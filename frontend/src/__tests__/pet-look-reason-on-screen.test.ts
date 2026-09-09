/* psygames-test-pet-look-reason-on-screen · VER 1 · 09.09.2026 */
/**
 * ПРИЧИНА ВИДА ПИТОМЦА ПОКАЗЫВАЕТСЯ ЧЕЛОВЕКУ — И СЧИТАЕТСЯ В ОДНОМ МЕСТЕ.
 *
 * Отчёты тестировщика 08.09.2026 (622e217d, d1264bfd): «кормлю каждый день, а он
 * грустный». Экран питомца писал «Сыт и доволен» по одному флагу кормления, а кадр
 * ходящего кота выбирался по ХУДШЕЙ из шкал заботы (мытьё, тренировки, перекорм) —
 * и причина этого выбора не показывалась нигде. Проба держит три вещи:
 *   · экран питомца печатает причину ключом `petLook_<reason>`;
 *   · и экран, и ходящий кот считают вид ОДНИМ вызовом `currentPetLook` — иначе
 *     подпись и картинка снова разойдутся;
 *   · у каждой причины, кроме `growing`, есть слово в словаре (ru и en).
 */
declare function require(m: string): any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const безКомментариев = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ПРИЧИНЫ = ['hungry', 'overfed', 'dirty', 'lonely', 'neglected'];

describe('вид питомца: причина видна и считается в одном месте', () => {
  it('🔴 экран питомца печатает причину ключом petLook_<reason>', () => {
    const код = безКомментариев(src('app/pet.tsx'));
    expect(код).toMatch(/currentPetLook\(\)/);
    expect(код).toMatch(/petLook_\$\{look\.reason\}/);
    expect(код).toMatch(/look\.reason !== 'growing'/);
  });

  it('🔴 ходящий кот считает вид тем же вызовом, что и экран', () => {
    const код = безКомментариев(src('src/components/pet/WalkingPet.tsx'));
    expect(код).toMatch(/currentPetLook\(\)/);
    // Своей копии расчёта больше нет: иначе подпись и кадр разойдутся при первой правке.
    expect(код).not.toMatch(/petLook\(\{/);
  });

  it('🔴 у каждой причины есть слово в словаре — ru и en', () => {
    const словарь = src('src/contexts/LanguageContext.tsx');
    const нет: string[] = [];
    for (const r of ПРИЧИНЫ) {
      const m = словарь.match(new RegExp(`petLook_${r}: \\{ ru: '([^']+)', en: '([^']+)' \\}`));
      if (!m) нетPush(нет, `${r}: ключа нет`);
      else if (m[1].length < 4 || m[2].length < 4) нетPush(нет, `${r}: подпись короче слова`);
    }
    expect(нет).toEqual([]);
  });

  it('список причин в пробе совпадает с типом PetLook — иначе проба слепа к новой причине', () => {
    const тип = src('src/services/petLook.ts').match(/reason: ((?:'[a-z]+'(?: \| )?)+);/);
    expect(тип).toBeTruthy();
    const вТипе = [...тип![1].matchAll(/'([a-z]+)'/g)].map((m: any) => m[1]).filter((r: string) => r !== 'growing').sort();
    expect(вТипе).toEqual([...ПРИЧИНЫ].sort());
  });
});

function нетPush(arr: string[], s: string) { arr.push(s); }
