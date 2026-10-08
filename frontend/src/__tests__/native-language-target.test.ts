/* psygames-native-language-target · VER 1 · 02.10.2026 */
/**
 * РОДНОЙ ЯЗЫК — ТОЖЕ ЯЗЫК ЗАДАНИЯ (решение Дениса 01.10.2026, задача d0ad03d9).
 *
 * До правки «Слово или нет?» и «Эхо: псевдослова» отсекали язык интерфейса из
 * выбора и подменяли его на en/es: англоязычный игрок никогда не получал
 * английский, русскоязычный — русский. Здесь — что отсечения нет ни в списке,
 * ни в выборе цели, а откат остался только для языка без словаря.
 * Поведение нажатиями — во Flutter-пробах `lexical_decision_screen_test.dart`
 * и `pseudoword_echo_screen_test.dart`.
 */
declare const __dirname: string;
declare function require(m: string): { readFileSync: (p: string, e: string) => string; join: (...a: string[]) => string };
const fs = require('fs');
const path = require('path');
const читать = (rel: string): string => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const код = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('родной язык — язык задания', () => {
  for (const игра of ['lexical-decision', 'pseudoword-echo']) {
    it(`${игра}: язык интерфейса не отсекается и не подменяется`, () => {
      const src = код(читать(`../../app/games/${игра}.tsx`));
      expect(src).not.toMatch(/l\.code !== language/);
      expect(src).not.toMatch(/targetLang === language/);
      // Цель берётся из выбора; откат — только когда у языка нет словаря.
      expect(src).toMatch(/const tgt = (hasPseudowords\(targetLang\)|TARGET_LANGS\.some\(\(l\) => l\.code === targetLang\)) \? targetLang :/);
    });
  }
});
