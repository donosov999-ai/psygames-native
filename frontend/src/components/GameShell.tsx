/**
 * GameShell — единый каркас игрового экрана (v1.128.0).
 *
 * ЗАЧЕМ. У 62 игр не было общего каркаса: header копировался в 52 файлах,
 * playArea — в 48, и при формально одинаковом `justifyContent:'center'` поле
 * у всех оказывалось в разном месте. Отсюда волна репортов: «почему кнопки
 * не внизу», «поле не по центру», «тулбар то есть, то нет». Эталоном
 * тестировщики назвали math-sprint («тулбар плавающий внизу — надо так везде»).
 *
 * РЕШЕНИЯ ПО API (зафиксированы, чтобы миграция не переделывалась):
 *  1. Тулбар — ПРИБИТЫЙ нижний футер с разделителем, а не «кнопки в конце
 *     центрированной колонки». Так место постоянно и не зависит от высоты поля.
 *
 *     ⚠️ И у этого постоянного места должен быть ПОСТОЯННЫЙ СМЫСЛ, чего сперва
 *     не было: полоса называлась «тулбар действий», и туда клали и ответ игрока,
 *     и служебное. Теперь низ — ТОЛЬКО ответ, служебное — только в шапке
 *     (`headerActions`); граница и доводы разобраны в комментарии к обоим
 *     слотам ниже, кнопка служебного действия одна на всё приложение —
 *     `components/GameAuxAction`.
 *  2. Скроллящееся поле — ПРОП `scrollableField`, а не второй компонент:
 *     10 игр (mnemonics, counter, cloze, lexical-decision, proofreading,
 *     semantic-sort, schulte, targets, vocab-srs, word-pairs) держат длинный
 *     контент, остальным хватает центрирования.
 *  3. Правый слот шапки (`headerRight`) — под кнопку самой игры.
 *
 *     ⚠️ ЗДЕСЬ БЫЛО НАПИСАНО «под справку „?“» — и это оказалось неправдой.
 *     Справка так и осталась ПЛАВАЮЩЕЙ кнопкой GameHelpOverlay, смонтированной
 *     глобально в _layout поверх экрана (zIndex 100) ровно в этом углу. Слот
 *     переехать ей не помог, а комментарий продолжал обещать обратное — и
 *     следующий, кто в слот что-то положил (Шульте, «новая таблица»), получил
 *     кнопку ПОД справкой. Замер 19.08.2026 на 390×844: справка занимает
 *     x 330…380, кнопка таблицы x 326…374, перекрытие 92 % площади, а
 *     elementFromPoint по центру кнопки возвращает справку — то есть нажать
 *     кнопку игры было нельзя вообще, тап открывал справку.
 *
 *     Поэтому слот теперь ОТСТУПАЕТ от края на ширину справки (HELP_FAB_GUTTER)
 *     — но только когда в нём что-то есть: у 63 игр он пуст, и лишний отступ
 *     сдвинул бы им центрированный заголовок без всякой причины.
 *
 * Футер оставляет отступ слева (FAB_GUTTER) под плавающую кнопку фидбека —
 * она смонтирована глобально в _layout и иначе перекрывает крайнюю кнопку.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, DeviceEventEmitter } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { onGameHold, isGameHeld, holdGame } from '@/src/services/gamePause';
import { announce } from '@/src/services/a11y';
import { useExitGuard } from '@/src/hooks/useExitGuard';

/** Ширина зоны, которую занимает плавающая кнопка фидбека снизу (LTR — слева, RTL — справа). */
const FAB_GUTTER = 66;

/**
 * Ширина зоны, которую занимает плавающая справка «?» сверху: 50 — сама кнопка
 * (styles.fabWrap в GameHelpOverlay), 10 — её отступ от края экрана. Сторона
 * зеркалится вместе с ней: LTR — справа, RTL — слева.
 */
const HELP_FAB_GUTTER = 60;

export interface GameShellProps {
  /** Заголовок игры (уже переведённый). */
  title: string;
  /** Кнопка «назад». */
  onBack: () => void;
  /** Строка счётчиков под шапкой (раунд/время/ошибки). Опционально. */
  stats?: React.ReactNode;
  /**
   * 🔴 СЛУЖЕБНЫЕ действия — ВСЕГДА здесь, под счётчиками. Кладут `GameAuxBar`
   * с кнопками `GameAuxAction`: подсказка, отмена хода, перетасовка, повтор
   * задания, «СТОП».
   *
   * ⚠️ ЗДЕСЬ БЫЛО НАПИСАНО ДРУГОЕ, И ИМЕННО ЭТО РАЗЪЕХАЛОСЬ. Правило звучало
   * «наверх уносят игры со СВОЕЙ клавиатурой (судоку), остальным низ свободен —
   * пусть кладут в toolbar». Это описывало не смысл, а обстоятельство: «наверх,
   * если внизу не помещается». Обстоятельство и породило беду — замер аудита по
   * 43 играм с нижней полосой: примерно в 17 там ОТВЕТ игрока (← → во фланкере,
   * Познере, ANT, Саймоне; «Слово/Не слово»; «Накачать/Забрать»), а примерно в
   * 8 — СЛУЖЕБНОЕ («Отменить» в ханое и башне Лондона, «Перемешать» в маджонге
   * и сортировке, «СТОП» в дыхании, CPT, PRL, глаз-разрядке). Человек учится во
   * «Фланкере», что нижняя полоса — это его ответ, и в маджонге бьёт туда же —
   * а там «Перемешать», которого на уровень всего три.
   *
   * НОВОЕ ПРАВИЛО — ПО СМЫСЛУ, А НЕ ПО СВОБОДНОМУ МЕСТУ:
   *
   *   низ (`toolbar`)         = ОТВЕТ игрока на текущее задание, и ничего кроме;
   *   шапка (`headerActions`) = всё, что трогает ИГРУ помимо ответа.
   *
   * Служебное едет наверх ВСЕГДА — не только когда низ занят ответом. Правило
   * «не смешивать на одном экране» починило бы два экрана из сорока трёх и
   * оставило бы главное: полоса всё равно значила бы в разных играх разное, и
   * рефлекс, натренированный одной игрой, в другой тратил бы ресурс.
   *
   * ⚠️ ДОВОД ПРОТИВ ВЗВЕШЕН, А НЕ ОТБРОШЕН. Низ ближе к большому пальцу, и
   * унося «Отменить» наверх, мы делаем действие дальше. Но близость к пальцу —
   * преимущество для действия, которое хочешь совершить, и ЛОВУШКА для того,
   * которое не хочешь. Ни одно перенесённое действие не частое: перетасовка —
   * 3 за уровень, подсказка — по счётчику, отмена — на ошибках, «СТОП» — один
   * раз за сеанс. Зато каждое тратит ресурс или обрывает партию. Острее всего
   * это в CPT: человек полторы минуты лупит по окну стимула на скорость, а
   * нижняя полоса под ним заканчивает сеанс. Дешёвый доступ к дорогому
   * действию — не удобство.
   *
   * Побочно перенос отдаёт полю место: в маджонге две служебные пилюли не
   * влезали в ряд (`flexWrap` + отступ под кнопку фидбека) и занимали ДВЕ
   * строки нижней полосы — 180 px, отобранных у доски.
   */
  headerActions?: React.ReactNode;
  /**
   * 🔴 ОТВЕТ игрока — прибит к низу экрана. Опционально: у игр, где отвечают
   * прямо на поле (маджонг, ханой, сортировка), нижней полосы нет вовсе.
   *
   * Ответом считается всё, чем игрок формирует, правит и сдаёт ответ на текущее
   * задание: кнопки выбора, своя клавиатура, «Проверить», а также правка
   * ЧЕРНОВИКА ответа («Сброс», «стереть последнюю букву») — она не трогает
   * игру, только то, что ещё не сдано, и потому живёт рядом со сдачей.
   *
   * ⚠️ Служебному действию здесь не место — см. `headerActions`. Реестр
   * «в этой игре низ = ответ / низ пуст» с обоснованием каждой строки:
   * `src/__tests__/slot-meaning.test.ts`; живая проверка того, что кнопка не
   * только написана, но и нарисована в шапке — `scripts/slot-audit.mjs`.
   */
  toolbar?: React.ReactNode;
  /** Слот справа в шапке (обычно «?»-справка). */
  headerRight?: React.ReactNode;
  /** true — игровое поле в ScrollView (длинный контент: списки слов и т.п.). */
  scrollableField?: boolean;
  /**
   * Накладка поверх поля — экран «уровень пройден».
   *
   * ЗАЧЕМ СЛОТ, А НЕ ЗАМЕНА ЭКРАНА. Раньше игра при `phase === 'cleared'` возвращала
   * карточку ВМЕСТО доски, и в момент победы доска пропадала. Денис: «карточка и
   * плашка — надо объединить их идеи и делать карточку над всей доской, чтобы было
   * оттуда и оттуда полезное». Разобранный маджонг, разложенные товары, сошедшиеся
   * пары — это и есть награда, ради неё играли; полноэкранная карточка её отбирала.
   *
   * Игра теперь продолжает рисовать доску, а итог кладёт сюда — правка в игре
   * умещается в одну строку.
   */
  overlay?: React.ReactNode;
  /**
   * ЕСТЬ ЧТО ТЕРЯТЬ: партия идёт и в ней уже что-то сделано → «назад» спросит,
   * а не выбросит молча.
   *
   * ⚠️ Флаг задаёт САМА игра, и это принципиально. Каркас не знает, начата ли
   * партия и сделан ли в ней хоть один ход, а вопрос «вы уверены?» там, где
   * терять нечего (экран настройки, первый кадр, доигранная партия), раздражает
   * сильнее, чем помогает. Молчаливых «на всякий случай» здесь быть не должно.
   */
  confirmExit?: boolean;
  /**
   * Партия переживёт выход (игра положила её в `services/resume`) — меняет текст
   * вопроса с «пропадёт» на «сохранится». Врать тут нельзя: обещание продолжить
   * без слоя сохранения хуже, чем честное «потеряется».
   */
  resumable?: boolean;
  /**
   * Дописать незаконченную партию. Зовётся ПЕРЕД вопросом, перед уходом и при
   * сносе экрана — то есть и тогда, когда «назад» никто не нажимал (переход
   * зарядки, убийство приложения системой).
   */
  onSaveBeforeExit?: () => void;
  /** Само игровое поле. */
  children: React.ReactNode;
}

export default function GameShell({
  title, onBack, stats, headerActions, toolbar, headerRight, scrollableField, overlay,
  confirmExit, resumable, onSaveBeforeExit, children,
}: GameShellProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // RTL: стрелка «назад» смотрит вправо, отступ под кнопку фидбека зеркалится
  const { language, t } = useLanguage();
  const rtl = isRTLLang(language);
  const fieldScrollRef = React.useRef<ScrollView>(null);
  // v1.160: пока открыт отзыв — игра на паузе (репорт Вали «писала отзыв, пауза
  // не наступила, и теперь не понимаю, что за игра»). Оверлей ловит тапы, чтобы
  // не проиграть вслепую, и возвращает контекст после закрытия окна.
  const [paused, setPaused] = React.useState(isGameHeld());
  React.useEffect(() => onGameHold((v) => {
    setPaused(v);
    if (v) announce(t('gamePaused'));
  }), []);

  // Выход из живой партии. Одно место на 61 экран: и кнопка в шапке, и аппаратная
  // «назад» идут сюда, поэтому мимо проверки из игры не выйдешь.
  const exitGuard = useExitGuard({
    armed: !!confirmExit,
    onExit: onBack,
    onSave: onSaveBeforeExit,
  });
  // Скринридер обязан узнать про вопрос: он перехватывает «назад», и молчание
  // здесь читается как «кнопка не сработала».
  React.useEffect(() => {
    if (exitGuard.asking) announce(t('exitConfirmTitle'));
  }, [exitGuard.asking]);   // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 🔴 ПОКА ВИСИТ ВОПРОС — ИГРА СТОИТ. Без этого «вы уверены?» стоит денег: в SET
   * с 11-го уровня на расклад даётся 10 секунд, и человек, читающий вопрос,
   * терял расклад и получал ✗ за то, что задумался над кнопкой «назад». Поймано
   * живьём заходом по SET 19.08.2026: пока читал вопрос, расклад сгорел.
   *
   * ⚠️ Тот же механизм, что у окна отзыва (`holdGame`), а не свой: счётчик пауз
   * общий, поэтому вопрос поверх открытого отзыва не снимет чужую паузу.
   */
  React.useEffect(() => {
    if (!exitGuard.asking) return;
    return holdGame();
  }, [exitGuard.asking]);

  // Android-сборка — WebView (Platform.OS === 'web'). Клавиатура уменьшает
  // visual viewport, но браузер не всегда докручивает вложенный RN ScrollView
  // к активному полю. В итоге input остаётся ниже видимой части, хотя viewport
  // meta уже содержит interactive-widget=resizes-content. Два шага нужны для
  // начала и конца анимации клавиатуры; обычные экраны без активного ввода не
  // двигаются вообще.
  React.useEffect(() => {
    if (!scrollableField || Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const revealFocusedField = () => {
      const active = document.activeElement as HTMLElement | null;
      const isTextEntry = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;
      if (!isTextEntry) return;
      for (const delay of [60, 320]) {
        const tm = setTimeout(() => {
          fieldScrollRef.current?.scrollToEnd({ animated: true });
          timers.delete(tm);
        }, delay);
        timers.add(tm);
      }
    };
    window.addEventListener('resize', revealFocusedField);
    window.visualViewport?.addEventListener('resize', revealFocusedField);
    return () => {
      window.removeEventListener('resize', revealFocusedField);
      window.visualViewport?.removeEventListener('resize', revealFocusedField);
      timers.forEach(clearTimeout);
    };
  }, [scrollableField]);

  /**
   * 🔴 НИЖНЮЮ БЕЗОПАСНУЮ ЗОНУ ОПЛАЧИВАЕТ РОВНО ОДИН СЛОЙ.
   *
   * Было два: корневой SafeAreaView шёл БЕЗ `edges` (значит, все четыре края,
   * в том числе нижний), а тулбар ДОПОЛНИТЕЛЬНО клал себе
   * `paddingBottom: Math.max(insets.bottom, 10)`. Отступ считался дважды.
   *
   * ЗАМЕР 19.08.2026 (playwright, 390×844, insets.bottom = 34 подсунуты в
   * скрытый env(safe-area-*)-элемент react-native-safe-area-context):
   *   корень paddingBottom 34 + тулбар paddingBottom 34 → под кнопками 68 px
   *   пустоты, тулбар кончался на y=810 при высоте окна 844.
   * После правки тот же замер даёт 34 — ровно домашнюю полосу.
   *
   * ⚠️ ПОЧЕМУ ЭТОГО НЕ ВИДЕЛИ. Android-сборка у нас Tauri, то есть WebView, и
   * `env(safe-area-inset-bottom)` там 0 — двойной ноль остаётся нулём. Баг живёт
   * только на iPhone с домашней полосой, куда тестировщики не ходили.
   *
   * Нижний край снимаем с корня и оставляем ТОМУ, кто стоит внизу: есть тулбар —
   * платит тулбар; тулбара нет — платит поле, иначе последняя строка залезет под
   * домашнюю полосу.
   */
  const bottomSafe = insets.bottom;

  const field = scrollableField ? (
    <ScrollView
      ref={fieldScrollRef}
      style={styles.fieldScroll}
      contentContainerStyle={[styles.fieldScrollContent, toolbar ? null : { paddingBottom: 8 + bottomSafe }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.field, toolbar ? null : { paddingBottom: bottomSafe }]}>{children}</View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Шапка: назад — заголовок — правый слот. Заголовок ужимается, кнопки нет. */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={exitGuard.requestExit}
          style={[styles.headerBtn, { backgroundColor: colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel={t('a11yBack')}
        >
          <Ionicons name={rtl ? 'arrow-forward' : 'arrow-back'} size={22} color={colors.text} />
        </TouchableOpacity>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {/* Правый слот фиксированной ширины — держит заголовок по центру.
            Отступ под плавающую справку кладём ТОЛЬКО когда в слоте что-то есть:
            пустому слоту разъезжаться незачем, а заголовок центрируется по нему. */}
        <View
          style={[
            styles.headerRight,
            headerRight ? (rtl ? { marginLeft: HELP_FAB_GUTTER } : { marginRight: HELP_FAB_GUTTER }) : null,
          ]}
        >
          {headerRight}
        </View>
      </View>

      {stats ? <View style={styles.stats}>{stats}</View> : null}

      {/* testID — якорь для живого аудита слотов (`scripts/slot-audit.mjs`):
          он ходит по собранному приложению и смотрит, в КАКОЙ из двух зон
          реально нарисована служебная кнопка. Проверка «написано ли» в
          исходнике такое не ловит: в SET бейдж был написан, переведён на 12
          языков, покрыт гейтом — и не показывался ни разу. */}
      {headerActions ? (
        <View testID="game-header-actions" style={[styles.headerActions, { borderBottomColor: colors.border }]}>{headerActions}</View>
      ) : null}

      {field}

      {toolbar ? (
        <View
          testID="game-toolbar"
          style={[
            styles.toolbar,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, 10),
              // не залезать под кнопку фидбека (в RTL она у правого края)
              ...(rtl
                ? { paddingRight: FAB_GUTTER, paddingLeft: 16 }
                : { paddingLeft: FAB_GUTTER, paddingRight: 16 }),
            },
          ]}
        >
          {toolbar}
        </View>
      ) : null}

      {/* Итог уровня — поверх доски, но ПОД паузой: если человек открыл отзыв,
          пауза должна перекрывать всё, включая карточку. */}
      {overlay ? <View style={styles.overlay}>{overlay}</View> : null}

      {/* Вопрос о выходе — выше карточки итога (иначе она перекроет кнопки), но
          ниже паузы: если человек ушёл писать отзыв, пауза перекрывает всё. */}
      {exitGuard.asking && (
        <View style={styles.exitOverlay} pointerEvents="auto">
          <View style={[styles.exitCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text accessibilityRole="header" testID="exit-confirm-title" style={[styles.exitTitle, { color: colors.text }]}>
              {t('exitConfirmTitle')}
            </Text>
            <Text testID="exit-confirm-body" style={[styles.exitBody, { color: colors.textSecondary }]}>
              {t(resumable ? 'exitConfirmSaved' : 'exitConfirmLost')}
            </Text>
            {/* «Продолжить игру» — первой и залитой: безопасный ответ должен быть
                и ближе к пальцу, и заметнее, раз сюда попадают промахом. */}
            <View style={styles.exitButtons}>
              <TouchableOpacity
                testID="exit-confirm-stay"
                accessibilityRole="button"
                onPress={exitGuard.stay}
                style={[styles.exitBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.exitBtnText, { color: '#fff' }]}>{t('exitConfirmStay')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="exit-confirm-leave"
                accessibilityRole="button"
                onPress={exitGuard.confirmExit}
                style={[styles.exitBtn, styles.exitBtnGhost, { borderColor: colors.border }]}
              >
                <Text style={[styles.exitBtnText, { color: colors.text }]}>{t('exitConfirmLeave')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/*
        ⚠️ ПЛАШКА ПАУЗЫ НЕ ПОКАЗЫВАЕТСЯ ПОВЕРХ ВОПРОСА О ВЫХОДЕ. Игра на паузе и
        во время вопроса — так и задумано, часы стоят. Но плашка лежит выше
        (zIndex 90 против 85) и ловит нажатия: на «остаться» и «выйти» нельзя
        было нажать вовсе, экран запирался до перезагрузки. Регрессия жила
        полчаса и накрывала все девять игр с вопросом при выходе.

        Пауза здесь и не нужна: вопрос сам и есть накладка, и он объясняет, что
        происходит, лучше, чем «Пауза — пишется отзыв».
      */}
      {paused && !exitGuard.asking && (
        <View style={styles.pauseOverlay} pointerEvents="auto">
          <View style={[styles.pauseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="pause-circle" size={44} color={colors.primary} />
            <Text style={[styles.pauseText, { color: colors.text }]}>{t('gamePaused')}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Слой итога. Своего фона нет: затемнение рисует сама карточка — так она решает,
  // насколько глушить доску, а каркас не навязывает.
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 80 },
  /**
   * Вопрос о выходе — САМАЯ ВЕРХНЯЯ накладка каркаса (итог 80, пауза 90).
   *
   * ⚠️ Был 85, ниже паузы, и это заперло экран: пауза ложится во весь экран с
   * `pointerEvents="auto"`, поэтому нажатия по «остаться» и «выйти» доставались
   * ей. Ответить на вопрос было нельзя вообще. Одного «не показывать паузу
   * поверх вопроса» мало: любая следующая накладка повторит ту же беду молча,
   * поэтому вопрос теперь выше всех по порядку, а не по стечению обстоятельств.
   */
  exitOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 95, paddingHorizontal: 24 },
  exitCard: { width: '100%', maxWidth: 380, paddingVertical: 22, paddingHorizontal: 22, borderRadius: 18, borderWidth: 1, gap: 10 },
  exitTitle: { fontSize: 19, fontWeight: '800' },
  exitBody: { fontSize: 14, lineHeight: 20 },
  // Кнопки в колонку: два длинных перевода (немецкий, французский) в строку не
  // влезают, а ужатая до многоточия кнопка выхода — худшее, что тут может быть.
  exitButtons: { gap: 10, marginTop: 6 },
  exitBtn: { minHeight: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  exitBtnGhost: { borderWidth: 1 },
  exitBtnText: { fontSize: 16, fontWeight: '700' },
  pauseOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', zIndex: 90 },
  pauseCard: { paddingVertical: 22, paddingHorizontal: 30, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 8 },
  pauseText: { fontSize: 16, fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  // flexShrink+minWidth: при системном крупном шрифте длинный заголовок
  // ужимается, а не выталкивает кнопку «назад» за край (репорт «кнопка уехала»).
  title: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  headerBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  headerRight: { width: 44, alignItems: 'flex-end', flexShrink: 0 },
  stats: { paddingHorizontal: 16, paddingBottom: 6 },
  // Разделитель снизу отделяет действия от игрового поля: без него ряд кнопок
  // читается как часть поля, и в судоку его принимали за первую строку доски.
  headerActions: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  // Поле забирает всё свободное место и центрирует содержимое — единое
  // поведение для всех игр вместо разнобоя.
  field: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  fieldScroll: { flex: 1 },
  fieldScrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    // горизонтальные отступы задаются в рендере (FAB_GUTTER зеркалится в RTL)
    ...(Platform.OS === 'web' ? { cursor: 'default' as any } : null),
  },
});
