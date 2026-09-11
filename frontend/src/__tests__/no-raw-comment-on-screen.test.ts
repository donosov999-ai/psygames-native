/* psygames-no-raw-comment-on-screen · VER 1 · 10.09.2026 */
/**
 * 🔴 КОММЕНТАРИЙ БЕЗ ФИГУРНЫХ СКОБОК ПЕЧАТАЕТСЯ ЧЕЛОВЕКУ НА ЭКРАНЕ.
 *
 * 📍 ЗАМЕР 10.09.2026, ЖИВЬЁМ. Открыл настройки «Словаря SRS» в собранной
 * веб-версии и увидел в тексте страницы:
 *   «English → /* 🔴 ПРЕДЛАГАЕМ ТОЛЬКО ТЕ ЯЗЫКИ, НА КОТОРЫХ ЕСТЬ СЛОВАРЬ…»
 * В JSX `/* … *\/` без обёртки `{…}` — это не комментарий, а ТЕКСТОВЫЙ УЗЕЛ.
 * Один и тот же блок был скопирован в ШЕСТЬ экранов, и во всех шести потерялась
 * `{`: cloze, word-pairs, semantic-sort, lexical-decision, listening-span,
 * vocab-srs. Уехало людям в v2.52.11.
 *
 * ⚠️ ПОЧЕМУ ЭТОГО НЕ ПОЙМАЛ НИ ОДИН ГЕЙТ. Он валиден для TypeScript (строка как
 * строка), валиден для линта, не ломает ни одной пробы — экран рисуется,
 * кнопки работают. Видно ТОЛЬКО глазами на собранной странице или таким
 * сканером. Поэтому сканер, а не «внимательнее смотреть».
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

function экраны(): string[] {
  const из: string[] = [];
  const обойти = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        обойти(p);
      } else if (e.name.endsWith('.tsx')) из.push(p);
    }
  };
  обойти(path.join(ROOT, 'app'));
  обойти(path.join(ROOT, 'src'));
  return из;
}

describe('комментарии не попадают на экран', () => {
  it('есть что проверять — экраны найдены', () => {
    expect(экраны().length).toBeGreaterThan(50);
  });

  /**
   * Признак: строка, начинающаяся с `/*`, у которой предыдущая непустая строка
   * заканчивается на `>` — то есть мы стоим В ДЕТЯХ JSX-элемента, где всё, что
   * не в скобках, рисуется как текст.
   */
  it('🔴 ни один блочный комментарий не стоит голым внутри JSX', () => {
    const плохо: string[] = [];
    for (const p of экраны()) {
      const строки = (fs.readFileSync(p, 'utf8') as string).split('\n');
      for (let i = 1; i < строки.length; i += 1) {
        if (!/^\s*\/\*/.test(строки[i]!)) continue;
        let j = i - 1;
        while (j >= 0 && !строки[j]!.trim()) j -= 1;
        if (j < 0) continue;
        if (/>\s*$/.test(строки[j]!)) {
          плохо.push(`${path.relative(ROOT, p)}:${i + 1}`);
        }
      }
    }
    expect(`голых комментариев в JSX: ${плохо.join(', ') || '—'}`)
      .toBe('голых комментариев в JSX: —');
  });

  /**
   * ⚠️ ВТОРАЯ ПОЛОВИНА ТОГО ЖЕ КЛАССА: `//` внутри детей JSX тоже рисуется.
   * Проверяется отдельно, потому что признак другой — двойная косая в начале
   * строки сразу после открытого тега.
   */
  it('🔴 и строчный комментарий не стоит голым внутри JSX', () => {
    const плохо: string[] = [];
    for (const p of экраны()) {
      const строки = (fs.readFileSync(p, 'utf8') as string).split('\n');
      for (let i = 1; i < строки.length; i += 1) {
        if (!/^\s*\/\//.test(строки[i]!)) continue;
        let j = i - 1;
        while (j >= 0 && !строки[j]!.trim()) j -= 1;
        if (j >= 0 && /^\s*<[A-Z][\w.]*[^/>]*>$/.test(строки[j]!)) {
          плохо.push(`${path.relative(ROOT, p)}:${i + 1}`);
        }
      }
    }
    expect(`голых // в JSX: ${плохо.join(', ') || '—'}`).toBe('голых // в JSX: —');
  });
});
