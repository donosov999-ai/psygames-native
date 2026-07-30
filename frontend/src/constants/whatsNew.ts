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
