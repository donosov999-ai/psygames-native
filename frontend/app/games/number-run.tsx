/* psygames-game-number-run · VER 1 · 12.09.2026 */
/**
 * ЧИСЛОВОЙ ЗАБЕГ — ЭКРАН НА ОБЩЕМ КАРКАСЕ.
 *
 * Игру собрал `psygames-codex-mac` (LOCAL 0.4, `renderer-lab/`), передал
 * инструкцией `RUNNER_INTEGRATION_FOR_CLAUDE.md` VER 1 от 12.09.2026. Здесь —
 * только стыковка: шапка, показатели, пауза, нижнее управление и штатный итог
 * принадлежат приложению; механика целиком в перенесённых модулях ядра.
 *
 * ━━━ ЧТО ЭТО ЗА ИГРА ━━━
 * Один непрерывный забег: 12 этапов по 42 секунды, 504 активные секунды БЕЗ
 * сброса числа и без меню между этапами. Синие блоки прибавляют, красные
 * вычитают написанное; в поперечном ряду до пяти чисел, и каждое собирается
 * независимо — можно взять все пять, а не выбрать одно из трёх.
 *
 * 🔴 ЭТО НЕ КОРОТКАЯ ПРОБА, И В ЗАРЯДКУ ОНА НЕ ВКЛЮЧАЕТСЯ. Полный забег длится
 * 8:24. Короткий preset для зарядки — отдельное согласованное решение о
 * длительности, а не тихая подмена основного режима (требование инструкции).
 *
 * ⚠️ СМЕНА ЭТАПА — НЕ ПОБЕДА. Штатный итог пишется ОДИН раз на весь забег;
 * `LevelCleared` на каждом из двенадцати этапов был бы враньём об успехе.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import GameShell from '@/src/components/GameShell';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { onGameHold, isGameHeld } from '@/src/services/gamePause';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { saveSession } from '@/src/services/api';
import { goBackOrHome } from '@/src/utils/nav';
import NumberRunGame, { type РульЗабега, type ПоказателиЗабега, type ИтогЗабега } from '@/src/games/number-run/NumberRunGame.web';

const GRADIENT = ['#2563eb', '#7c3aed'] as const;
/** 12 этапов × 42 секунды — из `runner-campaign.mjs`, не выдумано здесь. */
const ЭТАПОВ = 12;
const СЕКУНД_НА_ЭТАП = 42;

type Фаза = 'config' | 'playing' | 'result';

export default function NumberRunScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка, общий канон
  const [фаза, setФаза] = useState<Фаза>('config');
  const [зерно, setЗерно] = useState(() => Math.floor(Math.random() * 1e6));
  const [пауза, setПауза] = useState(isGameHeld());
  const [показатели, setПоказатели] = useState<ПоказателиЗабега>({
    число: 1, этап: 1, этапов: ЭТАПОВ, столкновений: 0, секунд: 0,
  });
  const [итог, setИтог] = useState<ИтогЗабега | null>(null);
  const руль = useRef<РульЗабега | null>(null);
  const итогЗаписан = useRef(false);

  /**
   * 🔴 ПАУЗА БЕРЁТСЯ ИЗ ОБЩЕЙ СЛУЖБЫ, А НЕ ИЗ СВОЕГО ФЛАГА. Меню паузы рисует
   * каркас, и держит игру он же (`holdGame`). Свой флаг разошёлся бы с ним при
   * любом другом источнике удержания — например, при открытом отзыве.
   */
  useEffect(() => onGameHold((held) => setПауза(held)), []);

  const начать = useCallback(() => {
    setЗерно(Math.floor(Math.random() * 1e6));
    setИтог(null);
    итогЗаписан.current = false;
    setПоказатели({ число: 1, этап: 1, этапов: ЭТАПОВ, столкновений: 0, секунд: 0 });
    setФаза('playing');
  }, []);

  /**
   * ⚠️ ОДНА ЗАПИСЬ НА ЗАБЕГ. `итогЗаписан` сторожит повтор: адаптер может отдать
   * итог и по «упал», и по потере графики, а сессия должна лечь ровно одна.
   */
  const принятьИтог = useCallback((и: ИтогЗабега) => {
    setИтог(и);
    setФаза('result');
    if (итогЗаписан.current) return;
    итогЗаписан.current = true;
    void saveSession({
      passed: и.победа,
      game_type: 'number_run',
      score: и.число,
      time_seconds: и.активныхСекунд,
      difficulty: `journey-${и.этаповПройдено}/${ЭТАПОВ}`,
      mode: 'journey',
      details: {
        stages: и.этаповПройдено, hits: и.столкновений,
        number: и.число, reason: и.причина, seed: зерно,
      },
    }).catch(() => { /* офлайн — забег всё равно пройден */ });
  }, [зерно]);

  const рулить = useCallback((x: number) => руль.current?.рулить(x), []);

  /**
   * ⚠️ КЛЮЧ ТЕМЫ СЧИТАЕТСЯ ДО `useMemo`, А НЕ ВНУТРИ СПИСКА ЗАВИСИМОСТЕЙ. Вызов
   * функции в списке — правило `react-hooks/use-memo`, и заглушить его строкой про
   * `exhaustive-deps` нельзя: это разные правила. Поймал линт, не я.
   */
  const ключЦветов = колорыКлюч(colors);

  const нижниеКнопки = useMemo(() => (
    /**
     * 🔴 ТРИ КНОПКИ: ЛЕВЫЙ КРАЙ, ЦЕНТР, ПРАВЫЙ КРАЙ. Это НЕ крестовина и не
     * повод добавить фиктивные ↑/↓: прыжок запускает трамплин, а не кнопка.
     * Правило крестовины (правило 7 UI_LAYOUT_RULES) действует там, где
     * направлений действительно четыре.
     * ⚠️ Кнопки — ОТВЕТ, а не служебное: `bottom="answer"`. Рулением человек и
     * играет, смешивать с ним отмену и подсказки нельзя.
     */
    <View style={styles.руль}>
      {([[-1, 'chevron-back', 'влево'], [0, 'ellipse-outline', 'центр'], [1, 'chevron-forward', 'вправо']] as const).map(([x, знак, метка]) => (
        <Pressable
          key={метка}
          accessibilityRole="button"
          accessibilityLabel={метка}
          onPress={() => рулить(x)}
          style={[styles.кнопкаРуля, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Ionicons name={знак} size={24} color={colors.text} />
        </Pressable>
      ))}
    </View>
  ), [ключЦветов, рулить]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ── настройка: объясняем, во что человек входит ─────────────────────────── */
  if (фаза === 'config') {
    return (
      <GameShell title={t('numberRun')} onBack={() => goBackOrHome()}>
        <View style={styles.центр}>
          <Text style={[styles.заголовок, { color: colors.text }]}>{t('numberRun')}</Text>
          <Text style={[styles.правило, { color: colors.textSecondary }]}>{t('numberRunRule')}</Text>
          {/*
            Длительность названа ДО входа: 8:24 — это не короткая проба, и человек
            должен понимать, на что соглашается, а не обнаружить это на пятой минуте.
          */}
          <Text style={[styles.длительность, { color: colors.textSecondary }]}>
            {ЭТАПОВ} × {СЕКУНД_НА_ЭТАП} {t('secShort')} · {Math.floor(ЭТАПОВ * СЕКУНД_НА_ЭТАП / 60)}:{String(ЭТАПОВ * СЕКУНД_НА_ЭТАП % 60).padStart(2, '0')}
          </Text>
          <Pressable accessibilityRole="button" onPress={начать} style={styles.старт}>
            <LinearGradient colors={GRADIENT as unknown as [string, string]} style={styles.стартФон}>
              <Text style={styles.стартТекст}>{t('start')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </GameShell>
    );
  }

  /* ── итог: один на весь забег ────────────────────────────────────────────── */
  if (фаза === 'result' && итог) {
    return (
      <GameShell title={t('numberRun')} onBack={() => goBackOrHome()}>
        <View style={styles.центр}>
          <Text style={styles.итогЭмодзи}>{итог.победа ? '🏁' : '💫'}</Text>
          <Text style={[styles.заголовок, { color: colors.text }]}>
            {итог.победа ? t('numberRunDone') : t('retry')}
          </Text>
          {/*
            Показываем ТО, ЧТО ИГРА МЕРИТ, и ничего кроме: итоговое число, сколько
            этапов пройдено, столкновения, активное время. Медицинских норм для
            этого прототипа не выдумываем — прямой запрет инструкции.
          */}
          <View style={styles.строкиИтога}>
            {([
              [t('score'), String(итог.число)],
              [t('round'), `${итог.этаповПройдено}/${ЭТАПОВ}`],
              [t('errors'), String(итог.столкновений)],
              [t('time'), `${итог.активныхСекунд} ${t('secShort')}`],
            ] as const).map(([подпись, значение]) => (
              <View key={подпись} style={styles.строкаИтога}>
                <Text style={[styles.подписьИтога, { color: colors.textSecondary }]}>{подпись}</Text>
                <Text style={[styles.значениеИтога, { color: colors.text }]}>{значение}</Text>
              </View>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={начать} style={styles.старт}>
            <LinearGradient colors={GRADIENT as unknown as [string, string]} style={styles.стартФон}>
              <Text style={styles.стартТекст}>{t('restart')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </GameShell>
    );
  }

  /* ── забег ───────────────────────────────────────────────────────────────── */
  return (
    <GameShell
      title={t('numberRun')}
      onBack={() => goBackOrHome()}
      /**
       * ⚠️ ВОПРОС ПРИ ВЫХОДЕ — ЖИВОЕ ВЫРАЖЕНИЕ, А НЕ `true`. Спрашиваем, когда есть
       * что терять: забег идёт 8:24, и уйти с четвёртого этапа по случайному касанию
       * «назад» — потерять восемь минут. На нулевой секунде терять нечего, и лишний
       * вопрос там только раздражает.
       */
      confirmExit={показатели.секунд > 0}
      /**
       * Показатели ДАННЫМИ: каркас рисует их одинаково во всех играх. Обновляются
       * только при изменении значений — адаптер сравнивает и молчит, пока цифры те же.
       */
      hud={[
        { key: 'sum', icon: 'trending-up', label: t('score'), value: показатели.число, tone: 'accent' as const, pop: true },
        { key: 'stage', icon: 'flag', label: t('round'), value: `${показатели.этап}/${показатели.этапов}` },
        /**
         * ⚠️ КЛЮЧ `crashes`, А НЕ `hits`. `hits` уже занят n-back, где он значит
         * ПОПАДАНИЯ — то есть успех, и канон красит его в «хорошо». У забега это
         * СТОЛКНОВЕНИЯ, то есть беда. Один ключ с двумя смыслами покрасил бы
         * ошибку зелёным; гейт `hud-tone-canon` это и поймал.
         */
        { key: 'crashes', icon: 'close-circle', label: t('errors'), value: показатели.столкновений, tone: 'bad' as const },
      ]}
      bottom="answer"
      toolbar={нижниеКнопки}
    >
      {/*
        🔴 СТРОКА ЗАДАНИЯ ЖИВЁТ ВСЮ ПАРТИЮ, а не только на настройке. Человек входит
        в забег на восемь минут; к четвёртому этапу он уже не помнит, что красное
        вычитает. Гейт `game-task-line` держит её именно в партии.
        ⚠️ Одна строка, а не три: место над полем платится высотой поля (правило 9).
      */}
      <Text style={[styles.заданиеВПартии, { color: colors.textSecondary }]} numberOfLines={1}>
        {t('numberRunTask')}
      </Text>
      {Platform.OS === 'web' ? (
        <NumberRunGame
          ref={руль}
          зерно={зерно}
          пауза={пауза}
          onПоказатели={setПоказатели}
          onИтог={принятьИтог}
          фон={colors.background}
          цветТекста={colors.text}
        />
      ) : (
        /**
         * Приложение на телефоне — это WebView, и веб-ветка там и работает. Эта
         * заглушка на случай запуска в настоящем нативном окружении (например,
         * в пробах): лучше честная строка, чем пустой экран.
         */
        <View style={styles.центр}>
          <Text style={[styles.правило, { color: colors.textSecondary }]}>{t('numberRunWebOnly')}</Text>
        </View>
      )}
    </GameShell>
  );
}

/** Ключ темы для мемоизации: пересобираем кнопки при смене цветов, а не каждый кадр. */
function колорыКлюч(c: { card: string; border: string; text: string }) { return `${c.card}|${c.border}|${c.text}`; }

const styles = StyleSheet.create({
  заданиеВПартии: { fontSize: 13, textAlign: 'center', paddingHorizontal: 12, paddingBottom: 4 },
  центр: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 },
  заголовок: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  правило: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 420 },
  длительность: { fontSize: 13, fontWeight: '600' },
  старт: { marginTop: 8, borderRadius: 16, overflow: 'hidden' },
  стартФон: { paddingHorizontal: 34, height: 52, alignItems: 'center', justifyContent: 'center' },
  стартТекст: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  итогЭмодзи: { fontSize: 44 },
  строкиИтога: { alignSelf: 'stretch', maxWidth: 360, gap: 8, marginTop: 4 },
  строкаИтога: { flexDirection: 'row', justifyContent: 'space-between' },
  подписьИтога: { fontSize: 14 },
  значениеИтога: { fontSize: 16, fontWeight: '700' },
  /**
   * 🔴 ТРИ КНОПКИ В РЯД, И КАЖДАЯ НЕ МЕЛЬЧЕ ПАЛЬЦА ПО ОБЕИМ СТОРОНАМ (`ПАЛЕЦ` = 48).
   *
   * ⚠️ ЗДЕСЬ Я ПЕРЕПУТАЛ ОСЬ, И ГЕЙТ `tap-field` МЕНЯ ПОЙМАЛ. Стояло
   * `alignSelf: 'stretch'`, а нижний слот каркаса (`styles.toolbar` в GameShell)
   * — СТРОКА. В строке `stretch` тянет по ПОПЕРЕЧНОЙ оси, то есть по высоте;
   * ширину такой ребёнок берёт по содержимому. Внутренний `flex: 1` делил уже
   * скукоженную ширину, и кнопки выходили 26 px при пороге 48.
   *
   * 📍 Замер 12.09.2026, окно 390×844, собранный бандл: 26×48 ×3 на
   * `/games/number-run`. Ширину в строке даёт `flex`, а не `alignSelf`.
   * `minWidth` — страховка: даже в узком слоте кнопка не уедет ниже пальца.
   */
  руль: { flexDirection: 'row', gap: 10, flex: 1, justifyContent: 'center' },
  кнопкаРуля: { flex: 1, minWidth: 48, maxWidth: 120, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
