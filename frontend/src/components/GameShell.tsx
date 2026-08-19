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
 *  1. Тулбар действий — ПРИБИТЫЙ нижний футер с разделителем, а не «кнопки
 *     в конце центрированной колонки». Так место действий постоянно и не
 *     зависит от высоты поля.
 *  2. Скроллящееся поле — ПРОП `scrollableField`, а не второй компонент:
 *     10 игр (mnemonics, counter, cloze, lexical-decision, proofreading,
 *     semantic-sort, schulte, targets, vocab-srs, word-pairs) держат длинный
 *     контент, остальным хватает центрирования.
 *  3. Правый слот шапки (`headerRight`) — под справку «?», чтобы плавающая
 *     кнопка не висела над игровым полем.
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
import { onGameHold, isGameHeld } from '@/src/services/gamePause';
import { announce } from '@/src/services/a11y';
import { useExitGuard } from '@/src/hooks/useExitGuard';

/** Ширина зоны, которую занимает плавающая кнопка фидбека снизу (LTR — слева, RTL — справа). */
const FAB_GUTTER = 66;

export interface GameShellProps {
  /** Заголовок игры (уже переведённый). */
  title: string;
  /** Кнопка «назад». */
  onBack: () => void;
  /** Строка счётчиков под шапкой (раунд/время/ошибки). Опционально. */
  stats?: React.ReactNode;
  /**
   * Вспомогательные действия ВВЕРХУ, под счётчиками: подсказка, отмена, цвет.
   *
   * ЗАЧЕМ ОТДЕЛЬНО ОТ toolbar. Низ — место ОСНОВНОГО ввода, и в играх, где этот ввод
   * занимает целый ряд (цифровая клавиатура судоку), действия под ним образуют второй
   * ряд кнопок: два уровня управления подряд, и рука на телефоне закрывает оба. Наверху
   * вспомогательное не спорит с вводом и не уезжает при смене высоты поля.
   *
   * Игры БЕЗ своей клавиатуры по-прежнему кладут кнопки в toolbar — там низ свободен,
   * и переносить их наверх незачем: место действий во всём приложении должно совпадать
   * там, где для этого нет причины расходиться.
   */
  headerActions?: React.ReactNode;
  /** Кнопки действий — прибиты к низу экрана. Опционально. */
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

  const field = scrollableField ? (
    <ScrollView
      ref={fieldScrollRef}
      style={styles.fieldScroll}
      contentContainerStyle={styles.fieldScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.field}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
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
        {/* Правый слот фиксированной ширины — держит заголовок по центру */}
        <View style={styles.headerRight}>{headerRight}</View>
      </View>

      {stats ? <View style={styles.stats}>{stats}</View> : null}

      {headerActions ? (
        <View style={[styles.headerActions, { borderBottomColor: colors.border }]}>{headerActions}</View>
      ) : null}

      {field}

      {toolbar ? (
        <View
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

      {paused && (
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
  // Вопрос о выходе. zIndex между итогом (80) и паузой (90).
  exitOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 85, paddingHorizontal: 24 },
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
