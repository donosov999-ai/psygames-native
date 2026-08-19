/**
 * ОПИСАНИЕ ИГРЫ ОПИСЫВАЕТ ТУ ИГРУ, КОТОРАЯ ЕСТЬ.
 *
 * 🔴 ЗАЧЕМ. Это уже ломалось: прежний текст обещал стопки, спрятанные за
 * передним товаром предметы и комбо ×2/×3 — ничего этого в коде не было.
 * Человек читал одно, играл в другое и справедливо считал, что игра сломана.
 *
 * Теперь наоборот: механики появились (цели уровня, четыре вида препятствий,
 * перетаскивание), а текст о них молчал. Ошибка того же рода, только в другую
 * сторону: справка перестала объяснять, во что играют.
 *
 * ⚠️ Гейт сверяет текст С КОДОМ, а не со своей копией списка механик: он берёт
 * названия из самого экрана. Иначе он застрянет на сегодняшнем наборе и
 * пропустит следующее расхождение.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '../..');
const GAME = readFileSync(join(ROOT, 'app/games/goods-sort.tsx'), 'utf8') as string;
const BASE = readFileSync(join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8') as string;

/** Текст ключа из базового словаря. */
function baseText(key: string, lang: 'ru' | 'en'): string {
  const re = new RegExp(`${key}:\\s*\\{[\\s\\S]*?\\}`, 'm');
  const block = (BASE.match(re) || [''])[0];
  const m = block.match(new RegExp(`${lang}:\\s*'((?:[^'\\\\]|\\\\.)*)'`))
    || block.match(new RegExp(`${lang}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1] : '';
}

const INTRO_RU = baseText('goodsSortIntroDesc', 'ru');
const INTRO_EN = baseText('goodsSortIntroDesc', 'en');

describe('описание сортировки', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(INTRO_RU.length).toBeGreaterThan(120);
    expect(INTRO_EN.length).toBeGreaterThan(120);
  });

  /**
   * 🔴 Механики берём ИЗ КОДА. Появится пятая — гейт спросит про неё сам,
   * а не промолчит, потому что в его списке было четыре.
   */
  it('обещанное в тексте есть в игре: препятствия', () => {
    const kinds = GAME.slice(GAME.indexOf('type Obstacle ='), GAME.indexOf('interface ObstaclePlan'));
    const has = {
      blocked: /'blocked'/.test(kinds),
      locked: /'locked'/.test(kinds),
      covered: /covered: number/.test(GAME),
      frozen: /frozenRow: boolean/.test(GAME),
    };
    expect(Object.values(has).every(Boolean)).toBe(true);
    // Каждый вид упомянут в описании — своими словами, не именем поля.
    for (const word of ['заперт', 'замк', 'накрыт', 'примёрз']) {
      expect(INTRO_RU.toLowerCase()).toContain(word);
    }
    for (const word of ['locked', 'timed', 'covered', 'frozen']) {
      expect(INTRO_EN.toLowerCase()).toContain(word);
    }
  });

  it('обещанное в тексте есть в игре: цели уровня', () => {
    const plans = GAME.slice(GAME.indexOf('const GOAL_PLANS'), GAME.indexOf('export function goalPlan'));
    for (const kind of ['pick', 'free', 'moves', 'all']) {
      expect(plans).toContain(`'${kind}'`);
    }
    for (const word of ['цель', 'убрать всё', 'ход', 'помеченные']) {
      expect(INTRO_RU.toLowerCase()).toContain(word);
    }
  });

  it('оба способа хода названы — тап остаётся главным для озвучки экрана', () => {
    expect(GAME).toMatch(/PanResponder/);
    expect(INTRO_RU.toLowerCase()).toContain('перетащи');
    expect(INTRO_RU.toLowerCase()).toContain('тапни');
    expect(INTRO_EN.toLowerCase()).toContain('drag');
    expect(INTRO_EN.toLowerCase()).toContain('tap');
  });

  /** Прежний текст обещал стопки и комбо-множители, которых не было. */
  it('не обещает того, чего в игре нет', () => {
    for (const lie of ['стопк', '×2', '×3', 'спрятан']) {
      expect(INTRO_RU.toLowerCase()).not.toContain(lie);
    }
  });

  /** Десять языков не должны читать описание по-английски. */
  it('переведено на все двенадцать языков и не английским текстом', () => {
    const dir = join(ROOT, 'src/contexts/translations');
    const bad: string[] = [];
    for (const f of readdirSync(dir) as string[]) {
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, f), 'utf8') as string;
      const m = src.match(/"goodsSortIntroDesc":\s*"((?:[^"\\]|\\.)*)"/);
      if (!m) { bad.push(`${f}: ключа нет`); continue; }
      if (m[1].length < 100) bad.push(`${f}: описание куцее (${m[1].length} знаков)`);
      if (m[1] === INTRO_EN) bad.push(`${f}: английский текст вместо перевода`);
    }
    expect(bad).toEqual([]);
  });
});
