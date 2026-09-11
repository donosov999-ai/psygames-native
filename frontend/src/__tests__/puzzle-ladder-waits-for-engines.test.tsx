/* psygames-puzzle-ladder-waits-for-engines · VER 1 · 11.09.2026 */
/**
 * 🔴 ЭКРАН НЕ ОБЪЯВЛЯЕТ ЛЕСТНИЦУ, КОТОРОЙ ЕЩЁ НЕ ВИДЕЛ.
 *
 * 📍 ПОВОД. Чат «Пространство» 11.09.2026: «Клоцки на экране настройки показывают
 * „Уровень 1/1“, хотя `psy_presets` отдаёт 3». Пресеты отдавали три всегда — проверено
 * прямым вызовом моста: Slide 3, Sokoban 3, Untangle 5. Врал экран.
 *
 * ПОЧЕМУ. `ступеней = Math.max(ступени.length, 1)`, а `ступени` берутся у `движок`,
 * которого до загрузки wasm нет. Ноль ступеней превращался в уверенную «1»,
 * и ЛЮБАЯ головоломка — хоть судоку с шестнадцатью ступенями — в это окно
 * показывала «1/1». Кнопка «Начать» в том же окне не работала вовсе:
 * `начать()` первой строкой выходит по `if (!движок) return`.
 *
 * 📍 ЗАМЕР 11.09.2026, статическая сборка, свой показ без торможения сети:
 * «1/1» видно с 263-й по 652-ю миллисекунду, дальше «1/3». Окно растёт вместе со
 * временем загрузки модуля (969 КБ) — на телефоне оно заметно длиннее, и именно
 * туда попал читавший.
 *
 * ⚠️ Проба смотрит НЕ на исходник, а на то, что экран отдаёт в шапку и рисует:
 * гейт по грепу поймал бы приём, а не дефект.
 */
import React from 'react';
import PuzzlesScreen from '@/app/games/puzzles';

// ⚠️ Имя с приставкой `mock` — требование jest: фабрика `jest.mock` поднимается выше
// объявлений, и обращаться из неё разрешено только к таким именам.
let отдатьОпись: (д: any[]) => void = () => {};
const mockОпись = new Promise<any[]>((resolve) => { отдатьОпись = resolve; });

jest.mock('@/src/games/tatham-bridge', () => ({
  движки: () => mockОпись,
  доскаСтрок: () => [],
}));
jest.mock('@/src/games/tatham-bridge/play', () => ({
  открыть: jest.fn(async () => ({ ширина: 100, высота: 100, палитра: ['rgb(0,0,0)'], примитивы: [], статус: 0, ход: null, подорвался: false, тупик: false })),
  указатель: jest.fn(), стрелка: jest.fn(), клавиша: jest.fn(), отменить: jest.fn(), решить: jest.fn(),
}));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { bg: '#fff', text: '#000', textSecondary: '#666', card: '#eee', border: '#ccc', primary: '#7c6cf0' }, isDark: false }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'free' } }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ mode: 'Slide' }),
}));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
/** Каркас подменён: нас занимает, ЧТО экран кладёт в шапку, а не как шапка рисуется. */
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View, Text } = require('react-native');
  return { __esModule: true, default: ({ hud, children }: any) => React.createElement(View, null,
    (hud ?? []).map((п: any) => React.createElement(Text, { key: п.key }, `${п.key}=${п.value}`)), children) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

function весьТекст(узел: any): string {
  const куски: string[] = [];
  const обойти = (у: any) => {
    if (у == null) return;
    if (typeof у === 'string' || typeof у === 'number') { куски.push(String(у)); return; }
    if (Array.isArray(у)) { у.forEach(обойти); return; }
    if (у.children) обойти(у.children);
  };
  обойти(узел.toJSON());
  return куски.join(' ');
}

describe('лестница головоломки ждёт опись движков', () => {
  it('🔴 до загрузки описи экран НЕ показывает выдуманное «1/1»', async () => {
    let дерево: any;
    await TestRenderer.act(async () => { дерево = TestRenderer.create(React.createElement(PuzzlesScreen)); });
    const текст = весьТекст(дерево);
    expect(текст).toContain('level=—');
    expect(текст).not.toMatch(/level=\d+\/1\b/);
  });

  it('🔴 как опись пришла — в шапке настоящее число ступеней', async () => {
    let дерево: any;
    await TestRenderer.act(async () => { дерево = TestRenderer.create(React.createElement(PuzzlesScreen)); });
    await TestRenderer.act(async () => {
      отдатьОпись([{ индекс: 0, имя: 'Slide', умеетТекстом: false, решаем: false, ступени: [
        { индекс: 0, имя: '7x6, max 25 moves', параметры: '7x6m25' },
        { индекс: 1, имя: '7x6, no move limit', параметры: '7x6u' },
        { индекс: 2, имя: '8x6, no move limit', параметры: '8x6u' },
      ] }]);
      await mockОпись;
      await Promise.resolve();
    });
    expect(весьТекст(дерево)).toMatch(/level=\d+\/3/);
  });
});
