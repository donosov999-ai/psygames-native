/**
 * GradientSurface — плашка с игровым градиентом, на которой текст ЧИТАЕТСЯ.
 *
 * 🔴 ЗАЧЕМ. Градиент игры трогать нельзя — это её опознавательный знак. Но у 21
 * градиента из 65 (`#43cea2→#185a9d`, `#cb356b→#bdfff3`, `#7c3aed→#ec4899` и др.)
 * ни белый, ни чёрный текст не берёт AA 4.5 сразу на обоих концах: один конец
 * слишком светлый, другой слишком тёмный. Это арифметика WCAG, а не недоделка —
 * подробности в шапке `src/services/onGradientText.ts`.
 *
 * Единственный способ и градиент сохранить, и текст сделать читаемым — положить
 * поверх ВУАЛЬ цветом самого же градиента: оттенок узнаётся, меняется только
 * глубина. Прозрачность считает `onGradientText` — минимальная из тех, что дают AA.
 *
 * ⚠️ Замена делается ИМЕНЕМ ТЕГА, один в один с `LinearGradient`:
 *     <LinearGradient colors={GRADIENT} .../>  →  <GradientSurface colors={GRADIENT} .../>
 * Пропсы те же. Где вуаль не нужна (44 градиента из 65) — компонент рисует ровно
 * тот же градиент и ничего не добавляет.
 *
 * ГРАБЛЯ: вуаль — абсолютный слой внутри плашки, и без `overflow: 'hidden'` её
 * прямые углы вылезали бы за скруглённые углы карточки. `overflow` включается
 * ТОЛЬКО когда вуаль есть: включать его всегда — значит однажды срезать чей-то
 * всплывающий элемент внутри плашки.
 * ГРАБЛЯ-2: `pointerEvents="none"` обязателен — иначе на вебе слой перехватывает
 * нажатие у кнопки «Начать», под которой он лежит.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { onGradientText, withAlpha } from '@/src/services/onGradientText';

type Props = React.ComponentProps<typeof LinearGradient>;

export default function GradientSurface({ colors, style, children, ...rest }: Props) {
  const list = colors as unknown as string[];
  const g = onGradientText(list[0], list[list.length - 1]);
  return (
    <LinearGradient colors={colors} style={[style, g.veil ? styles.clip : null]} {...rest}>
      {g.veil ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(g.veil, g.veilAlpha) }]}
        />
      ) : null}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
