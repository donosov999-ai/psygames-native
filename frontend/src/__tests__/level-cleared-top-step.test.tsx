/* psygames-level-cleared-top-step · VER 1 · 17.09.2026 */
/**
 * 🔴 НА ВЕРХНЕЙ СТУПЕНИ КАРТОЧКА ИТОГА НЕ ОБЕЩАЕТ НЕСУЩЕСТВУЮЩИЙ УРОВЕНЬ.
 *
 * 📍 Проход раздела «Судоку» по всем 35 ступеням касаниями (16.09.2026): на верхней ступени
 * карточка писала «Уровень 6 запускается…», а игра раздавала снова пятую — у 7 игр из 7.
 * В `LevelCleared` строка была `level + 1` без потолка.
 *
 * Проба рисует настоящую карточку (полноэкранный вид, уровень пройден) и читает строку
 * «запускается»: без `maxLevel` — прежнее N+1, на верхней ступени — сама верхняя, ниже верха — N+1.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import LevelCleared from '@/src/components/LevelCleared';

jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => (k === 'levelStarting' ? 'ЗАПУСК {n}' : k), language: 'ru' }),
}));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'free' } }) }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { text: '#000', textSecondary: '#666', background: '#fff', surface: '#fff', border: '#ccc', primary: '#07c', card: '#eee' }, isDark: false }),
}));

beforeAll(() => {
  const g = globalThis as unknown as { window?: { dispatchEvent?: () => void } };
  g.window = g.window ?? {};
  if (!g.window.dispatchEvent) g.window.dispatchEvent = () => {};
});

function строкаЗапуска(props: { level: number; maxLevel?: number }): string {
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => {
    tr = TestRenderer.create(
      <LevelCleared {...props} passed stars={3} gradient={['#000', '#111']}
        colors={{ text: '#000', textSecondary: '#666', background: '#fff', surface: '#fff', border: '#ccc', primary: '#07c' } as any}
        language="ru" onContinue={() => {}} onStop={() => {}} autoMs={600000} variant="screen" />,
    );
  });
  const строки = tr.root.findAllByType(Text).map((n) => [].concat(n.props.children as never).join(''))
    .filter((s) => s.startsWith('ЗАПУСК'));
  act(() => { tr.unmount(); });
  return строки[0] ?? '—';
}

describe('карточка итога на верхней ступени', () => {
  it('без maxLevel — прежнее N+1', () => {
    expect(строкаЗапуска({ level: 5 })).toBe('ЗАПУСК 6');
  });
  it('🔴 верхняя ступень — запускается она же, а не шестая', () => {
    expect(строкаЗапуска({ level: 5, maxLevel: 5 })).toBe('ЗАПУСК 5');
  });
  it('ниже верха — N+1, как было', () => {
    expect(строкаЗапуска({ level: 3, maxLevel: 5 })).toBe('ЗАПУСК 4');
  });
});
