import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProfileId, ProfileDef, PROFILE_BY_ID, PROFILES } from '@/src/constants/profiles';
import { tryUnlock, requiresUnlock } from '@/src/services/unlock';
import { загрузить as загрузитьСостав, наложить, type СохранённыйСостав } from '@/src/services/playlistOverride';
import { установитьХабыИзФайла } from '@/src/constants/hubContents';
import { установитьЗамкиИзФайла } from '@/src/services/featureLadder';
import { установитьПорогиФигурок } from '@/src/services/collection';
import { установитьПравилоУровня } from '@/src/services/warmup';

const ACTIVE_PROFILE_KEY = 'psygames_active_profile';
const UNLOCKED_THEMED_KEY = 'psygames_unlocked_themed';   // string[] of profile ids

/**
 * Profile IDs that existed pre-v1.3.0 (personal: Денис/Алекс/Валя/Юля/Гость).
 * When an old install loads with one of these saved, we silently fall back
 * to FREE — they no longer exist in PROFILE_BY_ID.
 */
const LEGACY_REMOVED_IDS = new Set(['denis', 'alex', 'valya', 'yulya', 'guest']);

interface ProfileCtx {
  profile: ProfileDef;
  switchProfile: (id: ProfileId) => Promise<void>;
  ready: boolean;
  allProfiles: ProfileDef[];

  /** Set of themed profile ids the user has unlocked with codes. */
  unlockedThemed: Set<ProfileId>;
  /** Try a code → returns the unlocked profile id, or null if invalid. */
  redeemCode: (code: string) => Promise<ProfileId | null>;
  /** Forget all unlocks. */
  resetUnlocks: () => Promise<void>;
  /** Is this profile available to switch to right now? */
  isAccessible: (id: ProfileId) => boolean;

  /** True on the very first app launch (no saved profile, no flag). */
  isFirstRun: boolean;
  /** Mark first run as completed (dismiss welcome). */
  completeFirstRun: () => Promise<void>;

  /** Наложенный файлом состав (null = заводской из сборки). Для экрана настроек. */
  составИзФайла: СохранённыйСостав | null;
  /** Перечитать файл состава после загрузки или сброса — без перезапуска приложения. */
  перечитатьСостав: () => Promise<void>;
}

const Ctx = createContext<ProfileCtx | null>(null);

const FIRST_RUN_KEY = 'psygames_first_run_done';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  // Default = FREE for unknown devices (commercial-friendly).
  // Load effect below restores a saved profile (if it still exists post-v1.3.0).
  const [profile, setProfile] = useState<ProfileDef>(PROFILE_BY_ID.free);
  const [ready, setReady] = useState(false);
  const [unlockedThemed, setUnlockedThemed] = useState<Set<ProfileId>>(new Set());
  const [isFirstRun, setIsFirstRun] = useState(false);
  /**
   * 🔴 ЕДИНСТВЕННАЯ ТОЧКА, ГДЕ НАКЛАДЫВАЕТСЯ ФАЙЛ СОСТАВА.
   *
   * Замер 13.09.2026: `allowed_games` читают 13 мест, плейлисты зарядки — 16, и
   * все берут их из объекта профиля, который раздаёт этот контекст. Поэтому
   * переопределение делается здесь один раз, а двадцать девять мест о нём даже
   * не знают. Править каждое было бы той же ошибкой, что чинить нехватку меню
   * паузы на 63 экранах поимённо вместо одной правки каркаса.
   */
  const [состав, setСостав] = useState<СохранённыйСостав | null>(null);

  /** Перечитать файл состава — зовётся после загрузки файла и после сброса. */
  const перечитатьСостав = useCallback(async () => {
    setСостав(await загрузитьСостав());
  }, []);

  // Load on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedProfile, savedUnlocks, firstRunDone] = await Promise.all([
          AsyncStorage.getItem(ACTIVE_PROFILE_KEY),
          AsyncStorage.getItem(UNLOCKED_THEMED_KEY),
          AsyncStorage.getItem(FIRST_RUN_KEY),
        ]);

        const unlocks = new Set<ProfileId>(
          savedUnlocks ? (JSON.parse(savedUnlocks) as ProfileId[]) : []
        );
        setUnlockedThemed(unlocks);

        // Первый запуск. Экрана выбора («Начать с FREE» / «У меня есть код»)
        // больше нет: приложение бесплатное, а код-вход на iOS запрещён
        // гайдлайном 3.1.1 — экран был чистым фрикшном на старте.
        // Стартуем молча на FREE (профиль по умолчанию) и закрываем first-run,
        // чтобы состояние в сторе было консистентным (раньше это делал WelcomeModal).
        if (!savedProfile && !firstRunDone) {
          try { await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, 'free'); } catch {}
          try { await AsyncStorage.setItem(FIRST_RUN_KEY, '1'); } catch {}
        }

        if (savedProfile) {
          // Legacy install: saved profile was Денис/Алекс/Валя/Юля/Гость → silently
          // fall back to FREE (v1.3.0 removed personal profiles from the public app).
          if (LEGACY_REMOVED_IDS.has(savedProfile)) {
            setProfile(PROFILE_BY_ID.free);
            try { await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, 'free'); } catch {}
          } else if (savedProfile in PROFILE_BY_ID) {
            const candidate = PROFILE_BY_ID[savedProfile as ProfileId];
            // If saved is a themed-locked profile and unlock was cleared → fall back to FREE
            if (requiresUnlock(candidate.id) && !unlocks.has(candidate.id)) {
              setProfile(PROFILE_BY_ID.free);
            } else {
              setProfile(candidate);
            }
          }
        }
        /**
         * Состав читается ПОСЛЕ профиля и НЕ мешает запуску: любая беда с файлом
         * оставляет заводской состав из сборки. Приложение обязано открываться
         * даже с испорченным хранилищем.
         */
        try { setСостав(await загрузитьСостав()); } catch {}
      } catch (e) {
        console.warn('ProfileContext load failed:', e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Mark first run completed (called when welcome modal is dismissed)
  const completeFirstRun = useCallback(async () => {
    setIsFirstRun(false);
    try { await AsyncStorage.setItem(FIRST_RUN_KEY, '1'); } catch {}
  }, []);

  const persistUnlocks = useCallback(async (next: Set<ProfileId>) => {
    try {
      await AsyncStorage.setItem(UNLOCKED_THEMED_KEY, JSON.stringify(Array.from(next)));
    } catch (e) {
      console.warn('ProfileContext persist unlocks failed:', e);
    }
  }, []);

  const switchProfile = useCallback(async (id: ProfileId) => {
    const next = PROFILE_BY_ID[id];
    if (!next) return;
    // Block switching to a locked themed profile unless unlocked
    if (requiresUnlock(id) && !unlockedThemed.has(id)) {
      console.warn('Cannot switch to locked themed profile without unlock:', id);
      return;
    }
    setProfile(next);
    try {
      await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, id);
      (globalThis as any).__psygames_active_person = next.person;
      (globalThis as any).__psygames_active_profile_id = next.id;
    } catch (e) {
      console.warn('ProfileContext save failed:', e);
    }
  }, [unlockedThemed]);

  const redeemCode = useCallback(async (code: string): Promise<ProfileId | null> => {
    const unlocked = await tryUnlock(code);
    if (!unlocked) return null;
    const next = new Set(unlockedThemed);
    next.add(unlocked);
    setUnlockedThemed(next);
    await persistUnlocks(next);
    // Auto-switch to the just-unlocked profile
    await switchProfile(unlocked);
    return unlocked;
  }, [unlockedThemed, persistUnlocks, switchProfile]);

  const resetUnlocks = useCallback(async () => {
    setUnlockedThemed(new Set());
    try {
      await AsyncStorage.removeItem(UNLOCKED_THEMED_KEY);
    } catch (e) {
      console.warn('ProfileContext reset unlocks failed:', e);
    }
    // If current profile was a locked themed → fall back to FREE
    if (requiresUnlock(profile.id)) {
      const fallback = PROFILE_BY_ID.free;
      setProfile(fallback);
      try { await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, fallback.id); } catch {}
    }
  }, [profile.id]);

  const isAccessible = useCallback((id: ProfileId): boolean => {
    if (!requiresUnlock(id)) return true;
    return unlockedThemed.has(id);
  }, [unlockedThemed]);

  // Push current person + themed-flag to globals on every change (for api.ts level-unlocks)
  useEffect(() => {
    (globalThis as any).__psygames_active_person = profile.person;
    (globalThis as any).__psygames_active_themed = profile.group === 'themed';
    (globalThis as any).__psygames_active_profile_id = profile.id;
  }, [profile]);

  /* Наложенные профили считаются один раз на смену состава, а не каждый рендер:
     новый объект профиля на каждом кадре перерисовывал бы весь каталог. */
  const профильСоСоставом = React.useMemo(() => наложить(profile, состав?.профили ?? null), [profile, состав]);

  /**
   * 🔴 СОСТАВ РАЗВИЛОК СТАВИТСЯ ПОД АКТИВНЫЙ ПРОФИЛЬ, А НЕ ОДИН НА ВСЕХ.
   *
   * За карточкой `/games/puzzles-hub` стоят 40 режимов Тэтхэма, и отбор по
   * `allowed_games` открывает их скопом: разрешён базовый маршрут — открыты все
   * сорок. Профильный список — единственный способ дать детям десять, а взрослым
   * сорок, не трогая сам отбор. Общий раздел `хабы` остаётся запасным слоем для
   * профилей, у которых своего списка нет.
   *
   * Эффект, а не useMemo: `установитьХабыИзФайла` меняет модульное состояние
   * реестра — это побочное действие, и оно обязано случаться после рендера, а не
   * во время него.
   */
  React.useEffect(() => {
    установитьХабыИзФайла(состав?.профили?.[profile.id]?.хабы ?? состав?.хабы ?? null);
  }, [profile.id, состав]);

  /**
   * Баланс — общий на всё приложение, а не на профиль: экономика одна. Поэтому
   * зависимость только от состава, без `profile.id`.
   */
  React.useEffect(() => {
    установитьЗамкиИзФайла(состав?.замки ?? null);
    установитьПорогиФигурок(состав?.коллекция ?? null);
  }, [состав]);

  /* Правило уровня — ПРОФИЛЬНОЕ: зарядка у детей и у взрослых разной строгости.
     Профиль нужен и как часть ключа уровня в хранилище. */
  React.useEffect(() => {
    установитьПравилоУровня(состав?.профили?.[profile.id]?.уровень_в_зарядке ?? null, profile.id);
  }, [profile.id, состав]);
  const всеСоСоставом = React.useMemo(() => PROFILES.map((p) => наложить(p, состав?.профили ?? null)), [состав]);

  return (
    <Ctx.Provider value={{
      profile: профильСоСоставом, switchProfile, ready, allProfiles: всеСоСоставом,
      составИзФайла: состав, перечитатьСостав,
      unlockedThemed, redeemCode, resetUnlocks, isAccessible,
      isFirstRun, completeFirstRun,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProfile(): ProfileCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile must be inside ProfileProvider');
  return ctx;
}

/**
 * То же, но БЕЗ падения вне провайдера — `null`, если профиля нет.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНАЯ ФОРМА, А НЕ «ОБЕРНУТЬ ПРОВАЙДЕРОМ ГДЕ НАДО». Строгий
 * `useProfile` прав для экранов: экран без профиля не имеет смысла, и упасть
 * громко лучше, чем нарисовать не то. Но для УКРАШЕНИЯ это правило вредно.
 *
 * Случай 26.08.2026: в заставку перехода между уровнями добавили выбор города
 * по профилю — и `LevelInterlude` начал падать везде, где рендерится без
 * провайдера. Поймали три проверки, а могло поймать и живого игрока: заставка —
 * НАГРАДА за пройденный уровень, и уронить её из-за оформления значит отнять у
 * человека ровно то, ради чего он играл.
 *
 * Правило: то, что рисует, а не решает, обязано переживать отсутствие профиля.
 */
export function useProfileOptional(): ProfileCtx | null {
  return useContext(Ctx) ?? null;
}
