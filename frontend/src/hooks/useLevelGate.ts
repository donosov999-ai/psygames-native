/**
 * useLevelGate — reusable hook for game config screens.
 *
 * Returns:
 *   - isLocked(levelKey): true if this level is gated for the active profile
 *     (false for personal profiles, false for first level, false if already unlocked)
 *   - nextHint: human-readable string "🔒 Следующий 6×6: пройди 5×5 за ≤25 сек · прогресс 0/1"
 *     (or null if profile is personal / all unlocked / no progression configured;
 *     v1.142: строится в formatUnlockHint() через словарь unlockNextFmt +
 *     unlockLabel_… + unlockHint_… — 12 языков, фолбэк на ru/en-поля манифеста)
 *   - isThemed: convenience flag if the active profile is a themed (locked) one
 *
 * Usage:
 *   const { isLocked, nextHint } = useLevelGate('math_sprint');
 *   <Button disabled={isLocked('hard')}>Hard{isLocked('hard') ? ' 🔒' : ''}</Button>
 *   {nextHint && <Text>{nextHint}</Text>}
 */

import { useEffect, useState } from 'react';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { getUnlockedLevels, getNextLockedLevel, formatUnlockHint } from '@/src/services/level-unlocks';

export interface LevelGate {
  isLocked: (levelKey: string) => boolean;
  nextHint: string | null;
  isThemed: boolean;
  unlockedSet: Set<string>;
}

export function useLevelGate(gameId: string): LevelGate {
  const { profile } = useProfile();
  const { language } = useLanguage();
  const isThemed = profile.group === 'themed';
  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());
  const [nextHint, setNextHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isThemed) {
        if (!cancelled) {
          setUnlockedSet(new Set());
          setNextHint(null);
        }
        return;
      }
      const unlocked = await getUnlockedLevels(profile.person, true, gameId);
      const next = await getNextLockedLevel(profile.person, true, gameId);
      if (cancelled) return;
      setUnlockedSet(new Set(unlocked));
      // v1.142: строка собирается из словаря (12 языков) с фолбэком на манифест
      setNextHint(next ? formatUnlockHint(language, gameId, next) : null);
    })();
    return () => { cancelled = true; };
  }, [isThemed, profile.person, gameId, language]);

  const isLocked = (levelKey: string): boolean => {
    // Personal profiles never gate
    if (!isThemed) return false;
    // Until manifest loads (unlockedSet is empty) — be conservative: nothing locked
    if (unlockedSet.size === 0) return false;
    return !unlockedSet.has(levelKey);
  };

  return { isLocked, nextHint, isThemed, unlockedSet };
}
