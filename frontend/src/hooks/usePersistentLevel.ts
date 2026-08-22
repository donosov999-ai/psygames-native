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
 * reach(target): поднимает уровень до target, если target больше достигнутого (и сохраняет),
 *   плюс сбрасывает счётчик провалов подряд (успех = чистый лист).
 * fail(): увеличивает счётчик провалов подряд; при достижении FAIL_STREAK_THRESHOLD (3)
 *   понижает уровень на 1 (не ниже 1) и сбрасывает счётчик. Возвращает true при понижении.
 *   Паттерн гистерезиса — как в brainworkshop/cogniba: единичный провал НЕ наказывает
 *   сразу, чтобы не разочаровывать за одну неудачную сессию.
 * setLevel(n): прямая установка + сохранение (сбрасывает счётчик провалов).
 *
 * ПЕРЕИГРАТЬ ПРОЙДЕННОЕ (pick). Денис про тропинку: «там можно вернуться к боссу
 * или какой-то интересной части». Нажатие на пройденный узел зовёт pick(n) — и
 * `level` временно отдаёт n вместо достигнутого. Игру это не касается: она как
 * читала `lvl.level`, так и читает, и стартует та же кнопка «Начать».
 *
 * Три правила переигровки, иначе она превращается в наказание:
 *   1. выбрать можно только ПРОЙДЕННОЕ — вперёд не перепрыгнуть;
 *   2. провал на переигровке НЕ понижает уровень: человек сам полез в лёгкое,
 *      это не показатель, что ему стало трудно;
 *   3. выбор живёт в памяти и снимается на конце раунда — перезапуск приложения
 *      или следующий заход возвращают на достигнутое.
 * Смысл переигровки — добрать звёзды: saveLevelStars хранит ЛУЧШИЙ результат,
 * так что второй заход может улучшить оценку, но не испортить её.
 */
import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getMaxLevelFromSessions } from '@/src/services/api';
import { pickTarget } from '@/src/services/levelPick';
import { IS_WEB_DEMO } from '@/src/services/buildTarget';
import { cachedLevelValue, rememberLevelValue, warmLevelCache } from '@/src/services/levelCache';

const FAIL_STREAK_THRESHOLD = 3;

export interface PersistentLevel {
  level: number;                        // НА ЧЁМ ИГРАТЬ: выбранный на тропинке либо достигнутый
  best: number;                         // достигнутый потолок — он и растёт
  picked: number | null;                // выбран пройденный уровень (переигровка) либо null
  loaded: boolean;
  setLevel: (n: number) => void;
  reach: (target: number) => boolean;   // bump-up до target, true если повысился
  fail: () => boolean;                  // провал уровня; true если после этого понизился
  pick: (n: number) => void;            // переиграть пройденный уровень; n ≥ best снимает выбор
}

export function usePersistentLevel(gameId: string, initial = 1): PersistentLevel {
  const { profile } = useProfile();
  const pid = (profile as any)?.id ?? 'default';
  const key = `psygames_${gameId}_level_${pid}`;
  const failKey = `psygames_${gameId}_failstreak_${pid}`;
  /**
   * ⚠️ ЕСЛИ УРОВЕНЬ УЖЕ ЗНАЕМ — ОТВЕЧАЕМ ПЕРВЫМ ЖЕ КАДРОМ. Асинхронное чтение не
   * может успеть до эффектов монтирования, поэтому автостарт видел `initial`
   * вместо достигнутого и играл первый уровень человеку с двенадцатым. Тёплый кэш
   * (`levelCache`) читает все уровни одним заходом на старте приложения, и здесь
   * остаётся только взять готовое. Холодный кэш ведёт себя как раньше.
   */
  const cachedRaw = IS_WEB_DEMO ? undefined : cachedLevelValue(key);
  const cachedLevel = cachedRaw === undefined ? null : (() => {
    const n = parseInt(cachedRaw || '', 10);
    return n >= 1 ? n : null;
  })();
  const [level, setLevelState] = useState(cachedLevel ?? initial);
  const [loaded, setLoaded] = useState(cachedLevel !== null);
  const levelRef = useRef(cachedLevel ?? initial);
  const failStreakRef = useRef(0);
  // Выбор на тропинке. ⚠️ Только в памяти: перезапуск приложения обязан вернуть
  // человека на достигнутое, иначе забытая переигровка тихо занижает сложность.
  const [picked, setPicked] = useState<number | null>(null);
  const pickedRef = useRef<number | null>(null);
  const clearPick = () => { pickedRef.current = null; setPicked(null); };

  useEffect(() => {
    // Смена профиля или игры — переигровка чужая, снимаем.
    pickedRef.current = null;
    setPicked(null);
    // Web-demo: прогресс не читаем и не пишем — всегда стартовый уровень (демо-раунд).
    if (IS_WEB_DEMO) {
      levelRef.current = initial;
      setLevelState(initial);
      failStreakRef.current = 0;
      setLoaded(true);
      return;
    }
    let cancelled = false;
    // Прогрев мог не успеть стартовать (глубокая ссылка прямо в игру) — толкаем его.
    void warmLevelCache();
    if (cachedLevelValue(key) === undefined) setLoaded(false);
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
        if (restored > 1) { rememberLevelValue(key, String(restored)); AsyncStorage.setItem(key, String(restored)).catch(() => {}); }
      }
      failStreakRef.current = parseInt(f || '', 10) || 0;
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [key, failKey, initial, gameId]);

  const setFailStreak = (n: number) => {
    failStreakRef.current = n;
    if (IS_WEB_DEMO) return;   // демо: запись прогресса выключена
    rememberLevelValue(failKey, String(n));
    AsyncStorage.setItem(failKey, String(n)).catch(() => {});
  };

  const setLevel = (n: number) => {
    const lv = Math.max(1, Math.round(n));
    levelRef.current = lv;
    setLevelState(lv);
    if (!IS_WEB_DEMO) { rememberLevelValue(key, String(lv)); AsyncStorage.setItem(key, String(lv)).catch(() => {}); }   // демо: без записи
    setFailStreak(0);
    clearPick();
  };

  /**
   * Выбрать пройденный уровень. Выше достигнутого не пускаем — тропинка не лифт:
   * иначе тапом по дальнему узлу можно было бы перескочить всю сложность.
   */
  const pick = (n: number) => {
    const next = pickTarget(n, levelRef.current);
    pickedRef.current = next;
    setPicked(next);
  };

  const reach = (target: number): boolean => {
    if (IS_WEB_DEMO) return false;   // демо: уровень не растёт (всегда демо-раунд уровня 1), записи нет
    // ⚠️ Сравниваем с ДОСТИГНУТЫМ, а не с тем, на чём играли. Переигровка лёгкого
    // уровня иначе выглядела бы как «дорос до 3» и обнуляла бы честную десятку.
    if (target > levelRef.current) { setLevel(target); return true; }   // setLevel снимает выбор
    setFailStreak(0);   // уровень пройден (пусть и не выше текущего потолка) — сбрасываем счётчик провалов
    clearPick();
    return false;
  };

  const fail = (): boolean => {
    if (IS_WEB_DEMO) return false;   // демо: без понижений и записи
    // Провалил уровень, на который сам вернулся, — это не «стало трудно», а выбор
    // человека. Понижать за это значит наказывать за интерес к своей же истории.
    if (pickedRef.current !== null) { clearPick(); return false; }
    const streak = failStreakRef.current + 1;
    if (streak >= FAIL_STREAK_THRESHOLD && levelRef.current > 1) {
      setLevel(levelRef.current - 1);   // setLevel уже обнуляет failStreak
      return true;
    }
    setFailStreak(streak);
    return false;
  };

  return { level: picked ?? level, best: level, picked, loaded, setLevel, reach, fail, pick };
}
