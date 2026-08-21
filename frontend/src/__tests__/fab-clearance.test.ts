/* psygames-fab-clearance · VER 1 · 21.08.2026 */
/**
 * НИЗ ЭКРАНА ЗАНЯТ — И ЭКРАНЫ ОБЯЗАНЫ СЧИТАТЬСЯ С ЭТИМ ОДНОЙ МЕРОЙ.
 *
 * 🔴 ЧТО НАШЛОСЬ ГЛАЗАМИ. В левом нижнем углу висит кнопка отзыва, по центру
 * внизу ходит питомец. Снимки 21.08.2026: в магазине кнопка легла НА строку
 * «Очки копятся за игры, стрики и ачивки» (замер в браузере: кнопка 672–720 по
 * вертикали, строка 698–716 — прямое пересечение); в лигах — на заголовок
 * «Заработанные рамки» и на плашку лиги, а питомец накрыл нижнюю строку.
 *
 * ⚠️ ЭТО БЫЛА НЕ ОШИБКА ОДНОГО ЭКРАНА. Семь экранов отступали снизу числом,
 * подобранным на глаз (40, 48, 96), и ВСЕ СЕМЬ промахнулись: нужно 156. В
 * `statistics.tsx` рядом с числом 96 даже стоял комментарий «место под
 * гуляющего питомца» — намерение было верное, число нет.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ СМОТРИТ НА ЧИСЛА В ОПАСНОЙ ПОЛОСЕ. Проверить «не перекрывает
 * ли» статикой нельзя — это видно только на экране. Зато видно другое: отступ
 * снизу, заданный числом из диапазона, где живут кнопка и питомец, — почти
 * наверняка подобранный на глаз. Такое число обязано быть заменено общей мерой
 * либо объяснено поимённо.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const APP = join(__dirname, '../../app');
const FAB = join(__dirname, '../services/fabPosition.ts');

const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * Экраны, где число снизу НЕ про занятый угол, — поимённо и с причиной.
 * Пусто: пока таких нет. Появится — пусть объяснится здесь.
 */
const OK: Record<string, string> = {};

const screens = (): string[] =>
  readdirSync(APP).filter((f: string) => f.endsWith('.tsx') && !f.startsWith('_'));

describe('низ экрана занят кнопкой отзыва и питомцем', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(screens().length).toBeGreaterThanOrEqual(8);
    expect(readFileSync(FAB, 'utf8')).toContain('FAB_CLEARANCE');
  });

  /** Мера выведена из положения кнопки, а не назначена числом. */
  it('🔴 мера считается, а не вписана готовым числом', () => {
    const src = code(readFileSync(FAB, 'utf8') as string);
    expect(src).toMatch(/FAB_CLEARANCE\s*=\s*FAB_BOTTOM\s*\+\s*FAB_SIZE\s*\+/);
    // Виджет обязан брать своё смещение оттуда же, иначе числа разойдутся молча.
    const w = code(readFileSync(join(__dirname, '../components/FeedbackWidget.tsx'), 'utf8') as string);
    expect(w).toContain('FAB_BOTTOM');
    expect(/insets\.bottom \+ 92/.test(w)).toBe(false);
  });

  it('🔴 ни один экран не подбирает отступ снизу на глаз', () => {
    const плохие: string[] = [];
    for (const f of screens()) {
      if (OK[f]) continue;
      const src = code(readFileSync(join(APP, f), 'utf8') as string);
      for (const m of src.matchAll(/paddingBottom:\s*(\d+)/g)) {
        const n = Number(m[1]);
        // Полоса, где живут кнопка (92..140) и питомец: число отсюда — почти
        // наверняка попытка «оставить место» на глаз.
        if (n >= 40 && n <= 150) плохие.push(`${f}: paddingBottom ${n} — занятый угол считается FAB_CLEARANCE`);
      }
    }
    expect(плохие).toEqual([]);
  });

  it('в списке исключений нет записей про исчезнувшие экраны', () => {
    const ghosts = Object.keys(OK).filter((f) => !screens().includes(f));
    expect(ghosts).toEqual([]);
  });
});
