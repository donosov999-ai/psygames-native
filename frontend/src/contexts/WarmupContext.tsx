import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import {
  PlaylistMeta, PlaylistStep,
  buildMorningWarmupPlaylist, buildFinancialBatteryPlaylist, buildAssessmentPlaylist,
  buildFixedPlaylist, buildEveningWarmupPlaylist, buildDayPlaylist, buildNightPlaylist, stepToParams,
  getCurrentWeekday, todayDateKey,
  saveWarmupHistory, WarmupHistoryEntry, Weekday,
  shouldAdvance,
} from '@/src/services/warmup';
import { setSessionListener, GameSession } from '@/src/services/api';
import { isGameAllowed } from '@/src/constants/profiles';
import { useProfile } from '@/src/contexts/ProfileContext';
import { fbCorrect, fbComplete } from '@/src/services/feedback';

export interface StepResult {
  game_type: string;
  score: number;
  time_seconds: number;
  errors: number;
  details?: Record<string, any>;
}

interface WarmupState {
  active: boolean;
  meta: PlaylistMeta | null;
  currentIdx: number;
  startTime: number;
  results: StepResult[];
  warmupId: string | null;       // UUID for the entire series — shared across all games for analytics grouping
  sessionTag: string | null;     // 'warmup' | 'peak' | 'baseline' | etc. — derived from track
}

interface WarmupCtx extends WarmupState {
  currentStep: PlaylistStep | null;
  startWarmup: (duration: 5 | 10 | 15) => void;
  startEvening: () => void;              // v1.23 — вечерний комплекс (перед сном)
  startDay: () => void;                  // v1.179 — дневной перерыв
  startNight: () => void;                // v1.179 — «Не спится»: НЕ тренировка, вне стрика
  startFinancialBattery: () => void;     // D1 — Iowa+BART+PRL session
  startAssessment: () => void;            // G1 — 12-domain skill assessment
  recordResult: (r: StepResult) => Promise<void>;
  advanceToNext: (fromIdx?: number) => void;   // переход к следующей игре или на /warmup-complete
  skipCurrent: () => void;
  stopWarmup: (completed?: boolean) => Promise<void>;
}

const Ctx = createContext<WarmupCtx | null>(null);

export function WarmupProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile } = useProfile();
  const [state, setState] = useState<WarmupState>({
    active: false, meta: null, currentIdx: 0, startTime: 0, results: [],
    warmupId: null, sessionTag: null,
  });

  // Generate a UUID for the warmup series — shared across all games in this run.
  // Cross-platform: crypto.randomUUID() works in modern web; falls back to manual generator.
  const genUUID = (): string => {
    try {
      // @ts-ignore — crypto may be available
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const trackToTag = (track: PlaylistMeta['track']): string => {
    if (track === 'measure-peak') return 'peak';
    if (track === 'measure-baseline') return 'baseline';
    if (track === 'rest') return 'rest';
    if (track === 'financial-battery') return 'episodic';   // per coleague's contract
    if (track === 'assessment') return 'assessment';
    return 'warmup';
  };

  /**
   * Игры текущего профиля. Зарядка обязана собираться ИЗ НИХ: главная экрана
   * каталог уже гейтит (`filterAllowedGames`), и без этого предиката зарядка
   * стала бы чёрным ходом к платным тренажёрам.
   */
  const allow = useCallback((gameId: string) => isGameAllowed(profile, gameId), [profile]);

  const startWarmup = useCallback((duration: 5 | 10 | 15) => {
    const wd = getCurrentWeekday();
    // Если у профиля задан фиксированный утренний набор — используем его (минуя weekday-логику).
    const meta = profile.morning_playlist && profile.morning_playlist.length > 0
      ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd, allow)
      : buildMorningWarmupPlaylist({
          duration,
          weekday: wd,
          profilePlaylists: profile.custom_playlists,    // E1: per-profile override
          allow,
        });
    const warmupId = genUUID();
    const sessionTag = trackToTag(meta.track);
    setState({
      active: true, meta, currentIdx: 0, startTime: Date.now(), results: [],
      warmupId, sessionTag,
    });
    if (meta.steps.length === 0) {
      // rest day — open completion immediately
      router.replace('/warmup-complete' as any);
    } else {
      router.replace({ pathname: meta.steps[0].game_route, params: stepToParams(meta.steps[0]) } as any);
    }
  }, [router, profile, allow]);

  // v1.23 «Комплексы» — вечерний комплекс (перед сном): спокойные игры из profile.evening_playlist.
  const startEvening = useCallback(() => {
    const wd = getCurrentWeekday();
    // утро сегодня → дедуп: вечер не повторяет утренние игры (утро≠вечер)
    const morning = profile.morning_playlist && profile.morning_playlist.length > 0
      ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd, allow)
      : buildMorningWarmupPlaylist({ duration: 5, weekday: wd, profilePlaylists: profile.custom_playlists, allow });
    const meta = buildEveningWarmupPlaylist({ weekday: wd, excludeGameIds: morning.steps.map((s) => s.game_id), profileEvening: profile.evening_playlist, allow });
    const warmupId = genUUID();
    setState({
      active: true, meta, currentIdx: 0, startTime: Date.now(), results: [],
      warmupId, sessionTag: 'warmup',
    });
    if (meta.steps.length === 0) {
      router.replace('/warmup-complete' as any);
    } else {
      router.replace({ pathname: meta.steps[0].game_route, params: stepToParams(meta.steps[0]) } as any);
    }
  }, [router, profile, allow]);

  /**
   * Дневной перерыв и «Не спится». Оба набора фиксированные, от профиля и дня
   * недели не зависят, поэтому строятся проще утра и вечера.
   *
   * sessionTag у ночи 'manual', а не 'warmup': она не тренировка и не должна
   * попадать в статистику комплексов и двигать стрик (решение Дениса 02.08).
   */
  const startSlotPlaylist = useCallback((meta: PlaylistMeta) => {
    const warmupId = genUUID();
    setState({
      active: true, meta, currentIdx: 0, startTime: Date.now(), results: [],
      warmupId, sessionTag: meta.slot === 'night' ? 'manual' : 'warmup',
    });
    if (meta.steps.length === 0) router.replace('/warmup-complete' as any);
    else router.replace({ pathname: meta.steps[0].game_route, params: stepToParams(meta.steps[0]) } as any);
  }, [router]);

  const startDay = useCallback(() => {
    startSlotPlaylist(buildDayPlaylist(getCurrentWeekday()));
  }, [startSlotPlaylist]);

  const startNight = useCallback(() => {
    startSlotPlaylist(buildNightPlaylist(getCurrentWeekday()));
  }, [startSlotPlaylist]);

  const startFinancialBattery = useCallback(() => {
    const meta = buildFinancialBatteryPlaylist();
    const warmupId = genUUID();
    const sessionTag = trackToTag(meta.track);
    setState({
      active: true, meta, currentIdx: 0, startTime: Date.now(), results: [],
      warmupId, sessionTag,
    });
    router.replace(meta.steps[0].game_route as any);
  }, [router]);

  const startAssessment = useCallback(() => {
    const meta = buildAssessmentPlaylist();
    const warmupId = genUUID();
    const sessionTag = trackToTag(meta.track);
    setState({
      active: true, meta, currentIdx: 0, startTime: Date.now(), results: [],
      warmupId, sessionTag,
    });
    router.replace(meta.steps[0].game_route as any);
  }, [router]);

  const recordResult = useCallback(async (r: StepResult) => {
    setState((s) => ({ ...s, results: [...s.results, r] }));
  }, []);

  // ⚠️ Побочные эффекты (звук, router.replace) НЕ внутри setState-updater — React вправе
  // исполнять updater повторно/в фазе рендера → двойной инкремент шага и двойная навигация
  // (симптом: зарядка «проскакивает» игры и обрывается раньше времени). Плюс debounce-гард:
  // два advanceToNext ближе 800мс (напр. дубль-сейв сессии) не продвигают шаг дважды.
  const lastAdvanceRef = useRef(0);
  // Отложенный авто-переход (см. слушатель сессий ниже) планируется на 2000–3500 мс.
  // Если человек за это время сам жмёт «Далее» в результате игры — переход происходит
  // дважды: руками и по таймеру, — и шаг между ними ПРОГЛАТЫВАЕТСЯ. Дебаунс в 800 мс
  // это не ловит: переходы разнесены на секунды. Именно так у Вали вечерняя зарядка
  // из трёх игр схлопывалась в «одна игра и сразу дыхание» (репорты 03.08 и 05.08 —
  // «где другие игры?????»). У вечера задержка самая длинная → рвалось чаще всего.
  // Лечим двумя замками: гасим запланированный таймер и сверяем номер шага.
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceToNext = useCallback((fromIdx?: number) => {
    const s = stateRef.current;
    if (!s.meta) return;
    const now = Date.now();
    if (!shouldAdvance({ fromIdx, currentIdx: s.currentIdx, now, lastAdvanceAt: lastAdvanceRef.current })) return;
    // Гасим только когда переход реально состоялся: отменить таймер и при этом
    // никуда не уйти — значит подвесить зарядку на текущем шаге навсегда.
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null; }
    lastAdvanceRef.current = now;
    const next = s.currentIdx + 1;
    setState((st) => ({ ...st, currentIdx: st.currentIdx + 1 }));
    if (next >= s.meta.steps.length) {
      // all done — chime + go to appropriate complete screen based on track
      fbComplete();
      const completePath = s.meta.track === 'assessment'
        ? '/assessment-result'
        : '/warmup-complete';
      setTimeout(() => router.replace(completePath as any), 0);
    } else {
      // bridge first → next game (subtle tick)
      fbCorrect();
      setTimeout(() => router.replace('/warmup-bridge' as any), 0);
    }
  }, [router]);

  const skipCurrent = useCallback(() => {
    advanceToNext();
  }, [advanceToNext]);

  const stopWarmup = useCallback(async (completed = false) => {
    if (state.meta) {
      const totalScore = state.results.reduce((a, b) => a + (b.score || 0), 0);
      const entry: WarmupHistoryEntry = {
        date: todayDateKey(),
        weekday: state.meta.weekday,
        duration_min: state.meta.duration_min,
        track: state.meta.track,
        total_score: totalScore,
        completed,
        steps_done: state.results.length,
        steps_total: state.meta.steps.length,
      };
      await saveWarmupHistory(entry);
    }
    setState({
      active: false, meta: null, currentIdx: 0, startTime: 0, results: [],
      warmupId: null, sessionTag: null,
    });
  }, [state]);

  const currentStep = state.meta && state.currentIdx < state.meta.steps.length
    ? state.meta.steps[state.currentIdx]
    : null;

  // Subscribe to ALL session saves — when warmup is active and the saved
  // session matches the current expected game, record + advance automatically.
  // This avoids per-game patching across 39 game files.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Глобал для saveSession: во время зарядки серия-бонус (cleanRun) не начисляется —
  // у зарядки свой comboBonus ×1.5 в warmup-complete, не задваиваем награду.
  useEffect(() => { (globalThis as any).__psygames_warmup_active = state.active; }, [state.active]);
  useEffect(() => {
    const listener = async (s: GameSession) => {
      const cur = stateRef.current;
      if (!cur.active || !cur.meta) return;
      const step = cur.meta.steps[cur.currentIdx];
      if (!step) return;
      if (s.game_type !== step.game_id) return;  // not the expected game

      // ENRICH the just-saved session with warmup metadata for Supabase sync.
      // Mutate in place — saveSession returned this object reference, and the
      // listener fires AFTER writeAll(), so storage already has the bare version.
      // We re-tag and rewrite for cloud sync compatibility.
      s.session_tag = cur.sessionTag || 'warmup';
      s.warmup_id = cur.warmupId || undefined;
      s.weekday = cur.meta.weekday;
      s.duration_preset = cur.meta.duration_min;

      // record into warmup result list
      await recordResult({
        game_type: s.game_type,
        score: s.score || 0,
        time_seconds: s.time_seconds || 0,
        errors: s.errors || 0,
        details: s.details,
      });

      // Ачивки чекаются в saveSession (runAchievementsCheck) — единая точка для
      // ЛЮБОГО завершённого раунда, с настоящим warmup-стриком (раньше тут был 0).
      // small delay so the game's own result UI can render briefly,
      // then auto-navigate to bridge / complete
      const idxAtSave = cur.currentIdx;   // переход валиден только для ЭТОГО шага
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => advanceToNext(idxAtSave), cur.meta.slot === 'evening' ? 3500 : 2000);
    };
    setSessionListener(listener);
    return () => setSessionListener(null);
  }, [recordResult, advanceToNext]);

  // Android: системная кнопка «Назад» (◁) во время зарядки/комплекса. Навигация warmup идёт
  // через router.replace (без бэк-стека) → ◁ ничего не делал. Перехватываем: выходим из зарядки домой.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      const cur = stateRef.current;
      if (cur.active && cur.meta) {
        stopWarmup(false);
        router.replace('/' as any);
        return true;   // обработали — приложение не закрывается
      }
      return false;    // не в зарядке → дефолтное поведение
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [stopWarmup, router]);

  return (
    <Ctx.Provider value={{ ...state, currentStep, startWarmup, startEvening, startDay, startNight, startFinancialBattery, startAssessment, recordResult, advanceToNext, skipCurrent, stopWarmup }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWarmup(): WarmupCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWarmup must be inside WarmupProvider');
  return ctx;
}
