/* psygames-tatham-bridge-monster-glyph · VER 1 · 23.09.2026 */
/**
 * 🔴 ЧУДОВИЩА «НЕЖИТИ» НА КЛАВИШЕ — ТЕ ЖЕ, ЧТО ДВИЖОК РИСУЕТ НА ДОСКЕ.
 *
 * 📍 ПОВОД. Денис, iPhone 403×873, v2.54.22, отзыв `91967288`: «Дизайн, нормально сделай
 * иконки». На доске счётчики нарисованы фигурами движка, а на клавишах стояли эмодзи
 * 👻 🧛 🧟 — другой рисунок, другой стиль, и на тёмной теме они читались как чужие наклейки.
 *
 * ЧТО ЗДЕСЬ. Перенос `draw_monster` (`~/dev/puzzles/undead.c:2473`) один в один:
 *   · призрак — верхняя половина круга и волнистый подол в три зубца, глаза с зрачками;
 *   · вампир — чёрные волосы сверху с мысом на лбу, бледное лицо, глаза, два клыка,
 *     прикрытые сверху ещё одним кругом лица (в движке это `clip` по полосе рта);
 *   · зомби — круг, глаза-крестики, приоткрытый рот из нижней половины кружка и черта губ.
 * Числа взяты из движка в долях `tilesize`; здесь `tilesize` = 100, центр (50, 50).
 *
 * ЦВЕТА — формула движка (`undead.c:2353–2363`) от белого фона:
 *   призрак rgb(128,255,255) · зомби rgb(128,255,128) · вампир rgb(255,230,230), обводка чёрная.
 * Поэтому клавиша и счётчик над доской показывают одно и то же существо.
 *
 * ⚠️ Номер здесь — НАША клавиша (1 призрак, 2 вампир, 3 зомби; `undead.c:1931–1945`), а не
 * внутренний код движка (там зомби = 4). Порядок сторожит гейт `sudoku-undead-monster-keys`.
 */
import React from 'react';
import Svg, { Circle, Defs, ClipPath, Rect, Path, Line, G } from 'react-native-svg';

const ЧЁРНЫЙ = '#000';
const ФОН = '#FFF';
const ПРИЗРАК = 'rgb(128,255,255)';
const ВАМПИР = 'rgb(255,230,230)';
const ЗОМБИ = 'rgb(128,255,128)';
const ОБВОДКА = 2.5;

/** Призрак: `undead.c:2479` — купол, подол в три зубца, глаза. */
function Призрак() {
  return (
    <G>
      <Path
        d="M10,50 A40,40 0 0 1 90,50 L90,90 L76,77 L63,90 L49,77 L36,90 L23,77 L10,90 Z"
        fill={ПРИЗРАК} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} strokeLinejoin="round"
      />
      <Circle cx={33.3} cy={41.7} r={10} fill={ФОН} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} />
      <Circle cx={66.7} cy={41.7} r={10} fill={ФОН} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} />
      <Circle cx={35.4} cy={41.7} r={2.6} fill={ЧЁРНЫЙ} />
      <Circle cx={68.8} cy={41.7} r={2.6} fill={ЧЁРНЫЙ} />
    </G>
  );
}

/** Вампир: `undead.c:2518` — волосы, мыс на лбу, лицо, глаза, клыки под прикрытием. */
function Вампир() {
  return (
    <G>
      <Defs>
        <ClipPath id="в-верх"><Rect x={2} y={2} width={96} height={51} /></ClipPath>
        <ClipPath id="в-верх-лево"><Rect x={2} y={2} width={48} height={50} /></ClipPath>
        <ClipPath id="в-верх-право"><Rect x={50} y={2} width={48} height={50} /></ClipPath>
        <ClipPath id="в-низ"><Rect x={2} y={50} width={96} height={48} /></ClipPath>
        <ClipPath id="в-рот"><Rect x={2} y={62.5} width={96} height={25} /></ClipPath>
      </Defs>
      <Circle cx={50} cy={50} r={40} fill={ЧЁРНЫЙ} clipPath="url(#в-верх)" />
      <Circle cx={35.7} cy={50} r={25.7} fill={ВАМПИР} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} clipPath="url(#в-верх-лево)" />
      <Circle cx={64.3} cy={50} r={25.7} fill={ВАМПИР} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} clipPath="url(#в-верх-право)" />
      <Circle cx={50} cy={50} r={40} fill={ВАМПИР} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} clipPath="url(#в-низ)" />
      <Circle cx={35.7} cy={43.8} r={6.3} fill={ФОН} stroke={ЧЁРНЫЙ} strokeWidth={2} />
      <Circle cx={64.3} cy={43.8} r={6.3} fill={ФОН} stroke={ЧЁРНЫЙ} strokeWidth={2} />
      <Circle cx={35.7} cy={43.8} r={2.1} fill={ЧЁРНЫЙ} />
      <Circle cx={64.3} cy={43.8} r={2.1} fill={ЧЁРНЫЙ} />
      <G clipPath="url(#в-рот)">
        <Path d="M31.3,62.5 L37.5,79.2 L43.8,62.5 Z" fill={ФОН} stroke={ЧЁРНЫЙ} strokeWidth={2} />
        <Path d="M68.8,62.5 L62.5,79.2 L56.3,62.5 Z" fill={ФОН} stroke={ЧЁРНЫЙ} strokeWidth={2} />
        <Circle cx={50} cy={30} r={40} fill={ВАМПИР} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} />
      </G>
    </G>
  );
}

/** Зомби: `undead.c:2571` — круг, глаза-крестики, приоткрытый рот. */
function Зомби() {
  return (
    <G>
      <Defs>
        <ClipPath id="з-рот"><Rect x={30} y={66.7} width={41} height={50} /></ClipPath>
      </Defs>
      <Circle cx={50} cy={50} r={40} fill={ЗОМБИ} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} />
      <Line x1={29.4} y1={35.4} x2={41.9} y2={47.9} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} strokeLinecap="round" />
      <Line x1={41.9} y1={35.4} x2={29.4} y2={47.9} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} strokeLinecap="round" />
      <Line x1={58.1} y1={35.4} x2={70.6} y2={47.9} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} strokeLinecap="round" />
      <Line x1={70.6} y1={35.4} x2={58.1} y2={47.9} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} strokeLinecap="round" />
      <Circle cx={43.3} cy={66.7} r={8.3} fill={ФОН} stroke={ЧЁРНЫЙ} strokeWidth={2} clipPath="url(#з-рот)" />
      <Line x1={30} y1={66.7} x2={70} y2={66.7} stroke={ЧЁРНЫЙ} strokeWidth={ОБВОДКА} strokeLinecap="round" />
    </G>
  );
}

/** Клавиша «Нежити»: 1 призрак · 2 вампир · 3 зомби. Чужой номер — ничего не рисуем. */
export default function MonsterGlyph({ номер, размер = 30 }: { номер: number; размер?: number }) {
  const фигура = номер === 1 ? <Призрак /> : номер === 2 ? <Вампир /> : номер === 3 ? <Зомби /> : null;
  if (!фигура) return null;
  return (
    <Svg width={размер} height={размер} viewBox="0 0 100 100" testID={`monster-glyph-${номер}`}>
      {фигура}
    </Svg>
  );
}

/**
 * Реестр рисунков клавиш: имя из `знакиЦифр[].рисунок` → чем рисовать.
 * Экран головоломок общий, поэтому он не знает про «Нежить» — он спрашивает реестр.
 */
export const РИСУНКИ_КЛАВИШ: Record<string, React.ComponentType<{ номер: number; размер?: number }>> = {
  undead: MonsterGlyph,
};
