/**
 * Геометрия дыхания: фигура, по которой бежит точка.
 *
 * ЗАЧЕМ (задача Дениса 02.08). Раньше все семь техник рисовались ОДНИМ кругом,
 * который просто менял размер. Квадратное дыхание было визуально неотличимо от
 * 4-7-8 и от когерентного — при том что разница между ними и есть суть метода.
 * Теперь у каждой техники своя форма, и метод читается до того, как прочитан текст.
 *
 * КАК УСТРОЕНО. Вершин столько же, сколько фаз в цикле; каждая сторона проходится
 * за свою фазу, углы — моменты смены фазы. Отсюда:
 *   4 фазы (квадрат 4-4-4-4) → квадрат: вдох, задержка, выдох, пауза по сторонам;
 *   3 фазы (4-7-8, 4-2-4, вздох) → треугольник;
 *   2 фазы (когерентное, удлинённый выдох) → круг, углам там взяться неоткуда.
 *
 * ПОЧЕМУ НЕ «СТОРОНЫ ПРОПОРЦИОНАЛЬНЫ СЕКУНДАМ», как я предлагал в роадмапе.
 * Такой многоугольник существует не всегда: у физиологического вздоха фазы
 * 2-1-6, а треугольника со сторонами 2, 1 и 6 не бывает — 2+1 < 6. Поэтому
 * фигура правильная, а секунды выражены СКОРОСТЬЮ: на длинной фазе точка ползёт,
 * на короткой идёт быстро. Задержка видна как остановка в углу.
 *
 * Пройденная часть контура подсвечена — видно, где ты в цикле.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

export interface BreathPhaseLike { type: 'inhale' | 'hold' | 'exhale'; sec: number }

interface Props {
  phases: BreathPhaseLike[];
  /** Индекс текущей фазы. */
  phaseIdx: number;
  /** Прогресс внутри фазы, 0..1. */
  local: number;
  size: number;
  /** [основной, контрастный] — палитра экрана дыхания. */
  colors: [string, string];
  children?: React.ReactNode;
}

/**
 * Вершины фигуры В ПОРЯДКЕ ОБХОДА, начиная с той, откуда стартует первая фаза.
 *
 * ГЛАВНОЕ ЗДЕСЬ — НАПРАВЛЕНИЕ: первая фаза всегда вдох, и он обязан идти ВВЕРХ.
 * Наполнение лёгких, показанное движением вниз, читается наоборот и мешает, а не
 * помогает. Поэтому обход задан явными точками, а не формулой по углу: в первой
 * версии точка стартовала в правом верхнем углу и на вдохе опускалась.
 *
 * Квадрат: снизу-слева вверх (вдох) → вправо (задержка) → вниз (выдох) → влево
 * (пауза) — канонический рисунок box breathing.
 * Треугольник: снизу-слева к вершине (вдох) → вниз-вправо → по основанию назад.
 */
function polygonPoints(n: number, r: number, cx: number, cy: number) {
  if (n === 4) {
    const d = r * Math.SQRT1_2 * 1.32;   // полусторона: квадрат по осям, вписан с запасом
    return [
      { x: cx - d, y: cy + d },   // снизу-слева — старт вдоха
      { x: cx - d, y: cy - d },   // вверх
      { x: cx + d, y: cy - d },   // вправо
      { x: cx + d, y: cy + d },   // вниз
    ];
  }
  // Треугольник и всё прочее: вершина сверху, обход начинается снизу-слева.
  const base = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  // Разворачиваем так, чтобы первый шаг шёл к верхней вершине, а не от неё.
  return [base[n - 1], ...base.slice(0, n - 1)];
}

export default function BreathShape({ phases, phaseIdx, local, size, colors, children }: Props) {
  // Без фаз рисовать нечего: так устроен Вим Хоф — у него свой экран со счётом
  // вдохов и задержкой, фазового цикла нет. Сейчас сюда он не попадает, но
  // обращение к phases[0] у пустого массива уронило бы экран целиком, а цена
  // страховки — одна строка.
  if (!phases.length) return <View style={{ width: size, height: size }}>{children}</View>;

  const n = phases.length;
  // Всё пропорционально размеру: компонент рисуется и на 300px в сессии, и на
  // 40px превью в карточке техники. С фиксированными 18px отступа у превью
  // оставался радиус 2 — вместо квадрата и треугольника были одинаковые точки.
  const pad = Math.max(5, size * 0.06);
  const r = (size - pad * 2) / 2;
  const c = size / 2;
  const [main, accent] = colors;
  const dotR = Math.max(3, size * 0.03);
  const lineW = Math.max(1.5, size * 0.017);

  // Позиция точки и подсвеченная часть контура.
  let dot = { x: c, y: c - r };
  let progressPath = '';

  if (n >= 3) {
    const pts = polygonPoints(n, r, c, c);
    const from = pts[phaseIdx % n];
    const to = pts[(phaseIdx + 1) % n];
    dot = { x: from.x + (to.x - from.x) * local, y: from.y + (to.y - from.y) * local };
    // Пройденное: целые стороны до текущей + часть текущей.
    const done = [pts[0]];
    for (let i = 1; i <= phaseIdx; i++) done.push(pts[i % n]);
    done.push(dot);
    progressPath = done.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  } else {
    // Две фазы — круг, углам взяться неоткуда. Старт СНИЗУ и движение вверх по
    // правой стороне: вдох идёт вверх, как и на многоугольниках. Угол убывает —
    // в экранных координатах (y вниз) это как раз подъём справа.
    const share = phases.reduce((s, p) => s + p.sec, 0);
    const before = phases.slice(0, phaseIdx).reduce((s, p) => s + p.sec, 0);
    const frac = (before + phases[phaseIdx].sec * local) / share;
    const a = Math.PI / 2 - frac * 2 * Math.PI;
    dot = { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
    const large = frac > 0.5 ? 1 : 0;
    // sweep-flag 0: обход против часовой в системе с осью Y вниз = визуально вверх-вправо.
    progressPath = `M${c},${c + r} A${r},${r} 0 ${large} 0 ${dot.x.toFixed(1)},${dot.y.toFixed(1)}`;
  }

  const outline = n >= 3
    ? polygonPoints(n, r, c, c).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    : '';

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Непройденный контур — намеренно бледный и тонкий. Он задаёт форму, но
            не должен спорить с пройденной частью: иначе прогресс по циклу не
            читается, а ради него всё и затевалось. */}
        {n >= 3 ? (
          <Polygon points={outline} fill={main} fillOpacity={0.09} stroke={main} strokeOpacity={0.2} strokeWidth={lineW} />
        ) : (
          <Circle cx={c} cy={c} r={r} fill={main} fillOpacity={0.09} stroke={main} strokeOpacity={0.2} strokeWidth={lineW} />
        )}
        {/* Пройденная часть — толще и в полную силу цвета. */}
        <Path d={progressPath} fill="none" stroke={accent} strokeWidth={lineW * 2.2} strokeLinecap="round" strokeLinejoin="round" />
        {/* Бегунок. Крупный, чтобы за ним можно было следить, не вглядываясь. */}
        <Circle cx={dot.x} cy={dot.y} r={dotR} fill={accent} />
        <Circle cx={dot.x} cy={dot.y} r={dotR} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={lineW} />
      </Svg>
      {children}
    </View>
  );
}
