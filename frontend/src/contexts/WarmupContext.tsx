import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useRouter } from 'expo-router';
import {
  PlaylistMeta, PlaylistStep,
  buildMorningWarmupPlaylist, buildFinancialBatteryPlaylist, buildAssessmentPlaylist,
  buildFixedPlaylist, stepToParams,
  getCurrentWeekday, todayDateKey,
  saveWarmupHistory, WarmupHistoryEntry, Weekday,
} from '@/src/services/warmup';
import { setSessionListener, GameSession } from '@/src/services/api';
import { useProfile } from '@/src/contexts/ProfileContext';
import { fbCorrect, fbComplete, fbAchievement } from '@/src/services/feedback';
import { checkNewAchievements } from '@/src/services/achievements';
import { getSessions } from '@/src/services/api';
import { loadAssessmentHistory } from '@/src/services/assessment';

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
  startFinancialBattery: () => void;     // D1 — Iowa+BART+PRL session
  startAssessment: () => void;            // G1 — 12-domain skill assessment
  recordResult: (r: StepResult) => Promise<void>;
  advanceToNext: () => void;        // navigates to next game or to /warmup-complete
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

  const startWarmup = useCallback((duration: 5 | 10 | 15) => {
    const wd = getCurrentWeekday();
    // Если у профиля задан фиксированный утренний набор — используем его (минуя weekday-логику).
    const meta = profile.morning_playlist && profile.morning_playlist.length > 0
      ? buildFixedPlaylist(profile.morning_playlist, 'morning', wd)
      : buildMorningWarmupPlaylist({
          duration,
          weekday: wd,
          profilePlaylists: profile.custom_playlists,    // E1: per-profile override
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
  }, [router, profile]);

  // v1.23 «Комплексы» — вечерний комплекс (перед сном): спокойные игры из profile.evening_playlist.
  const startEvening = useCallback(() => {
    const wd = getCurrentWeekday();
    const steps = profile.evening_playlist || [];
    const meta = buildFixedPlaylist(steps, 'evening', wd);
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
  }, [router, profile]);

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

  const advanceToNext = useCallback(() => {
    setState((s) => {
      if (!s.meta) return s;
      const next = s.currentIdx + 1;
      if (next >= s.meta.steps.length) {
        // all done — chime + go to appropriate complete screen based on track
        fbComplete();
        const completePath = s.meta.track === 'assessment'
          ? '/assessment-result'
          : '/warmup-complete';
        setTimeout(() => router.replace(completePath as any), 0);
        return { ...s, currentIdx: next };
      }
      // bridge first → next game (subtle tick)
      fbCorrect();
      setTimeout(() => router.replace('/warmup-bridge' as any), 0);
      return { ...s, currentIdx: next };
    });
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

      // Check for newly unlocked achievements (background, no blocking)
      try {
        const [allSessions, warmupHist, assessHist] = await Promise.all([
          getSessions(),
          import('@/src/services/warmup').then(m => m.loadWarmupHistory()),
          loadAssessmentHistory(),
        ]);
        const newly = await checkNewAchievements({
          sessions: allSessions,
          warmupHistory: warmupHist,
          assessmentHistory: assessHist,
          currentStreak: 0, // streak computed elsewhere; pass 0 here, streak achievements re-evaluated on home open
        });
        if (newly.length > 0) {
          fbAchievement();
          // Toast via global event — main screen can subscribe
          (globalThis as any).__psygames_new_achievement = newly[0];
          DeviceEventEmitter.emit('psygames:achievement', newly[0]);
        }
      } catch {}
      // small delay so the game's own result UI can render briefly,
      // then auto-navigate to bridge / complete
      setTimeout(() => advanceToNext(), cur.meta.slot === 'evening' ? 3500 : 2000);
    };
    setSessionListener(listener);
    return () => setSessionListener(null);
  }, [recordResult, advanceToNext]);

  return (
    <Ctx.Provider value={{ ...state, currentStep, startWarmup, startEvening, startFinancialBattery, startAssessment, recordResult, advanceToNext, skipCurrent, stopWarmup }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWarmup(): WarmupCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWarmup must be inside WarmupProvider');
  return ctx;
}
