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
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { levelCfg, goalPlan } from '@/src/games/goods-sort/core/level';
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
  /**
   * 🔴 МЕХАНИКИ БЕРУТСЯ ИЗ ПРОГОНА ИГРЫ, А НЕ ИЗ ЕЁ ИСХОДНИКА.
   *
   * Замысел «появится пятая — гейт спросит про неё сам» был верен, а исполнение
   * — нет: список вычитывался из текста экрана между `type Obstacle =` и
   * `interface ObstaclePlan`. 06.09.2026 объявления уехали в лист `core/level`,
   * срез стал пустым, и `/'blocked'/.test('')` дало false — пункт покраснел от
   * переноса кода. Хуже другое: сдвинься граница среза чуть иначе — и он бы
   * зеленел, проверяя чужой кусок файла.
   *
   * Теперь виды собираются ПРОГОНОМ шестидесяти уровней: что игрок реально
   * встретит, то и обязано быть в описании. Заведут пятый вид — он появится в
   * прогоне, слова для него в словаре не найдётся, и гейт назовёт его по имени.
   */
  const СЛОВА_ПРЕПЯТСТВИЙ: Record<string, { ru: string; en: string }> = {
    blocked: { ru: 'заперт', en: 'locked' },
    locked: { ru: 'замк', en: 'timed' },
    covered: { ru: 'накрыт', en: 'covered' },
    frozen: { ru: 'примёрз', en: 'frozen' },
  };

  it('обещанное в тексте есть в игре: препятствия', () => {
    const встречены = new Set<string>();
    for (let L = 1; L <= 60; L += 1) {
      const o = levelCfg(L, 8, false).obst;
      if (o.blocked > 0) встречены.add('blocked');
      if (o.locked > 0) встречены.add('locked');
      if (o.covered > 0) встречены.add('covered');
      if (o.frozenRow) встречены.add('frozen');
    }
    // Есть что проверять: за 60 уровней игрок встречает все четыре вида.
    expect([...встречены].sort()).toEqual(['blocked', 'covered', 'frozen', 'locked']);
    const немые: string[] = [];
    for (const вид of встречены) {
      const с = СЛОВА_ПРЕПЯТСТВИЙ[вид];
      if (!с) { немые.push(`${вид}: новый вид, для него нет слова в описании — заведи`); continue; }
      if (!INTRO_RU.toLowerCase().includes(с.ru)) немые.push(`${вид}: в русском описании нет «${с.ru}»`);
      if (!INTRO_EN.toLowerCase().includes(с.en)) немые.push(`${вид}: в английском описании нет «${с.en}»`);
    }
    expect(немые).toEqual([]);
  });

  it('обещанное в тексте есть в игре: цели уровня', () => {
    // Виды целей — тоже прогоном: что `goalPlan` реально выдаёт за 60 уровней.
    const виды = new Set<string>();
    for (let L = 1; L <= 60; L += 1) виды.add(goalPlan(L).kind);
    expect([...виды].sort()).toEqual(['all', 'free', 'moves', 'pick']);
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
