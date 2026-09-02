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
import GamePet, { type PetMood } from '@/src/components/pet/GamePet';
import { onGameEvent, type GameEventKind } from '@/src/services/gameEvents';
import { streakMultiplier, scoreWithStreak } from '@/src/services/scoring';

import { sndCorrect, sndWrong, sndMatch, sndLose } from '@/src/services/feedback';
import { HudBadge, useScorePopups, ScorePopupLayer } from '@/src/components/juice';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useWarmupSafe } from '@/src/contexts/WarmupContext';
import { GAMES } from '@/src/constants/games';
import { isRTLLang } from '@/src/services/rtl';
import { onGameHold, isGameHeld, holdGame } from '@/src/services/gamePause';
import { announce } from '@/src/services/a11y';
import { useExitGuard } from '@/src/hooks/useExitGuard';

/** Один счётчик в шапке: что показать и каким тоном. */
export interface HudItem {
  key: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Слово из словаря — видно на экране и читается скринридером. */
  label: string;
  value: string | number;
  /** Смысл, а не цвет: каркас сам решит, каким цветом это показать. */
  tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad';
  /** Дёрнуть при изменении — для того, что растёт по ходу партии. */
  pop?: boolean;
}

/** Значок-модификатор уровня: показывается без слова, слово — в подписи. */
export interface ModItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad';
}

/**
 * 🔴 ЧЕТЫРЕ СЧЁТЧИКА — ПОТОЛОК, И ОН ЗДЕСЬ, А НЕ В ИГРАХ.
 *
 * У сортировки их было семь: уровень, звёзды, ходы, серия, товары, цель,
 * режим — они ломали строку на второй ряд и съедали поле. Пятый и дальше
 * каркас не рисует: место в шапке дороже, чем полнота отчёта, а подробности
 * человек смотрит на экране статистики.
 */
const HUD_MAX = 4;

/**
 * Тон — это СМЫСЛ, а не цвет: игра говорит «плохо», каркас решает, каким
 * красным. Один набор на все игры, поэтому перекрасить приложение — правка
 * здесь, а не поиск шестнадцатеричных кодов по 72 экранам.
 */
const TONE: Record<NonNullable<HudItem['tone']>, [string, string]> = {
  neutral: ['#cbd5e1', '#64748b'],
  accent:  ['#fbbf24', '#d97706'],
  good:    ['#34d399', '#059669'],
  warn:    ['#fb923c', '#c2410c'],
  bad:     ['#fb7185', '#e11d48'],
};


/** Ширина зоны, которую занимает плавающая кнопка фидбека снизу (LTR — слева, RTL — справа). */
const FAB_GUTTER = 66;

/**
 * Ширина зоны, которую занимает плавающая справка «?» сверху: 50 — сама кнопка
 * (styles.fabWrap в GameHelpOverlay), 10 — её отступ от края экрана. Сторона
 * зеркалится вместе с ней: LTR — справа, RTL — слева.
 */
const HELP_FAB_GUTTER = 68;   // 60→68 = обёртка 64 + отступ 4: расширена под подпись «Правила»

export interface GameShellProps {
  /** Заголовок игры (уже переведённый). */
  /**
   * 🔴 КАРКАС ПРИНИМАЕТ ДАННЫЕ, А НЕ ВЁРСТКУ — ЧТОБЫ ВИД МЕНЯЛСЯ В ОДНОМ МЕСТЕ.
   *
   * Решение Дениса 02.09.2026: «перестраивай каркас так, чтобы потом он легко
   * менялся и модернизировался, нижний тоже заложи».
   *
   * ЧТО БЫЛО. Игра передавала `stats` готовой вёрсткой: сама выбирала бейджи,
   * порядок, цвета и сколько их. Поэтому «ужать шапку во всех играх» означало
   * править 72 файла, а правило «не больше четырёх счётчиков» вообще негде было
   * применить. Репорт Вали 01.09.2026 со скриншотом: у сортировки семь
   * счётчиков в два ряда, поле сжато до трети экрана.
   *
   * КАК СТАЛО. Игра отдаёт СПИСОК: что показать и каким тоном. Каркас решает,
   * как это выглядит, сколько влезает и что делать с лишним. Поменять вид всех
   * игр — правка здесь, а не обход экранов.
   *
   * ⚠️ `stats` НЕ отменён: 72 игры передают вёрстку, и переводить их разом
   * значит менять всё сразу без возможности откатить по одной. Пока переданы
   * оба — выигрывает `hud`.
   */
  hud?: HudItem[];
  /**
   * Значки-модификаторы уровня: примёрзший ряд, скрытая информация, строгая
   * укладка. Показываются рядом со счётчиками БЕЗ слов — слово живёт в
   * подписи для скринридера и во всплывающей подсказке при появлении.
   */
  mods?: ModItem[];
  /**
   * 🔴 ЧЕМУ ПРИНАДЛЕЖИТ НИЖНЯЯ ПОЛОСА.
   *
   * Прежнее правило (аудит 43 игр, 19.08.2026) звучало жёстко: низ = ОТВЕТ
   * игрока, служебное всегда наверх. Довод остаётся в силе: в 17 играх внизу
   * действительно ответ, и человек, натренированный «Фланкером», бьёт туда же
   * в маджонге — а там «Перемешать», которого три на уровень.
   *
   * НО правило запрещало лишнее. У эталона жанра служебные кнопки внизу и не
   * мешают никому, потому что в его игре ОТВЕТ ДАЁТСЯ ТАПОМ ПО ПОЛЮ — нижняя
   * полоса свободна. То же у нас в сортировке, судоку, маджонге, ханое.
   *
   * Поэтому правило уточнено: низ принадлежит ОТВЕТУ; там, где ответа кнопками
   * нет, низ отдаётся служебному. Смешения в одной игре по-прежнему не бывает —
   * это и был смысл запрета. Явное объявление вместо угадывания по наличию
   * пропа: игра говорит, что у неё внизу.
   */
  bottom?: 'answer' | 'actions';
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
  /**
   * Питомец в шапке — реакция игры на действие (см. `GamePet`).
   * Игра передаёт настроение словом ('good' / 'bad' / 'win'), спрайт, скин,
   * возврат в покой и щадящий режим — забота компонента, а не 72 экранов.
   */
  pet?: PetMood;
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
  title, onBack, stats, hud, mods, bottom, headerActions, toolbar, headerRight, scrollableField, overlay, pet,
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
  /**
   * З5 (29.08.2026): страховка от застревания в зарядке. Переход к следующему
   * шагу живёт на слушателе saveSession — игра, упавшая ДО записи сессии,
   * подвешивала комплекс без пути вперёд (только выход домой с потерей серии).
   * Кнопка в шапке видна ровно во время зарядки и пропускает шаг с ПОДТВЕРЖДЕНИЕМ
   * и именем игры — класс Валиного «что значит 1 игра была пропущена» (v1.166):
   * безымянный skip читается как «пропустить ожидание».
   */
  const wu = useWarmupSafe();
  const wuStep = wu?.active ? wu.currentStep : null;
  /**
   * 🔴 `Alert.alert` ЗДЕСЬ НЕ РАБОТАЛ ВООБЩЕ.
   *
   * Денис 30.08.2026: «нет кнопки пропустить упражнение… она не срабатывает при
   * нажатии». Кнопка была и нажималась — но `Alert.alert` из react-native не
   * реализован на web, а наши Mac и Android — это WebView (та же грабля, что с
   * вибрацией в `juice/haptics.ts`: для RN наша Android-сборка есть `web`).
   * Значит вопрос не появлялся, шаг не пропускался, и человек оставался запертым
   * в упражнении, которое не хочет делать.
   *
   * Спрашиваем своей карточкой — ровно той же, что подтверждает выход: она
   * рисуется в дереве и работает на всех трёх платформах.
   */
  const [askSkip, setAskSkip] = React.useState(false);
  const wuSkip = () => { if (wu && wuStep) setAskSkip(true); };
  const wuSkipConfirm = () => { setAskSkip(false); wu?.skipCurrent(); };

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

  /**
   * 🔴 ОТВЕТ ИГРЫ ЖИВЁТ В КАРКАСЕ, А НЕ В КАЖДОЙ ИГРЕ.
   *
   * Решение Дениса 30.08.2026: раскатать по общему каркасу звук на действие,
   * серию и реакцию питомца. Замер до правки: звук на верный ход звали 12 игр
   * из 74 — в остальных шестидесяти попадание молчало.
   *
   * Игра говорит одну строку (`gameGood()` из `services/gameEvents`), а каркас
   * делает всё остальное: звучит, ведёт серию, меняет лицо питомца. Новая игра
   * получает это бесплатно, если сообщила о ходе.
   *
   * ⚠️ Проп `pet` НЕ отменяется: игра, которая уже управляет настроением сама
   * («Матрица памяти»), продолжает это делать, и её значение сильнее канала.
   */
  const [autoMood, setAutoMood] = React.useState<PetMood>('idle');
  const [streak, setStreak] = React.useState(0);
  const streakRef = React.useRef(0);
  /**
   * Всплывашка «+N» У МЕСТА действия — тоже из канала. Компонент был написан
   * давно, но пользовались им три игры из семидесяти четырёх: подключённый к
   * общему каналу, он достаётся любой игре, которая сказала, сколько начислила
   * и где (`gameGood(50, { x, y })`).
   */
  const { popups, spawn } = useScorePopups();
  /**
   * `spawn` — новая функция на каждом рендере, поэтому в зависимостях подписки
   * ей не место: эффект пересоздавался бы постоянно, отписываясь и подписываясь
   * заново по кадру. Держим в ссылке, а подписка читает свежее значение.
   */
  /**
   * Размер игрового поля: слово похвалы показывается У МЕСТА действия, когда
   * игра прислала координаты, и над полем по центру, когда не прислала —
   * а прислать их сегодня умеют единицы. Без запасного места слово молчало бы
   * в тридцати трёх играх, где событие приходит из хаптика без координат.
   */
  const [fieldBox, setFieldBox] = React.useState({ w: 0, h: 0 });
  const spawnRef = React.useRef(spawn);
  // Запись в ссылку — в эффекте, а не в теле: писать в ref во время рендера
  // нельзя, и линтер это ловит правилом `react-hooks/refs`.
  React.useEffect(() => { spawnRef.current = spawn; }, [spawn]);

  React.useEffect(() => onGameEvent((e) => {
    const kind: GameEventKind = e.kind;
    if (kind === 'good') {
      streakRef.current += 1; setStreak(streakRef.current);
      if (!e.silent) sndCorrect();
      setAutoMood('good');
    } else if (kind === 'bad') {
      streakRef.current = 0; setStreak(0);
      if (!e.silent) sndWrong();
      setAutoMood('bad');
    } else if (kind === 'win') {
      if (!e.silent) sndMatch();
      setAutoMood('win');
    } else {
      if (!e.silent) sndLose();
      setAutoMood('bad');
    }
    /**
     * Прибавку показываем там, где она случилась. Без координат всплывашки нет:
     * «+50» посреди пустого экрана не связывается ни с каким действием.
     *
     * 🔴 РАЗГОН ОТ СЕРИИ ПРИМЕНЯЕТСЯ ЗДЕСЬ — ОДИН РАЗ НА ВСЕ ИГРЫ. Каркас уже
     * ведёт серию, значит он же и знает множитель; игре остаётся сообщить
     * базовую прибавку. Множитель показан рядом («×2»), иначе игрок видит
     * выросшее число и не понимает, за что: невидимая награда не учит.
     *
     * ⚠️ Разгон трогает ОЧКИ ПАРТИИ, а не валюту (§12.2 карты геймификации).
     */
    if (e.value && e.at) {
      const mult = streakMultiplier(streakRef.current);
      const shown = scoreWithStreak(e.value, streakRef.current);
      spawnRef.current(e.at.x, e.at.y, mult > 1 ? `+${shown} ×${mult}` : `+${shown}`,
        mult >= 2 ? '#fbbf24' : undefined);
    }
    /**
     * 🔴 СЛОВО ПОХВАЛЫ — С ТРЕТЬЕГО ВЕРНОГО ХОДА, А НЕ С КАЖДОГО.
     *
     * На каждый ход оно превращается в шум и обесценивается к третьему разу;
     * доказательная база §12.1 карты геймификации даёт этому и цифру:
     * ОЖИДАЕМАЯ похвала подрывает мотивацию так же, как деньги (d = −0,40), а
     * неожиданная безвредна. Поэтому порог по серии и три ступени: слово
     * приходит тогда, когда игрок его не ждёт, и растёт вместе с серией.
     */
    if (kind === 'good') {
      const n = streakRef.current;
      const word = n >= 7 ? t('praise_perfect') : n >= 4 ? t('praise_great') : n >= 3 ? t('praise_good') : null;
      if (word) {
        const x = e.at ? e.at.x : Math.max(0, fieldBox.w / 2 - 40);
        const y = e.at ? e.at.y - 26 : Math.max(0, fieldBox.h * 0.16);
        spawnRef.current(x, y, word, n >= 7 ? '#fbbf24' : '#34d399');
      }
    }
    // Настроение живёт до следующего события: сбрасываем сразу, чтобы два
    // одинаковых подряд дали ДВЕ реакции, а не одну слипшуюся.
    setTimeout(() => setAutoMood('idle'), 40);
  }), [t, fieldBox.w, fieldBox.h]);


  /**
   * 🔴 ПОД ПАЛЬЦЕМ ЭКРАН НЕ ЕЗДИТ.
   *
   * Четыре отчёта за 02.09.2026 об одном и том же, в четырёх разных играх:
   *   dots-connect: «окно ездит, когда начинаешь их соединять; экран должен быть
   *                  фиксированный во время игры»;
   *   one-line:      «когда соединяешь — экран вверх-вниз скачет»;
   *   math-slider:   «картинку можно пальцем двигать вверх-вниз, гуляет на сантиметр»;
   *   goods-sort:    «драг-энд-дроп лагает».
   *
   * Причина у всех одна и не в играх. Приложение на телефоне и на столе — это
   * веб-сборка внутри окна (Tauri), то есть БРАУЗЕР. Пока страница длиннее окна,
   * любое протаскивание пальцем по полю браузер считает прокруткой: он двигает
   * страницу, а игра в это время ведёт свой жест. Отсюда и «ездит», и «лагает» —
   * два толкования одного касания.
   *
   * `touchAction: 'none'` снимает у браузера право толковать касание как жест
   * прокрутки на этом узле; `overscrollBehavior: 'none'` убирает оттяжку у краёв
   * (резинка), из-за которой поле дёргалось даже когда прокручивать нечего.
   *
   * ⚠️ ТОЛЬКО ВОКРУГ ПОЛЯ, А НЕ НА ВЕСЬ ЭКРАН. Игры со списками (слова, длинные
   * правила) прокруткой пользуются законно — им каркас даёт `scrollableField`, и
   * та ветка ниже этот запрет не получает. Запрет на весь документ сломал бы их.
   */
  const безПрокрутки = Platform.OS === 'web'
    ? ({ touchAction: 'none', overscrollBehavior: 'none' } as unknown as Record<string, string>)
    : null;

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
    <View
      style={[styles.field, toolbar ? null : { paddingBottom: bottomSafe }, безПрокрутки]}
      onLayout={(ev) => {
        const { width: w, height: h } = ev.nativeEvent.layout;
        setFieldBox((prev) => (Math.abs(prev.w - w) > 8 || Math.abs(prev.h - h) > 8 ? { w, h } : prev));
      }}
    >
      {children}
      <ScorePopupLayer popups={popups} />
    </View>
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
            (headerRight || wuStep) ? (rtl ? { marginLeft: HELP_FAB_GUTTER } : { marginRight: HELP_FAB_GUTTER }) : null,
          ]}
        >
          {wuStep ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('skipStep')}
              testID="warmup-skip-step"
              onPress={wuSkip}
              style={styles.wuSkipBtn}
            >
              <Ionicons name="play-skip-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
          {headerRight}
        </View>
      </View>

      {/**
        * 🔴 ПИТОМЕЦ СТОИТ В ОДНОМ РЯДУ СО СЧЁТЧИКАМИ, А НЕ У ЗАГОЛОВКА.
        *
        * Решение Дениса 30.08.2026: «надо чтобы он там как в тулбаре был рядом
        * с полезными кнопками-действиями». У эталона жанра маскот и есть левый
        * край той же плашки, где таймер, уровень и счёт: игрок смотрит на счёт
        * и видит реакцию, не переводя взгляд.
        *
        * Первая редакция ставила его между «назад» и заголовком — это верхняя
        * строка навигации, куда игрок во время партии не смотрит вовсе.
        */}
      {/**
        * 🔴 ПИТОМЕЦ ЕСТЬ ВЕЗДЕ, А НЕ ТАМ, ГДЕ ИГРА ВСПОМНИЛА ЕГО ПЕРЕДАТЬ.
        *
        * Решение Дениса 30.08.2026: «надо по всем упражнениям наш новый тулбар с
        * питомцем раскатать, чтобы везде был одинаковый — а то пляшет то так, то
        * так». Требовать проп от каждой из 72 игр значило бы получить ровно эту
        * пляску: где-то передали, где-то нет.
        *
        * Поэтому проп `pet` управляет НАСТРОЕНИЕМ, а не наличием: игра, которой
        * нечего сказать, просто не передаёт его, и питомец стоит в покое.
        * Спрятать его целиком может только игрок — настройкой «показывать
        * питомца», которую читает сам `GamePet`.
        */}
      {/**
        * Полоса состояния: маскот, счётчики, значки модификаторов.
        * Рисуется из ДАННЫХ (`hud`/`mods`), если игра их дала, иначе — прежней
        * вёрсткой из `stats`. Так перевод 72 игр идёт по одной, а вид у всех
        * меняется отсюда.
        */}
      <View style={styles.statsOuter}>
        {/**
          * Единая ПЛАШКА тулбара: у эталона жанра маскот и все счётчики сидят в
          * одной скруглённой панели, и она одинакова на каждом экране. У нас же
          * пять игр из семидесяти четырёх рисовали бейджи, а остальные — строку
          * текста; Денис 30.08.2026: «пляшет то так, то так».
          *
          * Плашка задаётся ЗДЕСЬ, поэтому форма тулбара становится общей сразу
          * во всех играх, а перевод самих счётчиков на бейджи идёт своим ходом,
          * игра за игрой, ничего не ломая.
          */}
        <View style={[
          styles.statsPlate,
          // Игре нечего показать в счётчиках (зарядка, дыхание) — плашка сжимается
          // по питомцу и не тянет пустую полосу во всю ширину, отбирая место у поля.
          stats ? null : styles.statsPlateBare,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
          <GamePet mood={pet ?? autoMood} size={34} />
          {/* Серия показывается с двойки: единица — это ещё не серия, а один ход. */}
          {pet === undefined && streak >= 2 ? (
            <HudBadge icon="flame" label={t('hud_streak')} value={streak} colors={['#fb923c', '#c2410c']} pop />
          ) : null}
          <View style={styles.statsFlex}>
            {hud && hud.length ? (
              <View style={styles.hudRow}>
                {hud.slice(0, HUD_MAX).map((it) => (
                  <HudBadge
                    key={it.key}
                    icon={it.icon}
                    label={it.label}
                    value={it.value}
                    colors={TONE[it.tone ?? 'neutral']}
                    tint={it.tone === 'accent' ? '#3f2b00' : undefined}
                    pop={it.pop}
                  />
                ))}
                {/* Модификаторы — значком без слова: слово в подписи для
                    скринридера, иначе строка снова разъедется на два ряда. */}
                {mods?.map((m) => (
                  <View
                    key={m.key}
                    accessibilityLabel={m.label}
                    style={[styles.modDot, { borderColor: TONE[m.tone ?? 'neutral'][1] }]}
                  >
                    <Ionicons name={m.icon} size={15} color={TONE[m.tone ?? 'neutral'][1]} />
                  </View>
                ))}
              </View>
            ) : null}
            {/**
              * 🔴 `stats` РИСУЕТСЯ И РЯДОМ С `hud`, А НЕ ВМЕСТО НЕГО.
              *
              * Было `hud?.length ? <бейджи> : stats` — то есть игра, перешедшая на
              * данные, разом теряла ВСЁ, что оставалось в `stats`. А там остаётся не
              * мусор: бейдж правила уровня (объяснение механики), плашка стимула,
              * особые счётчики вроде буквы в беглости речи.
              *
              * Поймано 02.09.2026 на «Цифровом ряде»: перевёл шапку на `hud`, оставил
              * в `stats` строку с охватом и рекордом для теста — и тест перестал её
              * находить. Экран при этом выглядел нормально, потому что сами числа
              * переехали в бейджи; молча пропала только строка теста и бейдж правила
              * в четырёх играх.
              */}
            {stats}
          </View>
        </View>
      </View>

      {/* testID — якорь для живого аудита слотов (`scripts/slot-audit.mjs`):
          он ходит по собранному приложению и смотрит, в КАКОЙ из двух зон
          реально нарисована служебная кнопка. Проверка «написано ли» в
          исходнике такое не ловит: в SET бейдж был написан, переведён на 12
          языков, покрыт гейтом — и не показывался ни разу. */}
      {/**
        * 🔴 ПЕРЕКЛЮЧАТЕЛЬ НИЖНЕЙ ПОЛОСЫ ЗАЛОЖЕН, НО НЕ ВКЛЮЧЁН НИ У КОГО.
        *
        * Решение Дениса 02.09.2026: «нижний тоже заложи». Игра, объявившая
        * `bottom="actions"`, отдаёт свои служебные кнопки ВНИЗ — туда, где они
        * у эталона жанра. Одна строка в игре, а не переезд вёрстки.
        *
        * ⚠️ ВКЛЮЧАТЬ ПО ОДНОЙ И ВМЕСТЕ С РЕЕСТРОМ. Правило «низ = ответ игрока»
        * защищено гейтом `slot-meaning.test.ts`, где у каждой игры записано,
        * что у неё внизу и почему. Переключить игру, не обновив её строку в
        * реестре, — значит сломать проверку, которая ловит настоящую беду:
        * человек, натренированный «Фланкером» бить по низу, попадает в
        * «Перемешать», которого три на уровень.
        *
        * Уточнение правила: низ принадлежит ОТВЕТУ; там, где ответ даётся
        * тапом по полю (сортировка, судоку, маджонг, ханой), низ свободен и
        * достаётся служебному. Смешения в ОДНОЙ игре по-прежнему нет.
        */}
      {headerActions && bottom !== 'actions' ? (
        <View testID="game-header-actions" style={[styles.headerActions, { borderBottomColor: colors.border }]}>{headerActions}</View>
      ) : null}

      {field}

      {headerActions && bottom === 'actions' ? (
        <View
          testID="game-bottom-actions"
          style={[
            styles.toolbar,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, 10),
              ...(rtl
                ? { paddingRight: FAB_GUTTER, paddingLeft: PAD_H }
                : { paddingLeft: FAB_GUTTER, paddingRight: PAD_H }),
            },
          ]}
        >
          {headerActions}
        </View>
      ) : null}

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
      {askSkip && (
        <View style={styles.exitOverlay} pointerEvents="auto">
          <View style={[styles.exitCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text accessibilityRole="header" testID="skip-step-title" style={[styles.exitTitle, { color: colors.text }]}>
              {t('skipStep')}
            </Text>
            <Text testID="skip-step-body" style={[styles.exitBody, { color: colors.textSecondary }]}>
              {`${t('skipGameNamed')} ${wuStep ? (GAMES.find((x) => x.id === wuStep.game_id) ? t(GAMES.find((x) => x.id === wuStep.game_id)!.nameKey) : wuStep.game_id) : ''}?`}
            </Text>
            {/* Безопасный ответ первым и залитым — как в вопросе о выходе. */}
            <View style={styles.exitButtons}>
              <TouchableOpacity
                testID="skip-step-stay"
                accessibilityRole="button"
                onPress={() => setAskSkip(false)}
                style={[styles.exitBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.exitBtnText, { color: '#fff' }]}>{t('btn_cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="skip-step-confirm"
                accessibilityRole="button"
                onPress={wuSkipConfirm}
                style={[styles.exitBtn, styles.exitBtnGhost, { borderColor: colors.border }]}
              >
                <Text style={[styles.exitBtnText, { color: colors.text }]}>{t('skipStep')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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

/**
 * 🔴 ЕДИНЫЕ ОТСТУПЫ КАРКАСА — ОДИН НАБОР ЧИСЕЛ НА ВСЕ 72 ИГРЫ.
 *
 * Репорт Вали 01.09.2026 со скриншотами: «ужасно товары мелкие, ни хрена не
 * видно, при этом текст сверху очень крупно» и «поле судоку и цифры опять не
 * входят на весь экран». На кадрах видно причину: три полосы каркаса — шапка,
 * счётчики, действия — каждая со СВОИМИ отступами, и вместе они съедали больше
 * половины экрана. Цифры 7-8-9 в судоку уезжали под нижний край, отчего
 * читались как «не работают».
 *
 * Решение Дениса 02.09.2026: «ужать пустоты, не убирая полезные блоки», «ширину
 * тоже», «каркас ужимать, чтобы везде одинаково». Поэтому отступы вынесены в
 * два числа и применяются ко всем полосам разом: подвинуть их — значит подвинуть
 * во всех играх сразу, а не в одной.
 *
 * ⚠️ Кнопок это НЕ касается: 48×48 — норма нажатия, её держит отдельный гейт
 * `scripts/tap-target-audit.mjs`. Ужимаем воздух между блоками, а не сами блоки.
 */
/**
 * Боковой отступ полос каркаса (было 12…16 вразнобой).
 *
 * 🔴 ЭКСПОРТИРУЕТСЯ НАРОЧНО. Шесть игр-модулей растягивают поле во всю ширину и
 * гасят этот отступ отрицательным полем. Все шесть держали своё число — минус
 * 16, — а здесь стоит 10: перелёт на 6 с каждой стороны, из-за чего страница
 * ехала вбок. Замер браузером 02.09.2026 на 360 px нашёл ровно эти шесть игр,
 * ровно по +6 px. Число, повторённое в семи местах, разъезжается — теперь оно
 * одно.
 */
export const PAD_H = 10;
const PAD_V = 5;    // вертикальный зазор между полосами (было 6…10)

const styles = StyleSheet.create({
  wuSkipBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
    gap: 6,
    paddingHorizontal: PAD_H,
    paddingVertical: PAD_V,
  },
  // flexShrink+minWidth: при системном крупном шрифте длинный заголовок
  // ужимается, а не выталкивает кнопку «назад» за край (репорт «кнопка уехала»).
  title: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  headerBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  headerRight: { width: 44, alignItems: 'flex-end', flexShrink: 0 },
  stats: { paddingHorizontal: PAD_H, paddingBottom: PAD_V },
  // Питомец слева, счётчики занимают остаток: строка не разъезжается, когда
  // питомца нет (игра не передала `pet`) или он выключен в настройках.
  statsOuter: { paddingHorizontal: PAD_H, paddingBottom: PAD_V },
  /**
   * 🔴 ПЛАШКА НЕ ШИРЕ ЭКРАНА. Два отчёта 02.09.2026 («поехали кнопки верх тулбара»,
   * «с меню пиздец сверху»): счётчики растягивали плашку за край телефона, и вместе
   * с ней уезжала кнопка правил. В маджонге бейджей пять — там строка вылезала на
   * треть ширины.
   *
   * `flexWrap` переносит лишнее на вторую строку, `maxWidth: '100%'` не даёт всей
   * плашке стать шире родителя.
   *
   * 🔴 `overflow: 'hidden'` ЗДЕСЬ СТОЯТЬ НЕ ДОЛЖЕН — И СТОЯЛ ОДНУ ВЕРСИЮ.
   *
   * Он был добавлен «последней защитой от содержимого, которое всё-таки не ужалось»
   * — и ровно ею и стал: в судоку пять-шесть счётчиков (уровень, ошибки, серия,
   * время, подсказки) не помещались в строку, а обрезание СПРЯТАЛО их вместо
   * переноса. Отчёт того же дня, версия 2.34.2: «табло, не видно цифры, не видно
   * сверху».
   *
   * ⚠️ И это прошло мимо гейта по устройству самого гейта: третий проход меряет,
   * что ВЫЛЕЗАЕТ за край, а обрезанное не вылезает — оно исчезает. Проверка на 360
   * показала ноль нарушений, пока данные молча пропадали. Обрезание не защита, оно
   * подмена дефекта: «поехало за край» видно, «пропало» — нет.
   */
  statsPlate: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap', maxWidth: '100%',
  },
  statsFlex: { flex: 1, minWidth: 0 },
  hudRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', maxWidth: '100%' },
  // Модификатор — кружок со значком: занимает вчетверо меньше пилюли со словом.
  modDot: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  statsPlateBare: { alignSelf: 'flex-start' },
  // Разделитель снизу отделяет действия от игрового поля: без него ряд кнопок
  // читается как часть поля, и в судоку его принимали за первую строку доски.
  headerActions: { paddingHorizontal: PAD_H, paddingBottom: PAD_V, borderBottomWidth: StyleSheet.hairlineWidth },
  // Поле забирает всё свободное место и центрирует содержимое — единое
  // поведение для всех игр вместо разнобоя.
  field: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: PAD_H },
  fieldScroll: { flex: 1 },
  fieldScrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: PAD_H, paddingVertical: PAD_V },
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
