/* psygames-pet-streak-chip · VER 1 · 17.09.2026 */
/* eslint-disable import/first */
/**
 * ЗНАЧОК СЕРИИ НА МЕДАЛЬОНЕ ПИТОМЦА — С ДВОЙКИ И ВНУТРИ КНОПКИ ПИТОМЦА.
 *
 * Задача cca5f572: серия переехала из полосы счётчиков в угол справки. Здесь рисуется
 * сам угол (`HelpCornerRow`) и проверяется:
 *   · единица — ещё не серия, значка нет; с двойки значок есть и называет число словом;
 *   · значок лежит ВНУТРИ кнопки питомца, а не отдельным элементом ряда: иначе угол стал
 *     бы шире и снова задел соседей — ровно то, от чего серию уносили из плашки.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { text: '#000', textSecondary: '#888', surface: '#fff', border: '#ccc', background: '#fff' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => {
  const настоящий = jest.requireActual('@/src/contexts/LanguageContext');
  return { ...настоящий, useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) };
});
jest.mock('@/src/components/pet/GamePet', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Реакт = require('react');
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { __esModule: true, default: () => Реакт.createElement(View, { testID: 'game-pet' }) };
});

import { HelpCornerRow } from '@/src/components/GameHelpOverlay';

beforeAll(() => {
  const g = globalThis as unknown as { window?: { dispatchEvent?: () => void } };
  g.window = g.window ?? {};
  if (!g.window.dispatchEvent) g.window.dispatchEvent = () => {};
});

function угол(streak: number) {
  let t!: renderer.ReactTestRenderer;
  act(() => {
    t = renderer.create(
      <HelpCornerRow rtl={false} mood="idle" top={10} label="Правила" helpLabel="Справка"
        accent="#7c3aed" accentFg="#fff" onPress={() => {}} streak={streak} streakLabel="Серия" />,
    );
  });
  return t;
}

describe('значок серии на медальоне питомца', () => {
  it('единица — ещё не серия: значка нет', () => {
    const t = угол(1);
    expect(t.root.findAll((n: any) => n.props?.testID === 'pet-streak').length).toBe(0);
    act(() => { t.unmount(); });
  });

  it('🔴 с двойки значок есть, называет число и лежит внутри кнопки питомца', () => {
    const t = угол(3);
    const значок = t.root.findAll((n: any) => n.props?.testID === 'pet-streak')[0];
    let внутриПитомца = false;
    for (let p = значок?.parent; p; p = p.parent) if ((p.props as any)?.testID === 'pet-open') { внутриПитомца = true; break; }
    expect(`подпись: ${значок?.props.accessibilityLabel}, внутри питомца: ${внутриПитомца}`)
      .toBe('подпись: Серия: 3, внутри питомца: true');
    act(() => { t.unmount(); });
  });
});
