/**
 * ЭЛЕМЕНТ, КОТОРЫЙ НЕ ПОКАЗАТЬ НИКОГДА.
 *
 * 🔴 ЗАЧЕМ. 19.08.2026 в SET нашёлся бейдж обратного отсчёта, написанный,
 * переведённый на 12 языков, проверенный гейтом — и мёртвый: показ висел на
 * `dealLimit > 0`, а `setDealLimit` не звался НИГДЕ. Значение оставалось нулём,
 * и бейдж не появлялся ни разу. Строку с присваиванием просто не донесли до
 * коммита.
 *
 * Обычные гейты такое пропускают по построению: разметка на месте, ключи
 * переведены, подписи стоят. Не работает только поведение, а его в исходнике
 * не видно. Ловится это одним вопросом: если показ зависит от состояния —
 * присваивается ли это состояние хоть где-то?
 *
 * ⚠️ ПРОВЕРКА НАМЕРЕННО УЗКАЯ. Ловим только самый явный вид: `X > 0 &&` в
 * разметке при полном отсутствии `setX(`. Более умная эвристика начала бы врать
 * на живом коде, а гейт, который врёт, перестают читать.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const DIR = join(__dirname, '../../app/games');
const FILES: string[] = readdirSync(DIR).filter((f: string) => f.endsWith('.tsx'));

describe('мёртвое состояние в разметке', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('🔴 состояние, от которого зависит показ, где-то присваивается', () => {
    const dead: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(join(DIR, f), 'utf8') as string;
      // Пары «состояние + его сеттер», объявленные через useState.
      const pairs = [...src.matchAll(/const \[(\w+), (set\w+)\] = useState/g)];
      for (const [, name, setter] of pairs) {
        // Показ зависит от него? Ищем `name > 0 &&` или `name &&` прямо в разметке.
        const gatesRender = new RegExp(`\\{\\s*${name}\\s*(?:>\\s*0\\s*)?&&`).test(src);
        if (!gatesRender) continue;
        // Сеттер вызывается хоть раз (не считая самого объявления)?
        const calls = (src.match(new RegExp(`${setter}\\s*\\(`, 'g')) || []).length;
        if (calls === 0) dead.push(`${f}: показ висит на «${name}», но ${setter}() не зовётся нигде`);
      }
    }
    expect(dead).toEqual([]);
  });
});
