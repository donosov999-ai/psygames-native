/**
 * GameAuxAction — СЛУЖЕБНОЕ действие игры. Одна кнопка на всё приложение.
 *
 * 🔴 ЗАЧЕМ КОМПОНЕНТ, А НЕ ПРОСТО «ПЕРЕНЕСТИ КНОПКИ». Правило «служебное — в
 * шапку» без общего элемента живёт ровно до следующего экрана: новый автор
 * рисует свою кнопку своим стилем и кладёт куда удобнее. Проверить такое
 * можно только по словам в разметке, а гейты по словам в этом проекте уже
 * шесть раз краснели на ПРАВИЛЬНОЙ правке (переименовал обработчик — упал).
 *
 * Поэтому служебное действие — это ТИП, а не подпись. Раз тип один:
 *   · его видно в разметке структурно (гейт `slot-meaning` ищет компонент,
 *     а не слова «отмена»/«перемешать» — переименование его не сломает);
 *   · его видно в живом DOM по `data-testid="game-aux"` — значит браузерный
 *     аудит может проверить не «написано ли», а «нарисовано ли и ГДЕ»;
 *   · попадание пальцем задано здесь один раз (48×48 — норма Material для
 *     того, по чему стучат в игре), и его нельзя случайно потерять в одной
 *     игре из сорока трёх.
 *
 * ЧТО СЧИТАЕТСЯ СЛУЖЕБНЫМ (граница проведена в GameShell, здесь — коротко):
 * действие, которое трогает ИГРУ помимо ответа — тратит ресурс (подсказка,
 * перетасовка), откатывает ЗАСЧИТАННЫЙ ход, заново подаёт задание, обрывает
 * сеанс. Правка собственного черновика ответа («Сброс», «стереть букву»)
 * служебной НЕ является: она не трогает ничего, кроме ещё не сданного ответа.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';

export interface GameAuxActionProps {
  /** Иконка Ionicons. Без неё кнопка остаётся текстовой — так у «СТОП». */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Подпись — УЖЕ переведённая (`t('btn_undo')`), не ключ. */
  label: string;
  /**
   * Остаток ресурса прямо на кнопке.
   *
   * ЗАЧЕМ. Ресурс, о котором узнаёшь только когда он кончился, читается как
   * поломка, а не как правило (замечание по маджонгу). Цена видна ДО нажатия.
   */
  count?: number;
  /** Цвет иконки — игры красят своё действие в свой акцент. */
  tint?: string;
  /**
   * Действие обрывает сеанс («СТОП»). Красная рамка и подпись: это не отмена
   * хода, это конец упражнения, и спутать их нельзя.
   */
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** Красный «СТОП» — один и тот же во всех упражнениях с сеансом. */
const DANGER = '#f43f5e';

export function GameAuxAction({ icon, label, count, tint, danger, disabled, onPress }: GameAuxActionProps) {
  const { colors } = useTheme();
  const fg = danger ? DANGER : colors.text;
  return (
    <TouchableOpacity
      testID="game-aux"
      accessibilityRole="button"
      // Счётчик уходит в подпись для скринридера: «Перемешать · 3» вслух
      // читается как одно слово с числом, а не как два соседних элемента.
      accessibilityLabel={count === undefined ? label : `${label} — ${count}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.btn,
        {
          backgroundColor: colors.surface,
          borderColor: danger ? DANGER : colors.border,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={tint ?? fg} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {count === undefined ? label : `${label} · ${count}`}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Ряд служебных действий — то, что кладут в `GameShell.headerActions`.
 *
 * Перенос по строкам (`flexWrap`) обязателен: при системном крупном шрифте и в
 * длинных языках (de/fr) три пилюли в 390 pt не встают, а ужатая до многоточия
 * подпись служебного действия — худшее, что тут может быть.
 */
export function GameAuxBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.bar}>{children}</View>;
}

const styles = StyleSheet.create({
  /**
   * Зазор 6, а не 8: при переносе на вторую строку каждая лишняя пара точек
   * между кнопками отнимается у поля дважды — по горизонтали и по вертикали.
   * Сами кнопки не трогаем: 48×48 держит гейт нажатий (репорт Вали 01.09.2026
   * «цифры 7-8-9 не работают» — они уезжали под нижний край экрана).
   */
  /**
   * 🔴 `flexWrap` БЕЗ ОГРАНИЧЕНИЯ ШИРИНЫ НЕ ПЕРЕНОСИТ НИЧЕГО.
   *
   * Перенос здесь стоял с самого начала — и не работал ни разу. Замер 02.09.2026
   * на экране 360 px: ряд «Отменить · Подсказка · Перемешать» занял 456 px, то
   * есть вылез за край на 76, и вместе с ним поехала вся страница вбок. Отсюда и
   * отчёт Дениса «поехали кнопки верх тулбара».
   *
   * Причина — правило флексбокса, а не ошибка в числах. Оба места, куда каркас
   * кладёт этот ряд, сами строчные (`flexDirection: 'row'`). Ребёнок строки НЕ
   * растягивается по ширине родителя: его ширина берётся по содержимому. А раз
   * ширина всегда равна содержимому — переносить нечего, и `flexWrap` молчит,
   * сколько бы кнопок в ряд ни встало.
   *
   * `maxWidth: '100%'` даёт ряду границу — ту самую, относительно которой перенос
   * и считается. `flexShrink` с `minWidth: 0` разрешают строке ужаться (без нуля
   * потомок с текстом не даёт себя сжать).
   */
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, rowGap: 6, flexWrap: 'wrap',
    maxWidth: '100%', flexShrink: 1, minWidth: 0,
  },
  // 48×48 — норма Material для того, по чему стучат в игре (тот же порог, что
  // у `scripts/tap-target-audit.mjs` во втором проходе). Радиус 999 = пилюля:
  // служебное не должно выглядеть как кнопка ответа, а те у нас прямоугольные.
  btn: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  label: { fontSize: 14, fontWeight: '700' },
});

export default GameAuxAction;
