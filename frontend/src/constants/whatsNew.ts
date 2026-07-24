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
