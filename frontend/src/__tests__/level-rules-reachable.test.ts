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
   * ⚠️ ПРОВЕРКА ТЕКСТА ПРАВИЛ ПЕРЕЕХАЛА, А НЕ ПРОПАЛА — level-rules-i18n.test.ts.
   * Здесь она требовала инлайн-текст на ДВУХ языках («ru: { title:» и «en: { title:»)
   * рядом с объявлением правила. С v1.130.0 текст живёт в словаре ключами
   * lr_<игра>_<правило>_<поле>, и требование «оба языка на месте» стало требованием
   * «все двенадцать на месте»: соседний гейт сверяет РЕЗУЛЬТАТ levelRuleText по каждой
   * локали, а не наличие двух литералов в исходнике. Оставить старую проверку значило
   * бы держать красным ровно тот код, ради которого правка и делалась.
   *
   * Этот файл сторожит другое и по-прежнему нужен: что окно правил доезжает до экрана.
   */
});
