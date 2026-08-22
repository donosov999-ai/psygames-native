/**
 * Регрессия v1.189: Mahjong и Goods Sort в зарядке стартовали с L1 при каждом
 * входе и не сохраняли следующий уровень. Проверяем контракт двух экранов:
 * auto-start ждёт AsyncStorage, старт берёт lvl.level, успех пишет lvl.setLevel.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '../../app/games');
const read = (name: string) => fs.readFileSync(path.join(APP, name), 'utf8') as string;

describe.each(['mahjong.tsx', 'goods-sort.tsx'])('%s — уровень в зарядке', (file) => {
  const src = read(file);

  it('ждёт загрузки persistent level перед auto-start', () => {
    // Форма шва общая для всех экранов (см. playlist-autostart) — здесь важно, что
    // условие содержит готовность уровня, а не то, как именно оно записано.
    expect(src).toMatch(/useAutostart(?:WhenReady)?\([^;]*lvl\.loaded/);
  });

  it('стартует с восстановленного lvl.level', () => {
    expect(src).toContain('const startLvl = lvl.level');
    expect(src).toContain('loadLevel(startLvl)');
  });

  /**
   * ⚠️ ТЕПЕРЬ reach, А НЕ setLevel. Смысл гейта прежний — прохождение через зарядку
   * обязано сохранять прогресс, — но способ сменился вместе с переигровкой уровней:
   * прямая установка срезала бы потолок, если человек вернулся с тропинки на
   * пройденный уровень (собрал уровень 3 при рекорде 20 → записалось бы 4).
   */
  it('сохраняет следующий уровень без запрета для warmup', () => {
    expect(src).toContain('lvl.reach(next)');
    expect(src).not.toMatch(/if\s*\(!isPreset\)\s*lvl\.reach\(next\)/);
  });

  it('поднимает потолок только вверх — прямой установки уровня на успехе нет', () => {
    expect(src).not.toContain('lvl.setLevel(next)');
  });
});
