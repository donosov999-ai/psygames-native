/* eslint-env jest */
// Официальный in-memory мок AsyncStorage — сервисы (tokens, cleanRun, vocab-srs,
// daily-challenge) читают/пишут хранилище в тестах без нативного слоя.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * «Cannot log after tests are done» (CI run 33150197434 и ~2 раза на 259 сьютов
 * локально) — это НЕ незакрытая асинхронщина в тестах. Expo winter runtime ставит
 * `fetch` ЛЕНИВЫМ глобалом (installGlobal), и когда САМЫЙ ПЕРВЫЙ доступ к нему
 * случается на teardown (в стеке — голый `Array.forEach` внутренностей jest/jsdom,
 * без единого кадра приложения; воспроизводится и в node-, и в jsdom-окружении),
 * require-цепочка геттера варнит про отсутствующий в мок-среде нативный модуль
 * `ExpoModulesCoreJSLogger` — уже после конца тестов. Лечение классом: резолвим
 * геттер ЗДЕСЬ, на сетапе, — после этого `fetch` обычное значение, и позднему
 * касанию нечего резолвить. Точечно глушим только тот самый варн.
 */
{
  const warn0 = console.warn;
  console.warn = (...a) => {
    if (typeof a[0] === 'string' && a[0].includes("'ExpoModulesCoreJSLogger'")) return;
    warn0(...a);
  };
  try { void globalThis.fetch; } finally { console.warn = warn0; }
}

/**
 * 🔴 НАСТОЯЩАЯ ОШИБКА ПРЯТАЛАСЬ ЗА ПАДЕНИЕМ СОБСТВЕННОГО ДОКЛАДЧИКА REACT.
 *
 * Замер 16.09.2026, полный прогон 602 наборов: `chess-blind-pick-highlight` падал
 * с `TypeError: window.dispatchEvent is not a function`, а в одиночку шёл зелёным
 * (8 из 8). Стек указывал не на тест и не на игру, а на
 * `react-test-renderer/cjs/...development.js:15298 reportGlobalError`.
 *
 * Что там происходит. React зовёт `reportGlobalError` ТОЛЬКО когда внутри дерева
 * уже случилась неперехваченная ошибка, и докладывает её через
 * `window.dispatchEvent(new ErrorEvent(...))`. В окружении `node` у jest-expo
 * `window` существует (его ставит сам React Native), но это не DOM — метода
 * `dispatchEvent` у него нет. Докладчик падает САМ, его собственный TypeError
 * встаёт на место настоящей ошибки, и мы видим сообщение про `window` вместо
 * причины. Отсюда целый класс «падает только в полном прогоне» — задачи
 * b7018bcd и ecfa89b6: причина там могла быть названа с самого начала.
 *
 * ⚠️ Это НЕ починка тех падений и не попытка их спрятать: подставка ничего не
 * лечит, она только даёт докладчику доработать и напечатать ИСХОДНУЮ ошибку.
 * Если после неё набор снова покраснеет — покраснеет уже по делу и с именем.
 */
if (typeof globalThis.window === 'object' && globalThis.window
    && typeof globalThis.window.dispatchEvent !== 'function') {
  globalThis.window.dispatchEvent = (событие) => {
    // Печатаем то, ради чего докладчика и звали, и не глотаем событие молча.
    const е = событие && (событие.error ?? событие.reason ?? событие.message);
    if (е) console.error('[jest-setup] неперехваченная ошибка в дереве:', е);
    return true;
  };
}
