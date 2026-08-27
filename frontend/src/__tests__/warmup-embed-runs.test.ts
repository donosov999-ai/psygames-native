/* psygames-warmup-embed-runs · VER 1 · 27.08.2026 */
/**
 * `embed.js` ОБЯЗАН ЗАПУСКАТЬСЯ, А НЕ ПРОСТО РАЗБИРАТЬСЯ.
 *
 * 🔴 ЗАЧЕМ. 27.08.2026 правка `embed.js` вырезала из файла четыре функции
 * разом — замена куска по границам «от одной функции до другой» захватила всё,
 * что лежало между ними. Файл остался СИНТАКСИЧЕСКИ ВЕРНЫМ: `node --check`
 * молчал, экран открывался, страница рисовалась. Ломалось только исполнение —
 * `запуск()` падал на `ReferenceError`, наблюдатель за сессией не создавался
 * вовсе, и ни итог, ни пауза наружу не уходили. Нашлось это чтением консоли
 * браузера, а до того две проверки подряд отвечали «всё на месте».
 *
 * Отсюда правило: файл ПРОГОНЯЕТСЯ. Не «есть ли в нём слово», не «парсится ли
 * он», а действительно ли `запуск()` доходит до конца и отдаёт `warmup:ready`.
 *
 * ⚠️ Подставка нарочно скудная — ровно те узлы, что трогает `embed.js`. Если
 * файл начнёт трогать что-то ещё, тест упадёт, и это правильно: значит
 * договорённость со страницей изменилась и её надо перечитать.
 */
declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

const ФАЙЛ = join(__dirname, '..', '..', 'public', 'warmup', 'embed.js');

type Узел = {
  id?: string;
  className: string;
  classList: { add: (c: string) => void; remove: (c: string) => void; contains: (c: string) => boolean };
  style: Record<string, string>;
  textContent: string;
  disabled?: boolean;
  hidden?: boolean;
  getAttribute: (имя: string) => string | null;
  querySelector: (сел: string) => Узел | null;
  querySelectorAll: (сел: string) => Узел[];
  scrollIntoView: () => void;
  click: () => void;
  addEventListener: () => void;
};

function узел(id?: string, текст = ''): Узел {
  const классы = new Set<string>();
  const у: Узел = {
    id,
    className: '',
    classList: {
      add: (c: string) => { классы.add(c); },
      remove: (c: string) => { классы.delete(c); },
      contains: (c: string) => классы.has(c),
    },
    style: {},
    textContent: текст,
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    scrollIntoView: () => {},
    click: () => {},
    addEventListener: () => {},
  };
  return у;
}

/** Минимальная подставка окна и документа под то, что трогает `embed.js`. */
function подставка(поиск: string) {
  const узлы: Record<string, Узел> = {
    'practice-pause': узел('practice-pause', 'Пауза'),
    'language-toggle': узел('language-toggle'),
  };
  const body = узел();
  const отправленное: string[] = [];
  let наблюдает = false;

  const document: any = {
    readyState: 'complete',
    body,
    // stylизация под psygames вешает класс и на корень — подставка обязана
    // его принять, иначе честный запуск падал бы на ровном месте.
    documentElement: { dataset: {}, lang: 'ru', classList: { add: () => {}, remove: () => {}, contains: () => false } },
    getElementById: (id: string) => узлы[id] ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const родитель: any = { postMessage: (строка: string) => отправленное.push(строка) };
  const window: any = {
    location: { search: поиск },
    addEventListener: () => {},
    parent: родитель,
    MutationObserver: class {
      observe() { наблюдает = true; }
    },
    setInterval: () => 0,
    clearInterval: () => {},
  };
  window.parent = родитель;
  return { window, document, отправленное, наблюдал: () => наблюдает, body };
}

function прогнать(поиск: string) {
  const код = readFileSync(ФАЙЛ, 'utf8');
  const среда = подставка(поиск);
  const запустить = new Function(
    'window', 'document', 'location', 'URLSearchParams', 'setInterval', 'clearInterval', 'MutationObserver', 'Date',
    код,
  );
  запустить(
    среда.window, среда.document, среда.window.location, URLSearchParams,
    среда.window.setInterval, среда.window.clearInterval, среда.window.MutationObserver, Date,
  );
  return среда;
}

describe('embed.js встроенной «Зарядки» действительно исполняется', () => {
  it('🔴 запуск доходит до конца и отдаёт warmup:ready — не только парсится', () => {
    const среда = прогнать('?embed=1&theme=dark&lang=ru');
    const типы = среда.отправленное.map((с) => JSON.parse(с).type);
    expect(`отправлено: ${типы.join(', ') || 'ничего'}`).toBe('отправлено: warmup:ready');
  });

  it('🔴 наблюдатель за сессией создан — без него итог наружу не уйдёт', () => {
    const среда = прогнать('?embed=1');
    expect(`наблюдение включено: ${среда.наблюдал()}`).toBe('наблюдение включено: true');
  });

  it('🔴 чужая обвязка убрана, панель «Зарядки» помечена как встроенная', () => {
    const среда = прогнать('?embed=1');
    expect(среда.body.classList.contains('is-embedded')).toBe(true);
  });

  it('🔴 без `?embed=1` файл НЕ вмешивается — страница остаётся собой', () => {
    const среда = прогнать('');
    expect(`отправлено: ${среда.отправленное.length}`).toBe('отправлено: 0');
    expect(среда.body.classList.contains('is-embedded')).toBe(false);
  });
});
