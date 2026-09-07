/* psygames-math-slider-integral-figure · VER 1 · 07.09.2026 */
/**
 * Фигура вопроса «интеграл-оценка»: площадь под графиком (B14+, выбор Дениса
 * 07.09 — прогрессия ступени → ломаная → кривая). Рисуется View-колонками без
 * SVG-библиотек: ступени — широкие колонки по числу интервалов, ломаная и
 * кривая — 48 узких срезов той же кривой, которой ядро СЧИТАЕТ площадь
 * (expression.sampleAreaHeights) — «что видишь, то и считается».
 * Сетка и подписи осей обязательны: без чисел площадь не оценить.
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
  const H = 128;
  const widthUnits = (isSteps ? expr.heights.length : expr.heights.length - 1) * expr.dx;
  const gridLines: number[] = [];
  for (let v = gy; v <= top; v += gy) gridLines.push(v);

  return (
    <View accessibilityRole="image" accessibilityLabel={`график: ${expr.form}, ширина ${widthUnits}`}>
      <View style={[styles.plot, { height: H, borderColor: axisColor }]}>
        {gridLines.map((v) => (
          <View key={`g${v}`} style={[styles.gridLine, { bottom: (v / top) * H, borderColor: axisColor }]}>
            <Text style={[styles.gridLabel, { color: textColor }]}>{v}</Text>
          </View>
        ))}
        <View style={styles.columns}>
          {hs.map((h, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                marginHorizontal: isSteps ? 1 : 0,
                height: Math.max(2, (h / top) * H),
                backgroundColor: accent,
                borderTopLeftRadius: isSteps ? 3 : 0,
                borderTopRightRadius: isSteps ? 3 : 0,
              }}
            />
          ))}
        </View>
        {isSteps && expr.heights.length <= 8 ? (
          <View style={styles.stepLabels} pointerEvents="none">
            {expr.heights.map((h, i) => (
              <Text key={i} style={[styles.stepLabel, { color: textColor }]}>{h}</Text>
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.xAxis}>
        <Text style={[styles.axisLabel, { color: textColor }]}>0</Text>
        <Text style={[styles.axisLabel, { color: textColor }]}>{isSteps ? `dx = ${expr.dx}` : ''}</Text>
        <Text style={[styles.axisLabel, { color: textColor }]}>{widthUnits}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { borderBottomWidth: 1.5, borderLeftWidth: 1.5, justifyContent: 'flex-end', marginTop: 6 },
  columns: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 2 },
  gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.6 },
  gridLabel: { position: 'absolute', left: 2, top: -13, fontSize: 10 },
  stepLabels: { position: 'absolute', top: 2, left: 2, right: 0, flexDirection: 'row' },
  stepLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axisLabel: { fontSize: 11 },
});
