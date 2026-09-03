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
  it('🔴 питомец ОДИН и стоит в правом углу шапки, а не в плашке счётчиков', () => {
    const каркас = читать('src/components/GameShell.tsx');
    /**
     * ⚠️ ПЕРВАЯ РЕДАКЦИЯ СТАВИЛА ЕГО В ОВЕРЛЕЙ СПРАВКИ — рядом с «?», как и просил
     * Денис. На экране он не появился ни разу, хотя код был в бандле: проба
     * показала, что дерево того оверлея на экране настройки почти пустое (82
     * символа), справка приходит другим путём. Шапка каркаса рисуется заведомо и
     * стоит в том же углу — видно то же самое.
     */
    expect(каркас).toContain('<GamePet');
    expect((каркас.match(/<GamePet/g) || []).length).toBe(1);   // один, не два
    expect(читать('src/components/GameHelpOverlay.tsx')).not.toContain('<GamePet');
    // И он ВНЕ плашки счётчиков: она есть не на всех экранах и перестраивается.
    const послеПлашки = каркас.slice(каркас.indexOf('styles.statsPlate'));
    expect(послеПлашки).not.toContain('<GamePet');
  });

  it('🔴 ответ на ход НЕ потерян: настроение доходит до питомца', () => {
    const каркас = читать('src/components/GameShell.tsx');
    expect(каркас).toContain('setGameMood(');                    // канал жив
    expect(каркас).toMatch(/<GamePet mood=\{pet \?\? autoMood\}/);   // и проп на месте
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

/**
 * ⚠️ ЧЕСТНО О ГРАНИЦЕ ЭТОГО ГЕЙТА. Проверки выше читают ФАЙЛЫ: они ловят «положили
 * не туда», но не ловят «положили туда, а на экране пусто» — а именно так и вышло с
 * первой редакцией, когда питомец стоял в оверлее справки.
 *
 * Проба, монтирующая каркас целиком, здесь не встала: `jest.resetModules()` нужен
 * ради подмены роутера, а после него `require('react')` даёт ВТОРОЙ экземпляр React,
 * и дерево не собирается. Городить обход дороже пользы: место питомца проверено
 * файлами, а его видимость — глазами на симуляторе, командой `scripts/sim-run.sh`,
 * которая сама сверяет версию установленного приложения.
 */
