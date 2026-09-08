/* psygames-pencil-marks-layer · VER 1 · 08.09.2026 */
/**
 * КАРАНДАШНЫЕ ПОМЕТКИ — ОДНА РАЗМЕТКА НА ВСЕ ЧЕТЫРЕ СУДОКУ.
 *
 * 🔴 ЗАЧЕМ ОБЩИЙ КОМПОНЕНТ. Разметка была скопирована в четыре экрана (обычная
 * судоку, самурай, фрактал, глубокий фрактал), и во всех четырёх слот считался как
 * треть КЛЕТКИ — при том, что слой лежит внутри рамки и трети клетки там нет.
 * Дефект жил во всех, а залечен был в одном: в глубоком фрактале кто-то подобрал
 * вслепую `cell / 3.2`, и симптом там стал тише, но не исчез (при клетке меньше 64
 * точек её `paddingHorizontal: 1` съедал остаток). Четыре копии — причина того, что
 * починка одной ничего не дала остальным.
 *
 * ⚠️ СЛОТЫ СТОЯТ НА МЕСТАХ ВСЕГДА. Отсутствующая цифра рисуется прозрачной, а не
 * пропускается: на бумаге «двойка» всегда во втором углу, и по неподвижной сетке
 * кандидаты читаются взглядом, а по съезжающему списку — чтением.
 *
 * ⚠️ КАСАНИЙ СЛОЙ НЕ ПЕРЕХВАТЫВАЕТ. Палец обязан попадать в клетку, а не в цифру
 * поверх неё.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { PENCIL_CELL_BORDER, pencilFontSize, pencilSlotSize } from '@/src/services/pencilMarks';
import { AA_NORMAL, contrastRatio, textOn } from '@/src/services/onGradientText';

type Props = {
  /** Какие цифры видны. Пустой список — компонент не рисует ничего. */
  digits: number[];
  /** Сторона клетки ВМЕСТЕ с рамкой — та самая, что стоит у клетки в `width`. */
  cellSize: number;
  /** Цвет видимой пометки. Невидимые слоты всегда прозрачны. */
  color: string;
  /**
   * Фон клетки. Если на нём заданный цвет не читается — слой берёт читаемый САМ.
   *
   * 🔴 ЗАМЕР 08.09.2026 на живом экране: пометка `#6e6e73` на выделенной клетке
   * `#5b4fd1` даёт контраст 1,19 при планке 4,5. Ставишь вторую пометку — первой
   * не видно, потому что клетка под пальцем выделена, и это ровно вторая половина
   * жалобы «больше одной не поставить». Фонов у клетки судоку много (выделение,
   * ошибка, раскраска, зона killer), и перечислять их в каждом экране — та же
   * четырёхкратная копия, с которой всё началось. Поэтому решает слой.
   */
  on?: string;
  /** Сколько слотов держать: 9 у девятки, 6 у доски 6×6. */
  slots?: number;
  /** Слой поверх клетки (по умолчанию) или блок в её потоке. */
  absolute?: boolean;
  /** Самая толстая рамка клетки — по ней считается доступное место. */
  border?: number;
  style?: StyleProp<ViewStyle>;
};

export function PencilMarksLayer({
  digits, cellSize, color, on, slots = 9, absolute = true, border = PENCIL_CELL_BORDER, style,
}: Props) {
  if (!digits.length) return null;
  const slot = pencilSlotSize(cellSize, border);
  /**
   * Нечитаемый цвет НЕ подменяем молча на любой другой: берём тот, что даёт планку
   * на этом самом фоне.
   *
   * ⚠️ ТОЛЬКО ПО РАЗОБРАННОМУ ФОНУ. `contrastRatio` разбирает hex, а на `rgba(…)`,
   * `transparent` или названии цвета молча считает как чёрный — и подменял цвет по
   * мусору: собственная проба поймала подстановку `#dbdbdb`, то есть светло-серые
   * пометки на светлой клетке — исчезнувшие. Не разобрали фон — оставляем заданный
   * цвет: хуже прежнего не станет.
   */
  const known = !!on && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(on);
  const shown = known && contrastRatio(color, on!) < AA_NORMAL ? textOn(on!, AA_NORMAL) : color;
  return (
    <View
      pointerEvents="none"
      style={[absolute ? styles.layer : styles.inline, style]}
    >
      {Array.from({ length: slots }, (_, k) => k + 1).map((d) => (
        <Text
          key={d}
          style={{
            width: slot, height: slot, lineHeight: slot,
            fontSize: pencilFontSize(slot), textAlign: 'center',
            color: digits.includes(d) ? shown : 'transparent',
          }}
        >
          {d}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
  },
  inline: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
    maxWidth: '100%',
  },
});
