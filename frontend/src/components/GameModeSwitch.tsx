import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * GameModeSwitch — переключатель «Уровни / Свободно» на экране настроек игры.
 *
 * ЗАЧЕМ. Правило Дениса: у каждой игры три режима — уровни, свободно, зарядка.
 * Зарядка приходит извне (маршрутом), а вот выбор между уровнями и свободной
 * партией человек должен видеть глазами. До этого он был выражен по-разному и
 * почти нигде: в судоку липким футером, в Шульте — фразой «or customize your
 * table below and tap Free play» и кнопкой, до которой надо доскроллить мимо всех
 * настроек, в остальных не выражен вовсе. Денис ткнул в Шульте и был прав:
 * «щас одиночные битвы то с тем, то с другим».
 *
 * ЧТО ЭТО МЕНЯЕТ. Не механику — она везде уже есть, — а видимость выбора.
 * В режиме уровней ручные настройки прячутся: они и есть свободная партия, и
 * показывать их рядом с лесенкой значит предлагать два взаимоисключающих способа
 * играть одновременно.
 *
 * ⚠️ ПАНЕЛЬ УМЕСТНА НЕ ВЕЗДЕ. Свободная партия существует там, где параметры
 * задаёт человек: судоку, Шульте, глазная гимнастика, WCST, PRL, парные картинки.
 * У фланкера, стоп-сигнала и прочих замеров свободного режима нет по природе
 * задачи — там пустая панель ВРАЛА БЫ о наличии выбора. Поимённый реестр обеих
 * половин — в src/__tests__/game-mode-switch.test.ts.
 *
 * ⚠️ КЛЮЧИ ПОДПИСЕЙ НАЗЫВАЮТСЯ sudokuMode*, потому что впервые появились в судоку.
 * Строки в них общие («Уровни» / «Свободно») и уже переведены на все 12 языков;
 * заводить вторую пару ключей ради имени — двенадцать правок и риск разъехавшегося
 * перевода. Переименование — отдельная механическая замена, когда панель доедет
 * до всех экранов.
 */
export type PlayMode = 'levels' | 'free';

/**
 * Игра может звать переключатель со своим набором значений (у судоку третьим идёт
 * killer), поэтому тип режима — параметр, а не жёсткое 'levels' | 'free'.
 */
interface Props<M extends string = PlayMode> {
  mode: M;
  onChange: (m: M) => void;
  colors: any;
  /** Цвет выбранного режима — фирменный цвет игры, чтобы панель не выбивалась. */
  accent: string;
  /** Подпись t(key) — прокидывается игрой, чтобы компонент не зависел от контекста языка. */
  t: (key: string) => string;
  /**
   * Строка-пояснение под кнопками: чем этот режим отличается от соседнего.
   * У WCST и PRL она была ДО сведения к общей панели и объясняет замысел
   * («Стандартные параметры… для чистой метрики»), у парных картинок — что
   * уровни копят счёт. Терять её при унификации нельзя: подпись «Свободно» сама
   * по себе не говорит, что там меняется.
   */
  hint?: string;
  /**
   * Режимы СВЕРХ пары «уровни / свободно». У судоку это Killer — свободная партия
   * с клетками-суммами: отдельная раскладка, но такой же способ играть, и человек
   * выбирает её тем же жестом в том же ряду. Подпись готовая (имя варианта), а не
   * ключ словаря: «Killer» одинаково пишется во всех двенадцати языках.
   */
  extra?: readonly (readonly [M, string])[];
  /**
   * Без карточки-подложки: панель встаёт в чужой ряд (липкий футер судоку, где
   * рядом стоит кнопка справки) и подложка рисовала бы карточку внутри карточки.
   */
  bare?: boolean;
}

export default function GameModeSwitch<M extends string = PlayMode>({
  mode, onChange, colors, accent, t, hint, extra, bare,
}: Props<M>) {
  const items: { m: M; label: string }[] = [
    { m: 'levels' as M, label: t('sudokuModeLevels') },
    { m: 'free' as M, label: t('sudokuModeFree') },
    ...(extra ?? []).map(([m, label]) => ({ m, label })),
  ];
  return (
    <View style={bare ? styles.bare : [styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.row}>
        {items.map(({ m, label }) => {
          const on = mode === m;
          return (
            <TouchableOpacity
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.btn,
                on
                  ? { backgroundColor: accent }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => onChange(m)}
            >
              <Text style={[styles.label, { color: on ? '#FFF' : colors.text }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!hint && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 12 },
  // В чужом ряду панель обязана делить ширину с соседом (кнопка справки в судоку).
  bare: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: 8 },
  // 48 — минимальный размер, при котором палец попадает уверенно (аудит кнопок).
  btn: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, paddingHorizontal: 8 },
  // Подпись НЕ обрезаем в одну строку: у немецкого «Freies Spiel» и корейского
  // «자유 플레이» она длиннее английской, и обрезка съела бы слово целиком.
  label: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 8 },
});
