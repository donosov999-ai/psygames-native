/* psygames-balls-picker · VER 1 · 05.09.2026 */
/**
 * Выбор фактуры шаров — один ряд картинок, общий для всех игр с шарами.
 *
 * ⚠️ КОМПОНЕНТ, А НЕ ДВАДЦАТЬ СТРОК В КАЖДОМ ЭКРАНЕ. Шары нужны трекеру
 * объектов, «одной линии» и дальше по списку; выбор при этом ОДИН на приложение.
 * Скопируй ряд в два экрана — и они разойдутся ровно тогда, когда в один добавят
 * фактуру, а во второй забудут.
 *
 * Фактуру выбирают ГЛАЗАМИ: «желейный» и «стеклянный» словами не различить, а
 * рядом очевидны. Поэтому кнопки — картинки, а слово живёт в accessibilityLabel
 * для голосового доступа.
 */
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { useLanguage } from '@/src/contexts/LanguageContext';
import {
  BALL_STYLES, ballColorForLevel, ballImage, setBallStyle, useBallStyle, type BallStyle,
} from './ballChoice';

export default function BallStylePicker({ level, colors, accent }: {
  /** Уровень задаёт цвет образцов — те же шары, что будут в партии. */
  level: number;
  colors: { border: string; textSecondary: string };
  /** Цвет рамки выбранного — градиент игры, чтобы ряд не выглядел чужим. */
  accent: string;
}) {
  const { t } = useLanguage();
  const выбран = useBallStyle();
  const выбрать = (s: BallStyle) => { setBallStyle(s).catch(() => {}); };

  return (
    <>
      <Text style={[стили.заголовок, { color: colors.textSecondary }]}>{t('ballStyleTitle')}</Text>
      {/* Ряд прокручивается вбок: девять целей по 56 px не влезают в 360. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={стили.ряд}>
        {BALL_STYLES.map((s) => (
          <TouchableOpacity
            key={s}
            accessibilityRole="button"
            accessibilityState={{ selected: выбран === s }}
            accessibilityLabel={t(`ball${s.charAt(0).toUpperCase()}${s.slice(1)}` as never)}
            onPress={() => выбрать(s)}
            style={[стили.кнопка, {
              borderColor: выбран === s ? accent : colors.border,
              borderWidth: выбран === s ? 3 : 1,
            }]}
          >
            <Image source={ballImage(s, ballColorForLevel(level))}
              style={стили.образец} resizeMode="contain" fadeDuration={0} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );
}

const стили = StyleSheet.create({
  заголовок: { fontSize: 14, marginTop: 6 },
  ряд: { gap: 10, paddingVertical: 4 },
  // 56, а не «под картинку 40»: это цель для пальца, и меньше 48 она быть не может.
  кнопка: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  образец: { width: 40, height: 40 },
});
