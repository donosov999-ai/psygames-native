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
    expect(src).toContain('useAutostart(autostart && lvl.loaded, startGame)');
  });

  it('стартует с восстановленного lvl.level', () => {
    expect(src).toContain('const startLvl = lvl.level');
    expect(src).toContain('loadLevel(startLvl)');
  });

  it('сохраняет следующий уровень без запрета для warmup', () => {
    expect(src).toContain('lvl.setLevel(next)');
    expect(src).not.toMatch(/if\s*\(!isPreset\)\s*lvl\.setLevel\(next\)/);
  });
});
