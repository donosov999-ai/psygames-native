/* psygames-game-pause · VER 1 · 26.08.2026 */
/**
 * «ПАУЗА / ЗАРЯДКА» — ХАБ ТЕЛЕСНЫХ ПРАКТИК.
 *
 * Модуль приехал из лаборатории `~/dev/psygames-game-lab/pause-practices`
 * (ветка `codex/pause-practices`, автор psygames-codex-mac). Ядро перенесено
 * без правок в `src/games/pause/core`, здесь только переходник: тема, язык,
 * сохранение сессии.
 *
 * 🔴 ЯДРО ОБЩЕЕ С ОТДЕЛЬНЫМ ПРИЛОЖЕНИЕМ «Умный будильник». Оно компилирует
 * `src/games/pause/core` к себе в `web-dist/shared/` на сборке — это НЕ копия,
 * а один и тот же исходник. Поэтому ядро обязано остаться платформенно чистым;
 * сторожит `src/__tests__/pause-shared-core.test.ts`.
 *
 * ⚠️ «ДЫХАНИЕ» И «ГИМНАСТИКА ДЛЯ ГЛАЗ» НЕ УДАЛЕНЫ. В инструкции приёмки
 * предлагалось заменить их этим хабом, но у обеих игр есть история сессий,
 * достижения и глубокие ссылки у живых игроков. Слияние — отдельное решение с
 * миграцией, а не побочный эффект переноса. Пока хаб добавлен рядом.
 *
 * ⚠️ ЯЗЫКОВ ДВА, А НЕ ДВЕНАДЦАТЬ. Ядро несёт 156 шагов с подписями на `ru`/`en`
 * (`PauseLocale`), приложение говорит на двенадцати. Это ЗНАЕМАЯ дыра, а не
 * недосмотр: перевод 156 шагов — работа канала переводов, заведена задачей.
 * Гейт `pause-i18n-debt.test.ts` держит долг на виду и покраснеет, когда
 * перевод приедет, — чтобы модуль не забыли включить в общий гейт словарей.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { goBackOrHome } from '@/src/utils/nav';
import { useKeepAwake } from '@/src/hooks/useKeepAwake';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameShell from '@/src/components/GameShell';
import GameAbout from '@/src/components/GameAbout';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { gameNow } from '@/src/services/gamePause';
import {
  PausePracticesGame,
  PRACTICE_CATALOG,
  getDefaultPracticeSets,
  type PauseLocale,
  type PlanMode,
  type PracticeContext,
  type PracticeResult,
  type PracticeSetId,
  type PracticeSelection,
} from '@/src/games/pause';

const GRADIENT = ['#0f766e', '#134e4a'];   // глубокий зелёный: не совпадает ни с «Дыханием», ни с «Глазами»

/** Длительности паузы. Пятнадцать минут — потолок: дальше это уже не пауза. */
const DURATIONS_MIN = [3, 5, 10, 15] as const;

const CONTEXT_LABEL: Record<PracticeContext, { ru: string; en: string }> = {
  'desk-invisible': { ru: 'За столом, незаметно', en: 'At the desk, unnoticed' },
  'desk-visible': { ru: 'За столом, можно двигаться', en: 'At the desk, movement fine' },
  home: { ru: 'Дома, свободно', en: 'At home, free' },
};

const MODE_LABEL: Record<PlanMode, { ru: string; en: string }> = {
  solo: { ru: 'По одной', en: 'One at a time' },
  parallel: { ru: 'Параллельно', en: 'In parallel' },
  charge: { ru: 'Зарядка подряд', en: 'Charge sequence' },
};

type Phase = 'config' | 'playing' | 'result';

export default function PauseGame() {
  const { colors } = useTheme();
  const { language } = useLanguage();
  useKeepAwake(true);

  const { isPreset, autostart, num, str, isCalm } = useGamePreset();
  useCalmHush(isCalm);

  const locale: PauseLocale = language === 'ru' ? 'ru' : 'en';
  const tr = useCallback((pair: { ru: string; en: string }) => pair[locale], [locale]);

  const [phase, setPhase] = useState<Phase>('config');
  const [minutes, setMinutes] = useState<number>(() => num('minutes', 5));
  const [context, setContext] = useState<PracticeContext>(() => (str('context', 'desk-visible') as PracticeContext));
  const [mode, setMode] = useState<PlanMode>(() => (str('mode', 'solo') as PlanMode));
  const [chosen, setChosen] = useState<readonly PracticeSetId[]>(() => getDefaultPracticeSets().slice(0, 1).map((s) => s.id));
  const [last, setLast] = useState<PracticeResult | null>(null);
  /**
   * ⚠️ МОДУЛЮ БОЛЬШЕ НЕ ПЕРЕДАЁТСЯ `onExit`. Его собственная кнопка «Выход»
   * уводила МИМО вопроса при выходе — то есть вопрос стоял, а обойти его можно
   * было в один тап. Поймал гейт `module-games-guard`. Теперь выход один: через
   * шапку каркаса, и он спрашивает.
   */
  const [started, setStarted] = useState(false);
  const markStarted = useCallback(() => setStarted(true), []);

  // Показываем только наборы, подходящие к выбранной обстановке: за столом
  // незаметно не сделать позы и подвижность, и предлагать их там — обман.
  const available = useMemo(
    () => PRACTICE_CATALOG.filter((set) => set.contexts.includes(context)),
    [context],
  );

  const selections: readonly PracticeSelection[] = useMemo(
    () => chosen
      .filter((id) => available.some((s) => s.id === id))
      .map((id) => ({ setId: id })),
    [chosen, available],
  );

  const start = useCallback(() => { if (selections.length) { setStarted(false); setPhase('playing'); } }, [selections.length]);
  useAutostartWhenReady(() => autostart && selections.length > 0, () => start());

  /**
   * 🔴 В ОДИНОЧНОМ РЕЖИМЕ НАБОР РОВНО ОДИН — ЭТО ПРАВИЛО ЯДРА, А НЕ ВКУС.
   * `validatePlanRequest` возвращает `INVALID_SELECTION_COUNT`, если в `solo`
   * пришло больше одного. Первая редакция этого экрана клала по умолчанию два
   * набора: план не собрался бы НИКОГДА, а человек видел бы кнопку «Начать»,
   * которая молча ничего не делает. Поймал гейт `pause-shared-core`, не я.
   * Поэтому здесь выбор ведёт себя как переключатель в solo и как галочки в
   * остальных режимах.
   */
  const toggle = useCallback((id: PracticeSetId) => {
    setChosen((prev) => {
      if (mode === 'solo') return prev.includes(id) ? prev : [id];
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, [mode]);

  // Смена режима на одиночный обязана обрезать выбор, иначе останется прежний
  // список из нескольких наборов и старт снова окажется мёртвым.
  const chooseMode = useCallback((m: PlanMode) => {
    setMode(m);
    if (m === 'solo') setChosen((prev) => (prev.length > 1 ? prev.slice(0, 1) : prev));
  }, []);

  const onComplete = useCallback((result: PracticeResult) => {
    setStarted(false);   // практика дошла до конца — терять нечего, вопрос снимаем
    setLast(result);
    setPhase('result');
    // 🔴 СОХРАНЯЕМ ТОЛЬКО ФАКТ И ДЛИТЕЛЬНОСТЬ. Ни «качества выполнения», ни
    // придуманной пользы: практику никто не оценивает, и очки здесь были бы
    // выдумкой. `score` = минуты, чтобы таблица не показывала ноль.
    void saveSession({
      game_type: 'pause',
      score: Math.round(result.durationMs / 60_000),
      time_seconds: Math.round(result.durationMs / 1000),
      mode,
      difficulty: context,
      details: {
        sets: [...result.completedSetIds],
        interrupted: result.interruptedCount,
        plan_id: result.planId,
      },
    });
  }, [mode, context]);

  const theme = useMemo(() => ({
    background: colors.background,
    surface: colors.surface,
    surfaceMuted: colors.surface,
    text: colors.text,
    textSecondary: colors.textSecondary,
    border: colors.border,
    primary: colors.primary,
    secondary: colors.textSecondary,
    success: colors.success,
    danger: colors.error,
    focus: colors.primary,
  }), [colors]);

  // 🔴 ПРАКТИКА ИДЁТ ВНУТРИ КАРКАСА, А НЕ ВМЕСТО НЕГО. Первая редакция возвращала
  // модуль отдельным экраном мимо `GameShell` — и на время практики пропадали и
  // рамка, и кнопка «назад»: выйти из десятиминутной паузы было нечем, кроме
  // системного жеста. Поймал гейт `game-task-line` («каркас партии без модуля
  // внутри»), и он же объясняет, почему каркас нужен именно здесь: партия на
  // минуты, и молча оборвать её нельзя.
  if (phase === 'playing') {
    return (
      <GameShell
        title={tr({ ru: 'Пауза', en: 'Pause' })}
        onBack={() => setPhase('config')}
        /**
         * 🔴 ВОПРОС ПРИ ВЫХОДЕ ВЗВЕДЁН ЖИВЫМ ВЫРАЖЕНИЕМ, А НЕ КОНСТАНТОЙ.
         * `started` поднимается, как только модуль отдал первый сигнал хода:
         * до того терять нечего и спрашивать не о чем, после — человек уже
         * дышит, и десять минут молча стереть нельзя. Константа `true` приучила
         * бы жать «выйти» не читая, `false` — проп ради проппа.
         */
        confirmExit={started}
      >
        <PausePracticesGame
          request={{
            mode,
            selections,
            durationMs: minutes * 60_000,
            locale,
            guideMode: 'visual',
            context,
          }}
          theme={theme}
          // ⚠️ ЧАСЫ ИГРОВЫЕ, А НЕ НАСТЕННЫЕ. По `Date.now` практика продолжала бы
          // идти, пока приложение свёрнуто или открыт вопрос при выходе: человек
          // вернулся бы к «уже всё» вместо своих десяти минут.
          now={gameNow}
          onProgress={markStarted}
          onComplete={onComplete}
        />
      </GameShell>
    );
  }

  return (
    <GameShell title={tr({ ru: 'Пауза', en: 'Pause' })} onBack={() => goBackOrHome()}>
      <ScrollView contentContainerStyle={styles.body}>
        {phase === 'result' && last && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.h, { color: colors.text }]}>
              {tr({ ru: 'Пауза окончена', en: 'Pause complete' })}
            </Text>
            <Text style={[styles.p, { color: colors.textSecondary }]}>
              {tr({ ru: 'Минут', en: 'Minutes' })}: {Math.round(last.durationMs / 60_000)} · {tr({ ru: 'наборов', en: 'sets' })}: {last.completedSetIds.length}
            </Text>
          </View>
        )}

        <Text style={[styles.h, { color: colors.text }]}>{tr({ ru: 'Где вы сейчас', en: 'Where you are' })}</Text>
        <View style={styles.row}>
          {(Object.keys(CONTEXT_LABEL) as PracticeContext[]).map((c) => (
            <TouchableOpacity
              key={c}
              accessibilityRole="button"
              accessibilityLabel={tr(CONTEXT_LABEL[c])}
              onPress={() => setContext(c)}
              style={[styles.chip, { borderColor: context === c ? colors.primary : colors.border, backgroundColor: context === c ? colors.primary + '22' : 'transparent' }]}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{tr(CONTEXT_LABEL[c])}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.h, { color: colors.text }]}>{tr({ ru: 'Сколько минут', en: 'How many minutes' })}</Text>
        <View style={styles.row}>
          {DURATIONS_MIN.map((m) => (
            <TouchableOpacity
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`${m}`}
              onPress={() => setMinutes(m)}
              style={[styles.chip, { borderColor: minutes === m ? colors.primary : colors.border, backgroundColor: minutes === m ? colors.primary + '22' : 'transparent' }]}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.h, { color: colors.text }]}>{tr({ ru: 'Как вести', en: 'How to run' })}</Text>
        <View style={styles.row}>
          {(Object.keys(MODE_LABEL) as PlanMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              accessibilityRole="button"
              accessibilityLabel={tr(MODE_LABEL[m])}
              onPress={() => chooseMode(m)}
              style={[styles.chip, { borderColor: mode === m ? colors.primary : colors.border, backgroundColor: mode === m ? colors.primary + '22' : 'transparent' }]}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{tr(MODE_LABEL[m])}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.h, { color: colors.text }]}>
          {tr({ ru: 'Что делаем', en: 'What to practise' })} · {selections.length}
        </Text>
        {available.map((set) => {
          const on = chosen.includes(set.id);
          return (
            <TouchableOpacity
              key={set.id}
              accessibilityRole="button"
              accessibilityLabel={set.title[locale]}
              onPress={() => toggle(set.id)}
              style={[styles.setRow, { borderColor: on ? colors.primary : colors.border, backgroundColor: colors.surface }]}
            >
              <Ionicons
                name={mode === 'solo' ? (on ? 'radio-button-on' : 'radio-button-off') : (on ? 'checkbox' : 'square-outline')}
                size={20}
                color={on ? colors.primary : colors.textSecondary}
              />
              <View style={styles.setText}>
                <Text style={[styles.setTitle, { color: colors.text }]}>{set.title[locale]}</Text>
                <Text style={[styles.setSummary, { color: colors.textSecondary }]}>{set.summary[locale]}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={tr({ ru: 'Начать паузу', en: 'Start the pause' })}
          disabled={!selections.length}
          onPress={start}
          style={[styles.start, { backgroundColor: selections.length ? colors.primary : colors.border }]}
        >
          <Text style={styles.startText}>{tr({ ru: 'Начать', en: 'Start' })}</Text>
        </TouchableOpacity>

        {!isPreset && <GameAbout descriptionKey="pauseDesc" accent={GRADIENT[0]} />}
      </ScrollView>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 6 },
  h: { fontSize: 16, fontWeight: '600', marginTop: 10 },
  p: { fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // ⚠️ И ШИРИНА, А НЕ ТОЛЬКО ВЫСОТА. Стояло `minHeight: 44` — и этого хватало всем
  // чипам, кроме числовых: «3» и «5» с боковыми отступами по 14 дают ~40 px ширины.
  // Поймал живой гейт размеров на собранном вебе («/games/pause — 2 шт.»), а не глаз:
  // на экране разница в четыре пикселя не видна, а пальцем промахиваешься.
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '500' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, minHeight: 44 },
  setText: { flex: 1, gap: 2 },
  setTitle: { fontSize: 15, fontWeight: '600' },
  setSummary: { fontSize: 13 },
  start: { marginTop: 18, padding: 16, borderRadius: 14, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  startText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
