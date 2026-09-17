/* psygames-spatial-lab-help-says-how · VER 3 · 17.09.2026 */
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
 *
 * VER 2 (17.09.2026, задача afb6ab5b): в лаборатории четыре упражнения — добавлены «Сдвиг
 * чисел» и «Сеть со сдвигом», у них вместо «Влево/Вправо» четыре стрелки. Справка обязана
 * назвать все четыре вкладки и все четыре стрелки.
 *
 * VER 3 (17.09.2026, задача f3fae4e2, отчёт 60913453): «по двойному нажатию вращение, чтобы шло
 * тоже». Нажатие клетки по-прежнему выбирает, а второе нажатие по той же клетке поворачивает по
 * часовой. Справка на каждом языке обязана это назвать — иначе функцию найдут только случайно.
 */
import { translateFor, LANGUAGES } from '@/src/contexts/LanguageContext';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

describe('справка «Пространственной лаборатории»', () => {
  it('🔴 на каждом языке названы обе кнопки поворота, все четыре упражнения и четыре стрелки сдвига — словами экрана', () => {
    expect(LANGUAGES.length).toBe(12);
    const плохо: string[] = [];
    for (const { code } of LANGUAGES) {
      const справка = translateFor(code, 'spatialLabIntroDesc');
      for (const ключ of ['a11yLeft', 'a11yRight', 'spatialNet', 'spatialTwiddle', 'spatialSixteen', 'spatialNetslide']) {
        const слово = translateFor(code, ключ);
        if (!справка.includes(слово)) плохо.push(`${code}: нет «${слово}» (${ключ})`);
      }
      for (const стрелка of ['←', '→', '↑', '↓']) if (!справка.includes(стрелка)) плохо.push(`${code}: нет стрелки ${стрелка}`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('контроль: старая справка («поверни трубы… вращай блок») пробу не проходит', () => {
    const старая = 'Две головоломки на одном экране: поверни трубы, чтобы вода дошла до каждого конца, и вращай блок 2×2, чтобы расставить числа по порядку.';
    expect(старая.includes(translateFor('ru', 'a11yLeft'))).toBe(false);
  });

  it('экран подписывает кнопки поворота теми же ключами; нажатие клетки выбирает, второе по той же — поворачивает', () => {
    const код = fs.readFileSync(path.join(__dirname, '..', 'components', 'SpatialLab.tsx'), 'utf8');
    expect(код).toMatch(/t\('a11yLeft'\)/);
    expect(код).toMatch(/t\('a11yRight'\)/);
    expect(код).toMatch(/onPress=\{\(\)=>нажатьКлетку\(i,r,c\)\}/);
    expect(код).toMatch(/if\(двойноеНажатие\(цель\)&&!сдвиг&&selection===цель\)\{turn\(1\);return;\}/);
    expect(код).toMatch(/сейчас-было\.t<=ДВОЙНОЕ_НАЖАТИЕ_МС/);
  });

  it('🔴 на каждом языке справка называет двойное нажатие', () => {
    const слова: Record<string, string> = { ru: 'Двойное нажатие', en: 'double tap', de: 'Doppeltipp', es: 'doble toque', fr: 'double appui', it: 'doppio tocco', pt: 'toque duplo', hi: 'दो बार', ja: 'ダブルタップ', ko: '두 번 탭', zh: '双击', ar: 'النقر المزدوج' };
    const плохо = LANGUAGES.map(({ code }) => code).filter((code) => !translateFor(code, 'spatialLabIntroDesc').includes(слова[code]));
    expect(плохо).toEqual([]);
  });
});
