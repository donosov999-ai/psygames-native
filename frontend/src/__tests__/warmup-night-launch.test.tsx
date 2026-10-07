/* psygames-warmup-night-launch · VER 2 · 07.10.2026 */
/**
 * 🔴 КАРТОЧКА «НОЧНАЯ» РАЗВИЛКИ «РЕЛАКСАЦИЯ» ЗАПУСКАЕТ НОЧНОЙ НАБОР (решение Дениса 07.10.2026,
 * b271f702: ночной набор переезжает с Главной в развилку).
 *   · `/warmup-night` зовёт `startNight` ровно раз — с длиной, которую запомнил выбор зарядки;
 *   · незапомненная или чужая длина — 5 минут;
 *   · карточка открыта всем 13 профилям (набор по профилю не фильтруется нарочно).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockWarmup = { startNight: jest.fn() };
jest.mock('@/src/contexts/WarmupContext', () => ({ useWarmup: () => mockWarmup }));
jest.mock('@/src/contexts/ThemeContext', () => {
  const theme = { colors: { background: '#000', primary: '#a855f7' } };
  return { useTheme: () => theme };
});
const mockLang = { t: (k: string) => k };
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => mockLang }));

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
/* eslint-enable @typescript-eslint/no-require-imports */

const осесть = async () => {
  await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
};

async function запустить(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Screen = require('../../app/warmup-night').default;
  let r: any;
  await TestRenderer.act(async () => { r = TestRenderer.create(React.createElement(Screen)); });
  await осесть();
  await TestRenderer.act(async () => { r.update(React.createElement(Screen)); });
  await осесть();
  TestRenderer.act(() => r.unmount());
}

beforeEach(async () => { await AsyncStorage.clear(); mockWarmup.startNight.mockClear(); });

describe('/warmup-night', () => {
  it('🔴 запускает ночной набор один раз с запомненной длиной', async () => {
    await AsyncStorage.setItem('psygames_warmup_duration_night', '10');
    await запустить();
    expect(mockWarmup.startNight.mock.calls).toEqual([[10]]);
  });

  it('длины нет или она чужая — 5 минут', async () => {
    await AsyncStorage.setItem('psygames_warmup_duration_night', '7');
    await запустить();
    expect(mockWarmup.startNight.mock.calls).toEqual([[5]]);
  });

  it('🔴 карточка «Ночная» в «Релаксации» видна каждому профилю', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { visibleHubCards } = require('@/src/constants/hubContents');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PROFILES, filterAllowedGames } = require('@/src/constants/profiles');
    const без: string[] = [];
    for (const p of PROFILES) {
      const allowed = new Set<string>(filterAllowedGames(p).map((g: { route: string }) => g.route));
      const routes = visibleHubCards('/games/relaxation-hub', allowed, (k: string) => k).map((c: { route: string }) => c.route);
      if (!routes.includes('/warmup-night') || !routes.includes('/games/eye-gym')) без.push(p.id);
    }
    expect(`профили без «Ночной» или «Гимнастики для глаз»: ${без.join(', ') || 'нет'}`).toBe('профили без «Ночной» или «Гимнастики для глаз»: нет');
  });
});
