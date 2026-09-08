/* psygames-gate-result-actions · VER 1 · 08.09.2026 */
/**
 * КНОПКИ ПОСЛЕ ПАРТИИ — ОДНОЙ ФОРМЫ ВЕЗДЕ.
 *
 * 🔴 ЗАЧЕМ. Отчёт тестировщиков `d35840f8`: «Выход из зарядки разный у всех, где
 * кнопки внизу».
 *
 * 📍 ЗАМЕР 08.09.2026 по всем 95 экранам игр: своих кнопок итога — у ДВУХ игр (в
 * плане стояло четыре, пересчитано), а видов было ТРИ: общий `GameResult`
 * (иконка + залитая главная), «Доска в уме» (градиент без иконки плюс карточка
 * «Назад») и «Глубокий фрактал» (`GlassButton`, а выхода нет вовсе).
 *
 * ⚠️ ЗДЕСЬ ПРОВЕРЯЕТСЯ ВЫЗОВОМ. Компонент рендерится, и у кнопок читаются
 * ОТДАННЫЕ ИМ стили и подписи, а не исходник.
 */
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ResultActions } from '@/src/components/ResultActions';

declare function require(m: string): any;
declare const __dirname: string;
const ЗДЕСЬ = __dirname;
const TestRenderer = require('react-test-renderer');

const COLORS = { primary: '#5b4fd1', surface: '#f3f3fb', border: '#e2e2ee', text: '#1c1c1e' };

function mount(actions: any[]) {
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(<ResultActions actions={actions} colors={COLORS} />);
  });
  const кнопки = r.root.findAllByType(TouchableOpacity);
  const стиль = (n: any) => (Array.isArray(n.props.style) ? Object.assign({}, ...n.props.style.filter(Boolean)) : n.props.style);
  return { r, кнопки, стиль, unmount: () => TestRenderer.act(() => r.unmount()) };
}

const ПАРА = [
  { key: 'retry', label: 'Ещё раз', icon: 'refresh', tone: 'primary', onPress: () => {} },
  { key: 'back', label: 'Назад', icon: 'arrow-back', onPress: () => {} },
];

describe('🔴 одна форма кнопок итога', () => {
  it('главная — залита, второстепенная — светлая с рамкой', () => {
    const m = mount(ПАРА);
    expect(m.кнопки.length).toBe(2);
    const главная = m.стиль(m.кнопки[0]);
    const второстепенная = m.стиль(m.кнопки[1]);
    expect(главная.backgroundColor).toBe('#5b4fd1');
    expect(второстепенная.backgroundColor).toBe('#f3f3fb');
    expect(второстепенная.borderWidth).toBe(1);
    expect(главная.borderWidth).toBeUndefined();
    // обе одного роста и радиуса — иначе «разный у всех» остаётся на месте
    expect(главная.paddingVertical).toBe(второстепенная.paddingVertical);
    expect(главная.borderRadius).toBe(второстепенная.borderRadius);
    m.unmount();
  });

  it('🔴 у каждой кнопки есть иконка — без неё кнопка читается как строка текста', () => {
    const m = mount(ПАРА);
    for (const b of m.кнопки) {
      // ⚠️ Считаем по ТИПУ компонента: `Ionicons` внутри разворачивается ещё в один
      // узел с теми же props, и поиск по props давал двойку на одну иконку.
      expect(`иконок в кнопке: ${b.findAllByType(Ionicons).length}`).toBe('иконок в кнопке: 1');
    }
    m.unmount();
  });

  it('подпись ужимается внутри кнопки, а не выдавливает её за край', () => {
    const m = mount(ПАРА);
    // Подписи — те тексты, которым задано ограничение строк: иконки Ionicons
    // тоже рендерятся через Text, и без фильтра их четыре вместо двух.
    const тексты = m.r.root.findAllByType(Text).filter((t: any) => t.props.numberOfLines != null);
    expect(тексты.length).toBe(2);
    for (const t of тексты) {
      expect(t.props.numberOfLines).toBe(1);
      const st = Array.isArray(t.props.style) ? Object.assign({}, ...t.props.style.filter(Boolean)) : t.props.style;
      expect(st.flexShrink).toBe(1);
    }
    m.unmount();
  });

  it('🔴 КОНТРПРОБА: без действий не рисуется пустая полоса', () => {
    let r: any;
    TestRenderer.act(() => { r = TestRenderer.create(<ResultActions actions={[]} colors={COLORS} />); });
    expect(r.toJSON()).toBeNull();
    TestRenderer.act(() => r.unmount());
  });

  it('каждая кнопка опознаётся по роли, а не по подписи — подпись переводится', () => {
    const m = mount(ПАРА);
    expect(m.кнопки.map((b: any) => b.props.testID)).toEqual(['result-action:retry', 'result-action:back']);
    m.unmount();
  });
});

describe('🔴 общие экраны итога зовут ОДИН компонент, а не свою копию', () => {
  /**
   * ⚠️ Это единственное место набора, где смотрится исходник, — и смотрится ФАКТ
   * вызова, а не вёрстка. Проверить рендером «нет ли у экрана своей копии кнопок»
   * нельзя: своя копия выглядела бы точно так же, в том и беда.
   */
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const read = (p: string) => (readFileSync(join(ЗДЕСЬ, '../../', p), 'utf8') as string)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l: string) => !l.trim().startsWith('//')).join('\n');

  const НОСИТЕЛИ = [
    'src/components/GameResult.tsx',
    'src/components/LevelCleared.tsx',
    'app/games/chess-blind.tsx',
    'app/games/sudoku-fractal-deep.tsx',
  ];

  it('все четыре носителя используют ResultActions', () => {
    for (const f of НОСИТЕЛИ) {
      expect(`${f}: зовёт общий компонент: ${/<ResultActions/.test(read(f))}`)
        .toBe(`${f}: зовёт общий компонент: true`);
    }
  });

  it('🔴 и «Глубокий фрактал» получил кнопку выхода — раньше её не было вовсе', () => {
    const src = read('app/games/sudoku-fractal-deep.tsx');
    expect(`выход в итоге есть: ${/key: 'back'/.test(src)}`).toBe('выход в итоге есть: true');
  });
});
