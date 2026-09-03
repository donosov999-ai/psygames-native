/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import renderer from 'react-test-renderer';
import { setGameMood, gameMoodNow } from '@/src/services/petMood';

jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { text: '#000', textSecondary: '#888', surface: '#fff', border: '#ccc', background: '#fff' } }),
}));
// Ввозится ПОСЛЕ подмены темы — иначе значок потянет настоящий контекст.
const HudBadge = require('@/src/components/juice/HudBadge').default;

declare const __dirname: string;

/**
 * 🔴 ПИТОМЕЦ НЕ КОЧУЕТ ПО ЭКРАНАМ (жалоба Дениса 03.09.2026: «он переезжает у нас
 * туда во всех местах… и в выборе настроек, и в самой игре»).
 *
 * Он сидел в плашке счётчиков — а плашки нет на экранах настройки, и она сама
 * перестраивается по ходу партии: счётчики переносятся на второй ряд, и питомец
 * уезжает по высоте. Теперь его дом один — рядом с кнопкой справки, которая
 * плавающая и одинакова на каждом экране.
 *
 * ⚠️ ВТОРАЯ ПОЛОВИНА ПРОБЫ ВАЖНЕЕ ПЕРВОЙ. Переезд легко сделать тихой потерей:
 * питомец отвечал на ход (верно — прыжок, ошибка — сон), а в новом месте пропа нет.
 * Поэтому проверяется, что канал настроения жив и что каркас в него ПИШЕТ.
 */
function читать(rel: string): string {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
}

beforeAll(() => {
  // react-test-renderer 19 при ошибке рендера зовёт window.dispatchEvent, а в среде
  // jest-expo его нет — без заглушки настоящая ошибка подменяется чужой.
  const g = globalThis as unknown as { window?: { dispatchEvent?: () => void } };
  g.window = g.window ?? {};
  if (!g.window.dispatchEvent) g.window.dispatchEvent = () => {};
});

describe('питомец живёт у справки', () => {
  it('🔴 питомца рисует оверлей справки, а не плашка счётчиков', () => {
    expect(читать('src/components/GameHelpOverlay.tsx')).toContain('<GamePet');
    // В каркасе его больше нет: два питомца на экране — это «он переезжает» наоборот.
    expect(читать('src/components/GameShell.tsx')).not.toContain('<GamePet');
  });

  it('🔴 ответ на ход НЕ потерян: каркас пишет настроение, оверлей читает', () => {
    expect(читать('src/components/GameShell.tsx')).toContain('setGameMood(');
    expect(читать('src/components/GameHelpOverlay.tsx')).toContain('useGameMood()');
  });

  it('канал настроения работает и возвращается в покой', () => {
    setGameMood('good');
    expect(gameMoodNow()).toBe('good');
    setGameMood(undefined);
    expect(gameMoodNow()).toBe('idle');
  });

  it('🔴 значок со значком не пишет слово — только число', () => {
    /**
     * Просьба Дениса: «слово «серия» тоже не пиши, в тулбаре только значок».
     * Проверяется НАРИСОВАННЫЙ текст, а не исходник: слово остаётся в подписи для
     * скринридера, и проверка по дереву целиком зеленела бы на ней.
     */
    let r: any;
    renderer.act(() => { r = renderer.create(React.createElement(HudBadge, { icon: 'flame', label: 'Серия', value: 4 })); });
    const видно: string[] = [];
    const walk = (n: any) => {
      if (n == null) return;
      if (typeof n === 'string') { видно.push(n); return; }
      if (Array.isArray(n)) { n.forEach(walk); return; }
      walk(n.children);
    };
    walk(r.toJSON());
    expect(видно.join('|')).toBe('4');
    renderer.act(() => { r.unmount(); });
  });
});
