/**
 * Проигрыш внутри зарядки обязан ЗАВЕРШАТЬ шаг, а не запирать человека на нём.
 *
 * ЗАЧЕМ. Зарядка двигается по СОХРАНЁННОЙ сессии — другого сигнала у неё нет. Игра,
 * которая пишет сессию только при успехе, в зарядке становится тупиком: проиграл —
 * ничего не сохранилось — набор стоит. Человек видит, что зарядка «не идёт дальше».
 *
 * Так было в сортировке товаров (превысил лимит ходов → перезапуск того же уровня)
 * и в судоку (три ошибки → конец партии без записи). Судоку стоит в наборах зарядок
 * трижды, у неё настоящий проигрыш — значит тупик был достижим на ровном месте.
 *
 * ⚠️ Проверяем НЕ конкретные игры, а правило: если игра умеет проигрывать и пишет
 * сессию только при успехе — у неё обязан быть путь записи при провале.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const GAMES_DIR = join(__dirname, '../../app/games');

/** Игра пишет сессию ТОЛЬКО при успехе. */
const ONLY_ON_WIN = /passed:\s*true,\s*\/\/\s*сессия пишется только когда уровень собран/;
/** Есть путь записи при провале — прямой passed:false или вычисляемый флаг. */
const HAS_FAIL_PATH = /passed:\s*(false|won|levelPassed|passed)\b/;

describe('тупики в зарядке', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    const files = readdirSync(GAMES_DIR).filter((f: string) => f.endsWith('.tsx'));
    const onlyWin = files.filter((f: string) => ONLY_ON_WIN.test(readFileSync(join(GAMES_DIR, f), 'utf8')));
    expect(onlyWin.length).toBeGreaterThan(0);
  });

  it('игра, пишущая сессию только при успехе, умеет записать и провал', () => {
    const stuck: string[] = [];
    for (const f of readdirSync(GAMES_DIR)) {
      if (!f.endsWith('.tsx')) continue;
      const src: string = readFileSync(join(GAMES_DIR, f), 'utf8');
      if (!ONLY_ON_WIN.test(src)) continue;          // пишет всегда — тупика нет
      if (!/setOver\(true\)|gameOver|isFailOver/.test(src)) continue;   // проигрыша нет вовсе
      if (HAS_FAIL_PATH.test(src)) continue;         // путь записи при провале есть
      stuck.push(f);
    }
    expect(stuck).toEqual([]);
  });
});
