import React, { useEffect, useState } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import PetSprite from './PetSprite';
import { getPetSkin, getPetVisible, PET_VISIBLE_EVENT } from '@/src/services/pet';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { settle } from '@/src/components/juice/motion';

/**
 * 🔴 ПИТОМЕЦ В ШАПКЕ ИГРЫ — ОТВЕТ ИГРЫ, А НЕ УКРАШЕНИЕ.
 *
 * Решение Дениса 30.08.2026: «идею с маскотом в верхнем тулбаре зафиксируй,
 * надо её сквозной сделать, на все игры» и «можно тестово в них пока».
 *
 * ЗАЧЕМ. У эталона жанра лицо маскота меняется РАНЬШЕ, чем игрок успевает
 * посмотреть на счёт: серия идёт — радость, серия сорвана — грусть, уровень
 * взят — палец вверх. У нас питомец жил на главной, на своём экране, на карте
 * уровней и в перебивке — и НИ В ОДНОЙ игре, при том что шапка у 72 игр из 74
 * общая (`GameShell`).
 *
 * ⚠️ ПОЧЕМУ ПРОП, А НЕ ПОДПИСКА НА СОБЫТИЯ. Подписка — правильная цель (задача
 * `9d0503c7`), но она требует единого канала событий партии, которого пока нет.
 * Проп даёт то же поведение сегодня и не мешает завтра: когда канал появится,
 * `GameShell` будет читать его сам, а игры перестанут передавать `pet`.
 *
 * УВАЖЕНИЕ К НАСТРОЙКАМ. Скин берётся тот же, что у питомца на главной; если
 * питомец выключен в настройках — здесь его тоже нет. Щадящий режим убирает
 * подскок, оставляя смену выражения: смысл важнее движения (см. `motion.ts`).
 */

/** Что случилось в партии — на языке игры, а не спрайта. */
export type PetMood =
  | 'idle'   // ничего не происходит
  | 'good'   // верное действие
  | 'bad'    // ошибка
  | 'win';   // раунд или уровень взят

/** Сколько держится реакция, прежде чем питомец вернётся в покой. */
const HOLD_MS: Record<Exclude<PetMood, 'idle'>, number> = { good: 700, bad: 900, win: 1600 };

export default function GamePet({ mood = 'idle', size = 34 }: { mood?: PetMood; size?: number }) {
  const reduced = useReducedMotion();
  const [skin, setSkin] = useState<'cat' | 'robot' | 'constellation'>('cat');
  const [visible, setVisible] = useState(true);
  const [shown, setShown] = useState<PetMood>('idle');
  // ⚠️ `useState`, а не `useRef(...).current`: чтение `.current` в теле
  // компонента — обращение к рефу во время рендера, и линтер справедливо на
  // это ругается. Ленивый инициализатор даёт то же самое (значение создаётся
  // один раз) и не растит долг линта.
  const [pop] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let alive = true;
    getPetSkin().then((s) => { if (alive) setSkin(s); }).catch(() => {});
    getPetVisible().then((v) => { if (alive) setVisible(v); }).catch(() => {});
    // Настройку могли переключить, пока игра открыта.
    const onVis = (e: Event) => setVisible(Boolean((e as CustomEvent).detail));
    if (typeof window !== 'undefined') window.addEventListener(PET_VISIBLE_EVENT, onVis as EventListener);
    return () => {
      alive = false;
      if (typeof window !== 'undefined') window.removeEventListener(PET_VISIBLE_EVENT, onVis as EventListener);
    };
  }, []);

  useEffect(() => {
    if (mood === 'idle') { setShown('idle'); return; }
    setShown(mood);
    // Подскок только на удаче: на ошибке дёргать питомца — насмешка над игроком.
    if (mood !== 'bad') {
      settle(pop, 1.18, reduced, { friction: 4, tension: 260 });
      setTimeout(() => settle(pop, 1, reduced, { friction: 6, tension: 200 }), 140);
    }
    const t = setTimeout(() => setShown('idle'), HOLD_MS[mood]);
    return () => clearTimeout(t);
  }, [mood, reduced, pop]);

  if (!visible) return null;

  const state =
    shown === 'good' ? 'jump' :
    shown === 'win' ? 'wave' :
    shown === 'bad' ? 'sleep' : 'idle';

  return (
    // Питомец — не кнопка и не сообщение: скринридер его пропускает, состояние
    // партии он получает от самих клеток и счётчиков.
    <Animated.View
      style={[styles.box, { width: size, height: size, transform: [{ scale: pop }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <View style={styles.inner}>
        <PetSprite state={state} size={size} skin={skin} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  inner: { alignItems: 'center', justifyContent: 'center' },
});
