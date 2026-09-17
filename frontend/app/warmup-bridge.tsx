import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { GAMES } from '@/src/constants/games';
import { stepToParams, очкиСоЗнаком, серияБезСчёта, результатШага } from '@/src/services/warmup';
import { имяШага } from '@/src/services/stepName';
import { useLanguage } from '@/src/contexts/LanguageContext';

const GRADIENT = ['#fbbf24', '#f59e0b'];
const AUTOSTART_SEC = 3;

export default function WarmupBridge() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const warmup = useWarmup();
  const [countdown, setCountdown] = useState(() => (warmup.meta?.slot === 'evening' ? 8 : 5));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The just-completed step is the previous one; current step is the next one.
  const meta = warmup.meta;
  const justCompletedIdx = warmup.currentIdx - 1;
  const justCompleted = meta && justCompletedIdx >= 0 ? meta.steps[justCompletedIdx] : null;
  const next = warmup.currentStep;
  // Результат именно этого шага: нет его — шаг пропущен, и карточка говорит «Пропущено».
  const justCompletedResult = justCompletedIdx >= 0 ? результатШага(warmup.results, justCompletedIdx) : undefined;
  const пропущен = !!justCompleted && !justCompletedResult;
  const completedGame = justCompleted ? GAMES.find((g) => g.id === justCompleted.game_id) : null;
  const nextGame = next ? GAMES.find((g) => g.id === next.game_id) : null;
  const isEvening = meta?.slot === 'evening';
  // «Не спится» — без очков: у шага только время (`серияБезСчёта`).
  const безСчёта = серияБезСчёта(meta);
  const accent = isEvening ? '#818cf8' : '#fbbf24';

  // ⚠️ Навигация НЕ внутри setState-updater: updater исполняется в фазе рендера, и
  // router.replace оттуда давал «Cannot update NavigationContainerInner while rendering
  // WarmupBridge» — под React 18 такая навигация может теряться/дублироваться по таймингу
  // (симптом: зарядка обрывается раньше времени). Отсчёт только меняет число; переход — в
  // отдельном эффекте по countdown===0, с firedRef-гардом от двойного replace.
  const navFiredRef = useRef(false);
  /**
   * 🔴 МОСТ ПОЯВЛЯЕТСЯ ПОД ПАЛЬЦЕМ — ВТОРОСТЕПЕННЫЕ КНОПКИ ВЗВОДЯТСЯ НЕ СРАЗУ.
   *
   * ПОВОД — отчёт a0b6d77f (задача 1436bcdd), 13.09.2026, 2.54.4 Android: «на второй игре
   * зарядка вылетела, скинулось всё». Хронология из самого отчёта: игра → мост → главная
   * В ОДНУ СЕКУНДУ, «Итог зарядки» не открывался, дальше зарядка началась с первой игры.
   * Мгновенный уход с моста домой бывает, только если зарядка уже остановлена.
   *
   * УСТРОЙСТВО, КОТОРОЕ ЭТО ДОПУСКАЕТ (замер на экспорт-сборке, 390×844): мост открывается
   * САМ через 2 с после сохранения партии (`WarmupContext`, слушатель сессий) — ровно тогда,
   * когда человек читает итог и тянется к кнопке. На мосту под этим пальцем стоят
   * «Пропустить» (y 662–704) и красная «Остановить» (y 662–704), и «Остановить» стирала всю
   * серию одним касанием, без вопроса.
   *
   * ⚠️ ПРИЧИНА ОТЧЁТА НЕ ДОКАЗАНА ЖИВЬЁМ — это защита от единственного найденного пути
   * «мост → главная в одну секунду», а не установленный виновник. Поэтому две меры сразу:
   * первые 800 мс мост не принимает «Пропустить» и «Остановить», а «Остановить» переспрашивает
   * со счётом сыгранного.
   */
  const [взведено, setВзведено] = useState(false);
  const [спрашиваемСтоп, setСпрашиваемСтоп] = useState(false);
  useEffect(() => {
    const таймер = setTimeout(() => setВзведено(true), 800);
    return () => clearTimeout(таймер);
  }, []);
  useEffect(() => {
    if (!warmup.active || !next) {
      router.replace('/' as any);
      return;
    }
    intervalRef.current = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 🔴 ПОКА ВИСИТ ВОПРОС О ПЕРЕБОРЕ — ОТСЧЁТ СТОИТ. Иначе он уйдёт на следующую
   * игру ПОД вопросом, и человек нажмёт «Закончить» уже в чужом экране.
   */
  useEffect(() => {
    if (!(warmup.overtime || спрашиваемСтоп) || !intervalRef.current) return;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, [warmup.overtime, спрашиваемСтоп]);

  useEffect(() => {
    if (warmup.overtime || спрашиваемСтоп || countdown !== 0 || navFiredRef.current || !next) return;
    navFiredRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    router.replace({ pathname: next.game_route, params: stepToParams(next, meta?.slot, meta?.track) } as any);
  }, [countdown]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNow = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (next) router.replace({ pathname: next.game_route, params: stepToParams(next, meta?.slot, meta?.track) } as any);
  };

  /**
   * З5 (29.08.2026): прежний skip читал warmup из ЗАМКНУТОГО рендера через
   * setTimeout(50) — состояние в нём отставало от skipCurrent(), и на границе
   * последнего шага рождалась вторая навигация поверх той, что делает сам
   * advanceToNext. Теперь мост только просит пропуск и помечает себя ожидающим;
   * навигацию делает эффект ниже — по СВЕЖЕМУ currentStep из контекста.
   */
  const skipWaitRef = useRef(false);
  const skip = () => {
    if (!взведено) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    skipWaitRef.current = true;
    warmup.skipCurrent();
  };
  useEffect(() => {
    if (!skipWaitRef.current) return;
    skipWaitRef.current = false;
    navFiredRef.current = true;   // отсчёт больше не должен стрелять своей навигацией
    if (warmup.currentStep) {
      router.replace({ pathname: warmup.currentStep.game_route, params: stepToParams(warmup.currentStep, meta?.slot, meta?.track) } as any);
    }
    // Шагов не осталось — advanceToNext уже увёл на /warmup-complete сам.
  }, [warmup.currentIdx]);   // eslint-disable-line react-hooks/exhaustive-deps

  const stop = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    await warmup.stopWarmup(false);
    router.replace('/' as any);
  };
  const спроситьСтоп = () => { if (взведено) setСпрашиваемСтоп(true); };

  if (!warmup.active || !next) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.hud}>
        <Text style={[styles.hudText, { color: accent }]}>
          {isEvening ? `🌙 ${t('complexEvening')}` : `⚡ ${t('complexWarmup')}`} · {warmup.currentIdx}/{meta?.steps.length}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(warmup.currentIdx / (meta?.steps.length || 1)) * 100}%`, backgroundColor: accent }]} />
        </View>
      </View>

      <View style={styles.content}>
        {/* Just-completed result */}
        {justCompleted && completedGame && (
          <View style={[styles.completedCard, { backgroundColor: colors.surface }]}>
            {/* v1.170 (репорт Вали «опять пропустил среднюю игру»): карточка сыгранной
                игры отличалась от карточки следующей только галочкой, а «ДАЛЬШЕ:» стояло
                лишь на второй. Она читала верхнюю как «сейчас будет визуальный поиск»,
                начиналось дыхание — вывод «пропустил, обман». На её скриншоте игра при
                этом честно сыграна: +300 за 21.8 с. Подписываем карточку явно и номером
                шага, чтобы прочитать её наоборот было невозможно. */}
            <Text style={[styles.doneLabel, { color: colors.textSecondary }]}>
              {пропущен ? t('skippedNamed') : t('bridgeJustPlayed')}{justCompletedIdx >= 0 && meta ? ` · ${justCompletedIdx + 1}/${meta.steps.length}` : ''}
            </Text>
            <Ionicons name={пропущен ? 'play-skip-forward-circle' : 'checkmark-circle'} size={48} color={пропущен ? colors.textSecondary : '#22c55e'} />
            <Text style={[styles.completedTitle, { color: colors.text }]}>
              {имяШага(justCompleted, t)}
            </Text>
            {justCompletedResult && (
              <View style={styles.statsLine}>
                {!безСчёта && <Text style={[styles.statBadge, { color: justCompletedResult.score < 0 ? '#f43f5e' : '#22c55e' }]}>{очкиСоЗнаком(justCompletedResult.score)}</Text>}
                <Text style={[styles.statBadge, { color: colors.textSecondary }]}>{justCompletedResult.time_seconds.toFixed(1)}{t('secShort')}</Text>
                {!безСчёта && justCompletedResult.errors > 0 && <Text style={[styles.statBadge, { color: '#f43f5e' }]}>✗{justCompletedResult.errors}</Text>}
              </View>
            )}
          </View>
        )}

        {/* Next game preview */}
        {next && nextGame && (
          <LinearGradient colors={nextGame.gradient as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.nextCard}>
            <Text style={styles.nextLabel}>{t('onbNext')}:</Text>
            <Ionicons name={nextGame.icon as any} size={56} color="#FFF" />
            <Text style={styles.nextTitle}>{имяШага(next, t)}</Text>
            <Text style={styles.nextSkill}>{t(nextGame.skillKey)}</Text>
          </LinearGradient>
        )}

        {/*
          🔴 ВРЕМЯ ВЫШЛО, А ПОДХОДЫ ОСТАЛИСЬ — СПРАШИВАЕМ ОДИН РАЗ ЗА КОМПЛЕКС.

          📍 РЕШЕНИЕ ДЕНИСА 09.09.2026: «мы не можем контролировать у каждого
          скорость ответов, нам главное чтобы по шагам». Длина зарядки задана
          подходами, минуты на кнопке — оценка по медиане живых партий. У того,
          кто отвечает медленнее, десять минут кончаются на седьмом подходе из
          двенадцати. Обрывать нельзя — он не доиграл обещанное; молчать тоже —
          он планировал десять минут, а идёт двадцать.

          ⚠️ Ни слова упрёка: «время вышло», а не «вы затянули». И кнопка
          «доиграть» стоит ПЕРВОЙ и залитой — безопасный ответ по умолчанию тот,
          что продолжает начатое.
        */}
        {warmup.overtime ? (
          <Text style={[styles.countdown, { color: accent }]}>
            {t('warmupOvertime')
              .replace('{m}', String(meta?.duration_min ?? 0))
              .replace('{n}', String(warmup.stepsLeft))}
          </Text>
        ) : (
          <Text style={[styles.countdown, { color: accent }]}>
            {t('startingInN').replace('{n}', String(countdown))}
          </Text>
        )}

        {спрашиваемСтоп ? (
          <View style={styles.actions} testID="warmup-stop-ask">
            <Text style={[styles.countdown, { color: colors.text, textAlign: 'center' }]}>
              {t('warmupStopAsk')
                .replace('{n}', String(Math.max(0, warmup.currentIdx)))
                .replace('{m}', String(meta?.steps.length ?? 0))}
            </Text>
            {/* Безопасный ответ первым и залитым — как в вопросе о выходе из игры. */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('warmupStopKeep')}
              testID="warmup-stop-keep"
              style={styles.actionPrimary}
              onPress={() => { setСпрашиваемСтоп(false); startNow(); }}>
              <LinearGradient colors={GRADIENT as [string, string]} style={styles.actionPrimaryGrad}>
                <Text style={styles.actionPrimaryText}>{t('warmupStopKeep')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('stopComplex')}
              testID="warmup-stop-confirm"
              style={[styles.actionSecondary, { borderColor: '#f43f5e' }]} onPress={stop}>
              <Ionicons name="stop" size={18} color="#f43f5e" />
              <Text numberOfLines={1} style={[styles.actionSecondaryText, { color: '#f43f5e', flexShrink: 1 }]}>
                {t('stopComplex')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={warmup.overtime ? t('exitConfirmStay') : t('ctaStartNow')}
            style={styles.actionPrimary}
            onPress={() => { if (warmup.overtime) warmup.dismissOvertime(); startNow(); }}>
            <LinearGradient colors={GRADIENT as [string, string]} style={styles.actionPrimaryGrad}>
              <Text style={styles.actionPrimaryText}>{warmup.overtime ? t('exitConfirmStay') : t('ctaStartNow')}</Text>
            </LinearGradient>
          </TouchableOpacity>
          {/*
            🔴 РЯД НЕ ШИРЕ ЭКРАНА: «ПРОПУСТИТЬ: <ИМЯ>» СЖИМАЕТСЯ, «ОСТАНОВИТЬ» — НЕТ.
            📍 17.09.2026, экспорт, WebKit 390×844, «Не спится»: «Пропустить: Пары слов: память» и
            «Остановить» вылезали за оба края экрана — ряд стоял по центру шириной по содержимому,
            и `flexShrink` у подписи не работал: сжиматься было не во что. Ряд — на всю ширину
            блока, кнопка пропуска сжимается и переносит подпись на вторую строку (имя игры
            остаётся видно — ради него подпись и заводили), кнопка остановки держит ширину.
          */}
          <View style={styles.actionsRow} testID="warmup-bridge-actions-row">
            {/* v1.166 (репорт Вали «что значит 1 игра была пропущена, ни 1 игры не было
                пропущено»): кнопка называлась SKIP — латиницей, без перевода, и стояла
                под отсчётом «начинаем через N». Читалась как «пропустить ожидание», а
                пропускала игру целиком. Теперь в подписи стоит ИМЯ игры, которая уйдёт,
                и обе кнопки переведены. */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={next ? `${t('skipGameNamed')} ${имяШага(next, t)}` : t('skipStep')}
              style={[styles.actionSecondary, { borderColor: colors.border, flexShrink: 1 }]} onPress={skip}>
              <Ionicons name="play-skip-forward" size={18} color={colors.text} />
              <Text numberOfLines={2} style={[styles.actionSecondaryText, { color: colors.text, flexShrink: 1 }]}>
                {next ? `${t('skipGameNamed')} ${имяШага(next, t)}` : t('skipStep')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={t('stopComplex')}
              testID="warmup-stop"
              style={[styles.actionSecondary, { borderColor: '#f43f5e', flexShrink: 0 }]} onPress={спроситьСтоп}>
              <Ionicons name="stop" size={18} color="#f43f5e" />
              <Text numberOfLines={1} style={[styles.actionSecondaryText, { color: '#f43f5e', flexShrink: 1 }]}>
                {t('stopComplex')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hud: { padding: 12, gap: 8 },
  hudText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  progressBar: { height: 4, backgroundColor: '#1c1c40', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fbbf24' },
  content: { flex: 1, padding: 20, justifyContent: 'center', gap: 18, alignItems: 'center', maxWidth: 520, alignSelf: 'center', width: '100%' },
  doneLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  completedCard: { padding: 16, borderRadius: 14, alignItems: 'center', gap: 8, width: '100%' },
  completedTitle: { fontSize: 18, fontWeight: '700' },
  statsLine: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statBadge: { fontSize: 14, fontWeight: '700' },
  nextCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8, width: '100%' },
  nextLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  nextTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  nextSkill: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  countdown: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  actions: { gap: 12, width: '100%', alignItems: 'center' },
  actionPrimary: { borderRadius: 12, overflow: 'hidden', width: '100%', maxWidth: 320 },
  actionPrimaryGrad: { paddingVertical: 16, alignItems: 'center' },
  actionPrimaryText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  actionsRow: { flexDirection: 'row', gap: 12, width: '100%', justifyContent: 'center' },
  actionSecondary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1 },
  actionSecondaryText: { fontSize: 14, fontWeight: '700' },
});
