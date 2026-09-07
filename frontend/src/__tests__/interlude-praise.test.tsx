/* psygames-interlude-praise-gate · VER 1 · 07.09.2026 */
/**
 * ПОХВАЛА В ЗАСТАВКЕ ПРОВЕРЯЕТСЯ РЕНДЕРОМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА.
 *
 * ⚠️ Соседняя проба `level-interlude` читает текст файла. Это законно для того,
 * что она сторожит (размеры картинок, формула ступеней), но для «видно ли слова
 * питомца» не годится: наличие строки в исходнике зелено и когда пузырь не
 * рисуется. За сутки 07.09.2026 гейты-читатели ошиблись трижды подряд.
 */
import React from 'react';
import LevelInterlude from '@/src/components/LevelInterlude';
import { pickPraise } from '@/src/services/praiseLines';

declare function require(id: string): any;
const TestRenderer = require('react-test-renderer');

const ЦВЕТА = { text: '#111', textSecondary: '#666', primary: '#4a9' };
const смонтированные: any[] = [];
afterEach(() => { смонтированные.splice(0).forEach((r) => TestRenderer.act(() => r.unmount())); });

function заставка(praise: string | null) {
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(React.createElement(LevelInterlude as any, {
      level: 4, stars: 3, ms: 1000, nextLine: 'Запускаю уровень 5',
      doneLine: 'Уровень 4 пройден', colors: ЦВЕТА, praise,
    }));
  });
  смонтированные.push(r);
  return r;
}
const пузырь = (r: any) => r.root.findAll(
  (n: any) => n.props?.testID === 'interlude-praise' && typeof n.type === 'string', { deep: true },
);
const текст = (r: any): string => {
  const out: string[] = [];
  const идти = (n: any) => {
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(идти); return; }
    if (n && n.children) n.children.forEach(идти);
  };
  идти(r.toJSON());
  return out.join(' ');
};

describe('питомец в заставке между уровнями', () => {
  it('🔴 без повода МОЛЧИТ — пузыря нет вовсе', () => {
    const r = заставка(null);
    expect(пузырь(r).length).toBe(0);
  });

  it('есть повод — слова видно', () => {
    const l = pickPraise('ru', { isRecord: true })!;
    const r = заставка(l.text);
    expect(пузырь(r).length).toBe(1);
    expect(текст(r)).toContain(l.text);
  });

  it('заставка по-прежнему показывает свои строки и звёзды', () => {
    // Пузырь не должен вытеснить то, ради чего заставка делалась 19.08.
    const t = текст(заставка('Личный рекорд! 🏆'));
    expect(t).toContain('Уровень 4 пройден');
    expect(t).toContain('Запускаю уровень 5');
  });

  it('молчание не ломает остальное', () => {
    const t = текст(заставка(null));
    expect(t).toContain('Уровень 4 пройден');
  });

  it('🔴 длинная похвала не выдавливает вёрстку — строк не больше двух', () => {
    const r = заставка('Очень длинная похвала, которая могла бы растянуться на весь экран и всё сломать');
    const узел = пузырь(r)[0];
    const текстовый = узел.findAll((n: any) => typeof n.type === 'string' && n.props?.numberOfLines, { deep: true });
    expect(текстовый.some((n: any) => n.props.numberOfLines === 2)).toBe(true);
  });
});
