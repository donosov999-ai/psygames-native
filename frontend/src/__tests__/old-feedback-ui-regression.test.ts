/** UI-регрессии из открытых репортов v1.121–v1.126. */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

describe('старые UI-репорты', () => {
  it('кнопка START на Ready-экране Targets имеет нормальную ширину', () => {
    const source = read('app/games/targets.tsx');

    expect(source).toContain('style={[styles.startButton, styles.readyStartButton]}');
    expect(source).toContain("readyStartButton: { width: '100%', maxWidth: 280 }");
  });

  /**
   * ⚠️ ПРОВЕРКА ПЕРЕПИСАНА 13.08.2026. Раньше она требовала, чтобы Iowa показывала
   * GameIntro отдельным экраном и не вкладывала его под вторую шапку. Экрана-вступления
   * больше нет: описание переехало в сворачиваемый блок «Об игре» на экране настроек
   * (56 игр из 58). Старая проверка стала бессмысленной — стерегла конструкцию,
   * которой не существует.
   *
   * Свойство, ради которого она писалась, осталось прежним и стережётся дальше:
   * НЕ РИСОВАТЬ СВОЮ ШАПКУ ВНУТРИ ОБЩЕГО КАРКАСА. Две шапки подряд — это и был
   * исходный репорт.
   */
  it('Iowa не рисует свою шапку внутри общего каркаса', () => {
    const source = read('app/games/iowa.tsx');
    const shellStart = source.indexOf('<GameShell');
    expect(shellStart).toBeGreaterThan(0);

    // Своя шапка допустима ТОЛЬКО вне GameShell: экран настроек рисует её сам,
    // и он идёт ОТДЕЛЬНОЙ веткой возврата, после закрытия каркаса. Поэтому режем
    // строго содержимое каркаса — от открывающего тега до закрывающего.
    // (Первая версия этой проверки резала файл до конца и краснела на шапке
    //  настроек — ложная тревога на верном коде.)
    const shellEnd = source.indexOf('</GameShell>', shellStart);
    expect(shellEnd).toBeGreaterThan(shellStart);
    const insideShell = source.slice(shellStart, shellEnd);
    expect(`своя шапка внутри каркаса: ${insideShell.includes('styles.header')}`)
      .toBe('своя шапка внутри каркаса: false');
  });

  it('описание игры — сворачиваемым блоком, а не отдельным экраном', () => {
    const source = read('app/games/iowa.tsx');
    expect(source).toContain('<GameAbout');
    expect(`отдельный экран вступления: ${source.includes('<GameIntro')}`)
      .toBe('отдельный экран вступления: false');
  });
});
