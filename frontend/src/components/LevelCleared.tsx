import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { sndWin } from '@/src/services/feedback';
import { tickLevelStreak, resetLevelStreak } from '@/src/services/eyeRestTracker';
import { saveLevelStars } from '@/src/services/levelStars';
import { getCleanRun, cleanRunBonus } from '@/src/services/cleanRun';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { IS_WEB_DEMO, demoDownloadUrl } from '@/src/services/buildTarget';
import { announce } from '@/src/services/a11y';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import { hasBoss, isBossLevel } from '@/src/constants/bosses';
import LevelInterlude from '@/src/components/LevelInterlude';

/**
 * LevelCleared — короткий баннер между уровнями для АВТО-ПОТОКА (по выбору Дениса):
 * прошёл уровень чисто → «Уровень N ✓ ⭐⭐⭐» (~2с) → следующий стартует САМ (onContinue).
 * Кнопки «Дальше сразу» (мгновенно) и «Остановиться» (выход) дают контроль.
 * Полноэкранный GameResult остаётся для НЕ-пройденных попыток (переиграть/выйти).
 *
 * ГЛАЗ-РАЗРЯДКА (формат C): каждые 10 уровней ПОДРЯД (eyeRestTracker) баннер
 * заменяется на 20-сек передышку для глаз — отдых от азарта, потом авто-старт следующего.
 */

const EYE_REST_SEC = 20;
/**
 * ДВЕ ФАЗЫ МЕЖДУ УРОВНЯМИ (заказ Дениса 19.08.2026: «мини-пауза вроде как
 * человеку, на пару секунд, и движение питомца на новый уровень визуально»).
 *
 *   1. КАРТОЧКА над доской — коротко, чтобы человек увидел, ЧТО он собрал.
 *      Накладной облик выбран Денисом же именно ради этого, и отнимать его
 *      нельзя: доска в момент победы — половина награды.
 *   2. ЗАСТАВКА — вертикальная картинка, звёзды и питомец, переходящий на
 *      следующий уровень. Здесь глаз меняет план после мелкой доски, а
 *      продвижение показывается наглядно.
 *
 * Раньше пауза была одна и пустая: 2.2 с на карточку и сразу следующий уровень.
 * Уровни от этого слипались в один длинный, а переход по тропинке человек видел
 * только на экране настроек — то есть не тогда, когда он происходит.
 */
const CARD_MS = 1200;
const INTERLUDE_MS = 2000;
const LEVELS_HINT_KEY = 'psygames_levels_hint_seen';   // глобальный флаг: подсказку «уровни по порядку» показать один раз на всё приложение

interface Props {
  level: number;            // текущий уровень (passed: N ✓ → N+1; !passed: N — ещё раз)
  stars?: number;           // 1–3 (только при passed)
  passed?: boolean;         // прошёл чисто? false → баннер «почти, ещё раз» + рестарт того же уровня
  gradient: string[];
  language: string;
  colors: any;
  autoMs?: number;          // авто-старт следующего (по умолчанию 2200мс)
  gameId?: string;          // для персиста звёзд по уровням (psygames_<gameId>_stars_<profileId>)
  comparisonLine?: string;  // свой итог · лучший среди игроков / личный рекорд при офлайне
  onContinue: () => void;   // запустить следующий уровень (passed) / тот же уровень заново (!passed)
  onStop: () => void;       // куда именно — говорит stopKind, см. ниже
  /**
   * КУДА ВЕДЁТ КНОПКА ОСТАНОВКИ. Подпись обязана совпадать с исходом.
   *
   * 🔴 ЧТО БЫЛО СЛОМАНО (аудит 19.08.2026). Кнопка называлась «Остановиться» у всех,
   * но `onStop` у 54 игр делал `setPhase('config')` — человек оставался в игре, на её
   * настройках, — а у 8 игр `goBackOrHome()`, то есть выкидывал из игры целиком. Одно
   * слово, два разных исхода: нажимая «Остановиться» в дыхании, человек рассчитывал
   * вернуться к настройкам, как везде, и терял экран.
   *
   * Развели СЛОВАМИ, а не поведением: менять навигацию восьми игр — это менять их
   * сценарий, а подпись обязана лишь не врать. Отсюда:
   *   'config' (по умолчанию) → «Остановиться»: остановили прогон, остались в игре;
   *   'exit'                  → «На главную»:   ушли с экрана игры.
   *
   * ⚠️ Ключ `goHome` уже существовал ровно с этим смыслом (его показывает GameResult
   * на той же развилке) — нового слова не заводили.
   */
  stopKind?: 'config' | 'exit';
  /**
   * Как показывать итог.
   *
   * 'overlay' — карточка ПОВЕРХ доски: доска остаётся видна, и человек смотрит на
   *   то, что собрал. Это целевой облик (решение Дениса: «объединить их идеи и
   *   делать карточку над всей доской»). Игра при этом продолжает рисовать поле и
   *   кладёт карточку в слот overlay каркаса GameShell.
   * 'screen' — прежний полноэкранный вид. Остаётся для игр, где доски в момент
   *   победы попросту нет (набрал число, вспомнил слово): затемнять там нечего.
   */
  variant?: 'overlay' | 'screen';
}

export default function LevelCleared({ level, stars = 3, passed = true, gradient, colors, autoMs = 2200, gameId, comparisonLine, onContinue, onStop, stopKind = 'config', variant = 'screen' }: Props) {
  const { t, language } = useLanguage();
  const levelWord = t('level');   // внутри эффекта `t` перекрыт локальным таймер-хендлом   // язык берём из контекста; проп language остался в Props для совместимости вызовов из игр
  const { profile } = useProfile();
  const firedRef = useRef(false);
  // вычисляем ОДНАЖДЫ при маунте: пора ли передышка для глаз (10-й уровень подряд).
  // Считаем «уровни подряд» только за ЧИСТЫЕ прохождения — провал серию обнуляет.
  // Web-demo: авто-потока нет → и глаз-разрядки нет.
  const restRef = useRef<boolean | null>(null);
  if (restRef.current === null) restRef.current = IS_WEB_DEMO ? false : passed ? tickLevelStreak() : (resetLevelStreak(), false);
  const isRest = restRef.current;
  const [restLeft, setRestLeft] = useState(EYE_REST_SEC);
  const [cleanRun, setCleanRun] = useState(0);   // серия чистых раундов (🔥), тикается в saveSession
  /**
   * ⚠️ РЕЖИМ ЧИТАЕМ ЗДЕСЬ, А НЕ В КАЖДОЙ ИГРЕ. Этот экран показывают 49 игр; если
   * бы каждая передавала признак пропсом, 49 мест могли бы забыть — и забывали бы,
   * как забыли маджонг и сортировку товаров.
   *
   * В зарядке следующий уровень НЕ запускается. Иначе получается гонка: игра стартует
   * следующий уровень через autoMs, а зарядка через свои 2000–3500 мс уводит экран —
   * человек видит начавшийся уровень 2 и вылет. Репорт Вали на v1.193.0.
   */
  const gameMode = useGameMode();
  const chainNext = shouldChainNextLevel(gameMode);
  const [showLevelsHint, setShowLevelsHint] = useState(false);
  /**
   * Заставка положена только там, где следующий уровень запускается САМ. В
   * зарядке и в свободной партии дальше распоряжается не игра — вклинить туда
   * двухсекундную картинку значит подрезать чужой сценарий.
   */
  const [phase, setPhase] = useState<'card' | 'interlude'>('card');   // одноразовая подпись «уровни по порядку» при первом чистом прохождении

  /**
   * ПЛОТНОСТЬ КАРТОЧКИ. Решение Дениса: между обычными уровнями карточка короткая —
   * звёзды, серия, «запускаю следующий»; сравнение с игроками и кнопки показываются
   * ТОЛЬКО на вехе-боссе. Тогда каждый третий уровень становится событием, а не
   * рутиной, и поток между обычными уровнями не рвётся ряда́ми кнопок.
   *
   * ⚠️ ПРОВАЛ — ВСЕГДА ПОЛНАЯ. На непройденном уровне авто-рестарта нет (v1.154):
   * человек сам жмёт «Ещё раз». Спрятать там кнопки значило бы запереть его на
   * экране без выхода — ровно тот тупик, который чинили в зарядке судоку.
   *
   * ⚠️ И БЕЗ АВТО-ПЕРЕХОДА — ТОЖЕ ПОЛНАЯ. Компактная карточка не имеет кнопок и
   * рассчитывает, что следующий уровень запустится сам. Там, где он не запускается
   * (свободная партия), это тупик: ни кнопок, ни продолжения. Поймано при первой же
   * проверке в браузере. В зарядке кнопок тоже нет, но там дальше распоряжается
   * зарядка — она уводит на следующее упражнение сама, и тупика не возникает.
   */
  const boss = passed && !!gameId && hasBoss(gameId) && isBossLevel(level);
  const compact = variant === 'overlay' && passed && !boss && (chainNext || gameMode === 'warmup');

  const go = () => { if (firedRef.current) return; firedRef.current = true; onContinue(); };
  const stop = () => { firedRef.current = true; resetLevelStreak(); onStop(); };

  useEffect(() => {
    if (passed) sndWin();
    // Баннер держится ~2 с и уходит сам — скринридер должен успеть сказать.
    announce(`${levelWord} ${level}${passed ? ' ✓' : ''}`);
    // Web-demo: демо-раунд — без авто-продолжения на следующий уровень и без
    // персиста (звёзды/хинт/серии). Показываем CTA-блок, игрок решает сам.
    if (IS_WEB_DEMO) return;
    if (passed && gameId && profile?.id) saveLevelStars(gameId, profile.id, level, stars);   // лучшие звёзды за уровень
    // Одноразовый хинт «уровни идут по порядку»: при ПЕРВОМ чистом прохождении любого уровня
    // показываем подпись и сразу ставим глобальный флаг (больше не покажем на всё приложение).
    if (passed) {
      AsyncStorage.getItem(LEVELS_HINT_KEY).then((seen) => {
        if (!seen) { setShowLevelsHint(true); AsyncStorage.setItem(LEVELS_HINT_KEY, '1'); }
      }).catch(() => {});
    }
    // Серия чистых: читаем с задержкой — тик идёт в saveSession, а игры ставят
    // setPhase('cleared') ДО await saveSession (module-кэш cleanRun сгладит гонку).
    let runTimer: ReturnType<typeof setTimeout> | null = null;
    if (passed && profile?.id && stars === 3) {
      const pid = profile.id;
      runTimer = setTimeout(async () => {
        try { const r = await getCleanRun(pid); if (r >= 2) setCleanRun(r); } catch {}
      }, 350);
    }
    if (isRest) {
      // передышка для глаз: interval только обновляет отображение, go() — отдельным
      // таймером (не внутри setState-updater → нет setState после unmount)
      const iv = setInterval(() => setRestLeft((s) => Math.max(0, s - 1)), 1000);
      const to = setTimeout(go, EYE_REST_SEC * 1000);
      return () => { clearInterval(iv); clearTimeout(to); if (runTimer) clearTimeout(runTimer); };
    }
    // v1.154: на ПРОВАЛЕ авто-рестарта НЕТ — игрок сам жмёт «Ещё раз», успев спокойно
    // разобрать результат (репорт из аудита + Валя: повтор стартовал раньше, чем
    // читаешь ошибки). Авто-поток остаётся только для ПРОЙДЕННЫХ уровней.
    if (!passed) return () => { if (runTimer) clearTimeout(runTimer); };
    // В зарядке и в свободной партии дальше распоряжается не игра: зарядка уводит
    // на следующий шаг сама, свободный режим показывает итог. Свой таймер здесь
    // только сталкивался бы с чужим.
    if (!chainNext) return () => { if (runTimer) clearTimeout(runTimer); };
    // Сначала карточка над доской, потом заставка с переходом питомца.
    const toInterlude = setTimeout(() => setPhase('interlude'), Math.min(autoMs, CARD_MS));
    const t = setTimeout(go, Math.min(autoMs, CARD_MS) + INTERLUDE_MS);
    return () => { clearTimeout(toInterlude); clearTimeout(t); if (runTimer) clearTimeout(runTimer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Корень. В накладном облике фон НЕ сплошной, а полупрозрачный: доска должна
   * читаться сквозь него — иначе смысл накладки теряется и это просто карточка
   * с лишним шагом. 0.45 подобрано так, чтобы белый текст на градиенте оставался
   * контрастным, а собранная доска — узнаваемой.
   */
  const rootStyle = variant === 'overlay'
    ? [styles.full, styles.overlayRoot]
    : [styles.full, { backgroundColor: colors.background }];
  // Накладная карточка у́же и ниже: она висит над полем, а не занимает экран.
  const cardStyle = variant === 'overlay' ? [styles.card, styles.cardOverlay] : [styles.card];

  // ─── передышка для глаз (каждый 10-й уровень подряд) ───
  if (isRest) {
    return (
      <View style={rootStyle}>
        <LinearGradient colors={['#43cea2', '#185a9d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <Ionicons name="eye-outline" size={56} color="#FFFFFF" />
          <Text style={styles.title}>{t('eyeBreakTitle')}</Text>
          <Text style={styles.restHint}>
            {t('eyeBreakHint')}
          </Text>
          <Text style={styles.restTimer}>{restLeft}</Text>
        </LinearGradient>
        <View style={styles.btns}>
          <TouchableOpacity
            accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
            onPress={go} activeOpacity={0.85}>
            <Ionicons name="play-skip-forward" size={20} color={colors.text} />
            <Text style={[styles.btnText, { color: colors.text }]} numberOfLines={1}>{t('skip')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── заставка между уровнями ───
  // Тап по ней пропускает ожидание: кто хочет играть быстро, не должен ждать
  // картинку каждый раз. Фон непрозрачный — сквозь пейзаж доска читалась бы кашей.
  if (phase === 'interlude') {
    return (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('skip')}
        activeOpacity={1} onPress={go}
        style={[styles.full, { backgroundColor: colors.background }]}>
        <LevelInterlude
          level={level}
          stars={stars}
          ms={INTERLUDE_MS}
          doneLine={t('levelDone').replace('{n}', String(level))}
          nextLine={t('levelStarting').replace('{n}', String(level + 1))}
          colors={colors}
        />
      </TouchableOpacity>
    );
  }

  // ─── обычный баннер уровня ───
  // passed=false → «почти, ещё раз»: тот же уровень авто-рестарт (onContinue читает
  // lvl.level, который при провале не рос). Убирает «обрыв» — поток не кидает в тупик.
  return (
    <View style={rootStyle}>
      <LinearGradient colors={gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={cardStyle}>
        <Text style={styles.emoji}>{passed ? '🎉' : '💪'}</Text>
        <Text style={styles.title}>
          {t(passed ? 'levelDone' : 'levelAlmost').replace('{n}', String(level))}
        </Text>
        {passed && (
          <View style={styles.stars}>
            {[1, 2, 3].map((i) => (
              <Ionicons key={i} name={i <= stars ? 'star' : 'star-outline'} size={36} color={i <= stars ? '#FFD93B' : 'rgba(255,255,255,0.5)'} />
            ))}
          </View>
        )}
        {passed && cleanRun >= 2 && (
          <View style={styles.runBadge}>
            <Text style={styles.runText}>
              {t('cleanRunBadge').replace('{n}', String(cleanRun))}
              {cleanRunBonus(cleanRun) > 0 ? ` · +${cleanRunBonus(cleanRun)} ⭐` : ''}
            </Text>
          </View>
        )}
        {comparisonLine && !compact && (
          <View style={styles.comparisonBadge}>
            <Ionicons name="people-outline" size={17} color="#FFFFFF" />
            <Text style={styles.comparisonText}>{comparisonLine}</Text>
          </View>
        )}
        {/* Web-demo: авто-старта следующего уровня нет — строку «Запускаю уровень N+1» не показываем */}
        {!IS_WEB_DEMO && (
          <Text style={styles.next}>
            {passed
              ? t('levelStarting').replace('{n}', String(level + 1))
              : t('sameLevelRetry')}
          </Text>
        )}
        {passed && showLevelsHint && (
          <Text style={styles.levelsHint}>
            {t('levelsInOrderHint')}
          </Text>
        )}
      </LinearGradient>
      {IS_WEB_DEMO ? (
        // Демо: тот же CTA-блок, что и в GameResult — большая «Скачать приложение
        // — все 60+ игр и уровни» + маленькие «Ещё раз» и «Стоп».
        <View style={styles.btns}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.btn, styles.demoCta, { backgroundColor: colors.primary }]}
            onPress={() => Linking.openURL(demoDownloadUrl(language)).catch(() => {})}
            activeOpacity={0.85}
          >
            <Ionicons name="download-outline" size={22} color="#FFFFFF" />
            <Text style={[styles.btnText, styles.demoCtaText]} numberOfLines={2}>{t('demoResultCta')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
            onPress={go} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color={colors.text} />
            <Text style={[styles.btnText, { color: colors.text }]} numberOfLines={1}>{t('retry')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
            onPress={stop} activeOpacity={0.85}>
            <Ionicons name="stop" size={18} color={colors.text} />
            <Text style={[styles.btnText, { color: colors.text }]} numberOfLines={1}>{t(stopKind === 'exit' ? 'goHome' : 'stop')}</Text>
          </TouchableOpacity>
        </View>
      ) : compact ? null : (
      <View style={styles.btns}>
        <TouchableOpacity
          accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.primary }]} onPress={go} activeOpacity={0.85}>
          <Ionicons name={passed ? 'play' : 'refresh'} size={20} color="#FFFFFF" />
          <Text style={styles.btnText} numberOfLines={1}>{passed ? t('nextNow') : t('retry')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          onPress={stop} activeOpacity={0.85}>
          <Ionicons name="stop" size={20} color={colors.text} />
          <Text style={[styles.btnText, { color: colors.text }]} numberOfLines={1}>{t(stopKind === 'exit' ? 'goHome' : 'stop')}</Text>
        </TouchableOpacity>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  // Накладной облик: затемняем доску, но не прячем — она и есть награда.
  overlayRoot: { backgroundColor: 'rgba(0,0,0,0.45)' },
  card: { width: '100%', borderRadius: 24, padding: 32, alignItems: 'center' },
  // Над доской карточка у́же и компактнее: на телефоне 32 точки полей с каждой
  // стороны съедали поле целиком, и накладка переставала быть накладкой.
  cardOverlay: { maxWidth: 340, padding: 22, borderRadius: 20 },
  emoji: { fontSize: 56 },
  title: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginTop: 12, marginBottom: 16, textAlign: 'center' },
  stars: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  runBadge: { backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, marginBottom: 12 },
  runText: { color: '#FFD93B', fontSize: 14, fontWeight: '800' },
  comparisonBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,0.20)', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14, marginBottom: 12 },
  comparisonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  next: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  levelsHint: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 10, lineHeight: 18 },   // одноразовая подпись про порядок уровней
  restHint: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginBottom: 12, lineHeight: 21 },
  restTimer: { fontSize: 52, fontWeight: '900', color: '#FFFFFF' },
  btns: { width: '100%', marginTop: 24 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, marginBottom: 8 },
  btnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', flexShrink: 1 },   // крупный шрифт: усечь, не выдавить за кнопку
  // Web-demo CTA — крупнее обычной кнопки, текст в 2 строки допустим
  demoCta: { paddingVertical: 18, gap: 8, paddingHorizontal: 14 },
  demoCtaText: { fontWeight: '800', textAlign: 'center' },
});
