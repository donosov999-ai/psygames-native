/* psygames-warmup-page-whole · VER 1 · 27.08.2026 */
/**
 * «ЗАРЯДКА» ПЕРЕНЕСЕНА ЦЕЛИКОМ — И ОБЯЗАНА ОСТАТЬСЯ ЦЕЛОЙ.
 *
 * 🔴 ЗАЧЕМ СТОРОЖ. Вид зарядки проработан в «Умном будильнике»: картинки,
 * траектория взгляда, рамка времени по фазам, параллельный режим,
 * предупреждения. Попытка перенести это по частям — переписать рисовалки на
 * `react-native-svg` — дала расхождение на первом же замере: гимнастика глаз
 * получила фигуру дыхания вместо своей движущейся мишени, потому что в карте
 * рисовалок будильника её нет (у неё отдельная механика `renderEyeLayer`).
 *
 * Отсюда правило: страница берётся ЦЕЛИКОМ, готовой сборкой. Этот гейт держит
 * перенос целым — чтобы «немножко своего вида» не отросло обратно по кусочку.
 */
// Тесты идут в среде Node без типов @types/node — как и соседние гейты.
declare function require(id: string): any;
declare const __dirname: string;
const { existsSync, readFileSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..');
const СТРАНИЦА = join(ROOT, 'public', 'warmup');

/**
 * ⚠️ КОММЕНТАРИИ СНИМАЮТСЯ ПЕРЕД ПРОВЕРКОЙ. Первая редакция искала строку
 * `practice-complete` во всём файле — и осталась зелёной, когда наблюдение за
 * этим блоком сломали: слово никуда не делось, оно стоит в комментарии рядом.
 * Гейт, который удовлетворяется наличием текста, проверяет текст, а не
 * поведение.
 */
function безКомментариев(исходник: string): string {
  return исходник.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function файлыВглубь(корень: string): string[] {
  const итог: string[] = [];
  for (const имя of readdirSync(корень) as string[]) {
    const полный = join(корень, имя);
    if (statSync(полный).isDirectory()) итог.push(...файлыВглубь(полный));
    else итог.push(полный);
  }
  return итог;
}

describe('«Зарядка» перенесена страницей целиком', () => {
  it('🔴 страница на месте: разметка, стили, собранное приложение, картинки', () => {
    const обязательные = ['index.html', 'styles.css', 'embed.js', 'embed.css'];
    const нет = обязательные.filter((имя: string) => !existsSync(join(СТРАНИЦА, имя)));
    expect(`нет файлов: ${нет.join(', ') || '—'}`).toBe('нет файлов: —');
    expect(existsSync(join(СТРАНИЦА, 'app'))).toBe(true);
    expect(existsSync(join(СТРАНИЦА, 'shared'))).toBe(true);
  });

  it('🔴 встраивание подключено — иначе внутри чужая шапка и итог не вернётся', () => {
    const html = безКомментариев(readFileSync(join(СТРАНИЦА, 'index.html'), 'utf8'));
    expect(html).toContain('embed.css');
    expect(html).toContain('embed.js');
  });

  it('🔴 итог сессии уходит наружу, и завершение отличается от выхода без записи', () => {
    const embed = безКомментариев(readFileSync(join(СТРАНИЦА, 'embed.js'), 'utf8'));
    expect(embed).toContain('warmup:done');
    expect(embed).toContain('warmup:exit');
    // Признак завершения — блок `.practice-complete`. Если он исчезнет из
    // наблюдения, каждая сессия начнёт считаться выходом без записи, и в
    // истории будет тихо ноль.
    expect(embed).toContain('practice-complete');
    // Пауза приложения обязана доходить внутрь: часы страницы свои.
    expect(embed).toContain('warmup:hold');
  });

  it('🔴 экран показывает страницу, а не свои рисовалки', () => {
    const экран = безКомментариев(readFileSync(join(ROOT, 'app', 'games', 'pause.tsx'), 'utf8'));
    expect(экран).toContain('<WarmupPage');
    const модуль = безКомментариев(readFileSync(join(ROOT, 'src', 'games', 'pause', 'ui', 'WarmupPage.tsx'), 'utf8'));
    expect(модуль).toContain('warmup/index.html');
  });

  it('🔴 картинки сжаты: PNG будильника в телефонное приложение не кладут', () => {
    const файлы = файлыВглубь(СТРАНИЦА);
    const png = файлы.filter((ф: string) => ф.endsWith('.png'));
    expect(`PNG в странице: ${png.length}`).toBe('PNG в странице: 0');
    const мб = файлы.reduce((сумма: number, ф: string) => сумма + statSync(ф).size, 0) / 1024 / 1024;
    // Порог с запасом: сейчас 1,01 МБ. Растёт — значит вернулись тяжёлые файлы.
    expect(`вес страницы ≤ 3 МБ: ${мб <= 3} (${мб.toFixed(2)})`).toBe(`вес страницы ≤ 3 МБ: true (${мб.toFixed(2)})`);
  });

  it('🔴 ядро практик остаётся общим — страница собрана из канона psygames', () => {
    // Сборщик будильника компилирует ядро из `src/games/pause/core` psygames и
    // предупреждает, если канон не найден. Проверяем, что каталог наборов в
    // перенесённой странице тот же по составу, что в ядре приложения.
    const ядро = readFileSync(join(ROOT, 'src', 'games', 'pause', 'core', 'engine.ts'), 'utf8');
    const наборыЯдра = new Set((Array.from(ядро.matchAll(/id:\s*'([a-z-]+)'\s*,\s*\n?\s*title:/g)) as RegExpMatchArray[]).map((m: RegExpMatchArray) => m[1]));
    expect(наборыЯдра.size).toBeGreaterThan(0);
    const общий = файлыВглубь(join(СТРАНИЦА, 'shared'))
      .filter((ф: string) => ф.endsWith('.js'))
      .map((ф: string) => readFileSync(ф, 'utf8'))
      .join('\n');
    const пропали = [...наборыЯдра].filter((id) => !общий.includes(`'${id}'`));
    expect(`наборов ядра нет в странице: ${пропали.join(', ') || '—'}`).toBe('наборов ядра нет в странице: —');
  });
});
