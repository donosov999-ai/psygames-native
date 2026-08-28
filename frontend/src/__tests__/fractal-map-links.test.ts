/* psygames-fractal-map-links-gate · VER 1 · 28.08.2026 */
/**
 * КАРТА ФРАКТАЛА: СВЯЗЬ «КЛЕТКА ⇄ НИЖНЯЯ СЕТКА» ВИДНА И ИНТЕРАКТИВНА.
 *
 * Просьба Дениса 28.08 (по референсу Fractal Sudoku из Google Play): раньше по карте
 * было не понять, какая нижняя сетка кормит какую клетку корня. Что сторожится:
 *   · кормящая клетка знает НОМЕР своей сетки (FED_CHILD из rootCellForChild),
 *     носит его в углу и рисуется вложенной: пунктирная рамка, пока цифры нет;
 *   · призрак-миниатюра 9×9 живёт в клетке, пока сетка не решена, и различает три
 *     состояния (подсказка задания / поставил человек / пусто);
 *   · касание кормящей клетки выбирает пару, ВТОРОЕ касание открывает сетку;
 *   · плитка при открытии запоминает себя выбранной — вернувшись, видишь свою клетку;
 *   · подсказка под полем меняется от выбора и есть на всех двенадцати языках.
 */
declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

const src = readFileSync(join(__dirname, '..', '..', 'app', 'games', 'sudoku-fractal.tsx'), 'utf8');

describe('карта фрактала — связь клетка⇄сетка', () => {
  it('кормящая клетка знает номер своей сетки и носит его в углу', () => {
    expect(src).toMatch(/FED_CHILD = new Map<string, number>/);
    expect(src).toMatch(/rootCellForChild\(i\)\.join\(','\), i\]/);
    expect(src).toContain('styles.fedTag');
    expect(src).toContain('{fedChild + 1}');
  });

  it('вложенность нарисована как в референсе: пунктир до цифры, сплошная после', () => {
    expect(src).toContain("borderStyle: v === 0 ? 'dashed' : 'solid'");
    expect(src).toContain('styles.fedRing');
  });

  it('призрак-миниатюра живёт в нерешённой клетке и различает три состояния', () => {
    expect(src).toContain('v === 0 && ghost(fedChild, cell)');
    // подсказка задания / цифра человека / пустая клетка — три разных цвета точки
    expect(src).toMatch(/vv === 0 \? 'transparent'/);
    expect(src).toMatch(/given\[rr]\[cc] !== 0/);
  });

  it('первое касание выбирает пару, второе открывает сетку', () => {
    const dive = src.indexOf("if (linkSel === fedChild) { setOpenChild(fedChild); setSelected(null); setPhase('child'); }");
    const pick = src.indexOf('else { setLinkSel(fedChild); setRootSel(null); }');
    expect(dive).toBeGreaterThan(-1);
    expect(pick).toBeGreaterThan(dive);   // выбор — запасная ветка того же касания
  });

  it('плитка запоминает себя выбранной и подсвечивается вместе с клеткой', () => {
    expect(src).toContain('onPress={() => { setLinkSel(i); setOpenChild(i);');
    expect(src).toMatch(/borderColor: linkSel === i \? GRADIENT\[1]/);
  });

  it('подсказка пары стоит под полем, собрана из словаря и меняется для решённой сетки', () => {
    expect(src).toContain('testID="fractal-link-hint"');
    // Решённую сетку «реши её» просить нельзя — у неё своя строка.
    expect(src).toContain("${t(play.children[linkSel]?.done ? 'fractalLinkHintDone' : 'fractalLinkHint')}");
  });

  it('обе подсказки существуют на всех двенадцати языках', () => {
    const base = readFileSync(join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');
    for (const key of ['fractalLinkHint', 'fractalLinkHintDone']) {
      expect(`base ${key}: ${base.includes(`  ${key}:`)}`).toBe(`base ${key}: true`);
      for (const lang of ['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh']) {
        const overlay = readFileSync(join(__dirname, '..', 'contexts', 'translations', `${lang}.ts`), 'utf8');
        expect(`${lang} ${key}: ${overlay.includes(`"${key}"`)}`).toBe(`${lang} ${key}: true`);
      }
    }
  });
});
