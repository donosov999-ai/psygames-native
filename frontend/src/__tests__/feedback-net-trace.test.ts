/**
 * КАЖДЫЙ РЕПОРТ НЕСЁТ СЕТЕВОЙ СЛЕД.
 *
 * ЗАЧЕМ. Тестировщица написала «работает только с впн» ТРИ РАЗА: 01.08 на
 * v1.165, 05.08 на v1.183, 18.08 на v1.203. После первой жалобы сделан релей
 * sb.asibots.pro — и он не помог. Понять почему было НЕЧЕМ: функция
 * `currentSupabaseBase()` написана «для отладки и отчётов» и не вызывалась
 * нигде. Три жалобы подряд, семнадцать дней, тридцать восемь версий — и ни
 * одной цифры с её телефона.
 *
 * ⚠️ ЭТО НЕ ПРО КРАСОТУ КОДА. Пока след не доезжает, четвёртая такая жалоба
 * будет ровно так же нечитаема, как три предыдущие: мы снова будем гадать,
 * сработал ли релей, или он вообще не выбрался.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const read = (r: string) => readFileSync(join(__dirname, '../..', r), 'utf8') as string;

describe('сетевой след в репорте', () => {
  const fb = read('src/services/appFeedback.ts');
  const sb = read('src/services/supabase.ts');

  it('след кладётся в контекст отправляемой строки', () => {
    expect(fb).toMatch(/\.\.\.netTrace\(\)/);
    expect(fb).toMatch(/net_queued:\s*await queuedCount\(\)/);
  });

  it('след берётся из живого выбора адреса, а не из константы', () => {
    expect(fb).toMatch(/supabaseNetInfo/);
    expect(sb).toMatch(/export function supabaseNetInfo/);
  });

  /** Без этого «relay» в отчёте не отличить от «relay, потому что так запомнилось». */
  it('различаем пробу и запомненный выбор', () => {
    for (const how of ['relay-cached', 'relay-probed', 'direct']) {
      expect(sb).toContain(how);
    }
  });

  it('длина очереди считается, а не берётся с потолка', () => {
    expect(fb).toMatch(/async function queuedCount/);
    expect(fb).toMatch(/FEEDBACK_QUEUE_KEY/);
  });
});
