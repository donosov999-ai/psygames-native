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
const НОВЕЕ_CHROME_90: Array<[RegExp, string]> = [
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
