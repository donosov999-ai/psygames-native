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
