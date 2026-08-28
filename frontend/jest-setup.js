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
