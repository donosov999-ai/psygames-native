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
 * 🔴 ВИД ПОКАЗЫВАЕТСЯ СТРАНИЦЕЙ БУДИЛЬНИКА ЦЕЛИКОМ (27.08.2026). Здесь был свой
 * планировщик и свой экран практики, где на месте картинки стоял один значок.
 * В будильнике вид проработан полностью — картинки, траектория взгляда, рамка
 * времени по фазам, параллельный режим, предупреждения. Попытка перенести это
 * по частям, переписав рисовалки на `react-native-svg`, дала расхождение уже на
 * первом замере: гимнастика глаз получила фигуру дыхания вместо своей
 * движущейся мишени. Поэтому берётся готовая сборка страницы целиком —
 * `scripts/sync-warmup-page.mjs` → `public/warmup`, показ `ui/WarmupPage.tsx`.
 *
 * ⚠️ ЯЗЫКОВ ДВА, А НЕ ДВЕНАДЦАТЬ. Ядро несёт 156 шагов с подписями на `ru`/`en`
 * (`PauseLocale`), приложение говорит на двенадцати. Это ЗНАЕМАЯ дыра, а не
 * недосмотр: перевод 156 шагов — работа канала переводов, заведена задачей.
 * Гейт `pause-i18n-debt.test.ts` держит долг на виду и покраснеет, когда
 * перевод приедет, — чтобы модуль не забыли включить в общий гейт словарей.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { goBackOrHome } from '@/src/utils/nav';
import { useKeepAwake } from '@/src/hooks/useKeepAwake';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameShell from '@/src/components/GameShell';
import WarmupPage, { type WarmupOutcome } from '@/src/games/pause/ui/WarmupPage';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import {
  PRACTICE_CATALOG,
  getDefaultPracticeSets,
  type PauseLocale,
  type PlanMode,
  type PracticeContext,
  type PracticeResult,
  type PracticeSetId,
  type PracticeSelection,
} from '@/src/games/pause';



type Phase = 'config' | 'playing' | 'result';

export default function PauseGame() {
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  useKeepAwake(true);

  const { autostart, str, isCalm } = useGamePreset();
  useCalmHush(isCalm);

  const locale: PauseLocale = language === 'ru' ? 'ru' : 'en';
  const tr = useCallback((pair: { ru: string; en: string }) => pair[locale], [locale]);

  const [phase, setPhase] = useState<Phase>('config');
  const [context] = useState<PracticeContext>(() => (str('context', 'desk-visible') as PracticeContext));
  const [mode] = useState<PlanMode>(() => (str('mode', 'solo') as PlanMode));
  /**
   * 🔴 НАБОР МОЖНО ПОПРОСИТЬ ССЫЛКОЙ — `?set=breathing`.
   *
   * Появилось 27.08.2026, когда «Дыхание» и «Гимнастика глаз» перестали быть
   * отдельными карточками и стали дверями СЮДА. Без этого дверь вела бы в общий
   * хаб с набором по умолчанию, и человек, нажавший «Дыхание», получал бы не то,
   * что просил.
   *
   * ⚠️ Проверяем, что запрошенный набор существует: чужая ссылка с опечаткой не
   * должна оставлять экран с пустым выбором и мёртвой кнопкой «Начать».
   */
  const [chosen] = useState<readonly PracticeSetId[]>(() => {
    const запрошен = str('set');
    if (запрошен && PRACTICE_CATALOG.some((s) => s.id === запрошен)) {
      return [запрошен as PracticeSetId];
    }
    return getDefaultPracticeSets().slice(0, 1).map((s) => s.id);
  });
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
   * Итог приходит от встроенной страницы: дошла сессия до конца или человек
   * вышел без записи. Выход без записи НЕ сохраняем — так же, как и раньше.
   */
  const onOutcome = useCallback((outcome: WarmupOutcome) => {
    if (!outcome.completed) { setStarted(false); return; }
    setStarted(false);
    setLast({
      planId: 'warmup-page',
      durationMs: outcome.durationMs,
      completedSetIds: chosen,
      interruptedCount: 0,
    } as PracticeResult);
    setPhase('result');
    void saveSession({
      game_type: 'pause',
      score: Math.round(outcome.durationMs / 60_000),
      time_seconds: Math.round(outcome.durationMs / 1000),
      mode,
      difficulty: context,
      details: { sets: [...chosen], interrupted: 0, plan_id: 'warmup-page' },
    });
  }, [mode, context, chosen]);



  // 🔴 ПРАКТИКА ИДЁТ ВНУТРИ КАРКАСА, А НЕ ВМЕСТО НЕГО. Первая редакция возвращала
  // модуль отдельным экраном мимо `GameShell` — и на время практики пропадали и
  // рамка, и кнопка «назад»: выйти из десятиминутной паузы было нечем, кроме
  // системного жеста. Поймал гейт `game-task-line` («каркас партии без модуля
  // внутри»), и он же объясняет, почему каркас нужен именно здесь: партия на
  // минуты, и молча оборвать её нельзя.
  /**
   * 🔴 СВОЙ ПЛАНИРОВЩИК УБРАН — ОН ДУБЛИРОВАЛ ПЛАНИРОВЩИК СТРАНИЦЫ.
   *
   * Первая сборка переноса оставила оба: сначала выбор обстановки/минут/наборов
   * в приложении, потом ТОТ ЖЕ выбор внутри страницы. Два одинаковых экрана
   * подряд — это не «перенесли», это «положили рядом».
   *
   * Ведёт страница: её планировщик богаче (полный каталог, программа у каждого
   * набора, поиск, «освоено отдельно», экспериментальные наборы) и он же
   * держит предупреждения безопасности. Экран приложения остаётся каркасом:
   * заголовок, «назад» с вопросом, сохранение итога.
   *
   * ⚠️ Разбор итога (`phase === 'result'`) НЕ трогаем: он показывается после
   * завершения и ведёт к повторному заходу.
   */
  if (phase !== 'result') {
    return (
      <GameShell
        title={tr({ ru: 'Глаза и дыхание', en: 'Eyes & breathing' })}
        onBack={() => goBackOrHome()}
        /**
         * 🔴 ВОПРОС ПРИ ВЫХОДЕ ВЗВЕДЁН ЖИВЫМ ВЫРАЖЕНИЕМ, А НЕ КОНСТАНТОЙ.
         * `started` поднимается, как только модуль отдал первый сигнал хода:
         * до того терять нечего и спрашивать не о чем, после — человек уже
         * дышит, и десять минут молча стереть нельзя. Константа `true` приучила
         * бы жать «выйти» не читая, `false` — проп ради проппа.
         */
        confirmExit={started}
      >
        {/*
          🔴 ЗДЕСЬ БЫЛ СВОЙ ЭКРАН ПРАКТИКИ. Он рисовал текст, часы и один значок
          на месте картинки. Теперь показывается страница будильника целиком:
          её планировщик, её картинки, её рамка времени, её предупреждения.
          Итог — через `onOutcome`, сохранение осталось прежним.

          ⚠️ Предупреждения безопасности подтверждает ЧЕЛОВЕК внутри страницы.
          Проставлять их снаружи нельзя: галочка «я прочитал» не должна ставиться
          кодом.
        */}
        <WarmupPage
          /**
           * 🔴 ПРИЗНАК ТЕМЫ — `isDark` ИЗ КОНТЕКСТА, А НЕ СРАВНЕНИЕ ЦВЕТА.
           * Первая редакция сверяла фон с '#FFFFFF', а светлый фон приложения
           * — '#F5F5F7': условие было ложно ВСЕГДА, и страница жила в тёмной
           * теме даже в светлом приложении. Замер 27.08.2026 — скриншот Mac:
           * светлая главная, чёрный экран зарядки.
           */
          theme={isDark ? 'dark' : 'light'}
          locale={locale}
          set={str('set') || null}
          onReady={markStarted}
          onOutcome={onOutcome}
        />
      </GameShell>
    );
  }

  /**
   * 🔴 РАЗБОР ИТОГА — И ДВЕРЬ ОБРАТНО В СТРАНИЦУ, А НЕ В СТАРЫЙ ПЛАНИРОВЩИК.
   *
   * До 27.08.2026 после завершения показывался прежний экран приложения: выбор
   * обстановки, минут, режима и наборов. Он дублировал планировщик страницы, и
   * человек, только что закончивший зарядку, попадал в ХУДШУЮ копию того, из
   * чего вышел. Осталась карточка итога и одна кнопка — вернуться на страницу.
   */
  return (
    <GameShell title={tr({ ru: 'Глаза и дыхание', en: 'Eyes & breathing' })} onBack={() => goBackOrHome()}>
      <ScrollView contentContainerStyle={styles.body}>
        {last && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.h, { color: colors.text }]}>
              {tr({ ru: 'Пауза окончена', en: 'Pause complete' })}
            </Text>
            <Text style={[styles.p, { color: colors.textSecondary }]}>
              {tr({ ru: 'Минут', en: 'Minutes' })}: {Math.round(last.durationMs / 60_000)} · {tr({ ru: 'наборов', en: 'sets' })}: {last.completedSetIds.length}
            </Text>
          </View>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={tr({ ru: 'Ещё раз', en: 'Again' })}
          onPress={() => { setLast(null); setStarted(false); setPhase('config'); }}
          style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.primary + '22', alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 12 }]}
        >
          <Text style={{ color: colors.text, fontWeight: '600' }}>{tr({ ru: 'Ещё раз', en: 'Again' })}</Text>
        </TouchableOpacity>
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
