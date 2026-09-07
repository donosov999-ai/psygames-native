/* psygames-math-slider-integral-figure · VER 2 · 07.09.2026 */
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

export default function IntegralAreaFigure({ expr, accent, axisColor, textColor }: {
  expr: AreaExpr; accent: string; axisColor: string; textColor: string;
}) {
  const isSteps = expr.form === 'steps';
  const K = isSteps ? expr.heights.length : 48;
  const hs = sampleAreaHeights(expr, K);
  const peak = Math.max(...hs, 1);
  const gy = niceStep(peak);
  const top = Math.ceil((peak * 1.08) / gy) * gy;
  const H = 124;
  const LABEL_H = 16;
  const widthUnits = (isSteps ? expr.heights.length : expr.heights.length - 1) * expr.dx;
  const showHeights = isSteps && expr.heights.length <= 9;
  const gridLines: number[] = [];
  for (let v = gy; v < top; v += gy) gridLines.push(v);

  return (
    <View style={styles.root} accessibilityRole="image" accessibilityLabel={`график: ${expr.form}, ширина ${widthUnits}`}>
      <View style={[styles.plot, { height: H + LABEL_H, borderColor: axisColor }]}>
        <View style={styles.columns}>
          {hs.map((h, i) => (
            <View key={i} style={styles.colWrap}>
              {showHeights ? <Text style={[styles.stepLabel, { color: textColor }]}>{h}</Text> : null}
              <View
                style={{
                  alignSelf: 'stretch',
                  marginHorizontal: isSteps ? 1 : 0,
                  height: Math.max(2, (h / top) * H),
                  backgroundColor: accent,
                  borderTopLeftRadius: isSteps ? 3 : 0,
                  borderTopRightRadius: isSteps ? 3 : 0,
                }}
              />
            </View>
          ))}
        </View>
        {gridLines.map((v) => (
          <View key={`g${v}`} style={[styles.gridLine, { bottom: (v / top) * H, borderColor: axisColor }]} pointerEvents="none">
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
  plot: { borderBottomWidth: 1.5, borderLeftWidth: 1.5, justifyContent: 'flex-end' },
  columns: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 2 },
  colWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.55 },
  gridLabel: { position: 'absolute', left: 2, top: 1, fontSize: 10 },
  stepLabel: { fontSize: 11, fontWeight: '600', marginBottom: 1 },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axisLabel: { fontSize: 11 },
  dxLabel: { fontSize: 12, textAlign: 'center', marginTop: 2 },
});
