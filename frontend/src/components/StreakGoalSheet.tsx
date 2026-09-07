/* psygames-streak-goal-sheet · VER 1 · 07.09.2026 */
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { a11yModal } from '@/src/services/a11y';
import { PetStill, type PetSkin } from '@/src/components/pet/PetSprite';
import { GOAL_DAYS, type GoalDays, type AskReason } from '@/src/services/streakGoal';
import { pickGoalLine } from '@/src/services/goalPetLines';
import { suggestLabelKey, type Suggestion } from '@/src/services/goalSuggest';

/**
 * ОКНО ЦЕЛИ: ПИТОМЕЦ, ТРИ ВАРИАНТА, ОДИН ТАП.
 *
 * 🔴 ЗАЧЕМ. Единственное, что до сих пор называлось целью, — карточка со
 * СВОБОДНЫМ ТЕКСТОМ. Денис 07.09.2026: «она строчкой, которую не каждый
 * откроет, и каждый поймёт, что туда писать». Ввод текста — барьер, тап — нет.
 * Образец взят у Duolingo: одно окно, выбор нажатием, ноль клавиатуры.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕТ — ОБЕЩАНИЙ. У Duolingo над вариантами написано «ваши шансы
 * пройти курс вырастут в 2 раза». Такого замера у нас нет ни в каком виде, и
 * выдуманная цифра на первом экране обесценивает всё, что стоит рядом. Решение
 * Дениса: ничего не обещать. Вместо обещания — ФАКТ О ЧЕЛОВЕКЕ под выбранным
 * вариантом («твоя лучшая серия — 4 дня»), и только когда он ЗАМЕРЕН
 * (`suggestLabelKey` вернёт null, если основания нет).
 *
 * ⚠️ КОМПОНЕНТ НЕ ХОДИТ НИ В ХРАНИЛИЩЕ, НИ В КОНТЕКСТЫ — как `DailyGoalCard`
 * рядом. Всё приходит пропсами, подпись — прокинутым `t`. Так окно гонится
 * настоящим рендером во всех состояниях, а не проверяется глазами на живом
 * экране (`src/__tests__/streak-goal-sheet.test.tsx`).
 *
 * ⚠️ ПИТОМЕЦ ГОВОРИТ РАЗНОЕ НА РАЗНЫЕ ПОВОДЫ — требование Дениса «питомец
 * должен общаться с пользователем». Реплика и облик приходят из
 * `goalPetLines`, а не зашиты сюда: человеку, который ДОШЁЛ до срока, и
 * человеку, который сорвался, нельзя говорить одно и то же.
 */

export interface TodayMetrics {
  /** Партий сыграно за сегодня. */
  games: number;
  /** Заработано за сегодня, ⭐. */
  tokens: number;
  /** Текущая серия в днях. */
  streak: number;
}

interface Props {
  reason: AskReason;
  suggestion: Suggestion;
  today: TodayMetrics;
  language: string;
  petSkin: PetSkin;
  colors: { surface: string; text: string; textSecondary: string; primary: string; border: string };
  t: (key: string) => string;
  onPick: (days: GoalDays) => void;
  onSkip: () => void;
}

/** Подстановка числа в подпись — тем же приёмом, что в онбординге (`{n}`). */
const withN = (s: string, n: number) => s.replace('{n}', String(n));

export default function StreakGoalSheet({
  reason, suggestion, today, language, petSkin, colors, t, onPick, onSkip,
}: Props) {
  const line = pickGoalLine(language, reason);
  const labelKey = suggestLabelKey(suggestion);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onSkip}>
      <View {...a11yModal} style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]} testID="streak-goal-sheet">
          {/* Питомец и его реплика — над выбором: сначала кто спрашивает, потом что. */}
          <View style={styles.petRow}>
            <PetStill skin={petSkin} state={line.state} size={64} />
            <View style={[styles.bubble, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.bubbleText, { color: colors.text }]} testID="goal-pet-line">
                {line.text}
              </Text>
            </View>
          </View>

          {GOAL_DAYS.map((d) => {
            const chosen = d === suggestion.days;
            return (
              <TouchableOpacity
                key={d}
                accessibilityRole="button"
                testID={`goal-option-${d}`}
                onPress={() => onPick(d)}
                style={[
                  styles.option,
                  { borderColor: chosen ? colors.primary : colors.border },
                  chosen && styles.optionChosen,
                ]}
              >
                <Text style={[styles.optionDays, { color: chosen ? colors.primary : colors.text }]}>
                  {withN(t('goalSheetDays'), d)}
                </Text>
                {/* 🔴 Подпись-основание ТОЛЬКО под предложенным и ТОЛЬКО когда
                    оно замерено. Нет числа — нет строки, вариант просто выбран. */}
                {chosen && labelKey !== null && suggestion.basis !== null && (
                  <Text
                    style={[styles.optionWhy, { color: colors.textSecondary }]}
                    testID="goal-option-why"
                  >
                    {withN(t(labelKey), suggestion.basis)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}

          {/* Дневные метрики — просьба Дениса. Факт о сегодняшнем дне, без оценки. */}
          <Text style={[styles.today, { color: colors.textSecondary }]} testID="goal-today">
            {t('goalSheetToday')
              .replace('{g}', String(today.games))
              .replace('{p}', String(today.tokens))
              .replace('{s}', String(today.streak))}
          </Text>

          <TouchableOpacity accessibilityRole="button" testID="goal-skip" onPress={onSkip} style={styles.skip}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>{t('notNow')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { borderRadius: 18, padding: 20, width: '100%', maxWidth: 440, gap: 10 },
  petRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  // Форма пузыря — та же, что у ходячего питомца (WalkingPet), чтобы читалось
  // как один и тот же персонаж, а не два разных источника речи.
  bubble: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1,
    borderRadius: 13, borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 19 },
  // ⚠️ minHeight 56 — не «на глаз»: порог поля из tap-target-audit 48 px плюс
  // запас, иначе аудит целей нажатия покраснеет на этом же окне.
  option: {
    minHeight: 56, justifyContent: 'center', borderRadius: 14,
    borderWidth: 1, paddingVertical: 10, paddingHorizontal: 16,
  },
  optionChosen: { borderWidth: 2 },
  optionDays: { fontSize: 16, fontWeight: '800' },
  optionWhy: { fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  today: { fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 2 },
  skip: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  skipText: { fontSize: 14, fontWeight: '600' },
});
