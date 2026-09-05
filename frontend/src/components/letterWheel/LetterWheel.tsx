/* psygames-letter-wheel · VER 1 · 06.09.2026 */
/**
 * 🔴 КРУГ БУКВ: ПАЛЕЦ ВЕДЁТ ЛИНИЮ, СЛОВО СОБИРАЕТСЯ ПО ПУТИ.
 *
 * 📍 ПРОСЬБА ДЕНИСА 06.09.2026, дословно: «надо круг с буквами для введения у
 * них перенять, им удобнее вводить». Речь про «Море слов» (10 млн скачиваний)
 * и Zen Word (50 млн): буквы по окружности, ведение линией.
 *
 * Почему это правда удобнее, а не просто красивее: ряд плиток требует
 * ОТДЕЛЬНОГО нажатия на каждую букву — семь букв это семь прицеливаний. Круг
 * берётся одним движением, и путь виден целиком, поэтому ошибку замечают до
 * отпускания пальца, а не после сдачи слова.
 *
 * ⚠️ ТАП ОСТАЁТСЯ. Ведение — не единственный способ: часть людей играет одной
 * рукой и тапает, а скринридеру провести линию нечем вовсе. Обе дороги ведут
 * через `шагЛинии` в ядре, поэтому разойтись не могут.
 *
 * Геометрия и правило шага — `./geometry`, там же их пробы.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Line as SvgLine } from 'react-native-svg';
import { точкиКруга, радиусПопадания, буквоПод, шагЛинии, словоИзЛинии } from './geometry';

export interface LetterWheelProps {
  /** Буквы круга. Порядок задаёт расположение: первая сверху, дальше по часовой. */
  letters: readonly string[];
  /** Сторона квадрата под круг. */
  size: number;
  /** Набранная линия — индексы букв. Ведёт родитель: слово нужно и ему. */
  trace: readonly number[];
  onTrace: (next: readonly number[]) => void;
  /** Палец отпущен: слово сдано. */
  onSubmit: (word: string) => void;
  colors: { surface: string; text: string; primary: string; border: string };
  /** Подпись для скринридера у всего круга. */
  label?: string;
  disabled?: boolean;
}

export function LetterWheel({ letters, size, trace, onTrace, onSubmit, colors, label, disabled }: LetterWheelProps) {
  const точки = React.useMemo(() => точкиКруга(letters.length, size), [letters.length, size]);
  const радиус = React.useMemo(() => радиусПопадания(letters.length, size), [letters.length, size]);

  /**
   * ⚠️ РЕФЫ, А НЕ СОСТОЯНИЕ. `PanResponder` создаётся один раз и замыкает
   * первый рендер: без рефов он вёл бы линию по буквам ПЕРВОГО слова до конца
   * партии. Тот же класс устаревшего замыкания, что уже ловился в n-back и в
   * «Беглости речи».
   */
  const свежее = React.useRef({ линия: trace, точки, радиус, letters, disabled: !!disabled, onTrace, onSubmit });
  /**
   * ⚠️ ОБНОВЛЯЕМ РЕФ В ЭФФЕКТЕ, А НЕ В ТЕЛЕ РЕНДЕРА. Запись в реф во время
   * рендера — нечистая операция: при повторном прогоне (StrictMode, конкурентный
   * рендер) она выполняется дважды и может уехать вперёд состояния. Жест идёт
   * ПОСЛЕ рендера, так что эффекта хватает с запасом.
   */
  React.useEffect(() => {
    свежее.current = { линия: trace, точки, радиус, letters, disabled: !!disabled, onTrace, onSubmit };
  });

  const шаг = React.useCallback((x: number, y: number) => {
    const с = свежее.current;
    if (с.disabled) return;
    const i = буквоПод(с.точки, x, y, с.радиус);
    const next = шагЛинии(с.линия, i);
    if (next !== с.линия) { с.линия = next; с.onTrace(next); }
  }, []);

  /**
   * ⚠️ ПРЯМЫЕ ОБРАБОТЧИКИ ОТКЛИКА, А НЕ `PanResponder`.
   *
   * `PanResponder.create` собирается ВО ВРЕМЯ РЕНДЕРА и замыкает рефы — разбор
   * справедливо на это ругается: реф, прочитанный в теле рендера, при повторном
   * прогоне уезжает вперёд состояния. У `View` те же события есть свойствами,
   * и тогда во время рендера не создаётся ничего: обработчики — обычные
   * `useCallback`, вызываются только по касанию.
   */
  const можно = React.useCallback(() => !свежее.current.disabled, []);
  const наКасание = React.useCallback((e: { nativeEvent: { locationX: number; locationY: number } }) => {
    шаг(e.nativeEvent.locationX, e.nativeEvent.locationY);
  }, [шаг]);
  const отпустил = React.useCallback(() => {
    const с = свежее.current;
    const слово = словоИзЛинии(с.letters, с.линия);
    if (слово) с.onSubmit(слово);
  }, []);

  const взята = (i: number) => trace.indexOf(i) >= 0;

  return (
    <View
      accessible={false}
      accessibilityLabel={label}
      style={[стили.круг, { width: size, height: size, backgroundColor: colors.surface, borderColor: colors.border }]}
      onStartShouldSetResponder={можно}
      onMoveShouldSetResponder={можно}
      onResponderGrant={наКасание}
      onResponderMove={наКасание}
      onResponderRelease={отпустил}
      onResponderTerminate={отпустил}
    >
      {/* Линия пути — под буквами, чтобы не перечёркивать их. */}
      {trace.length > 1 && (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill as never} pointerEvents="none">
          {trace.slice(1).map((и, k) => {
            const a = точки[trace[k]!]!; const b = точки[и]!;
            return <SvgLine key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.primary} strokeWidth={6} strokeLinecap="round" />;
          })}
        </Svg>
      )}
      {letters.map((л, i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          accessibilityLabel={л}
          accessibilityState={{ selected: взята(i) }}
          disabled={disabled}
          onPress={() => { const с = свежее.current; const next = шагЛинии(с.линия, i); if (next !== с.линия) { с.линия = next; onTrace(next); } }}
          style={[
            стили.буква,
            {
              /**
               * 🔴 РАЗМЕР ЯВНО. Плитка круга стоит абсолютно, и без ширины с
               * высотой она в вебе схлопнулась бы по содержимому — та же беда,
               * что трижды ловилась у картинок (`absoluteFill` на `<Image>`).
               */
              left: точки[i]!.x - радиус, top: точки[i]!.y - радиус,
              width: радиус * 2, height: радиус * 2, borderRadius: радиус,
              backgroundColor: взята(i) ? colors.primary : colors.surface,
              borderColor: взята(i) ? colors.primary : colors.border,
            },
          ]}
        >
          <Text style={[стили.текст, { color: взята(i) ? '#fff' : colors.text, fontSize: радиус }]}>{л}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const стили = StyleSheet.create({
  круг: { borderRadius: 9999, borderWidth: 1, alignSelf: 'center', position: 'relative' },
  буква: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  текст: { fontWeight: '800' },
});

export default LetterWheel;
