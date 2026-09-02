import React, { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

/**
 * 🔴 ИТОГ ПРИХОДИТ АКТАМИ, А НЕ ОДНИМ КАДРОМ.
 *
 * Решение Дениса 30.08.2026 по разбору эталона жанра: там итог уровня — пять
 * экранов подряд (похвала → название → звёзды и сундук → множитель → награда), и
 * каждая порция ощущается отдельно. У нас всё появлялось разом: трофей, звёзды,
 * числа, заработок и кнопки — глазу не за что зацепиться, рука тянется к «дальше».
 *
 * Приём был написан внутри `GameResult` и работал только там — то есть на экране
 * КОНЦА ПАРТИИ. А между уровнями человек видит другой экран (`LevelCleared`), и
 * за одну сессию он показывается в разы чаще финального. 02.09.2026 приём вынесен
 * сюда и включён в обоих местах: копия в двух файлах разошлась бы так же тихо,
 * как разошлись формулы раскладки шкафа (см. `gsLayout`).
 *
 * ⚠️ ЩАДЯЩИЙ РЕЖИМ ПОКАЗЫВАЕТ ВСЁ СРАЗУ. Последовательность — украшение, а
 * содержимое итога — нет: ждать анимацию, чтобы увидеть свой счёт, недопустимо.
 * ⚠️ Кнопки — последний акт, но их задержка меньше полусекунды: человек, который
 * хочет уйти немедленно, не должен ловить уезжающую цель.
 */
export default function Act({ at, children }: { at: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [a] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) { a.setValue(1); return; }
    const t = setTimeout(() => {
      Animated.timing(a, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    }, at);
    return () => clearTimeout(t);
  }, [a, at, reduced]);
  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return <Animated.View style={{ opacity: a, transform: [{ translateY }] }}>{children}</Animated.View>;
}
