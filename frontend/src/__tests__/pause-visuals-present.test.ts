/**
 * У КАЖДОГО НАБОРА ПРАКТИК ЕСТЬ КАРТИНКА, А НЕ ЗНАЧОК.
 *
 * 🔴 ЧТО БЫЛО. Ядро практик общее с «Умным будильником»: 10 наборов, 33 практики.
 * В будильнике у каждого набора своя картинка — тело с подсвеченной зоной, снимки
 * поз, фигура дыхания. В приложении экран рисовал ОДИН ЗНАЧОК: ◯ □ △ ◉ ♪ ↗.
 *
 * Замер 27.08.2026: в `PausePracticesGame.tsx` было ноль `Image` и ноль `Svg`, а
 * в `assets` ноль файлов для практик. При этом в базе 512 сессий «Дыхания» и НОЛЬ
 * у хаба «Пауза» — модуль стоял собранным и нетронутым.
 *
 * Гейт держит перенос: набор из каталога обязан иметь свой вид, снимки поз обязаны
 * лежать на месте, а экран — звать `PracticeVisual`, а не рисовать значок.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const КОРЕНЬ = path.resolve(__dirname, '../..');

const ядро: string = fs.readFileSync(path.join(КОРЕНЬ, 'src/games/pause/core/engine.ts'), 'utf8');
const вид: string = fs.readFileSync(path.join(КОРЕНЬ, 'src/games/pause/ui/PracticeVisual.tsx'), 'utf8');
const экран: string = fs.readFileSync(path.join(КОРЕНЬ, 'src/games/pause/ui/PausePracticesGame.tsx'), 'utf8');

/** Наборы каталога — из ядра, а не списком здесь: список разошёлся бы в первый же день. */
const наборы: string[] = [...ядро.matchAll(/^\s{2}\{\s*$[\s\S]{0,80}?id: '([a-z-]+)'/gm)].map((m) => m[1]);

describe('картинки практик перенесены из будильника', () => {
  it('каталог прочитан — проверять есть что', () => {
    const изЯдра = [...new Set([...ядро.matchAll(/\n {4}id: '([a-z-]+)'/g)].map((m) => m[1]))];
    expect(изЯдра.length + наборы.length).toBeGreaterThan(5);
  });

  it('🔴 у каждого набора каталога есть свой вид', () => {
    const все = [...new Set([...ядро.matchAll(/\n {4}id: '([a-z-]+)'/g)].map((m) => m[1]))];
    const без = все.filter((id) => !new RegExp(`['"]?${id}['"]?:`).test(вид.slice(вид.indexOf('const RENDERERS'))));
    expect(без).toEqual([]);
  });

  it('🔴 экран зовёт картинку, а не рисует значок первым делом', () => {
    expect(экран).toMatch(/hasPracticeVisual\(cue\.setId\)/);
    expect(экран).toMatch(/<PracticeVisual/);
    // Значок остаётся ЗАПАСНЫМ путём — он обязан стоять после проверки наличия вида.
    const iПроверка = экран.indexOf('hasPracticeVisual(cue.setId)');
    const iЗначок = экран.indexOf('guideGlyph');
    expect(`проверка ${iПроверка} < значок ${iЗначок}`).toBe(`проверка ${iПроверка} < значок ${Math.max(iЗначок, iПроверка + 1)}`);
  });

  it('🔴 снимки поз лежат на месте и не весят как раньше', () => {
    const каталог = path.join(КОРЕНЬ, 'assets/images/pause');
    const файлы: string[] = fs.readdirSync(каталог);
    expect(файлы.length).toBeGreaterThanOrEqual(5);
    for (const нужен of ['body-master', 'pose-mountain', 'pose-horse', 'pose-cobbler', 'pose-lotus']) {
      expect(`${нужен}: ${файлы.some((f: string) => f.startsWith(нужен))}`).toBe(`${нужен}: true`);
    }
    /**
     * ⚠️ Вес проверяется числом: исходные пять PNG весили 9,3 МБ. В приложение,
     * которое ставят на телефон, девять мегабайт четырёх поз не кладут.
     */
    const вес = файлы.reduce((s: number, f: string) => s + fs.statSync(path.join(каталог, f)).size, 0);
    expect(`вес практик ${Math.round(вес / 1024)} КБ`).toBe(`вес практик ${Math.min(Math.round(вес / 1024), 1500)} КБ`);
  });
});
