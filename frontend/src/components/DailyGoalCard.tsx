/* psygames-daily-goal-card · VER 1 · 20.08.2026 */
import { textOn } from '@/src/services/onGradientText';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DAY_GOAL_EXAMPLE_KEYS, DAY_GOAL_MAX_LEN, DayGoalCardState, GoalOutcome, normalizeGoalText,
} from '@/src/services/dailyGoal';

/**
 * КАРТОЧКА ЦЕЛИ ДНЯ. Показывает ровно то, что человек написал сам, — и ничего сверх.
 *
 * Замысел и правила суток — в шапке `src/services/dailyGoal.ts`. Здесь только показ,
 * поэтому компонент НЕ ХОДИТ НИ В ХРАНИЛИЩЕ, НИ В КОНТЕКСТЫ: состояние, текст и
 * число партий приходят пропсами, подпись — прокинутым `t`. Так карточку можно
 * прогнать во всех пяти состояниях настоящим рендером, а не глазами на живом экране
 * (`src/__tests__/daily-goal.test.ts`).
 *
 * 🔴 ТРИ ЗАПРЕТА, КОТОРЫЕ ЛЕГКО НАРУШИТЬ ИЗ ЛУЧШИХ ПОБУЖДЕНИЙ.
 *
 * 1. ЗАКРЫТАЯ КАРТОЧКА НЕ ЗАНИМАЕТ МЕСТА. `hidden` рисует `null`, а не пустую рамку
 *    и не «свёрнутую полоску»: место, оставшееся от закрытого, — та же навязчивость,
 *    только тише. Проверяется прогоном: `toJSON()` в этом состоянии равен null.
 *
 * 2. ПУСТОЕ ПОЛЕ НЕ СОХРАНЯЕТСЯ. Кнопка при пустом (или пробельном) вводе не зовёт
 *    `onSave` вовсе — не «сохраняет пустую строку», не «сохраняет и прячет».
 *    Пустота проверяется тем же `normalizeGoalText`, что и в сервисе: два разных
 *    представления о пустоте разъехались бы на первом же переводе строки.
 *
 * 3. ПРИМЕРЫ — ТЕКСТ, А НЕ КНОПКИ. Нажимаемый пример подставил бы НАШУ формулировку
 *    и превратил бы «человек называет свою причину» в выбор из трёх наших. Они стоят
 *    подписью под полем и показывают жанр: короткая бытовая причина.
 *
 * 4. 🔴 СУММА НАГРАДЫ НЕ СТОИТ НА КНОПКАХ ИСХОДА. За достигнутую цель платят
 *    (`DAY_GOAL_REWARD`, earn.ts), но «+25 ⭐» рядом со словом «Получилось» — это
 *    ценник за нужный ответ: цель человек отмечает сам, проверить его некому, и
 *    подписанная кнопка покупает не результат, а нажатие. Число показывается ПОСЛЕ
 *    ответа, в закрытой карточке, — тогда оно сообщает о случившемся, а не торгуется.
 *    У ответа «не сегодня» разговора о деньгах нет вовсе: ни суммы, ни упоминания
 *    упущенного — «ты не получил очков» и есть тот самый штраф, которого мы не ставим.
 */

interface Props {
  state: DayGoalCardState;
  /** Строка человека. null — цели на сегодня нет. Наших текстов здесь не бывает. */
  goalText: string | null;
  outcome: GoalOutcome | null;
  /** Начислено за достигнутую цель. 0/null — не начислялось (см. запрет 4 в шапке). */
  reward?: number | null;
  /** Сколько партий сыграно сегодня — факт из журнала, не оценка. */
  roundsToday: number;
  colors: any;
  t: (key: string) => string;
  onSave: (raw: string) => void;
  onDismiss: () => void;
  onOutcome: (outcome: GoalOutcome) => void;
}

export default function DailyGoalCard({
  state, goalText, outcome, reward, roundsToday, colors, t, onSave, onDismiss, onOutcome,
}: Props) {
  const [draft, setDraft] = useState('');
  /**
   * Развёрнута ли форма цели. Свёрнутая — одна строка (см. комментарий у разметки).
   * ⚠️ Объявлено ЗДЕСЬ, до раннего `return null` при state === 'hidden': хук после
   * выхода вызывается не в каждом рендере, и правило порядка хуков это ловит.
   */
  const [развернуто, setРазвернуто] = useState(false);
  // Хук объявлен ДО выхода: ранний return выше сломал бы порядок хуков при смене состояния.
  if (state === 'hidden') return null;

  const canSave = normalizeGoalText(draft) !== null;
  const accent = '#0ea5e9';

  /** Крестик «убрать на сегодня» — один тап, из любого состояния. */
  const closeBtn = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t('dayGoalCloseA11y')}
      onPress={onDismiss}
      activeOpacity={0.7}
      style={styles.close}
    >
      <Ionicons name="close" size={17} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Ionicons name="flag-outline" size={18} color={accent} />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('dayGoalTitle')}</Text>
        {closeBtn}
      </View>

      {/**
        * 🔴 СПРОШЕНО ОДНОЙ СТРОКОЙ, РАЗВЁРНУТО ПО НАЖАТИЮ.
        *
        * Просьба Дениса 03.09.2026: «цель бы тоже компактнее сделать, а то дофига места
        * заняла, думаю как либо в квадрат свернуть». В свёрнутом виде карточка занимала
        * девять строк — вопрос, пояснение, поле, две кнопки, заголовок примеров и три
        * примера, — и выдавливала вниз «Сегодня» и рекомендации.
        *
        * Сам вопрос остаётся ВИДИМЫМ: сворачивать его в значок значило бы, что цель дня
        * перестанут ставить вовсе — а ради неё карточка и заведена. Разворачивается тот,
        * кто и правда хочет написать.
        */}
      {state === 'ask' && !развернуто && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('dayGoalAsk')}
          activeOpacity={0.8}
          onPress={() => setРазвернуто(true)}
          style={styles.compactRow}
        >
          <Text style={[styles.ask, { color: colors.text, flex: 1 }]} numberOfLines={1}>{t('dayGoalAsk')}</Text>
          <Text style={[styles.compactCta, { color: accent }]}>{t('dayGoalSave')}</Text>
          <Ionicons name="chevron-forward" size={16} color={accent} />
        </TouchableOpacity>
      )}

      {state === 'ask' && развернуто && (
        <>
          <Text style={[styles.ask, { color: colors.text }]}>{t('dayGoalAsk')}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('dayGoalAskHint')}</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('dayGoalPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            maxLength={DAY_GOAL_MAX_LEN}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          />
          <View style={styles.row}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              accessibilityLabel={t('dayGoalSave')}
              activeOpacity={0.85}
              // Пустое поле не сохраняется вовсе — см. запрет 2 в шапке.
              onPress={() => { if (!canSave) return; onSave(draft); setDraft(''); }}
              style={[styles.primary, { backgroundColor: canSave ? accent : colors.border }]}
            >
              <Text style={[styles.primaryText, { color: canSave ? '#fff' : colors.textSecondary }]}>
                {t('dayGoalSave')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('notNow')}
              activeOpacity={0.8}
              onPress={onDismiss}
              style={[styles.ghost, { borderColor: colors.border }]}
            >
              <Text style={[styles.ghostText, { color: colors.textSecondary }]}>{t('notNow')}</Text>
            </TouchableOpacity>
          </View>
          {/* Примеры. Не нажимаются намеренно — см. запрет 3 в шапке. */}
          <Text style={[styles.examplesTitle, { color: colors.textSecondary }]}>{t('dayGoalExamplesTitle')}</Text>
          {DAY_GOAL_EXAMPLE_KEYS.map((k) => (
            <Text key={k} style={[styles.example, { color: colors.textSecondary }]} numberOfLines={2}>
              {'— ' + t(k)}
            </Text>
          ))}
        </>
      )}

      {state !== 'ask' && (
        <>
          <Text style={[styles.lead, { color: colors.textSecondary }]}>{t('dayGoalTodayLine')}</Text>
          {/* Слова человека. Единственное место карточки, где текст не наш. */}
          <Text style={[styles.goal, { color: colors.text }]} numberOfLines={3}>{goalText}</Text>
          <Text style={[styles.rounds, { color: colors.textSecondary }]}>
            {roundsToday > 0
              ? t('dayGoalRounds').replace('{n}', String(roundsToday))
              : t('dayGoalRoundsNone')}
          </Text>
        </>
      )}

      {state === 'review' && (
        <>
          <Text style={[styles.ask, { color: colors.text }]}>{t('dayGoalReview')}</Text>
          <View style={styles.row}>
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('dayGoalYes')} activeOpacity={0.85}
              onPress={() => onOutcome('done')}
              style={[styles.primary, { backgroundColor: '#22c55e' }]}
            >
              <Text style={[styles.primaryText, { color: textOn('#22c55e') }]}>{t('dayGoalYes')}</Text>
            </TouchableOpacity>
            {/* «Не сегодня» — такая же обычная кнопка, как соседняя: ни красного цвета,
                ни знака беды. Ответ «нет» здесь не хуже ответа «да». */}
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('dayGoalNo')} activeOpacity={0.85}
              onPress={() => onOutcome('not_today')}
              style={[styles.ghost, { borderColor: colors.border }]}
            >
              <Text style={[styles.ghostText, { color: colors.textSecondary }]}>{t('dayGoalNo')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {state === 'closed' && (
        <>
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {t(outcome === 'done' ? 'dayGoalDoneNote' : 'dayGoalMissedNote')}
          </Text>
          {/* Разговор о деньгах — только у достигнутой цели. У «не сегодня» его нет:
              см. запрет 4 в шапке. Начислено — говорим сколько; не начислено — говорим
              правило («очки за цель дают в день с партиями»), а не «ты не заработал». */}
          {outcome === 'done' && ((reward ?? 0) > 0 ? (
            <Text style={[styles.reward, { color: '#b45309' }]}>
              {t('dayGoalRewardNote').replace('{n}', String(reward))}
            </Text>
          ) : (
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              {t('dayGoalRewardNeedsRound')}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 4, height: 18, borderRadius: 2 },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  /** 44×44 — настоящая зона нажатия: hitSlop в react-native-web не работает. */
  close: { width: 44, height: 44, marginVertical: -13, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
  ask: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  hint: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, minHeight: 42 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  primary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10 },
  primaryText: { fontSize: 14, fontWeight: '800' },
  ghost: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  ghostText: { fontSize: 14, fontWeight: '700' },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  compactCta: { fontSize: 14, fontWeight: '700' },
  examplesTitle: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  example: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  lead: { fontSize: 12, fontWeight: '700' },
  goal: { fontSize: 16, fontWeight: '800', lineHeight: 21 },
  rounds: { fontSize: 12, fontWeight: '600' },
  note: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  reward: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
});
