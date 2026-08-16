/**
 * ОКНО ПРАВИЛ ОБЯЗАНО БЫТЬ В ТОЙ ВЕТКЕ, КОТОРАЯ РИСУЕТСЯ ВО ВРЕМЯ ИГРЫ.
 *
 * ЗАЧЕМ. Правила уровня показываются автоматически при первом входе. Механика
 * такая: хук читает флаг «уже видел», ставит его и открывает окно. Флаг ставится
 * ВСЕГДА, а окно рисуется только если <LevelRuleModal> попал в ту ветку рендера,
 * которая сейчас на экране.
 *
 * ⚠️ ЭТО НЕ ТЕОРИЯ — НА ЭТОМ Я ПОТЕРЯЛ ЧАС 16.08.2026. Игровые экраны выходят
 * РАНЬШЕ корневого return: `if (phase === 'memorize') return renderMemorize();`
 * или отдельным блоком `if (phase === 'input') { return (<GameShell>…) }`. Я
 * вставил окно в корневой return, и получилось худшее из возможного: хук считал
 * правило показанным и ставил флаг, окно при этом не появлялось НИ РАЗУ, а со
 * второго входа не появилось бы уже и по правильному коду — флаг-то стоит.
 * Человек не увидел бы объяснение никогда, и никакой ошибки в логах.
 *
 * ЧТО СТЕРЕЖЁМ: если игра завела правила, окно должно быть в КАЖДОЙ ветке,
 * которая рисуется в игровых фазах.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const DIR = join(__dirname, '../../app/games');
const read = (f: string): string => readFileSync(join(DIR, f), 'utf8');

const withRules = readdirSync(DIR)
  .filter((f: string) => f.endsWith('.tsx'))
  .filter((f: string) => read(f).includes('useLevelRules('));

describe('окно правил доезжает до экрана', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(withRules.length).toBeGreaterThan(15);
  });

  /** Ранний выход `if (phase === 'x') return renderY();` минует корневой return. */
  it('ранние выходы по фазе несут окно правил с собой', () => {
    const bad: string[] = [];
    for (const f of withRules) {
      const src = read(f);
      for (const m of src.matchAll(/^ {2}if \(phase === '(\w+)'\) return ([^\n]+);$/gm)) {
        if (!m[2].includes('LevelRuleModal')) bad.push(`${f}: фаза '${m[1]}' выходит без окна правил`);
      }
    }
    expect(bad).toEqual([]);
  });

  /** Блок `if (phase === 'a' || phase === 'b') { return (…) }` — то же самое. */
  it('игровые ветки-блоки несут окно правил внутри', () => {
    const bad: string[] = [];
    for (const f of withRules) {
      const src = read(f);
      const m = src.match(/^ {2}if \(phase[^\n]*\) \{\n/m);
      if (!m) continue;
      const start = (m.index ?? 0) + m[0].length;
      const end = src.indexOf('\n  return (', start);
      if (end < 0) continue;
      if (!src.slice(start, end).includes('<LevelRuleModal')) {
        bad.push(`${f}: игровая ветка рисуется без окна правил`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * У правила должен быть текст на обоих языках: модалка выбирает ru/en по языку
   * интерфейса, и пустая половина означает пустое окно у половины людей.
   *
   * ⚠️ СОДЕРЖИМОЕ СТРОК НЕ РАЗБИРАЕМ. Две попытки подряд дали ложные срабатывания
   * на верном коде: первая ждала одинарных кавычек и не приняла восемь новых
   * правил, записанных двойными; вторая споткнулась о двойные кавычки ВНУТРИ
   * текста n-back. Проверять надо наличие обеих локалей, а не угадывать разметку
   * литерала — иначе гейт ловит собственную регулярку, а не поломку.
   */
  it('у каждого правила есть заголовок и текст на обоих языках', () => {
    const bad: string[] = [];
    for (const f of withRules) {
      const src = read(f);
      for (const m of src.matchAll(/key: '([^']+)', fromLevel: (\d+)/g)) {
        const tail = src.slice(m.index ?? 0, (m.index ?? 0) + 1800);
        for (const loc of ['ru', 'en']) {
          const at = tail.indexOf(`${loc}: { title:`);
          if (at < 0) { bad.push(`${f}/${m[1]}: нет ${loc}`); continue; }
          if (!tail.slice(at, at + 900).includes('rule:')) bad.push(`${f}/${m[1]}: ${loc} без текста правила`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
