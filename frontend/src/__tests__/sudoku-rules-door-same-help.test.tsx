/* psygames-gate-sudoku-rules-door-same-help · VER 1 · 17.09.2026 */
/**
 * ВСЕ ДВЕРИ «ПРАВИЛ» ВЕДУТ К ОДНОЙ СПРАВКЕ УРОВНЯ.
 *
 * 🔴 ПОВОД — замер 17.09.2026 на живом стенде, 390×844, уровень 1:
 *   кнопка «Справка» в углу (каркас)      → +2052 знака на экране: правило, «Чем берётся эта доска», «На этом уровне»;
 *   чип «правила ⓘ» в шапке               → +103 знака — одна строка правила;
 *   «Правила» из меню паузы               → +103 знака — та же строка.
 * Человек, который ищет помощь в паузе, получал однострочник. После правки чип и пауза дают
 * +311 знаков с тем же содержанием карточки уровня; на 360×640 окно прокручивается (+166 на
 * уровне 45 «термометр»), кнопка «Понятно» на экране. Кадры сняты.
 *
 * ⚠️ Две пробы рендерят само окно (поведение), третья — проводку экрана: что обе точки показа
 * получают справку уровня. Без третьей окно умело бы показывать справку, но его бы не кормили.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { RulesHelpModal } from '@/app/games/sudoku';
import { translateFor } from '@/src/contexts/LanguageContext';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const ЦВЕТА = { surface: '#fff', border: '#ddd', text: '#111', textSecondary: '#666', background: '#f5f5f7' };
const текст = (дерево: renderer.ReactTestRenderer): string =>
  дерево.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children as string).join(' ¦ ');

function показать(help: { title: string; body: string } | null) {
  let дерево!: renderer.ReactTestRenderer;
  act(() => {
    дерево = renderer.create(
      <RulesHelpModal visible variant="none" killer={false} N={6} colors={ЦВЕТА} language="ru" onClose={() => {}} help={help} />,
    );
  });
  const t = текст(дерево);
  act(() => дерево.unmount());
  return t;
}

describe('окно правил судоку показывает справку уровня', () => {
  it('🔴 со справкой: заголовок и текст справки уровня, а не одна строка правила', () => {
    const t = показать({ title: 'Ур.1', body: 'Базово: …\n\nЧем берётся эта доска\nГолый одиночка.\n\nНа этом уровне\nПодсказок: 3' });
    expect(`заголовок уровня: ${t.includes('Ур.1')}`).toBe('заголовок уровня: true');
    expect(`«Чем берётся эта доска»: ${t.includes('Чем берётся эта доска')}`).toBe('«Чем берётся эта доска»: true');
    expect(`«На этом уровне»: ${t.includes('На этом уровне')}`).toBe('«На этом уровне»: true');
  });

  it('без справки (экран настройки) — прежний вид: базовое правило', () => {
    const t = показать(null);
    const базовое = translateFor('ru', 'sudokuBaseRule').replace('{n}', '6');
    expect(`базовое правило на месте: ${t.includes(базовое)}`).toBe('базовое правило на месте: true');
  });

  it('🔴 ПРОВОДКА: каждое окно правил на экране получает справку уровня, а пауза открывает это окно', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../app/games/sudoku.tsx'), 'utf8') as string;
    const показы = src.match(/<RulesHelpModal[\s\S]*?\/>/g) ?? [];
    expect(`точек показа окна: ${показы.length}`).toBe('точек показа окна: 2');
    const безСправки = показы.filter((х) => !/help=\{levelHelpText\}/.test(х)).length;
    expect(`точек показа без справки: ${безСправки}`).toBe('точек показа без справки: 0');
    expect(`пункт паузы «Правила» открывает окно: ${/id: 'rules'[^}]*onPress: \(\) => setRulesOpen\(true\)/.test(src)}`)
      .toBe('пункт паузы «Правила» открывает окно: true');
  });
});
