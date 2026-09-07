/* psygames-math-slider-integral-figure · VER 3 · 07.09.2026 */
/**
 * Фигура вопроса «интеграл-оценка»: площадь под графиком (B14+, выбор Дениса
 * 07.09 — прогрессия ступени → ломаная → кривая). Рисуется View-колонками без
 * SVG-библиотек: ступени — широкие колонки с подписью высоты у вершины,
 * ломаная и кривая — 48 узких срезов той же кривой, которой ядро СЧИТАЕТ
 * площадь (expression.sampleAreaHeights) — «что видишь, то и считается».
 * Сетка и подписи осей обязательны: без чисел площадь не оценить.
 * VER 2 (глаза 07.09): растянута на всю карточку (в узкой фигуре подписи
 * высот слипались), высоты — у вершин своих столбиков, шаг dx — отдельной
 * строкой (в одной строке «0dx = 210» читалось кашей).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { sampleAreaHeights } from './core/expression';
import type { MathExpression } from './core/types';

type AreaExpr = Extract<MathExpression, { type: 'integral-area' }>;

function niceStep(maxH: number): number {
  const raw = maxH / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

export default function IntegralAreaFigure({ expr, accent, axisColor, textColor, negColor }: {
  expr: AreaExpr; accent: string; axisColor: string; textColor: string; negColor?: string;
}) {
  const isSteps = expr.form === 'steps';
  const K = isSteps ? expr.heights.length : 48;
  const hs = sampleAreaHeights(expr, K);
  const signed = expr.heights.some((h) => h < 0);
  const minus = negColor ?? '#d24b4b';
  const peak = Math.max(...hs, 1);
  const pit = Math.min(...hs, 0);
  const gy = niceStep(Math.max(peak, -pit));
  // Общая геометрия обоих режимов: беззнаковый — bot=0, ось совпадает с низом
  const top = Math.ceil((peak * 1.08) / gy) * gy;
  const bot = signed ? -Math.ceil((-pit * 1.08) / gy) * gy : 0;
  const span = top - bot;
  const H = signed ? 148 : 124;
  const LABEL_H = 16;
  const zeroY = (top / span) * H;   // px от верха области до оси y=0
  const widthUnits = (isSteps ? expr.heights.length : expr.heights.length - 1) * expr.dx;
  const showHeights = isSteps && expr.heights.length <= 9;
  const gridLines: number[] = [];
  for (let v = gy; v < top; v += gy) gridLines.push(v);
  for (let v = -gy; v > bot; v -= gy) gridLines.push(v);

  return (
    <View style={styles.root} accessibilityRole="image" accessibilityLabel={`график: ${expr.form}${signed ? ', есть области ниже нуля' : ''}, ширина ${widthUnits}`}>
      {signed ? (
        <View style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: accent }]} /><Text style={[styles.legendText, { color: textColor }]}>прибавляется</Text>
          <View style={[styles.swatch, { backgroundColor: minus, marginLeft: 10 }]} /><Text style={[styles.legendText, { color: textColor }]}>вычитается</Text>
        </View>
      ) : null}
      <View style={[styles.plot, { height: H + LABEL_H, borderColor: axisColor }]}>
        <View style={[styles.columns, { height: H + LABEL_H }]}>
          {hs.map((h, i) => {
            const hPx = Math.max(2, (Math.abs(h) / span) * H);
            const pos = h >= 0;
            return (
              <View key={i} style={styles.colWrap}>
                <View
                  style={{
                    position: 'absolute',
                    left: isSteps ? 1 : 0,
                    right: isSteps ? 1 : 0,
                    top: LABEL_H + (pos ? zeroY - hPx : zeroY),
                    height: hPx,
                    backgroundColor: pos ? accent : minus,
                    borderTopLeftRadius: isSteps && pos ? 3 : 0,
                    borderTopRightRadius: isSteps && pos ? 3 : 0,
                    borderBottomLeftRadius: isSteps && !pos ? 3 : 0,
                    borderBottomRightRadius: isSteps && !pos ? 3 : 0,
                  }}
                />
                {showHeights ? (
                  <Text style={[styles.stepLabel, { color: textColor, position: 'absolute', left: 0, right: 0, top: pos ? LABEL_H + zeroY - hPx - 15 : LABEL_H + zeroY + hPx + 1 }]}>{h}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
        <View style={[styles.zeroAxis, { top: LABEL_H + zeroY, backgroundColor: axisColor }]} pointerEvents="none" />
        {gridLines.map((v) => (
          <View key={`g${v}`} style={[styles.gridLine, { top: LABEL_H + zeroY - (v / span) * H, borderColor: axisColor }]} pointerEvents="none">
            <Text style={[styles.gridLabel, { color: textColor }]}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={styles.xAxis}>
        <Text style={[styles.axisLabel, { color: textColor }]}>0</Text>
        <Text style={[styles.axisLabel, { color: textColor }]}>{widthUnits}</Text>
      </View>
      {isSteps ? (
        <Text style={[styles.dxLabel, { color: textColor }]}>ширина ступени dx = {expr.dx}</Text>
      ) : (
        <Text style={[styles.dxLabel, { color: textColor }]}>0…{widthUnits} по горизонтали</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch', marginTop: 6 },
  plot: { borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  columns: { flexDirection: 'row', paddingLeft: 2 },
  colWrap: { flex: 1 },
  zeroAxis: { position: 'absolute', left: 0, right: 0, height: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  swatch: { width: 12, height: 12, borderRadius: 3, marginRight: 4 },
  legendText: { fontSize: 11 },
  gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.55 },
  gridLabel: { position: 'absolute', left: 2, top: 1, fontSize: 10 },
  stepLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axisLabel: { fontSize: 11 },
  dxLabel: { fontSize: 12, textAlign: 'center', marginTop: 2 },
});
