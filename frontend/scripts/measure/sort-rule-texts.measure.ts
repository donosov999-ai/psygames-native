/* psygames-sort-rule-texts-measure · VER 1 · 16.09.2026 */
/**
 * ЗАМЕР: какой текст получит окно правила у каждой игры раздела на 12 языках.
 * Зовётся та же `levelRuleText`, что рисует окно, — не своя копия сборки ключа.
 *   npx jest --rootDir . scripts/measure/sort-rule-texts.measure.ts --testMatch "<rootDir>/scripts/measure/*.measure.ts"
 */
import { levelRuleText } from '@/src/components/LevelRules';

const ЯЗЫКИ = ['ru', 'en', 'es', 'pt', 'hi', 'zh', 'de', 'fr', 'ar', 'ja', 'ko', 'it'];
const ИГРЫ: [string, string[]][] = [
  ['water_sort', ['movelimit', 'hidden', 'short', 'stones', 'sealed']],
  ['nut_sort', ['movelimit', 'hidden', 'short', 'stones', 'sealed']],
  ['ball_sort', ['movelimit', 'hidden', 'short', 'stones', 'sealed']],
  ['cake_sort', ['queue']],
  ['pizza_sort', ['queue']],
];

describe('СМЁТ текстов окна правила', () => {
  it('по играм и языкам', () => {
    const строки: string[] = [];
    for (const [игра, правила] of ИГРЫ) {
      for (const ключ of правила) {
        const пустые = ЯЗЫКИ.filter((я) => { const т = levelRuleText(я, игра, { key: ключ, fromLevel: 1 }); return !т.title || !т.rule; });
        const ru = levelRuleText('ru', игра, { key: ключ, fromLevel: 1 });
        строки.push(`${игра.padEnd(11)} ${ключ.padEnd(10)} пусто на ${String(пустые.length).padStart(2)} из 12 · ru: «${ru.title}» ${ru.rule ? '— ' + ru.rule.slice(0, 50) + '…' : ''}`);
      }
    }
    process.stdout.write('\n' + строки.join('\n') + '\n');
    expect(строки.length).toBe(17);
  });
});
