import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { hapticTap } from './haptics';
import { settle } from './motion';

/**
 * 🔴 КЛЕТКА СЕМЕЙСТВА «СЕТКА СО ВСПЫШКОЙ» — ОДНА НА ЧЕТЫРЕ ИГРЫ.
 *
 * Носители: «Матрица памяти», N-back, «Блоки Корси», «Пространственный размах».
 * Все четыре рисовали клетку сами, и все четыре рисовали её одинаково плохо:
 * белый прямоугольник, `borderWidth: 2`, смена `backgroundColor` вместо
 * загорания. Денис 30.08.2026: «скучная и не красивая», «по сути близнецы».
 *
 * Почему компонент, а не четыре правки. Пятая игра семейства, дописанная по
 * образцу соседней, вернула бы плоский прямоугольник обратно — ровно так уже
 * возвращались пружины до появления `settle` (см. `motion.ts`). Клетка тут
 * одна: поправка приходит во все игры сразу.
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ ПРОСТОЙ СМЕНЫ ЦВЕТА:
 * · погашенная клетка УТОПЛЕНА (тёмная кромка сверху), зажжённая ВЫПУКЛАЯ —
 *   разница читается даже боковым зрением, а не только по цвету;
 * · зажигание — короткий подскок масштаба, а не мгновенная заливка: глаз
 *   ловит событие, даже когда смотрит в соседний угол поля;
 * · вокруг зажжённой — ореол того же цвета: подсветка не обрывается по краю.
 *
 * ⚠️ ЦВЕТ НИКОГДА НЕ ЕДИНСТВЕННЫЙ ПРИЗНАК. У состояний ответа есть форма:
 * верное — точка, неверное — косой крест, пропущенное — кольцо. Иначе клетки
 * неразличимы при дальтонизме (§11.18 карты геймификации).
 */

export type FlashState =
  | 'idle'       // погашена
  | 'lit'        // горит (первая серия / показ)
  | 'lit2'       // горит второй серией (другой цвет)
  | 'picked'     // выбрана игроком, ответ ещё не проверен
  | 'correct'    // верно
  | 'wrong'      // неверно
  | 'missed';    // пропущена — была нужна, но не выбрана

interface Props {
  size: number;
  state: FlashState;
  onPress?: () => void;
  disabled?: boolean;
  /** Цвет первой серии — у игр он свой (фиолетовый / янтарный). */
  litColor?: string;
  /** Цвет второй серии (режим двух наборов в «Матрице памяти»). */
  lit2Color?: string;
  /** Фон погашенной клетки и цвет кромки — из темы вызывающей игры. */
  idleColor: string;
  borderColor: string;
  radius?: number;
  a11yLabel?: string;
  a11yState?: { selected?: boolean; disabled?: boolean };
  style?: ViewStyle;
}

const CORRECT = '#22c55e';
const WRONG = '#f43f5e';
const MISSED = '#fbbf24';

/** Пара «светлее → темнее» для объёмной грани зажжённой клетки. */
function faceColors(base: string): [string, string] {
  return [base, shade(base, 0.78)];
}

/** Затемнение hex-цвета на долю k (0,78 = на 22 % темнее). Для нижней грани. */
function shade(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default function FlashCell({
  size, state, onPress, disabled,
  litColor = '#8e2de2', lit2Color = '#ef4444',
  idleColor, borderColor, radius = 14,
  a11yLabel, a11yState, style,
}: Props) {
  const reduced = useReducedMotion();
  // ⚠️ `useState`, а не `useRef(...).current`: чтение `.current` в теле
  // компонента — обращение к рефу во время рендера, и линтер справедливо на
  // это ругается. Ленивый инициализатор даёт то же самое (значение создаётся
  // один раз) и не растит долг линта.
  const [pop] = useState(() => new Animated.Value(1));
  const prev = useRef<FlashState>(state);

  useEffect(() => {
    const wasDark = prev.current === 'idle';
    prev.current = state;
    // Подскок ровно на ЗАГОРАНИИ, а не на любой смене состояния: иначе поле
    // дёргается целиком на фазе проверки, когда состояния меняются у всех.
    if (!wasDark || state === 'idle') return;
    settle(pop, 1.06, reduced, { friction: 5, tension: 220 });
    const t = setTimeout(() => settle(pop, 1, reduced, { friction: 6, tension: 180 }), 130);
    return () => clearTimeout(t);
  }, [state, reduced, pop]);

  const on = state !== 'idle';
  const base =
    state === 'lit' ? litColor :
    state === 'lit2' ? lit2Color :
    state === 'picked' ? litColor :
    state === 'correct' ? CORRECT :
    state === 'wrong' ? WRONG :
    state === 'missed' ? MISSED : idleColor;

  const body = (
    <Animated.View style={[{ width: size, height: size, transform: [{ scale: pop }] }, style]}>
      {on ? (
        <View style={[styles.lit, { borderRadius: radius, shadowColor: base }]}>
          <LinearGradient
            colors={faceColors(base)}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={[styles.face, { borderRadius: radius }]}
          >
            <View style={[styles.gloss, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} pointerEvents="none" />
            {/* Форма поверх цвета — ответ читается без различения цветов. */}
            {state === 'correct' && <View style={styles.markDot} />}
            {state === 'wrong' && (
              <View style={styles.markCrossBox}>
                <View style={[styles.markBar, { transform: [{ rotate: '45deg' }] }]} />
                <View style={[styles.markBar, { transform: [{ rotate: '-45deg' }] }]} />
              </View>
            )}
            {state === 'missed' && <View style={styles.markRing} />}
          </LinearGradient>
        </View>
      ) : (
        <View
          style={[
            styles.idle,
            { borderRadius: radius, backgroundColor: idleColor, borderColor },
          ]}
        />
      )}
    </Animated.View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => { if (!disabled) { hapticTap(); onPress(); } }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={a11yState}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Погашенная УТОПЛЕНА: светлая кромка снизу, тёмная сверху — обратный рельеф
  // к зажжённой. Поэтому поле читается как набор лунок, а не как таблица.
  idle: {
    flex: 1,
    borderWidth: 1,
    borderTopWidth: 3,
    borderTopColor: 'rgba(0,0,0,0.13)',
    borderBottomColor: 'rgba(255,255,255,0.5)',
  },
  lit: { flex: 1, shadowOpacity: 0.55, shadowRadius: 9, shadowOffset: { width: 0, height: 0 }, elevation: 7 },
  face: {
    flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)',
    borderBottomWidth: 3, borderBottomColor: 'rgba(0,0,0,0.25)',
  },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '42%', backgroundColor: 'rgba(255,255,255,0.18)' },
  markDot: { width: '26%', aspectRatio: 1, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)' },
  markCrossBox: { width: '36%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  markBar: { position: 'absolute', width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.92)' },
  markRing: { width: '34%', aspectRatio: 1, borderRadius: 999, borderWidth: 4, borderColor: 'rgba(255,255,255,0.92)' },
});
