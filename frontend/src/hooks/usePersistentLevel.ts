/**
 * usePersistentLevel — переиспользуемый ПЕРСИСТ-уровень для игр (как у судоку,
 * но универсальный). Уровень сохраняется per-profile между сессиями: игрок
 * продолжает с достигнутого, видит, как растёт.
 *
 * Ключ AsyncStorage: `psygames_<gameId>_level_<profileId>`.
 * Ключ счётчика провалов подряд: `psygames_<gameId>_failstreak_<profileId>`.
 *
 * Использование:
 *   const lvl = usePersistentLevel('digit_span');           // lvl.level (число), грузится из стора
 *   // старт партии — производи параметр сложности от lvl.level
 *   const startLen = 3 + lvl.level;
 *   // по результату — поднять уровень до достигнутого «потолка»:
 *   if (lvl.reach(maxSpan - 3)) setLeveledUp(true);          // true = был level-up
 *   // НЕ прошёл уровень — гистерезис понижения (v1.116.0):
 *   if (lvl.fail()) setLeveledDown(true);                    // true = был level-down (после N провалов подряд)
 *
 * reach(target): поднимает уровень до target, если target больше текущего (и сохраняет),
 *   плюс сбрасывает счётчик провалов подряд (успех = чистый лист).
 * fail(): увеличивает счётчик провалов подряд; при достижении FAIL_STREAK_THRESHOLD (3)
 *   понижает уровень на 1 (не ниже 1) и сбрасывает счётчик. Возвращает true при понижении.
 *   Паттерн гистерезиса — как в brainworkshop/cogniba: единичный провал НЕ наказывает
 *   сразу, чтобы не разочаровывать за одну неудачную сессию.
 * setLevel(n): прямая установка + сохранение (сбрасывает счётчик провалов).
 */
import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getMaxLevelFromSessions } from '@/src/services/api';

const FAIL_STREAK_THRESHOLD = 3;

export interface PersistentLevel {
  level: number;
  loaded: boolean;
  setLevel: (n: number) => void;
  reach: (target: number) => boolean;   // bump-up до target, true если повысился
  fail: () => boolean;                  // провал уровня; true если после этого понизился
}

export function usePersistentLevel(gameId: string, initial = 1): PersistentLevel {
  const { profile } = useProfile();
  const pid = (profile as any)?.id ?? 'default';
  const key = `psygames_${gameId}_level_${pid}`;
  const failKey = `psygames_${gameId}_failstreak_${pid}`;
  const [level, setLevelState] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const levelRef = useRef(initial);
  const failStreakRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    Promise.all([AsyncStorage.getItem(key), AsyncStorage.getItem(failKey)]).then(async ([v, f]) => {
      if (cancelled) return;
      const n = parseInt(v || '', 10);
      if (n >= 1) {
        // Локальный ключ есть — он источник истины.
        levelRef.current = n;
        setLevelState(n);
      } else {
        // Ключа нет (переустановка / сброс-смена профиля): уровень потерян, но очки/сессии
        // durable — восстанавливаем достигнутый уровень из истории и пишем обратно в ключ,
        // чтобы дальше он был локальным. Очки так не терялись, а уровень — терялся (баг Вали).
        let restored = initial;
        try {
          const fromSessions = await getMaxLevelFromSessions(gameId);
          if (cancelled) return;
          restored = Math.max(initial, fromSessions);
        } catch { /* нет истории → initial */ }
        levelRef.current = restored;
        setLevelState(restored);
        if (restored > 1) AsyncStorage.setItem(key, String(restored)).catch(() => {});
      }
      failStreakRef.current = parseInt(f || '', 10) || 0;
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [key, failKey, initial, gameId]);

  const setFailStreak = (n: number) => {
    failStreakRef.current = n;
    AsyncStorage.setItem(failKey, String(n)).catch(() => {});
  };

  const setLevel = (n: number) => {
    const lv = Math.max(1, Math.round(n));
    levelRef.current = lv;
    setLevelState(lv);
    AsyncStorage.setItem(key, String(lv)).catch(() => {});
    setFailStreak(0);
  };

  const reach = (target: number): boolean => {
    if (target > levelRef.current) { setLevel(target); return true; }
    setFailStreak(0);   // уровень пройден (пусть и не выше текущего потолка) — сбрасываем счётчик провалов
    return false;
  };

  const fail = (): boolean => {
    const streak = failStreakRef.current + 1;
    if (streak >= FAIL_STREAK_THRESHOLD && levelRef.current > 1) {
      setLevel(levelRef.current - 1);   // setLevel уже обнуляет failStreak
      return true;
    }
    setFailStreak(streak);
    return false;
  };

  return { level, loaded, setLevel, reach, fail };
}
