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
 * fail(): увеличивает счётчик провалов подряд; при достижении порога (3 по умолчанию,
 *   у маджонга 5 — третий довод хука)
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
import { useState, useEffect, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { завестиЛестницу } from '@/src/services/levelRegistry';
import { useProfile } from '@/src/contexts/ProfileContext';
import { getMaxLevelFromSessions } from '@/src/services/api';
import { pickTarget } from '@/src/services/levelPick';
import { IS_WEB_DEMO } from '@/src/services/buildTarget';
import { cachedLevelValue, rememberLevelValue, warmLevelCache } from '@/src/services/levelCache';
import { useLocalSearchParams } from 'expo-router';
import { isProgressiveWarmup, trainingLevelId, webOwnsLevelProgress } from '@/src/services/warmupProgression';

/**
 * Сколько провалов ПОДРЯД опускают уровень. Три — общее правило приложения.
 *
 * ⚠️ Порог настраивается третьим доводом `usePersistentLevel`, и это не украшение
 * API: у игр разная цена проигрыша. В маджонге доска встаёт насмерть у 60 % раздач
 * на 28-м уровне и у 53 % на 40-м (замер 06.09.2026, 30 партий на уровень,
 * случайная игра — для человека верхняя граница). Три подряд там — обычное
 * невезение, а не «стало трудно». Решение Дениса 11.09.2026: у маджонга ПЯТЬ.
 * Менять порог ОДНОЙ игре, а не всем сразу.
 */
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

export function usePersistentLevel(gameId: string, initial = 1, порогПровалов = FAIL_STREAK_THRESHOLD): PersistentLevel {
  const { profile } = useProfile();
  const pid = (profile as any)?.id ?? 'default';
  const progressive = isProgressiveWarmup(useLocalSearchParams<Record<string, string>>());
  const levelId = trainingLevelId(gameId, progressive);
  const key = `psygames_${levelId}_level_${pid}`;
  const personalKey = `psygames_${gameId}_level_${pid}`;
  const failKey = `psygames_${levelId}_failstreak_${pid}`;
  /**
   * ⚠️ ЕСЛИ УРОВЕНЬ УЖЕ ЗНАЕМ — ОТВЕЧАЕМ ПЕРВЫМ ЖЕ КАДРОМ. Асинхронное чтение не
   * может успеть до эффектов монтирования, поэтому автостарт видел `initial`
   * вместо достигнутого и играл первый уровень человеку с двенадцатым. Тёплый кэш
   * (`levelCache`) читает все уровни одним заходом на старте приложения, и здесь
   * остаётся только взять готовое. Холодный кэш ведёт себя как раньше.
   */
  const ownCached = cachedLevelValue(key);
  const cachedRaw = IS_WEB_DEMO ? undefined : progressive ? ownCached ?? cachedLevelValue(personalKey) : ownCached;
  const cachedLevel = cachedRaw === undefined ? null : (() => {
    const n = parseInt(cachedRaw || '', 10);
    return n >= 1 ? n : null;
  })();
  const [level, setLevelState] = useState(cachedLevel ?? initial);
  const [loaded, setLoaded] = useState(cachedLevel !== null);
  const [stateKey, setStateKey] = useState(key);
  const levelRef = useRef(cachedLevel ?? initial);
  const loadedRef = useRef(cachedLevel !== null);
  const scope = useMemo(() => ({ key, initial, gameId, progressive }), [key, initial, gameId, progressive]);
  const activeScopeRef = useRef<typeof scope | null>(null);
  const mutationRef = useRef(0);
  const failStreakRef = useRef(0);
  const trainingAdvancedRef = useRef(false);
  // Выбор на тропинке. ⚠️ Только в памяти: перезапуск приложения обязан вернуть
  // человека на достигнутое, иначе забытая переигровка тихо занижает сложность.
  const [picked, setPicked] = useState<number | null>(null);
  const pickedRef = useRef<number | null>(null);
  const clearPick = () => { pickedRef.current = null; setPicked(null); };

  useEffect(() => {
    activeScopeRef.current = scope;
    let cancelled = false;
    const publish = () => {
      if (cancelled) return;
      setStateKey(key);
      setPicked(null);
      setLevelState(levelRef.current);
      setLoaded(loadedRef.current);
    };
    // Смена профиля или игры — переигровка чужая, снимаем.
    pickedRef.current = null;
    trainingAdvancedRef.current = false;
    // Web-demo: прогресс не читаем и не пишем — всегда стартовый уровень (демо-раунд).
    if (IS_WEB_DEMO) {
      levelRef.current = initial;
      failStreakRef.current = 0;
      loadedRef.current = true;
      void Promise.resolve().then(publish);
      return () => { cancelled = true; activeScopeRef.current = null; loadedRef.current = false; };
    }
    // Прогрев мог не успеть стартовать (глубокая ссылка прямо в игру) — толкаем его.
    void warmLevelCache();
    // Never expose the previous profile/mode's level while the new key loads.
    // Read this snapshot inside the effect rather than depending on a render's
    // changing cache value: success writes must not restart this loading effect.
    const own = cachedLevelValue(key);
    const raw = progressive ? own ?? cachedLevelValue(personalKey) : own;
    const snapshot = parseInt(raw ?? '', 10);
    const ready = snapshot >= 1;
    levelRef.current = ready ? snapshot : initial;
    failStreakRef.current = 0;
    loadedRef.current = ready;
    void Promise.resolve().then(publish);
    const revision = mutationRef.current;
    Promise.all([AsyncStorage.getItem(key), AsyncStorage.getItem(failKey),
      progressive ? AsyncStorage.getItem(personalKey) : Promise.resolve(null),
    ]).then(async ([v, f, personal]) => {
      if (cancelled) return;
      // A warm-cache autostart may finish before this read resolves. Never undo
      // a success with the snapshot that was taken before that success.
      if (mutationRef.current !== revision) return;
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
          // A training ladder must not promote personal history (or inherit a
          // fabricated maximum from unrelated modes). Bootstrap from the real key.
          const personalLevel = Number(personal);
          const fromSessions = progressive
            ? Number.isFinite(personalLevel) && personalLevel >= 1 ? Math.floor(personalLevel) : initial
            : await getMaxLevelFromSessions(gameId);
          if (cancelled) return;
          if (mutationRef.current !== revision) return;
          restored = Math.max(initial, fromSessions);
        } catch { /* нет истории → initial */ }
        levelRef.current = restored;
        setLevelState(restored);
        // Persist even L1: bootstrap is once, not a fresh inheritance from personal
        // every time training is reopened. Hidden native underlays must not write it.
        if ((progressive || restored > 1) && webOwnsLevelProgress(progressive)) {
          rememberLevelValue(key, String(restored));
          AsyncStorage.setItem(key, String(restored)).catch(() => {});
        }
      }
      failStreakRef.current = parseInt(f || '', 10) || 0;
      setLoaded(true);
      loadedRef.current = true;
    }).catch(() => { if (!cancelled) { setLoaded(true); loadedRef.current = true; } });
    return () => { cancelled = true; activeScopeRef.current = null; loadedRef.current = false; };
  }, [key, failKey, initial, gameId, progressive, personalKey, scope]);

  // Delayed callbacks from a previous profile/mode or an unmounted route do not
  // own this ladder. Check the host live, since overlay signals need no rerender.
  const canWrite = () => activeScopeRef.current === scope && loadedRef.current && webOwnsLevelProgress(progressive);

  const setFailStreak = (n: number) => {
    mutationRef.current += 1;
    failStreakRef.current = n;
    if (IS_WEB_DEMO) return;   // демо: запись прогресса выключена
    rememberLevelValue(failKey, String(n));
    AsyncStorage.setItem(failKey, String(n)).catch(() => {});
  };

  const setLevel = (n: number) => {
    if (!canWrite() || !Number.isFinite(n)) return;
    mutationRef.current += 1;
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
    if (!canWrite()) return;
    const next = pickTarget(n, levelRef.current);
    pickedRef.current = next;
    setPicked(next);
  };

  const reach = (target: number): boolean => {
    if (IS_WEB_DEMO) return false;   // демо: уровень не растёт (всегда демо-раунд уровня 1), записи нет
    if (!canWrite() || !Number.isFinite(target)) return false;
    if (progressive && trainingAdvancedRef.current) return false;
    // ⚠️ Сравниваем с ДОСТИГНУТЫМ, а не с тем, на чём играли. Переигровка лёгкого
    // уровня иначе выглядела бы как «дорос до 3» и обнуляла бы честную десятку.
    if (target > levelRef.current) {
      // One counted full round unlocks exactly the next training step. The game
      // still owns its success criterion and must call reach only on that success.
      setLevel(progressive ? levelRef.current + 1 : target);
      if (progressive) trainingAdvancedRef.current = true;
      return true;
    }   // setLevel снимает выбор
    setFailStreak(0);   // уровень пройден (пусть и не выше текущего потолка) — сбрасываем счётчик провалов
    clearPick();
    return false;
  };

  const fail = (): boolean => {
    if (IS_WEB_DEMO) return false;   // демо: без понижений и записи
    if (!canWrite()) return false;
    if (progressive) return false;  // a failed warmup stays for another attempt
    // Провалил уровень, на который сам вернулся, — это не «стало трудно», а выбор
    // человека. Понижать за это значит наказывать за интерес к своей же истории.
    if (pickedRef.current !== null) { clearPick(); return false; }
    const streak = failStreakRef.current + 1;
    if (streak >= порогПровалов && levelRef.current > 1) {
      setLevel(levelRef.current - 1);   // setLevel уже обнуляет failStreak
      return true;
    }
    setFailStreak(streak);
    return false;
  };

  const currentLevel = stateKey === key ? level : cachedLevel ?? initial;
  const currentPick = stateKey === key ? picked : null;
  const снаружи: PersistentLevel = {
    level: currentPick ?? currentLevel, best: currentLevel, picked: currentPick,
    loaded: stateKey === key ? loaded : cachedLevel !== null, setLevel, reach, fail, pick,
  };

  /**
   * Запись в общий реестр живых лестниц (`services/levelRegistry`), откуда каркас
   * берёт её для пунктов «уровень проще / сложнее» в меню паузы.
   *
   * ⚠️ Ссылка обновляется В ЭФФЕКТЕ БЕЗ СПИСКА ЗАВИСИМОСТЕЙ, а не во время рендера:
   * запись во время рендера линт ловит как ошибку, и правильно — под Strict Mode
   * она прошла бы дважды. Эффект без списка выполняется после каждого кадра, а меню
   * паузы открывается нажатием, то есть заведомо позже.
   */
  const запись = useRef<ReturnType<typeof завестиЛестницу> | null>(null);
  useEffect(() => {
    запись.current = завестиЛестницу(gameId, снаружи);
    return () => { запись.current?.снять(); запись.current = null; };
  }, [gameId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { запись.current?.обновить(снаружи); });

  return снаружи;
}
