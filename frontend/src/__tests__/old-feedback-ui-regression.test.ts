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

  it('Iowa не вкладывает GameIntro под вторую шапку игры', () => {
    const source = read('app/games/iowa.tsx');
    const introStart = source.indexOf("if (phase === 'intro')");
    const sharedScreenStart = source.indexOf('\n  return (', introStart);
    const introBranch = source.slice(
      introStart,
      sharedScreenStart,
    );

    expect(introStart).toBeGreaterThan(0);
    expect(sharedScreenStart).toBeGreaterThan(introStart);
    expect(introBranch).toContain('<GameIntro nameKey="iowa"');
    expect(introBranch).not.toContain('styles.header');
    expect(source.slice(sharedScreenStart)).not.toContain("phase === 'intro'");
  });
});
