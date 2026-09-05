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

import { BALL_STYLES, BALL_COLORS, BALL_IMG, type BallStyle, type BallColor } from './ballAssets.generated';

export { BALL_STYLES, BALL_COLORS, BALL_IMG };
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
