/**
 * usePersistentLevel — переиспользуемый ПЕРСИСТ-уровень для игр (как у судоку,
 * но универсальный). Уровень сохраняется per-profile между сессиями: игрок
 * продолжает с достигнутого, видит, как растёт.
 *
 * Ключ AsyncStorage: `psygames_<gameId>_level_<profileId>`.
 *
 * Использование:
 *   const lvl = usePersistentLevel('digit_span');           // lvl.level (число), грузится из стора
 *   // старт партии — производи параметр сложности от lvl.level
 *   const startLen = 3 + lvl.level;
 *   // по результату — поднять уровень до достигнутого «потолка»:
 *   if (lvl.reach(maxSpan - 3)) setLeveledUp(true);          // true = был level-up
 *
 * reach(target): поднимает уровень до target, если target больше текущего (и сохраняет).
 * Возвращает true при повышении. setLevel(n): прямая установка + сохранение.
 */
import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from '@/src/contexts/ProfileContext';

export interface PersistentLevel {
  level: number;
  loaded: boolean;
  setLevel: (n: number) => void;
  reach: (target: number) => boolean;   // bump-up до target, true если повысился
}

export function usePersistentLevel(gameId: string, initial = 1): PersistentLevel {
  const { profile } = useProfile();
  const pid = (profile as any)?.id ?? 'default';
  const key = `psygames_${gameId}_level_${pid}`;
  const [level, setLevelState] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const levelRef = useRef(initial);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    AsyncStorage.getItem(key).then((v) => {
      if (cancelled) return;
      const n = parseInt(v || '', 10);
      const lv = n >= 1 ? n : initial;
      levelRef.current = lv;
      setLevelState(lv);
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [key, initial]);

  const setLevel = (n: number) => {
    const lv = Math.max(1, Math.round(n));
    levelRef.current = lv;
    setLevelState(lv);
    AsyncStorage.setItem(key, String(lv)).catch(() => {});
  };

  const reach = (target: number): boolean => {
    if (target > levelRef.current) { setLevel(target); return true; }
    return false;
  };

  return { level, loaded, setLevel, reach };
}
