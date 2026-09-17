/* psygames-oblique-section-reference · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача 4f85b6a9 */
/**
 * РИСУНОК «СЕЧЕНИЯ»: ПАРАЛЛЕЛЕПИПЕД И КОСАЯ ПЛОСКОСТЬ, КАК В УЧЕБНИКЕ СТЕРЕОМЕТРИИ.
 *
 * Рёбра тела — линиями: видимые сплошные, невидимые пунктиром; сечение — закрашенный многоугольник
 * с точками вершин на рёбрах. Кубики здесь не рисуются: у косой плоскости разрез не клетчатый, и
 * грани кубиков спорили бы с его сторонами.
 *
 * Проекция та же, что у рисователя кубиков (`isoProject`): видны грани +x, +y, +z, значит невидима
 * вершина (0, 0, 0) и три ребра из неё. Сторона сечения, лежащая только на невидимых гранях
 * (x = 0, y = 0 или z = 0), рисуется пунктиром — так же, как невидимое ребро.
 */
import React from 'react';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { boxEdges, boxVertices, isoProject } from '@/src/games/mental-rotation/core/oblique';
import type { Vec3 } from '@/src/games/mental-rotation/core/types';

const ЛИНИЯ = '#5b4a78';
const СЕЧЕНИЕ = '#f59e0b';

export function ObliqueSectionReference({ dims, section, size, accent = СЕЧЕНИЕ }: {
  dims: Vec3; section: Vec3[]; size: number; accent?: string;
}) {
  const verts = boxVertices(dims).map(isoProject);
  const xs = verts.map((p) => p[0]), ys = verts.map((p) => p[1]);
  const margin = 10;
  const k = (size - 2 * margin) / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const ox = (size - (Math.max(...xs) - Math.min(...xs)) * k) / 2 - Math.min(...xs) * k;
  const oy = (size - (Math.max(...ys) - Math.min(...ys)) * k) / 2 - Math.min(...ys) * k;
  const at = (p: Vec3): [number, number] => { const [x, y] = isoProject(p); return [x * k + ox, y * k + oy]; };
  const hidden = (a: Vec3, b: Vec3) => [a, b].some((p) => p[0] === 0 && p[1] === 0 && p[2] === 0);
  // Сторона сечения невидима, если обе её точки лежат на одной и той же невидимой грани и ни на одной видимой.
  const onFace = (p: Vec3, axis: number, value: number) => Math.abs(p[axis] - value) < 1e-9;
  const sideHidden = (a: Vec3, b: Vec3) => {
    const visible = [0, 1, 2].some((ax) => onFace(a, ax, dims[ax]) && onFace(b, ax, dims[ax]));
    const invisible = [0, 1, 2].some((ax) => onFace(a, ax, 0) && onFace(b, ax, 0));
    return invisible && !visible;
  };
  const poly = section.map(at);
  return (
    <Svg testID="oblique-section-reference" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {boxEdges(dims).map(([a, b], i) => {
        const [x1, y1] = at(a), [x2, y2] = at(b);
        return <Line key={`e${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ЛИНИЯ} strokeWidth={hidden(a, b) ? 1.4 : 2}
          strokeDasharray={hidden(a, b) ? '5 4' : undefined} strokeLinecap="round" />;
      })}
      <Polygon testID="oblique-section-fill" points={poly.map((p) => p.join(',')).join(' ')} fill={accent} fillOpacity={0.38} stroke="none" />
      {section.map((a, i) => {
        const b = section[(i + 1) % section.length];
        const [x1, y1] = at(a), [x2, y2] = at(b);
        return <Line key={`s${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth={2.6}
          strokeDasharray={sideHidden(a, b) ? '6 4' : undefined} strokeLinecap="round" />;
      })}
      {poly.map(([x, y], i) => <Circle key={`v${i}`} cx={x} cy={y} r={3.2} fill={accent} stroke="#ffffff" strokeWidth={1} />)}
    </Svg>
  );
}

/** Вариант ответа: многоугольник, вписанный в карточку длинной стороной вниз. */
export function ObliquePolygonOption({ points, size, fill, stroke = '#5b4a78' }: {
  points: [number, number][]; size: number; fill: string; stroke?: string;
}) {
  return (
    <Svg testID="oblique-option" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Polygon points={points.map((p) => p.join(',')).join(' ')} fill={fill} fillOpacity={0.55} stroke={stroke} strokeWidth={2.2} strokeLinejoin="round" />
    </Svg>
  );
}

export default ObliqueSectionReference;
