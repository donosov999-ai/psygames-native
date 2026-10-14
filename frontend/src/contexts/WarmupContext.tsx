import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import {
  PlaylistMeta, PlaylistStep,
  buildMorningWarmupPlaylist, buildFinancialBatteryPlaylist, buildAssessmentPlaylist,
  buildFixedPlaylist, buildEveningWarmupPlaylist, buildDayPlaylist, buildNightPlaylist, stepToParams,
  getCurrentWeekday, todayDateKey,
  saveWarmupHistory, WarmupHistoryEntry, Длительность,
  партияЗаШаг,
} from '@/src/services/warmup';
import { setSessionListener, setSessionAcceptance, setSessionSaveFailed, GameSession } from '@/src/services/api';
import { localSpatialHost, spatialWarmupPlaylist } from '@/src/games/spatial-core/warmup';
import { isGameAllowed } from '@/src/constants/profiles';
import { useProfile } from '@/src/contexts/ProfileContext';
import { fbCorrect, fbComplete } from '@/src/services/feedback';
import { hostInfo, hostLeadsBetween, hostLeadsFinish, hostRendersNatively, lastStepMessage, postToHost, stepDoneMessage, type WarmupHostInfo } from '@/src/services/hostWarmup';
import { isHostSession } from '@/src/services/nativeSessionBridge';
import { ownerParams, parseWarmupOwner, sameWarmupOwner, type WarmupOwner } from '@/src/services/warmupOwner';

export interface StepResult {
  /** Локальный прогон приёмки: без сессий, наград и истории. */
  localSpatial?: boolean;
  game_type: string;
  score: number;
  time_seconds: number;
  errors: number;
  details?: Record<string, any>;
  /**
   * Настройки сыгранной партии — уровень и режим, как их записала игра.
   * 🔴 Без них оценка не узнавала свою партию: `sessionFitsStep` требует того, что шаг
   * батареи предписал (`difficulty: 'medium'`, `mode: 'forward'`…), а результат шага их не
   * нёс — и 7 доменов из 12 (digit_span, corsi, n_back, cpt, sdmt, phonemic_fluency, bart)
   * у ЛЮБОГО человека выходили «средними», z = 0. Замер 30.09.2026 по коду main.
   */
  difficulty?: string;
  mode?: string;
  /**
   * Номер шага в наборе, за который записан результат. Ставит `recordResult` сам — по
   * текущему шагу. Без номера мост и итог узнавали «сыгранное» по последнему результату и по
   * имени игры: после пропуска мост писал «✓ СЫГРАНО» с именем пропущенной игры, а игра,
   * стоящая в наборе дважды, выглядела сыгранной оба раза (см. `результатШага`).
   */
  шаг?: number;
}

/**
 * Результат шага из только что сохранённой партии.
 * Имя ШАГА, а не корзины партии: итог, ядро-снимок и оценка сверяют результаты с шагами.
 */
export function stepResultOf(stepGameId: string, s: GameSession): StepResult {
  return {
    game_type: stepGameId,
    score: s.score || 0,
    time_seconds: s.time_seconds || 0,
    errors: s.errors || 0,
    details: s.details,
    difficulty: s.difficulty,
    mode: s.mode,
  };
}

interface WarmupState {
  /** Локальный прогон приёмки: без сессий, наград и истории. */
  localSpatial?: boolean;
  active: boolean;
  meta: PlaylistMeta | null;
  currentIdx: number;
  startTime: number;
  results: StepResult[];
  warmupId: string | null;       // UUID for the entire series — shared across all games for analytics grouping
  sessionTag: string | null;     // 'warmup' | 'peak' | 'baseline' | etc. — derived from track
  attemptOwner: WarmupOwner | null;
  profileId?: string;
}

interface WarmupCtx extends WarmupState {
  currentStep: PlaylistStep | null;
  startWarmup: (duration: 5 | 10 | 15) => void;
  startEvening: (duration?: Длительность) => void;  // v1.23 — вечерний комплекс (перед сном)
  startDay: (duration?: Длительность) => void;      // v1.179 — дневной перерыв
  startNight: (duration?: Длительность) => void;    // v1.179 — «Не спится»: НЕ тренировка, вне стрика
  startFinancialBattery: () => void;     // D1 — Iowa+BART+PRL session
  /** Локальная приёмка пространственных упражнений: только loopback, без записи. */
  startSpatialLab: () => void;
  startAssessment: () => void;            // G1 — 12-domain skill assessment
  /**
   * Запустить ГОТОВЫЙ набор. Нужен развилкам, которые собирают свою зарядку из
   * своих же упражнений — например шахматной (отчёт Дениса 05.09.2026).
   */
  startPlaylist: (meta: PlaylistMeta) => void;
  recordResult: (r: StepResult, owner?: WarmupOwner | null) => Promise<boolean>;
  advanceToNext: (fromIdx?: number) => void;   // переход к следующей игре или на /warmup-complete
  skipCurrent: () => void;
  stopWarmup: (completed?: boolean) => Promise<boolean>;
  owner: () => WarmupOwner | null;
  canNavigateAfterStop: (runId: string | null) => boolean;
  /**
   * 🔴 ПРИДЕРЖАТЬ АВТОПЕРЕХОД, ПОКА ЧЕЛОВЕК ОТВЕЧАЕТ НА ВОПРОС. Возвращает «отпустить».
   *
   * 📍 Задача 1436bcdd, отчёт a0b6d77f: «на второй игре зарядка вылетела, скинулось всё».
   * После сохранения партии зарядка сама уходит на мост через 2 с (3,5 с вечером), а на
   * карточке итога рядом с «Дальше» стоит «Стоп», который стирал серию одним касанием.
   * Карточка теперь переспрашивает — и вопрос не должен уехать вместе с экраном по таймеру.
   *
   * Пока держат, уже запланированный переход срабатывает вхолостую, а новый не ставится. Отпускание переход
   * НЕ возобновляет: ответ на вопрос сам решает, куда идти («Продолжить» — дальше,
   * «Остановить» — домой).
   */
  holdAutoAdvance: () => () => void;
  /**
   * 🔴 ОБЕЩАННОЕ ВРЕМЯ ВЫШЛО, А ШАГИ ОСТАЛИСЬ.
   *
   * 📍 РЕШЕНИЕ ДЕНИСА 09.09.2026: «мы не можем контролировать у каждого скорость
   * ответов, нам главное чтобы по шагам». Длина зарядки задана числом подходов,
   * минуты на кнопке — оценка. У того, кто отвечает медленнее медианы, десять
   * минут выходят на седьмом подходе из двенадцати.
   *
   * Обрывать нельзя (человек не доиграл то, что ему обещали), молчать тоже
   * нельзя (он планировал десять минут, а идёт двадцать). Поэтому один раз за
   * комплекс спрашиваем.
   */
  overtime: boolean;
  /** Сколько подходов осталось — для вопроса. */
  stepsLeft: number;
  /** Человек ответил «доиграю»: больше не спрашивать до конца комплекса. */
  dismissOvertime: () => void;
}

const Ctx = createContext<WarmupCtx | null>(null);

const emptyState: WarmupState = {
  active: false, meta: null, currentIdx: 0, startTime: 0, results: [],
  warmupId: null, sessionTag: null, attemptOwner: null,
};
const genUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};
const freshOwner = (run_id: string, step_idx: number): WarmupOwner =>
  Object.freeze({ run_id, step_idx, attempt_id: genUUID() });

export function WarmupProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile } = useProfile();
  const [state, setState] = useState<WarmupState>(emptyState);
  // Authoritative synchronous controller; React state is its rendered mirror.
  // Do not overwrite this ref from a delayed render/layout effect.
  const stateRef = useRef(state);
  const lifecycleRef = useRef(0);
  const stoppedRunRef = useRef<{ runId: string; generation: number } | null>(null);
  const terminalClaimsRef = useRef(new Set<string>());
  const acceptedSessionsRef = useRef(new Map<string, WarmupOwner>());
  const recordedSessionsRef = useRef(new Set<string>());
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const autoAdvanceHoldsRef = useRef(0);
  const install = useCallback((next: WarmupState) => { stateRef.current = next; setState(next); }, []);
  const cancelPending = useCallback(() => {
    if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
    for (const timer of navigationTimersRef.current) clearTimeout(timer);
    navigationTimersRef.current.clear();
    autoAdvanceHoldsRef.current = 0;
  }, []);
  const deferNavigation = useCallback((target: Parameters<typeof router.replace>[0]) => {
    const generation = lifecycleRef.current;
    const timer = setTimeout(() => {
      navigationTimersRef.current.delete(timer);
      if (lifecycleRef.current === generation) router.replace(target);
    }, 0);
    navigationTimersRef.current.add(timer);
  }, [router]);
  const owner = useCallback(() => stateRef.current.attemptOwner, []);
  const canNavigateAfterStop = useCallback((runId: string | null) => {
    const stopped = stoppedRunRef.current;
    return !!stopped && stopped.runId === runId && stopped.generation === lifecycleRef.current;
  }, []);
  const currentInfo = useCallback(() => {
    const s = stateRef.current;
    return hostInfo(s.active, s.meta, s.currentIdx, s.attemptOwner);
  }, []);

  /**
   * У КАКОГО комплекса уже спросили — идентификатор, а не «да/нет».
   *
   * ⚠️ Булев флаг здесь был бы дефектом: его пришлось бы сбрасывать в семи
   * функциях запуска, и забытый сброс означал бы, что после первого «доиграю»
   * вопрос не появится НИКОГДА. С идентификатором сброса не нужно вовсе: новый
   * комплекс — новый `warmupId` — вопрос снова возможен.
   */
  const [спрошеноУ, setСпрошеноУ] = useState<string | null>(null);

  /**
   * 🔴 ЧАСЫ ТИКАЮТ СОСТОЯНИЕМ, А НЕ `Date.now()` В РЕНДЕРЕ.
   *
   * Первая редакция читала `Date.now()` прямо в вычислении `overtime`, и линтер
   * это поймал как нечистый вызов — справедливо: такой признак обновляется не
   * когда истекло время, а когда компонент СЛУЧАЙНО перерисовался по другой
   * причине. На мосту отсчёт тикает раз в секунду, и вопрос бы появился; на
   * экране без своего таймера — никогда.
   *
   * Раз в 10 секунд достаточно: речь о минутах, а лишние перерисовки провайдера
   * стоят дороже точности. Таймер живёт только пока комплекс идёт.
   */
  const [сейчас, setСейчас] = useState(0);
  useEffect(() => {
    if (!state.active) return undefined;
    // ⚠️ БЕЗ синхронного setState в эффекте — линтер зовёт это каскадом
    // перерисовок, и он прав. Первый тик приходит через 10 секунд; до него
    // `сейчас` равен нулю, разность отрицательна, вопрос не всплывает. Речь о
    // минутах, так что десять секунд задержки на старте ничего не решают.
    const id = setInterval(() => setСейчас(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [state.active]);

  const trackToTag = (track: PlaylistMeta['track']): string => {
    if (track === 'measure-peak') return 'peak';
    if (track === 'measure-baseline') return 'baseline';
    if (track === 'rest') return 'rest';
    if (track === 'financial-battery') return 'episodic';   // per coleague's contract
    if (track === 'assessment') return 'assessment';
    return 'warmup';
  };

  const beginPlaylist = useCallback((meta: PlaylistMeta, localSpatial = false) => {
    cancelPending(); lifecycleRef.current += 1; terminalClaimsRef.current.clear();
    acceptedSessionsRef.current.clear(); recordedSessionsRef.current.clear();
    const warmupId = genUUID();
    const attemptOwner = meta.steps.length ? freshOwner(warmupId, 0) : null;
    install({ active: true, localSpatial, meta, currentIdx: 0, startTime: Date.now(), results: [],
      warmupId, attemptOwner, profileId: profile.id,
      sessionTag: localSpatial ? null : meta.slot === 'night' ? 'manual' : trackToTag(meta.track),
    });
    if (!meta.steps.length) router.replace('/warmup-complete' as any);
    else router.replace({ pathname: meta.steps[0].game_route,
      params: { ...stepToParams(meta.steps[0], meta.slot, meta.track), ...ownerParams(attemptOwner) },
    } as any);
  }, [cancelPending, install, router, profile.id]);

  /**
   * Игры текущего профиля. Зарядка обязана собираться ИЗ НИХ: главная экрана
   * каталог уже гейтит (`filterAllowedGames`), и без этого предиката зарядка
   * стала бы чёрным ходом к платным тренажёрам.
   */
  const allow = useCallback((gameId: string) => isGameAllowed(profile, gameId), [profile]);

  const startWarmup = useCallback((duration: 5 | 10 | 15) => {
    const wd = getCurrentWeekday();
    // Если у профиля задан фиксированный утренний набор — используем его (минуя weekday-логику).
    const собран = profile.morning_playlist && profile.morning_playlist.length > 0
      ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd, allow)
      : buildMorningWarmupPlaylist({
          duration,
          weekday: wd,
          profilePlaylists: profile.custom_playlists,    // E1: per-profile override
          allow,
        });
    const meta: PlaylistMeta = { ...собран, вид: 'слот' };
    beginPlaylist(meta);
  }, [beginPlaylist, profile, allow]);

  // v1.23 «Комплексы» — вечерний комплекс (перед сном): спокойные игры из profile.evening_playlist.
  const startEvening = useCallback((duration: Длительность = 5) => {
    const wd = getCurrentWeekday();
    // утро сегодня → дедуп: вечер не повторяет утренние игры (утро≠вечер)
    const morning = profile.morning_playlist && profile.morning_playlist.length > 0
      ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd, allow)
      : buildMorningWarmupPlaylist({ duration: 15, weekday: wd, profilePlaylists: profile.custom_playlists, allow });
    const meta: PlaylistMeta = {
      ...buildEveningWarmupPlaylist({ weekday: wd, excludeGameIds: morning.steps.map((s) => s.game_id), profileEvening: profile.evening_playlist, allow, duration }),
      вид: 'слот',
    };
    beginPlaylist(meta);
  }, [beginPlaylist, profile, allow]);

  /**
   * Дневной перерыв и «Не спится». Оба набора фиксированные, от профиля и дня
   * недели не зависят, поэтому строятся проще утра и вечера.
   *
   * sessionTag у ночи 'manual', а не 'warmup': она не тренировка и не должна
   * попадать в статистику комплексов и двигать стрик (решение Дениса 02.08).
   *
   * ⚠️ Остальным метка — по дорожке, как у `startWarmup`: сюда же приходит повтор утра
   * замерного дня («Ещё раз» на итоге), и он обязан остаться 'peak' / 'baseline', а не
   * стать 'warmup' оттого, что пришёл другой дверью.
   */
  const startSlotPlaylist = useCallback((meta: PlaylistMeta) => {
    beginPlaylist(meta);
  }, [beginPlaylist]);

  /**
   * 🔴 ДЛИНА ЕСТЬ У ВСЕХ ЧЕТЫРЁХ СЛОТОВ, А НЕ ТОЛЬКО У УТРА.
   * Правка Дениса 13.09.2026: «выбор длины зарядки нужно добавить во все 4 —
   * это ошибка, что в приложении он только для утра, ещё 3 шт пропущены».
   */
  const startDay = useCallback((duration: Длительность = 5) => {
    // Фильтр профиля — как в утреннем и вечернем наборах. Без него перерыв
    // раздавал упражнения, которых в профиле нет.
    startSlotPlaylist({ ...buildDayPlaylist(getCurrentWeekday(), allow, duration), вид: 'слот' });
  }, [startSlotPlaylist, allow]);

  const startNight = useCallback((duration: Длительность = 5) => {
    startSlotPlaylist({ ...buildNightPlaylist(getCurrentWeekday(), duration), вид: 'слот' });
  }, [startSlotPlaylist]);

  /**
   * Готовый набор: своя серия, серия развилки, тема хаба — и повтор с итога.
   * Уже помеченный набор (повтор слота) свою пометку сохраняет.
   */
  const startPlaylist = useCallback((meta: PlaylistMeta) => {
    startSlotPlaylist({ вид: 'набор', ...meta });
  }, [startSlotPlaylist]);

  /**
   * Локальный плейлист пространственных упражнений (пакет из лаборатории).
   *
   * ⚠️ ТОЛЬКО ДЛЯ ПРИЁМКИ. Работает лишь на loopback (`localSpatialHost`), не
   * пишет сессии, награды и историю — это стенд, на котором проверяют настоящие
   * переходы между упражнениями, а не режим приложения.
   */
  const startSpatialLab = useCallback(() => {
    if (!localSpatialHost() || stateRef.current.active) return;
    const meta = spatialWarmupPlaylist(getCurrentWeekday());
    beginPlaylist(meta, true);
  }, [beginPlaylist]);

  const startFinancialBattery = useCallback(() => {
    const meta = buildFinancialBatteryPlaylist();
    beginPlaylist(meta);
  }, [beginPlaylist]);

  const startAssessment = useCallback(() => {
    const meta = buildAssessmentPlaylist();
    beginPlaylist(meta);
  }, [beginPlaylist]);

  const claimResult = useCallback((r: StepResult, expected: WarmupOwner | null): boolean => {
    const s = stateRef.current;
    if (!s.active || !s.meta || !sameWarmupOwner(s.attemptOwner, expected)) return false;
    const step = s.meta.steps[s.currentIdx];
    if (!step || r.game_type !== step.game_id || (r.шаг !== undefined && r.шаг !== expected!.step_idx)) return false;
    const key = `${expected!.run_id}:${expected!.step_idx}`;
    if (terminalClaimsRef.current.has(key)) return false;
    // Claim BEFORE any await/append: concurrent saves cannot both acquire this step.
    terminalClaimsRef.current.add(key);
    install({ ...s, results: [...s.results, { ...r, шаг: expected!.step_idx }] });
    return true;
  }, [install]);
  const recordResult = useCallback(async (r: StepResult, expected = state.attemptOwner) =>
    claimResult(r, expected), [claimResult, state.attemptOwner]);

  // ⚠️ Побочные эффекты (звук, router.replace) НЕ внутри setState-updater — React вправе
  // исполнять updater повторно/в фазе рендера → двойной инкремент шага и двойная навигация
  // (симптом: зарядка «проскакивает» игры и обрывается раньше времени). Плюс debounce-гард:
  // два advanceToNext ближе 800мс (напр. дубль-сейв сессии) не продвигают шаг дважды.
  // Отложенный авто-переход (см. слушатель сессий ниже) планируется на 2000–3500 мс.
  // Если человек за это время сам жмёт «Далее» в результате игры — переход происходит
  // дважды: руками и по таймеру, — и шаг между ними ПРОГЛАТЫВАЕТСЯ. Дебаунс в 800 мс
  // это не ловит: переходы разнесены на секунды. Именно так у Вали вечерняя зарядка
  // из трёх игр схлопывалась в «одна игра и сразу дыхание» (репорты 03.08 и 05.08 —
  // «где другие игры?????»). У вечера задержка самая длинная → рвалось чаще всего.
  // Лечим двумя замками: гасим запланированный таймер и сверяем номер шага.
  /** Сколько вопросов сейчас держат автопереход (см. `holdAutoAdvance` в интерфейсе). */
  const holdAutoAdvance = useCallback(() => {
    // Уже запланированный переход не снимаем здесь: сработав, он сам увидит держание
    // и ничего не сделает (проверка в таймере слушателя сессий).
    autoAdvanceHoldsRef.current += 1;
    const generation = lifecycleRef.current;
    let отпущено = false;
    return () => {
      if (отпущено) return;
      отпущено = true;
      if (generation === lifecycleRef.current) autoAdvanceHoldsRef.current = Math.max(0, autoAdvanceHoldsRef.current - 1);
    };
  }, []);
  const moveTo = useCallback((idx: number, expected: WarmupOwner | null, direct: boolean): WarmupHostInfo | null => {
    const s = stateRef.current;
    if (!s.active || !s.meta || !sameWarmupOwner(s.attemptOwner, expected)
      || !Number.isSafeInteger(idx) || idx <= s.currentIdx || idx > s.meta.steps.length
      || idx > s.currentIdx + 2) return null;
    cancelPending(); lifecycleRef.current += 1;
    const attemptOwner = idx < s.meta.steps.length ? freshOwner(s.warmupId!, idx) : null;
    install({ ...s, currentIdx: idx, attemptOwner });
    if (idx >= s.meta.steps.length) {
      // all done — chime + go to appropriate complete screen based on track
      fbComplete();
      const completePath = s.localSpatial ? '/spatial-warmup' : s.meta.track === 'assessment'
        ? '/assessment-result'
        : '/warmup-complete';
      deferNavigation(completePath as any);
    } else if (direct) {
      const step = s.meta.steps[idx];
      deferNavigation({ pathname: step.game_route,
        params: { ...stepToParams(step, s.meta.slot, s.meta.track), ...ownerParams(attemptOwner) },
      } as any);
    } else {
      // bridge first → next game (subtle tick)
      fbCorrect();
      deferNavigation('/warmup-bridge' as any);
    }
    return currentInfo();
  }, [cancelPending, install, deferNavigation, currentInfo]);
  const advanceOwned = useCallback((fromIdx: number | undefined, expected: WarmupOwner | null) => {
    if (!expected || (fromIdx !== undefined && fromIdx !== expected.step_idx)) return false;
    return moveTo(expected.step_idx + 1, expected, false) !== null;
  }, [moveTo]);
  const advanceToNext = useCallback((fromIdx?: number) => {
    advanceOwned(fromIdx, state.attemptOwner);
  }, [advanceOwned, state.attemptOwner]);

  const skipCurrent = useCallback(() => {
    advanceToNext();
  }, [advanceToNext]);

  /**
   * Оболочка гибрида САМА открыла шаг `idx` (или открывает его после «Пропустить») —
   * учёт догоняет её, а адрес страницы встаёт на тот же шаг. Для оболочки это
   * переход «на тот же экран», и она его пропускает (`routeAction` → keep).
   * См. `services/hostWarmup.ts`.
   */
  const goToStep = useCallback((idx: number, expected: WarmupOwner | null) => moveTo(idx, expected, true), [moveTo]);
  const retryStep = useCallback((expected: WarmupOwner | null): WarmupHostInfo | null => {
    const s = stateRef.current;
    if (!s.active || !s.meta || !sameWarmupOwner(s.attemptOwner, expected)
      || terminalClaimsRef.current.has(`${expected!.run_id}:${expected!.step_idx}`)) return null;
    cancelPending(); lifecycleRef.current += 1;
    install({ ...s, attemptOwner: freshOwner(expected!.run_id, expected!.step_idx) });
    // Native remounts the SAME page using info.url. No router/route event here.
    return currentInfo();
  }, [cancelPending, install, currentInfo]);

  const stopOwned = useCallback(async (completed: boolean, expectedRun: string | null, expected?: WarmupOwner | null): Promise<boolean> => {
    const s = stateRef.current;
    if (!expectedRun || s.warmupId !== expectedRun || (expected && !sameWarmupOwner(s.attemptOwner, expected))) return false;
    cancelPending(); lifecycleRef.current += 1;
    const generation = lifecycleRef.current;
    stoppedRunRef.current = { runId: expectedRun, generation };
    // Revoke synchronously, before history IO. Late results cannot join another run.
    install(emptyState);
    acceptedSessionsRef.current.clear(); recordedSessionsRef.current.clear();
    if (s.meta && !s.localSpatial) {
      const totalScore = s.results.reduce((a, b) => a + (b.score || 0), 0);
      /**
       * З3: очки ядра — только когда ядро сыграно ЦЕЛИКОМ и по порядку.
       * Ядро всегда впереди набора; сверяем первые k результатов с первыми k
       * шагами поимённо. Скип любого ядрового шага (результата нет → имена
       * съезжают) честно оставляет поле пустым: половина снимка — не снимок.
       * ⚠️ По одним именам без is_fixed_baseline нельзя: flanker живёт и в ядре,
       * и в ПТ-тренировке — тренировочный счёт попал бы в ряд замера.
       */
      const coreSteps = s.meta.steps.filter((st) => st.is_fixed_baseline);
      const k = coreSteps.length;
      const coreOrdered = k > 0 && s.meta.steps.slice(0, k).every((st) => st.is_fixed_baseline);
      const coreResults = s.meta.steps.slice(0, k).map((step, i) => s.results.find(r => r.шаг === i && r.game_type === step.game_id));
      const corePlayed = coreOrdered && coreResults.every(r => r !== undefined);
      const coreScore = corePlayed
        ? coreResults.reduce((a, b) => a + (b?.score || 0), 0)
        : undefined;
      const entry: WarmupHistoryEntry = {
        date: todayDateKey(),
        weekday: s.meta.weekday,
        duration_min: s.meta.duration_min,
        track: s.meta.track,
        total_score: totalScore,
        completed,
        steps_done: s.results.length,
        steps_total: s.meta.steps.length,
        ...(coreScore !== undefined ? { core_score: coreScore } : {}),
      };
      try { await saveWarmupHistory(entry); }
      catch (err) { console.warn('Warmup history save failed:', err); }
    }
    return lifecycleRef.current === generation;
  }, [cancelPending, install]);
  const stopWarmup = useCallback((completed = false) =>
    stopOwned(completed, state.warmupId), [stopOwned, state.warmupId]);

  const currentStep = state.meta && state.currentIdx < state.meta.steps.length
    ? state.meta.steps[state.currentIdx]
    : null;

  // Subscribe to ALL session saves — when warmup is active and the saved
  // session matches the current expected game, record + advance automatically.
  // This avoids per-game patching across 39 game files.
  // Глобал для saveSession: во время зарядки серия-бонус (cleanRun) не начисляется —
  // у зарядки свой comboBonus ×1.5 в warmup-complete, не задваиваем награду.
  useEffect(() => { (globalThis as any).__psygames_warmup_active = state.active; }, [state.active]);
  useEffect(() => {
    const rollback = (s: GameSession) => {
      if (!s.id || recordedSessionsRef.current.has(s.id)) return;
      const expected = acceptedSessionsRef.current.get(s.id);
      if (!expected || !sameWarmupOwner(expected, parseWarmupOwner(s.details?.warmup_owner))) return;
      acceptedSessionsRef.current.delete(s.id);
      if (sameWarmupOwner(expected, stateRef.current.attemptOwner)) terminalClaimsRef.current.delete(`${expected.run_id}:${expected.step_idx}`);
    };
    const accept = (s: GameSession): boolean => {
      const cur = stateRef.current;
      const step = cur.meta?.steps[cur.currentIdx];
      const expected = parseWarmupOwner(s.details?.warmup_owner);
      if (s.details?.warmup_owner === undefined) {
        // Ordinary ownerless WEB saves remain ordinary. Missing native launch
        // owner on the active native warmup step must not receive credit.
        return !(cur.active && step && партияЗаШаг(step.game_id, s) && isHostSession(s) && hostRendersNatively(step.game_route));
      }
      if (!expected || !s.id || !cur.active || !step || cur.localSpatial
        || !sameWarmupOwner(cur.attemptOwner, expected) || !партияЗаШаг(step.game_id, s)
        || (hostRendersNatively(step.game_route) && !isHostSession(s))) return false;
      const key = `${expected.run_id}:${expected.step_idx}`;
      if (terminalClaimsRef.current.has(key)) return false;
      terminalClaimsRef.current.add(key);
      acceptedSessionsRef.current.set(s.id, expected);
      // Capture all run/profile metadata before storage/rewards can yield.
      s.session_tag = cur.sessionTag || 'warmup';
      s.warmup_id = expected.run_id;
      s.weekday = cur.meta!.weekday;
      s.duration_preset = cur.meta!.duration_min;
      s.profile_id = cur.profileId ?? s.profile_id;
      return true;
    };
    const listener = async (s: GameSession) => {
      const cur = stateRef.current;
      if (!cur.active || !cur.meta || cur.localSpatial) return;
      const step = cur.meta.steps[cur.currentIdx];
      if (!step) return;
      const expected = parseWarmupOwner(s.details?.warmup_owner);
      if (!expected || !sameWarmupOwner(cur.attemptOwner, expected) || !s.id
        || !sameWarmupOwner(acceptedSessionsRef.current.get(s.id), expected) || recordedSessionsRef.current.has(s.id)) return;
      // Не та игра. Сверка по корзине экрана, а не по имени в каталоге — см. `партияЗаШаг`.
      if (!партияЗаШаг(step.game_id, s)) return;
      /**
       * 🔴 ШАГ РИСУЕТ ОБОЛОЧКА — ЗАСЧИТЫВАЕТСЯ ТОЛЬКО ЕЁ ПАРТИЯ.
       * Под нативным экраном живёт веб-копия той же игры; SDMT при `wu=1` стартует
       * сам, идёт 60 с и сохраняет партию, которую человек не играл. 06.10.2026,
       * 2.56.12 (отчёт 02d98918): две партии за шаг → два «шаг готов» → два моста
       * оболочки → первый снялся пустым и остановил зарядку, человек — на главной.
       * Партию нативной половины метит приёмник (`nativeSessionBridge`).
       */
      if (hostRendersNatively(step.game_route) && !isHostSession(s)) return;

      recordedSessionsRef.current.add(s.id);
      install({ ...cur, results: [...cur.results, { ...stepResultOf(step.game_id, s), шаг: expected.step_idx }] });

      // Ачивки чекаются в saveSession (runAchievementsCheck) — единая точка для
      // ЛЮБОГО завершённого раунда, с настоящим warmup-стриком (раньше тут был 0).
      // small delay so the game's own result UI can render briefly,
      // then auto-navigate to bridge / complete
      const idxAtSave = cur.currentIdx;   // переход валиден только для ЭТОГО шага
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
      // Человек уже отвечает на вопрос карточки итога (сохранение успело прийти позже
      // касания) — переход не ставим: ответ сам решит, куда идти.
      if (autoAdvanceHoldsRef.current > 0) return;
      /**
       * 🔴 ОБА ШАГА НАТИВНЫЕ — ПЕРЕХОД ВЕДЁТ ОБОЛОЧКА (решение Дениса 01.10.2026,
       * `services/hostWarmup.ts`). Веб не уходит на свой мост: оболочка сама покажет
       * «дальше: …» и откроет следующую игру, а сюда вернётся вызовом `goTo`.
       * Время зарядки вышло — спросить человека пока умеет только веб-мост: туда.
       */
      const timeUp = Date.now() - cur.startTime > cur.meta.duration_min * 60_000;
      if (!timeUp && hostLeadsBetween(step, cur.meta.steps[idxAtSave + 1])) {
        // Второй замок: один шаг — одно «готов». Повтор того же шага — не переход.
        const msg = stepDoneMessage(cur.meta, idxAtSave, { score: s.score, time_seconds: s.time_seconds, errors: s.errors }, expected);
        if (msg && postToHost(msg)) return;
      }
      /**
       * 🔴 ПОСЛЕДНИЙ ШАГ НАТИВНЫЙ — КОНЕЦ ВЕДЁТ ОБОЛОЧКА (08.10.2026, iPhone, «окно висит после 6/6»).
       * Свой таймер здесь не ставим: под нативной игрой невидимый WebView iOS его придерживает.
       * Оболочка подождёт сама, снимет игру и позовёт `advance` (`services/hostWarmup.ts`).
       */
      if (hostLeadsFinish(step, cur.meta.steps[idxAtSave + 1])) {
        if (postToHost(lastStepMessage(cur.meta, idxAtSave, expected))) return;
      }
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        if (autoAdvanceHoldsRef.current > 0) return;
        advanceOwned(idxAtSave, expected);
      }, cur.meta.slot === 'evening' ? 3500 : 2000);
    };
    setSessionAcceptance?.(accept);
    setSessionSaveFailed?.(rollback);
    setSessionListener(listener);
    return () => { setSessionAcceptance?.(null); setSessionSaveFailed?.(null); setSessionListener(null); };
  }, [install, advanceOwned]);

  /**
   * Входы для оболочки гибрида (`flutter/lib/shell/warmup_step_bridge.dart`).
   * Получив `warmupStepDone`, оболочка ОБЯЗАНА ответить одним из них — иначе
   * зарядка встанет: веб свой переход в этом случае не планирует.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as Record<string, unknown>;
    const api = {
      /** Оболочка вести не взялась (экрана уже нет и т. п.) — обычный веб-переход. */
      advance: (fromIdx: number, expected: unknown) => advanceOwned(fromIdx, parseWarmupOwner(expected)),
      goTo: (idx: number, expected: unknown) => goToStep(idx, parseWarmupOwner(expected)),
      retry: (expected: unknown) => retryStep(parseWarmupOwner(expected)),
      stop: (value: unknown) => {
        const expected = parseWarmupOwner(value);
        if (!sameWarmupOwner(expected, stateRef.current.attemptOwner)) return false;
        void stopOwned(false, expected!.run_id, expected).then(allowed => { if (allowed && canNavigateAfterStop(expected!.run_id)) router.replace('/' as any); });
        return true;
      },
      owner,
      /** Полоска «N/M» нативного шага (63bccf96). */
      info: (expected?: unknown) => expected === undefined || sameWarmupOwner(parseWarmupOwner(expected), owner()) ? currentInfo() : null,
      /** ⏭ нативного шага — ровно то же, что веб-⏭ в каркасе (`GameShell.wuSkipConfirm`). */
      skip: (expected: unknown) => advanceOwned(undefined, parseWarmupOwner(expected)),
    };
    w.__psyWarmupHost = api;
    return () => { if (w.__psyWarmupHost === api) delete w.__psyWarmupHost; };
  }, [advanceOwned, goToStep, retryStep, stopOwned, owner, currentInfo, canNavigateAfterStop, router]);
  useEffect(() => () => {
    cancelPending(); lifecycleRef.current += 1; stateRef.current = emptyState;
  }, [cancelPending]);

  // Android: системная кнопка «Назад» (◁) во время зарядки/комплекса. Навигация warmup идёт
  // через router.replace (без бэк-стека) → ◁ ничего не делал. Перехватываем: выходим из зарядки домой.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      const cur = stateRef.current;
      if (cur.active && cur.meta) {
        void stopOwned(false, cur.warmupId).then(allowed => { if (allowed && canNavigateAfterStop(cur.warmupId)) router.replace('/' as any); });
        return true;   // обработали — приложение не закрывается
      }
      return false;    // не в зарядке → дефолтное поведение
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [stopOwned, canNavigateAfterStop, router]);

  const stepsLeft = state.meta ? Math.max(0, state.meta.steps.length - state.currentIdx) : 0;
  /**
   * ⚠️ Считается ОТ ОБЕЩАНИЯ (`duration_min`), а не от суммы оценок шагов: человек
   * планировал время по кнопке, и сверять надо с тем, что он на ней прочитал.
   */
  const overtime = state.active && !!state.meta && stepsLeft > 0
    && спрошеноУ !== state.warmupId
    && сейчас - state.startTime > state.meta.duration_min * 60_000;

  const dismissOvertime = useCallback(() => setСпрошеноУ(state.warmupId), [state.warmupId]);

  return (
    <Ctx.Provider value={{ ...state, owner, canNavigateAfterStop, currentStep, overtime, stepsLeft, dismissOvertime, startWarmup, startEvening, startDay, startNight, startFinancialBattery, startSpatialLab, startAssessment, startPlaylist, recordResult, advanceToNext, skipCurrent, stopWarmup, holdAutoAdvance }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWarmup(): WarmupCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWarmup must be inside WarmupProvider');
  return ctx;
}

/** Как useWarmup, но вне провайдера возвращает null (для глобальных компонентов вроде GameShell). */
export function useWarmupSafe(): WarmupCtx | null {
  return useContext(Ctx);
}
