/* psygames-test-warmup-page-old-webview · VER 1 · 09.09.2026 */
/**
 * ВСТРОЕННАЯ «ЗАРЯДКА» ОБЯЗАНА ПОДНИМАТЬСЯ НА СТАРОМ WEBVIEW.
 *
 * Три кадра тестировщика (fac0ff8f v2.34.1, 54b549c9 v2.16, a9e93754 v2.12) —
 * экран «Eyes & breathing» пустой: шапка есть, поля нет. Устройство: Android 11,
 * WebView Chrome 90. Привозная страница будильника (public/warmup, кроме embed.*)
 * зовёт structuredClone (Chrome 98) и Array.prototype.at (Chrome 92) и задаёт
 * высоту оболочки в dvh (Chrome 108) без запасного vh. Первый же вызов роняет
 * модуль, оболочка остаётся без высоты — поле пустое.
 *
 * Правки в привозном не живут (следующий sync их сотрёт), поэтому:
 *   · полифилы вставляет sync-скрипт ПЕРЕД модулем приложения;
 *   · запасная высота лежит в своём embed.css под @supports.
 * Проба сканирует привозной код на API новее Chrome 90 и требует полифил на КАЖДЫЙ:
 * следующий перенос принесёт новый API — проба покраснеет раньше тестировщика.
 */
declare function require(m: string): any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
const СТРАНИЦА = path.join(__dirname, '..', '..', 'public', 'warmup');
const html = (): string => fs.readFileSync(path.join(СТРАНИЦА, 'index.html'), 'utf8');

/** API новее Chrome 90 → имя полифила, который обязан стоять в index.html. */
const НОВЕЕ_CHROME_90: [RegExp, string][] = [
  [/\bstructuredClone\s*\(/, 'structuredClone'],
  [/\.at\(\s*-?\d/, 'Array.prototype.at'],
  [/\bObject\.hasOwn\s*\(/, 'Object.hasOwn'],
  [/\.findLast(Index)?\s*\(/, 'findLast'],
  [/\.toSorted\s*\(|\.toReversed\s*\(|\.with\s*\(\s*\d/, 'change-array-by-copy'],
  [/\bArray\.fromAsync\b/, 'Array.fromAsync'],
  [/\bstatic\s*\{/, 'static-block'],
  [/\bAbortSignal\.timeout\b/, 'AbortSignal.timeout'],
];

function привозныеФайлы(): string[] {
  const out: string[] = [];
  const обход = (dir: string) => {
    for (const имя of fs.readdirSync(dir) as string[]) {
      const p = path.join(dir, имя);
      if (fs.statSync(p).isDirectory()) { обход(p); continue; }
      if (/\.(m?js)$/.test(имя) && имя !== 'embed.js') out.push(p);
    }
  };
  обход(СТРАНИЦА);
  return out;
}

describe('встроенная зарядка на WebView Chrome 90', () => {
  it('🔴 полифил стоит в index.html и стоит ПЕРЕД модулем приложения', () => {
    const h = html();
    const полифил = h.indexOf('psygames-embed-polyfill');
    const модуль = h.indexOf('<script type="module" src="./app/app.mjs">');
    expect(`полифил: ${полифил >= 0} · модуль: ${модуль >= 0} · порядок: ${полифил >= 0 && модуль >= 0 && полифил < модуль}`)
      .toBe('полифил: true · модуль: true · порядок: true');
    expect(h).toMatch(/typeof structuredClone !== 'function'/);
    expect(h).toMatch(/Array\.prototype\.at\)/);
  });

  it('🔴 sync-скрипт вставляет тот же полифил — иначе следующий перенос его сотрёт', () => {
    const sync: string = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'sync-warmup-page.mjs'), 'utf8');
    expect(sync).toContain('psygames-embed-polyfill');
    expect(sync).toMatch(/html\.replace\(МОДУЛЬ, ПОЛИФИЛ \+ МОДУЛЬ\)/);
  });

  it('🔴 каждый API новее Chrome 90 в привозном коде закрыт полифилом', () => {
    const файлы = привозныеФайлы();
    expect(файлы.length).toBeGreaterThan(3);
    const h = html();
    const полифилы = new Set<string>();
    if (/typeof structuredClone !== 'function'/.test(h)) полифилы.add('structuredClone');
    if (/Array\.prototype\.at\)/.test(h)) полифилы.add('Array.prototype.at');
    const непокрыто: string[] = [];
    for (const f of файлы) {
      const код = fs.readFileSync(f, 'utf8') as string;
      for (const [re, имя] of НОВЕЕ_CHROME_90) {
        if (re.test(код) && !полифилы.has(имя)) непокрыто.push(`${path.relative(СТРАНИЦА, f)}: ${имя}`);
      }
    }
    expect(непокрыто).toEqual([]);
  });

  it('🔴 высота оболочки без dvh: embed.css даёт 100vh под @supports not', () => {
    const css: string = fs.readFileSync(path.join(СТРАНИЦА, 'embed.css'), 'utf8');
    expect(css).toMatch(/@supports not \(height: 100dvh\)\s*\{\s*\.practice-shell\s*\{\s*height: 100vh;/);
    // Повод не выдуман: привозной styles.css правда задаёт dvh без запасного vh.
    const styles: string = fs.readFileSync(path.join(СТРАНИЦА, 'styles.css'), 'utf8');
    expect(styles).toMatch(/height: 100dvh/);
  });
});

/**
 * 🔴 ПОЧЕМУ ЧТЕНИЯ ИСХОДНИКА НЕ ХВАТИЛО.
 *
 * Проба выше сверяла, что в sync-скрипте ЕСТЬ строка `html.replace(МОДУЛЬ, ПОЛИФИЛ + МОДУЛЬ)`.
 * Строка была на месте — и 23.09.2026 полифил всё равно перестал вставляться: вызов лежал
 * ВНУТРИ ветки `if (!html.includes('embed.js'))`, по скобкам, а не по смыслу. Пришла сборка
 * будильника, где ссылки на embed.* стоят уже сверху, ветка закрылась — и вставка стала
 * недостижимой (коммит 39368dd4). Исходник читался зелёным, страница ехала без полифила.
 *
 * Поэтому здесь скрипт ПРОГОНЯЕТСЯ на подделке: папка с index.html той самой формы,
 * что и приехала 23.09. Отдельным процессом — файл модульный, а пробы здесь на require.
 */
describe('вставка полифила прогоном, а не чтением', () => {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const СКРИПТ = path.join(__dirname, '..', '..', 'scripts', 'sync-warmup-page.mjs');
  const ВЫСОТА = '@supports not (height: 100dvh) {\n  .practice-shell {\n    height: 100vh;\n  }\n}\n';

  /** Собирает подделку страницы и возвращает, что скрипт сделал с её index.html. */
  const прогнать = (css: string): { итог: string; html: string } => {
    const папка: string = fs.mkdtempSync(path.join(os.tmpdir(), 'warmup-embed-'));
    // Ровно форма 23.09: ссылки на embed.* уже стоят, полифила нет.
    fs.writeFileSync(path.join(папка, 'index.html'), [
      '<!doctype html><html><head>',
      '      <link rel="stylesheet" href="./embed.css" />',
      '</head><body>',
      '    <script type="module" src="./app/app.mjs"></script>',
      '      <script src="./embed.js" defer></script>',
      '</body></html>',
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(папка, 'embed.css'), css);
    const итог: string = execFileSync(process.execPath, [
      '--input-type=module', '-e',
      `import { вшитьВстраивание } from ${JSON.stringify(СКРИПТ)};` +
      `process.stdout.write(String(вшитьВстраивание(${JSON.stringify(папка)})));`,
    ], { encoding: 'utf8' }) as string;
    return { итог, html: fs.readFileSync(path.join(папка, 'index.html'), 'utf8') as string };
  };

  it('🔴 полифил доезжает даже туда, где ссылки на embed.* уже стоят', () => {
    const { итог, html } = прогнать(ВЫСОТА);
    expect(html).toContain('psygames-embed-polyfill');
    // И именно ПЕРЕД модулем: после — поздно, модуль исполнится первым.
    expect(html.indexOf('psygames-embed-polyfill')).toBeLessThan(html.indexOf('src="./app/app.mjs"'));
    expect(итог).toBe('true');
  });

  it('🔴 потерянная запасная высота в embed.css валит перенос, а не проходит молча', () => {
    const { итог, html } = прогнать('body.is-embedded { color: red; }\n');
    expect(html).toContain('psygames-embed-polyfill');   // вставка сделана,
    expect(итог).toBe('false');                          // но перенос себя не засчитал
  });
});
