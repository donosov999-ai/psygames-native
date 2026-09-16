/* psygames-spatial-lab-help-says-how · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · приёмка 50b87961, пункт «справка своя» */
/**
 * 🔴 СПРАВКА ЛАБОРАТОРИИ ГОВОРИТ, КАК ХОДИТЬ, А НЕ ТОЛЬКО ЧТО СОБРАТЬ.
 *
 * Сверка 17.09.2026: справка говорила «поверни трубы… вращай блок 2×2», а на экране
 * нажатие клетки только ВЫБИРАЕТ трубу или блок — поворачивают кнопки «Влево» / «Вправо»
 * под полем (`SpatialLab.tsx`, onPress клетки → setSelection). Человек, знакомый с «Сетью»
 * Тэтхэма, тычет в трубу и ждёт поворота. Денис 16.09 про соседние игры: «короткое
 * описание — непонятно, как играть».
 *
 * Проба на 12 языках: справка называет обе кнопки ТЕМИ ЖЕ подписями, что на экране, и оба
 * режима их именами; и узко по исходнику — экран подписывает кнопки именно этими ключами.
 */
import { translateFor, LANGUAGES } from '@/src/contexts/LanguageContext';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

describe('справка «Пространственной лаборатории»', () => {
  it('🔴 на каждом языке названы обе кнопки поворота и оба режима — словами экрана', () => {
    expect(LANGUAGES.length).toBe(12);
    const плохо: string[] = [];
    for (const { code } of LANGUAGES) {
      const справка = translateFor(code, 'spatialLabIntroDesc');
      for (const ключ of ['a11yLeft', 'a11yRight', 'spatialNet', 'spatialTwiddle']) {
        const слово = translateFor(code, ключ);
        if (!справка.includes(слово)) плохо.push(`${code}: нет «${слово}» (${ключ})`);
      }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('контроль: старая справка («поверни трубы… вращай блок») пробу не проходит', () => {
    const старая = 'Две головоломки на одном экране: поверни трубы, чтобы вода дошла до каждого конца, и вращай блок 2×2, чтобы расставить числа по порядку.';
    expect(старая.includes(translateFor('ru', 'a11yLeft'))).toBe(false);
  });

  it('экран подписывает кнопки поворота теми же ключами, а нажатие клетки только выбирает', () => {
    const код = fs.readFileSync(path.join(__dirname, '..', 'components', 'SpatialLab.tsx'), 'utf8');
    expect(код).toMatch(/t\('a11yLeft'\)/);
    expect(код).toMatch(/t\('a11yRight'\)/);
    expect(код).toMatch(/onPress=\{\(\)=>\{if\(locked\(i\)\)return;setSelection\(/);
  });
});
