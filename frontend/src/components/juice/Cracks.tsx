import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * 🔴 ТРЕЩИНЫ НА ЗАМКЕ — ПРОГРЕСС РАЗРУШЕНИЯ ВИДЕН ДО ТОГО, КАК ОН ОТКРОЕТСЯ.
 *
 * Пункт 1.8 карты дорог, взято с разбора эталона жанра: у них замок не просто тикает
 * «4 → 3 → 2», а покрывается трещинами — и человек видит, что его усилия ДЕЙСТВУЮТ,
 * ещё до того, как случится событие.
 *
 * Цифра говорит то же самое, но требует прочитать и сравнить с прошлым разом.
 * Трещина видна боковым зрением и не требует памяти.
 *
 * ⚠️ ТРЕЩИНЫ ДЕТЕРМИНИРОВАНЫ, а не случайны: положение считается из индекса ниши.
 * Случайные при каждой перерисовке дёргались бы на любом ходу, и «разрушение»
 * читалось бы как рябь.
 */
export default function Cracks({
  size, progress, cellKey, color = 'rgba(248,227,196,0.75)',
}: {
  /** Сторона области, по которой рисуем (обычно размер ниши). */
  size: number;
  /** Насколько разрушен: 0 — целый, 1 — вот-вот откроется. */
  progress: number;
  /** Индекс ниши: из него берётся рисунок трещин, чтобы он не прыгал. */
  cellKey: number;
  color?: string;
}) {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) return null;

  // Сколько линий показать: от одной до трёх, по мере разрушения.
  const линий = p >= 0.75 ? 3 : p >= 0.4 ? 2 : 1;
  // Псевдослучайность из индекса — устойчива между перерисовками.
  const рябь = (n: number) => ((cellKey * 37 + n * 91) % 23) / 23;

  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size, height: size }]}>
      {Array.from({ length: линий }).map((_, k) => {
        const наклон = -55 + рябь(k) * 110;                 // от −55° до +55°
        const длина = size * (0.34 + рябь(k + 5) * 0.4);
        const сдвигX = (рябь(k + 11) - 0.5) * size * 0.5;
        const сдвигY = (рябь(k + 17) - 0.5) * size * 0.5;
        return (
          <View
            key={k}
            style={{
              position: 'absolute',
              left: size / 2 + сдвигX - длина / 2,
              top: size / 2 + сдвигY,
              width: длина,
              height: Math.max(1, size * 0.028),
              backgroundColor: color,
              opacity: 0.35 + p * 0.5,
              transform: [{ rotate: `${наклон}deg` }],
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
});
