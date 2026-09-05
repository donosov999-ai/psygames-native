/* psygames-balls-choice · VER 1 · 05.09.2026 */
/**
 * Выбор фактуры шаров — общий для игр, где катаются кружки.
 *
 * ЗАЧЕМ. Денис 05.09.2026: «трекер объектов и ещё куча упражнений с плохими
 * шариками… отрисуй сеткой их, разные по стилю, чтобы заменить и дать выбор; не
 * просто разные цвета, а разные текстуры: стекло, пушистые, как капля воды».
 * Плоский круг с обводкой был не «скромным», а никаким: девять фактур — стекло,
 * мех, хром, желе, неон, камень, мыльный пузырь — стоят ровно столько же кода.
 *
 * 🔴 ВЫБИРАЕТСЯ ФАКТУРА, А НЕ ЦВЕТ КАЖДОГО ШАРА. В трекере объектов все объекты
 * в движении обязаны быть НЕРАЗЛИЧИМЫ — в этом вся игра. Разреши выбирать цвет
 * каждому объекту, и следить станет не за чем: цель будет видно без всякого
 * внимания. Поэтому фактура одна на партию, а цвет берётся от уровня — общий для
 * всех объектов раунда и меняющийся по мере прохождения.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

import {
  BALL_STYLES, BALL_COLORS, BALL_IMG, BLOCK_IMG, type BallStyle, type BallColor,
} from './ballAssets.generated';

export { BALL_STYLES, BALL_COLORS, BALL_IMG, BLOCK_IMG };
export type { BallStyle, BallColor };

const KEY = 'psygames_ball_style';
export const BALL_STYLE_DEFAULT: BallStyle = 'glossy';

export async function getBallStyle(): Promise<BallStyle> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return (BALL_STYLES as readonly string[]).includes(v ?? '') ? (v as BallStyle) : BALL_STYLE_DEFAULT;
  } catch { return BALL_STYLE_DEFAULT; }
}

/** Смена фактуры живьём: игра, открытая рядом, перерисуется без перезахода. */
export const BALL_STYLE_EVENT = 'psygames:ballStyle';

export async function setBallStyle(s: BallStyle): Promise<void> {
  try { await AsyncStorage.setItem(KEY, s); } catch {}
  DeviceEventEmitter.emit(BALL_STYLE_EVENT, s);
}

/**
 * Фактура шаров для игры.
 *
 * ⚠️ ХУК, А НЕ ПРОП. Шары нужны нескольким играм сразу, и протаскивать выбор
 * пропом через экран → раунд → узел значит завести три места, где его можно
 * забыть. Выбор общий на приложение — значит и читается он там, где рисуется.
 */
export function useBallStyle(): BallStyle {
  const [style, setStyle] = React.useState<BallStyle>(BALL_STYLE_DEFAULT);
  React.useEffect(() => {
    let alive = true;
    getBallStyle().then((s) => { if (alive) setStyle(s); }).catch(() => {});
    const sub = DeviceEventEmitter.addListener(BALL_STYLE_EVENT, (s: BallStyle) => {
      if ((BALL_STYLES as readonly string[]).includes(s)) setStyle(s);
    });
    return () => { alive = false; sub.remove(); };
  }, []);
  return style;
}

/**
 * Цвет раунда по уровню: один на все объекты, меняется с прохождением.
 *
 * ⚠️ Берётся ОСТАТОК, а не случайное число: случайный цвет пересчитывался бы на
 * каждой перерисовке, и объекты мигали бы разными цветами прямо во время
 * слежения — то есть ровно та разница, которой в них быть не должно.
 */
export function ballColorForLevel(level: number): BallColor {
  const n = Number.isFinite(level) ? Math.floor(level) : 1;
  return BALL_COLORS[((n % BALL_COLORS.length) + BALL_COLORS.length) % BALL_COLORS.length];
}

/** Картинка шара. Нет такой пары — падаем на умолчание, а не на белый квадрат. */
export function ballImage(style: BallStyle, color: BallColor): any {
  return BALL_IMG[style]?.[color] ?? BALL_IMG[BALL_STYLE_DEFAULT][color] ?? BALL_IMG[BALL_STYLE_DEFAULT].blue;
}

/**
 * Представительный цвет каждого набора — чтобы подобрать ближайший к тому, что
 * игра уже использует. Числа сняты с самих картинок (средний цвет непрозрачной
 * части ряда `glossy`), а не выбраны на глаз.
 */
const ЦВЕТ_НАБОРА: Record<BallColor, [number, number, number]> = {
  red: [214, 58, 58], orange: [232, 138, 44], yellow: [235, 202, 60],
  green: [104, 190, 74], mint: [116, 214, 172], cyan: [78, 196, 226],
  blue: [72, 118, 214], purple: [166, 84, 214], pink: [234, 128, 176],
  white: [238, 240, 244],
};

/**
 * 🔴 БЛИЖАЙШИЙ ЦВЕТ НАБОРА К ТОМУ, ЧТО ИГРА УЖЕ РИСУЕТ.
 *
 * Клетки и кубики окрашены по СМЫСЛУ: подсвечена, выбрана, верно, неверно — и
 * каждая игра задаёт свои цвета градиентом. Подменить их одним фиксированным
 * набором значило бы стереть смысл ради красоты. Поэтому фактуру выбирает
 * человек, а цвет по-прежнему приходит от игры: здесь он лишь переводится в
 * ближайший из десяти нарисованных.
 *
 * ⚠️ Сравнение в простом RGB, без цветовых пространств: десять образцов
 * разнесены далеко, и разницы между метриками тут нет. Городить CIELAB ради
 * выбора из десяти — тот самый велосипед.
 */
export function nearestPieceColor(hex: string): BallColor {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'white';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  let лучший: BallColor = 'white';
  let ближе = Infinity;
  for (const [имя, [cr, cg, cb]] of Object.entries(ЦВЕТ_НАБОРА) as [BallColor, [number, number, number]][]) {
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < ближе) { ближе = d; лучший = имя; }
  }
  return лучший;
}

/** Картинка квадратной плитки той же фактуры. */
export function blockImage(style: BallStyle, color: BallColor): any {
  return BLOCK_IMG[style]?.[color] ?? BLOCK_IMG[BALL_STYLE_DEFAULT][color] ?? BLOCK_IMG[BALL_STYLE_DEFAULT].white;
}
