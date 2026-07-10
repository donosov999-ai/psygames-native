// Спарклайн последних сессий на экране результата (v1.116.0, Фаза 2 шаринга —
// урезанный скоуп: визуальная карточка на экране, БЕЗ экспорта в PNG. Экспорт как
// шаринг-картинка требует новых нативных зависимостей (expo-file-system+expo-sharing) —
// не стал тянуть их вслепую без реального теста на Tauri-desktop сборке psygames.
// Идея из freefocusgames (progress-share.ts), с нуля — их репо AGPL, код не копировался.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';

interface Props {
  history: number[];        // последние сессии (БЕЗ текущей), старые → новые
  current: number;
  lowerIsBetter?: boolean;  // true для время-метрик (schulte), false для уровня/очков (n-back)
  language: string;
  color: string;
}

export default function ResultSparkline({ history, current, lowerIsBetter, language, color }: Props) {
  if (history.length < 2) return null;   // нужна хотя бы пара точек для тренда

  const points = [...history, current];
  const w = 220, h = 48, pad = 6;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((v, i) => ({
    x: pad + i * step,
    y: pad + (h - pad * 2) * (1 - (v - min) / range),
  }));
  const polylinePoints = coords.map((p) => `${p.x},${p.y}`).join(' ');

  const prevAvg = history.reduce((s, v) => s + v, 0) / history.length;
  const deltaPct = prevAvg !== 0 ? Math.round(((current - prevAvg) / prevAvg) * 100) : 0;
  const better = lowerIsBetter ? current < prevAvg : current > prevAvg;
  const trendText = deltaPct === 0
    ? (language === 'ru' ? 'как обычно' : 'right on your average')
    : language === 'ru'
      ? `${better ? 'лучше' : 'хуже'} среднего на ${Math.abs(deltaPct)}%`
      : `${Math.abs(deltaPct)}% ${better ? 'better' : 'worse'} than your average`;

  return (
    <View style={styles.wrap}>
      <Svg width={w} height={h}>
        <Polyline points={polylinePoints} fill="none" stroke={color} strokeWidth={2} />
        {coords.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={i === coords.length - 1 ? 4 : 2.5}
            fill={i === coords.length - 1 ? color : 'rgba(255,255,255,0.5)'} />
        ))}
      </Svg>
      <Text style={[styles.trend, { color }]}>{trendText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 12, gap: 4 },
  trend: { fontSize: 12, fontWeight: '600' },
});
