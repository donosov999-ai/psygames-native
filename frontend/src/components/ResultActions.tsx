/* psygames-result-actions · VER 1 · 08.09.2026 */
/**
 * КНОПКИ ПОСЛЕ ПАРТИИ — ОДНИ И ТЕ ЖЕ ВО ВСЕХ ИГРАХ.
 *
 * 🔴 ЗАЧЕМ. Отчёт тестировщиков `d35840f8`: «Выход из зарядки разный у всех, где
 * кнопки внизу».
 *
 * 📍 ЗАМЕР 08.09.2026 по всем 95 экранам игр: свои кнопки итога рисуют ДВЕ (в плане
 * стояло четыре — пересчитано). Видов при этом три:
 *   · 93 игры — общий `GameResult`/`LevelCleared`: строка с иконкой, главная кнопка
 *     залита `primary`, второстепенная — `surface` с рамкой;
 *   · «Доска в уме» — своя кнопка на градиенте без иконки плюс карточка «Назад»;
 *   · «Глубокий фрактал» — `GlassButton` и «Назад» нет вовсе.
 *
 * Отсюда и «разный у всех»: человек выходит из партии десятки раз в день, и каждый
 * раз кнопка выглядит и стоит иначе.
 *
 * ⚠️ ВИД ЗАДАН ЗДЕСЬ И БОЛЬШЕ НИГДЕ. Ровно та же история, что с карандашными
 * пометками 08.09: четыре копии одной разметки, дефект во всех, починен в одной.
 * Поэтому кнопки итога отныне живут одним компонентом.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ResultAction = {
  /**
   * ⚠️ ПОЛЕ НАЗЫВАЕТСЯ `id`, А НЕ `key`, И ЭТО НЕ ПРИДИРКА. Гейт `hud-tone-canon`
   * собирает по исходникам игр все записи вида `{ key: '…' }` — так он находит
   * счётчики шапки и следит, чтобы одинаковые ключи красились одинаково во всех
   * играх. Кнопки итога счётчиками не являются, но под ту же форму записи
   * подпадали, и CI на этом покраснел 08.09.2026: «retry (в 2 играх), back (в 2
   * играх) не названы в каноне». Роль действия — это `id`.
   */
  id: string;
  label: string;
  /** Иконка слева от подписи. Без неё кнопка читается как строка текста. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  /** `primary` — залитая, главная. `secondary` — светлая с рамкой. */
  tone?: 'primary' | 'secondary';
};

export function ResultActions({ actions, colors }: {
  actions: ResultAction[];
  colors: { primary: string; surface: string; border: string; text: string };
}) {
  if (!actions.length) return null;
  return (
    <View style={styles.wrap}>
      {actions.map((a) => {
        const primary = (a.tone ?? 'secondary') === 'primary';
        return (
          <TouchableOpacity
            key={a.id}
            accessibilityRole="button"
            testID={`result-action:${a.id}`}
            style={[
              styles.button,
              primary
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
            ]}
            onPress={a.onPress}
          >
            <Ionicons name={a.icon} size={20} color={primary ? '#FFFFFF' : colors.text} />
            {/* numberOfLines={1}: на крупном системном шрифте подпись ужимается,
                а не выдавливает кнопку за край экрана. */}
            <Text
              style={[styles.label, primary ? null : { color: colors.text }]}
              numberOfLines={1}
            >
              {a.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: 24, marginBottom: 12 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, marginBottom: 8, gap: 8,
  },
  // flexShrink — та же причина, что у numberOfLines: текст ужимается внутри кнопки.
  label: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', flexShrink: 1 },
});
