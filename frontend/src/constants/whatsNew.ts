/**
 * whatsNew — история версий для пользователя: модалка «Что нового» после
 * обновления + экран истории в настройках (запрос Дениса 23.07).
 *
 * Поддерживается руками при каждом релизе: короткие человеческие пункты
 * (не коммиты). ru/en — история версий техническая, на остальных языках
 * показывается en (переводить каждый релиз на 12 языков нереально).
 * Держим последние ~10 значимых версий, старое вычищаем.
 */
export interface WhatsNewEntry {
  version: string;        // '1.148.0'
  date: string;           // '2026-07-24'
  ru: string[];
  en: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '1.189.0',
    date: '2026-08-07',
    ru: [
      'Питомец больше не садится на кнопку «Начать» — на экранах с нижней панелью он ходит выше неё',
      'Поиск фигур: образец искомой фигуры было не видно — он рисовался белым по белому',
    ],
    en: [
      'The pet no longer sits on the Start button — on screens with a bottom bar it walks above it',
      'Visual Search: the target shape sample was invisible — it was drawn white on white',
    ],
  },
  {
    version: '1.188.0',
    date: '2026-08-07',
    ru: [
      'Судоку с правилом «соседи не отличаются на единицу» (уровни 22–25) больше не заставляет ждать: доска собиралась полторы минуты, теперь секунду',
      'Сложность по технике решения заработала ещё на трёх правилах — несоседние числа, стрелки и термометры',
    ],
    en: [
      'Sudoku with the “neighbours differ by more than one” rule (levels 22–25) no longer keeps you waiting: the board took a minute and a half to build, now about a second',
      'Technique-based difficulty now also covers three more rules — non-consecutive, arrows and thermometers',
    ],
  },
  {
    version: '1.187.0',
    date: '2026-08-07',
    ru: [
      'Судоку: сложность наконец растёт по уровням. Раньше уровень задавал число пустых клеток, а они могут заполняться совсем механически — поэтому 34-й выходил легче 12-го. Теперь уровень задаёт, какой приём решения понадобится',
      'Судоку: у каждого уровня гарантированно ровно одно решение — это проверяется при каждой сборке для всех 52 уровней, а не на глаз',
    ],
    en: [
      'Sudoku: difficulty finally grows with the level. It used to be set by the number of empty cells, which can be filled purely mechanically — that is why level 34 felt easier than 12. Now the level sets which solving technique you will need',
      'Sudoku: every level is guaranteed to have exactly one solution — checked on every build across all 52 levels, not by eye',
    ],
  },
  {
    version: '1.186.0',
    date: '2026-08-06',
    ru: [
      'Вызов дня снова засчитывает уровни: раньше он запускался как шаг зарядки, а там уровни намеренно не растут — можно было пройти идеально и остаться на первом',
      'Вечерняя зарядка больше не повторяет утреннюю игру: парные картинки заменены маджонгом',
    ],
    en: [
      'The daily challenge counts levels again: it used to launch as a workout step, where levels intentionally do not grow — you could play perfectly and stay on level one',
      'The evening workout no longer repeats a morning game: picture pairs replaced with mahjong',
    ],
  },
  {
    version: '1.185.0',
    date: '2026-08-06',
    ru: [
      'Судоку: на уровнях с кружками и квадратиками введённая цифра больше не «выцветает» — она читается сразу, не дожидаясь снятия выделения',
      'Главный экран стал компактнее: шапка занимает вдвое меньше, игры начинаются выше',
      'Кубок, магазин, статистика и настройки больше не переносятся на отдельную строку',
    ],
    en: [
      'Sudoku: on levels with circles and squares the digit you place no longer looks washed out — it reads right away, without deselecting the cell',
      'The home screen is tighter: the header takes half the space, games start higher',
      'Trophy, shop, stats and settings no longer wrap onto their own row',
    ],
  },
  {
    version: '1.184.0',
    date: '2026-08-06',
    ru: [
      'Зарядка больше не проглатывает игры: если нажать «Далее» самому, следующая игра не пропускается. Из-за этого вечерний набор превращался в одну игру и дыхание',
      'Вечерняя зарядка — четыре упражнения',
      'Зарядка — одна кнопка: утренняя, дневная, вечерняя и ночная выбираются на одном экране',
      'Подпись на главной больше не застревает: утром показывает утреннюю, а не ту, что была при запуске',
      'Игры внутри зарядки запускаются сами — больше не нужно жать «Начать» на каждом шаге',
    ],
    en: [
      'A workout no longer swallows games: tapping Next yourself no longer skips the following game. That is what turned the evening set into one game and breathing',
      'Evening workout now has four exercises',
      'Workout is one button now: morning, daytime, evening and night are picked on a single screen',
      'The label on the home screen no longer gets stuck — in the morning it shows the morning workout',
      'Games inside a workout start on their own — no more tapping Start at every step',
    ],
  },
  {
    version: '1.183.0',
    date: '2026-08-03',
    ru: ['Аксессуары питомца садятся на место на всех трёх обликах — колпак на макушку, бант на шею, очки на глаза'],
    en: ['Pet accessories now sit correctly on all three looks — hat on the head, bow on the neck, glasses on the eyes'],
  },
  {
    version: '1.182.0',
    date: '2026-08-03',
    ru: [
      'Зарядка есть каждый день — по средам она больше не пустует',
      'Среда закрывает рабочую память: n-back, Корси, ряды цифр и анаграммы',
    ],
    en: [
      'A workout every day — Wednesday is no longer empty',
      'Wednesday covers working memory: n-back, Corsi, digit span and anagrams',
    ],
  },
  {
    version: '1.181.0',
    date: '2026-08-03',
    ru: [
      'Экран больше не гаснет посреди дыхательной сессии',
      'Вдох, задержка и выдох звучат по-разному — упражнение можно делать с закрытыми глазами',
      'Перед первым вдохом три секунды на «устройся поудобнее»',
      'Ночью экран дыхания приглушён — яркий свет в три часа не помогает уснуть',
    ],
    en: [
      'The screen no longer sleeps in the middle of a breathing session',
      'Inhale, hold and exhale sound different — you can do the exercise with your eyes closed',
      'Three seconds to get comfortable before the first inhale',
      'At night the breathing screen is dimmed — bright light at 3am does not help you sleep',
    ],
  },
  {
    version: '1.180.0',
    date: '2026-08-03',
    ru: [
      'У каждой техники дыхания своя фигура: квадрат, треугольник или круг — по ней точка и бежит',
      'Вдох теперь идёт вверх, задержка видна как движение по стороне, выдох — вниз',
      'В выборе техники видно её фигуру, настоящее название и ритм отдельной строкой',
    ],
    en: [
      'Each breathing technique has its own shape — square, triangle or circle — and the dot travels along it',
      'The inhale now goes upward, the hold reads as movement along a side, the exhale goes down',
      'The technique list shows the shape, the real name and the rhythm on its own line',
    ],
  },
  {
    version: '1.179.0',
    date: '2026-08-03',
    ru: [
      'Зарядка — одна кнопка вместо двух: подпись меняется по времени суток, а набор выбирается на своём экране',
      'Появились дневной перерыв и ночное «Не спится» — только дыхание, без очков и без стрика',
      'Дыхание вынесено на главную отдельной кнопкой и осталось шагом вечернего набора',
      'В «Числовых парах» справка объясняет, как играть, а не только зачем',
      'На экране питомца подписано, что ряд картинок — это его внешность, а не другие персонажи',
    ],
    en: [
      'One workout button instead of two: the label follows the time of day, the set is chosen on its own screen',
      'Added a daytime break and a night “Can’t sleep” — breathing only, no points, no streak',
      'Breathing is now its own button on the home screen and still a step of the evening set',
      'Number Bonds help explains how to play, not just why',
      'The pet screen now says the row of pictures is how he looks, not other characters',
    ],
  },
  {
    version: '1.178.0',
    date: '2026-08-02',
    ru: [
      'Вечерний комплекс проходится целиком: средний шаг застревал и его приходилось бросать',
      'В дыхании видно, какой это шаг комплекса — раньше экран выглядел как отдельная игра',
      'Поиск предметов: сказано, что фигуру надо искать в любом повороте',
    ],
    en: [
      'The before-sleep set can be completed: the middle step used to get stuck',
      'Breathing shows which step of the set it is — it used to look like a standalone game',
      'Visual Search now says the shape can appear in any rotation',
    ],
  },
  {
    version: '1.177.0',
    date: '2026-08-02',
    ru: ['Написанный отзыв больше не пропадает, если закрыть окно и вернуться'],
    en: ['A feedback draft is no longer lost if you close the window and come back'],
  },
  {
    version: '1.175.0',
    date: '2026-08-02',
    ru: [
      'Вибрация заработала на телефоне — раньше тумблер сохранялся, но ничего не включал',
      'Кнопки отзываются на нажатие короткой вибрацией',
      'Питомец больше не мигает и не пропадает на мгновение',
      'Отправка отзыва не зависает навсегда: если связь не тянет, отзыв уходит без вложения',
      'Сообщить о проблеме можно прямо из окна с правилами',
      'Режим для дальтоников теперь работает и в Струпе, и в SET',
      'Судоку: цифра в кружке или квадрате видна нормально, а не полупрозрачной',
      'Карточки «Вызов дня» и «Гимнастика для глаз» одной высоты',
      'Вечерний комплекс: средний шаг стал 10 раундов вместо 20 — шаги сопоставимы',
      'Очень крупный системный шрифт больше не ломает подписи на кнопках',
    ],
    en: [
      'Vibration works on the phone — the toggle used to save but switch nothing on',
      'Buttons answer a press with a short vibration',
      'The pet no longer blinks or vanishes for a moment',
      'Sending feedback no longer hangs forever: on a weak connection it goes without the attachment',
      'You can report a problem straight from the rules window',
      'Colorblind mode now works in Stroop and SET too',
      'Sudoku: a digit inside a circle or square is properly visible, not half-transparent',
      'The “Daily challenge” and “Eye gym” cards are the same height',
      'Evening set: the middle step is 10 rounds instead of 20 — steps are comparable',
      'A very large system font no longer breaks button labels',
    ],
  },
  {
    version: '1.174.0',
    date: '2026-08-02',
    ru: [
      'Совет Синапса «во что поиграть» открывает игру, а не пустой экран с ошибкой',
      'Подсказка ходячего питомца ломалась так же — тоже починена',
    ],
    en: [
      'Synapse’s “what to play” tip now opens the game instead of an error page',
      'The walking pet’s tip was broken the same way — fixed too',
    ],
  },
  {
    version: '1.173.0',
    date: '2026-08-02',
    ru: [
      'Блок «Починили по твоим репортам» теперь начинается с благодарности, а не заканчивается ею — раньше её было не видно',
      'Профиль FREE называется «Стандарт»: девять тренажёров — это подобранный набор для старта, а не урезанная проба',
    ],
    en: [
      'The “Fixed from your reports” block now opens with a thank-you instead of ending with one — it used to be off-screen',
      'The FREE profile is now “Standard”: nine trainers are a curated starting set, not a cut-down trial',
    ],
  },
  {
    version: '1.172.0',
    date: '2026-08-02',
    ru: [
      'После отправки отзыва видно, дошла ли голосовая запись — раньше «спасибо» выглядело одинаково в обоих случаях',
      'Если связи нет, отзыв сохраняется и уходит сам — вместе с записью, а не без неё',
    ],
    en: [
      'After sending a report you can see whether the voice recording arrived — “thanks” used to look the same either way',
      'With no connection the report is saved and sends itself later — with the recording, not without it',
    ],
  },
  {
    version: '1.171.0',
    date: '2026-08-02',
    ru: [
      'Отзыв можно отправить одним голосом, без текста — раньше кнопка нажималась, а ничего не уходило',
      'Выбор персонажа теперь листается пальцем — четвёртая карточка не влезала на узкие экраны',
    ],
    en: [
      'A voice-only report now sends — the button used to press with nothing happening',
      'The character picker scrolls sideways — the fourth card did not fit narrow screens',
    ],
  },
  {
    version: '1.170.0',
    date: '2026-08-02',
    ru: [
      'Микрофон в отзывах заработал — не хватало разрешения на запись',
      'Отзывы уходят и без VPN, а при обрыве связи не пропадают, а досылаются потом',
      'На экране между играми видно, какая игра уже сыграна, а какая следующая',
      'Синапс подсказывает, во что поиграть, чтобы подтянуть отстающую шкалу',
    ],
    en: [
      'The microphone in feedback works — the recording permission was missing',
      'Feedback now sends without a VPN, and is queued instead of lost when offline',
      'The between-games screen now shows which game is already played',
      'Synapse suggests what to play to pull up your weakest skill',
    ],
  },
  {
    version: '1.169.0',
    date: '2026-08-01',
    ru: [
      'SET: когда время вышло, игра показывает сет, который был на столе — а не меняет доску молча',
      'WCST: видно, сколько верных подряд осталось до смены правила',
    ],
    en: [
      'SET: when time runs out the game shows the SET that was on the table instead of silently redealing',
      'WCST: you can see how many correct answers are left before the rule changes',
    ],
  },
  {
    version: '1.168.0',
    date: '2026-08-01',
    ru: ['Обновлён движок приложения — под капотом, на игры не влияет'],
    en: ['App engine updated — under the hood, games are unaffected'],
  },
  {
    version: '1.167.0',
    date: '2026-08-01',
    ru: [
      'Результаты комплексов снова синхронизируются — раньше они молча не доезжали и тормозили остальную синхронизацию',
    ],
    en: [
      'Warm-up results sync again — they used to fail silently and stall everything else',
    ],
  },
  {
    version: '1.166.0',
    date: '2026-08-01',
    ru: [
      'В отзыв можно записать голос — не нужно надиктовывать текст и бороться с распознаванием',
      'В комплексе видно, какую именно игру пропускает кнопка «Пропустить»',
      'Кнопка «На главную» больше не прячется под «Ещё раз»',
    ],
    en: [
      'You can attach a voice note to feedback — no more fighting with speech-to-text',
      'The skip button now names the game it will skip',
      'The Home button no longer hides under Play again',
    ],
  },
  {
    version: '1.165.0',
    date: '2026-08-01',
    ru: [
      'Теперь видно, что починили именно по твоим сообщениям — прямо в этом окне',
      'Судоку: нижний ряд больше не обрезается на невысоком экране',
    ],
    en: [
      'You can now see what was fixed from your own reports — right in this window',
      'Sudoku: the bottom row is no longer cut off on short screens',
    ],
  },
  {
    version: '1.164.0',
    date: '2026-07-31',
    ru: [
      'Видно, сколько тренировок осталось до следующей стадии питомца',
      'В дыхании 4-7-8 объяснено, зачем выдох длиннее вдоха — и можно перейти на ровный «квадрат»',
      'В WCST понятно, что ошибка сразу после смены правила неизбежна',
      'В SET пример «что такое SET» открыт сразу',
    ],
    en: [
      'You can see how many trainings are left until your pet grows',
      '4-7-8 breathing now explains why the exhale is longer — and you can switch to an even box pattern',
      'WCST makes clear that an error right after a rule change is unavoidable',
      'SET shows the “what is a SET” example right away',
    ],
  },
  {
    version: '1.163.0',
    date: '2026-07-31',
    ru: [
      'В статистике видно, сколько попыток пройдено, а не только сколько начато',
      'Появились самая быстрая и самая долгая игра',
      'Диаграмма подписана: столбик = очки за одну попытку',
      'На карточке каждой программы виден её собственный счёт — очки не теряются при смене',
    ],
    en: [
      'Statistics now show how many attempts you passed, not just how many you started',
      'Fastest and slowest game added',
      'The chart is labelled: each bar = score for one attempt',
      'Each program card shows its own score — switching does not lose your points',
    ],
  },
  {
    version: '1.162.0',
    date: '2026-07-31',
    ru: [
      'На телефонах без «чёлки» шапка больше не уезжает под системные иконки',
      'В альбомной ориентации контент не попадает под вырез экрана',
    ],
    en: [
      'On phones without a notch the header no longer slides under the system icons',
      'In landscape the content no longer falls under the display cutout',
    ],
  },
  {
    version: '1.161.0',
    date: '2026-07-31',
    ru: [
      'Приложение научилось работать с VoiceOver и TalkBack — незрячий человек теперь слышит, что на экране',
      'Игровое поле описывается словами: «Стержень 1: красный, зелёный», «2 зелёных круга»',
      'Итог игры, новый уровень и разблокировки проговариваются вслух',
    ],
    en: [
      'The app now works with VoiceOver and TalkBack — blind users can hear what is on screen',
      'The board is described in words: "Peg 1: red, green", "2 green circles"',
      'Results, new levels and unlocks are spoken out loud',
    ],
  },
  {
    version: '1.160.0',
    date: '2026-07-30',
    ru: [
      'Комплекс перед сном стал спокойным: отличия, поиск предметов и дыхание 4-7-8 прямо в нём',
      'Утренние и вечерние игры больше не повторяют друг друга',
      'Игра встаёт на паузу, пока пишете отзыв',
      'Приложение стало легче — картинки пережаты без потери качества',
    ],
    en: [
      'The evening set is calm now: spot-the-difference, visual search and 4-7-8 breathing built in',
      'Morning and evening games no longer repeat each other',
      'The game pauses while you write feedback',
      'Smaller app — images recompressed with no visible quality loss',
    ],
  },
  {
    version: '1.159.0',
    date: '2026-07-30',
    ru: [
      'Зарядка и комплекс перед сном больше не застревают: видно «Игра N из M» и кнопку «Следующая игра» вместо «Играть снова»',
    ],
    en: [
      'Warm-up and evening sets no longer get stuck: you see "Game N of M" and a "Next game" button instead of "Play again"',
    ],
  },
  {
    version: '1.158.0',
    date: '2026-07-30',
    ru: [
      'Питомец снова разговаривает — и на экранах со списками тоже, никого не перекрывая',
    ],
    en: [
      'The pet talks again — including on list screens, without covering anything',
    ],
  },
  {
    version: '1.157.0',
    date: '2026-07-30',
    ru: [
      'Вечерний комплекс «перед сном» снова из 3 игр — раньше запускалась только одна',
      'Дыхание: на экране видно выбранную технику и её ритм',
    ],
    en: [
      'The evening "before sleep" set is 3 games again — only one used to launch',
      'Breathing: the chosen technique and its rhythm are now shown on screen',
    ],
  },
  {
    version: '1.156.0',
    date: '2026-07-29',
    ru: [
      'Судоку: на уровнях 30+ пазл иногда имел два решения — верный ход мог засчитаться ошибкой. Теперь решение всегда единственное',
      'Питомец: у переименования появилась кнопка сохранения',
    ],
    en: [
      'Sudoku: on levels 30+ a puzzle could have two solutions — a correct move could count as an error. Now the solution is always unique',
      'Pet: renaming now has a save button',
    ],
  },
  {
    version: '1.155.0',
    date: '2026-07-29',
    ru: [
      'Магазин: фильтр по категориям — акценты, звуки, рамки, титулы, аватары, питомец',
      'Питомец больше не перекрывает нижние карточки на экранах со списками',
    ],
    en: [
      'Shop: category filter — accents, sounds, frames, titles, avatars, pet',
      'The pet no longer overlaps bottom cards on list screens',
    ],
  },
  {
    version: '1.154.0',
    date: '2026-07-29',
    ru: [
      'Провал уровня больше не перезапускается сам — сначала спокойно смотришь результат, потом жмёшь «Ещё раз»',
      'Токены за игру больше не уходят в минус',
    ],
    en: [
      'A failed level no longer auto-restarts — review your result first, then tap Retry',
      'Game tokens never go negative anymore',
    ],
  },
  {
    version: '1.153.0',
    date: '2026-07-29',
    ru: [
      'Полная локализация: испанский, португальский, немецкий, китайский и хинди больше не выпадают в английский посреди игры',
    ],
    en: [
      'Full localization: Spanish, Portuguese, German, Chinese and Hindi no longer drop to English mid-game',
    ],
  },
  {
    version: '1.152.0',
    date: '2026-07-29',
    ru: [
      'Судоку: введённая цифра в выделенной ячейке теперь хорошо видна',
      'WCST: справка исправлена — правило меняется после серии верных подряд, а первая ошибка после смены это норма',
    ],
    en: [
      'Sudoku: the digit you enter in the selected cell is now clearly visible',
      'WCST: help fixed — the rule changes after a run of correct answers, and the first error after a change is normal',
    ],
  },
  {
    version: '1.148.0',
    date: '2026-07-24',
    ru: [
      'SET: подсказка 💡, разбор ошибки не исчезает сам, полосатая заливка стала читаемой, советы по логике в справке',
      'Кнопки внизу больше не прячутся под системную навигацию (Samsung и др.)',
      'Тумблеры питомца и чата применяются мгновенно',
      'Питомец: кормление, имя, поглаживание, реакция на рекорды, советы-тренировки, аксессуары в магазине',
      'Ползунок размера питомца в настройках',
      'Проверка обновлений и этот список «Что нового»',
      'Импорт прогресса чинится сам, если код повредился при пересылке',
    ],
    en: [
      'SET: hint button 💡, mistake breakdown stays until you close it, striped fill is readable now, logic tips in help',
      'Bottom buttons no longer hide behind system navigation (Samsung etc.)',
      'Pet and chat toggles apply instantly',
      'Pet: feeding, custom name, petting, record celebrations, training suggestions, shop accessories',
      'Pet size slider in settings',
      'Update check and this "What’s new" list',
      'Progress import now survives codes mangled by messengers',
    ],
  },
  {
    version: '1.145.0',
    date: '2026-07-23',
    ru: [
      'Питомец: три облика на выбор — Нейро-кот, Робот и Нейрон',
      'Все 60 игр переведены на единый каркас: поле по центру, кнопки снизу',
      '12 языков, включая арабский с зеркальным интерфейсом',
    ],
    en: [
      'Pet: three looks to choose from — Neuro Cat, Robot and Neuron',
      'All 60 games moved to a unified layout: field centered, actions at the bottom',
      '12 languages including Arabic with RTL interface',
    ],
  },
  {
    version: '1.131.0',
    date: '2026-07-22',
    ru: [
      'Появился питомец Синапс — гуляет по экрану и растёт от ваших тренировок',
      'Веб-демо на сайте psy-games.pro',
    ],
    en: [
      'Meet Synapse the pet — walks the screen and grows with your training',
      'Web demo on psy-games.pro',
    ],
  },
];
