/* eslint-disable @typescript-eslint/no-require-imports -- компонент и контексты после jest.mock */
/* psygames-pet-sits-by-default · VER 1 · 07.10.2026 */
/**
 * 🔴 ПИТОМЕЦ ПО УМОЛЧАНИЮ НЕ ГУЛЯЕТ, НО ЖИВЁТ (задача ed85e191, решение Дениса 07.10.2026: «питомец
 * перекрывает «Сегодня»» → «по умолчанию сидит на месте»).
 *
 * Первая правка (#251) прятала питомца целиком — вместе с прогулкой пропадали встреча и мелочи
 * безделья, и координатор снял её с выпуска (6 из 10 проб питомца красные). «Сидит» ≠ «молчит»:
 *   · питомец включён (`psygames_pet_on` по-прежнему по умолчанию «да»);
 *   · гулять — отдельный тумблер `psygames_pet_walk`, по умолчанию «нет»;
 *   · не гуляя, питомец делает всё, кроме переходов: покой, мелочи безделья, дрёма;
 *   · включили прогулку на лету (событие настроек) — пошёл, без перезахода.
 * Оболочке ответ `config` несёт `walks` — нативный гуляка сидит по тому же правилу.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TestRenderer = require('react-test-renderer');

/** Что PetSprite просили нарисовать за время прогона. */
const показано: string[] = [];

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  router: { push: () => {}, canGoBack: () => false, back: () => {}, replace: () => {} },
}));

jest.mock('@/src/components/pet/PetSprite', () => {
  const настоящий = jest.requireActual('@/src/components/pet/PetSprite');
  return {
    __esModule: true,
    ...настоящий,
    default: ({ state }: { state: string }) => {
      показано.push(state);
      return null;
    },
  };
});

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function смонтировать() {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const WalkingPet = require('@/src/components/pet/WalkingPet').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(WalkingPet))))),
    );
  });
  return r;
}

/**
 * Сколько ПЕРЕХОДОВ начал питомец. ⚠️ По кадру «walk» не понять: в jest анимация прохода
 * завершается в том же такте, и React показывает сразу покой (замер 07.10: у кода из main за минуту
 * прогулки кадр «walk» не появился ни разу). Переход — это `Animated.timing` позиции длительностью
 * от 900 мс; разворот (260 мс) и подъём над полосой (220 мс) короче.
 */
const переходы: number[] = [];
async function идти(секунд: number) {
  for (let i = 0; i < секунд; i++) {
    await TestRenderer.act(async () => { jest.advanceTimersByTime(1000); });
  }
}

function повторимыйСлучай() {
  let x = 123456789;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe('питомец по умолчанию сидит на месте, но живёт', () => {
  let настоящийRandom: () => number;
  beforeEach(async () => {
    await AsyncStorage.clear();
    показано.length = 0;
    переходы.length = 0;
    const { Animated } = require('react-native');
    const настоящий = Animated.timing;
    jest.spyOn(Animated, 'timing').mockImplementation((v: any, cfg: any) => {
      if (cfg && typeof cfg.duration === 'number' && cfg.duration >= 900) переходы.push(cfg.toValue);
      return настоящий(v, cfg);
    });
    jest.useFakeTimers();
    настоящийRandom = Math.random;
    Math.random = повторимыйСлучай();
  });
  afterEach(() => { jest.useRealTimers(); Math.random = настоящийRandom; jest.restoreAllMocks(); });

  it('🔴 умолчания: питомец включён, гулять — нет; тумблер прогулки хранится отдельно', async () => {
    const { getPetVisible, getPetWalks, setPetWalks } = require('@/src/services/pet');
    expect(await getPetVisible()).toBe(true);
    expect(await getPetWalks()).toBe(false);
    await setPetWalks(true);
    expect(await getPetWalks()).toBe(true);
    expect(await getPetVisible()).toBe(true);
  });

  it('🔴 ответ оболочке `config` несёт walks — нативный гуляка сидит по тому же правилу', async () => {
    const { petHostAnswer } = require('@/src/components/pet/WalkingPet');
    const по_умолчанию = (await petHostAnswer('config')) as any;
    expect({ visible: по_умолчанию.visible, walks: по_умолчанию.walks }).toEqual({ visible: true, walks: false });
    await AsyncStorage.setItem('psygames_pet_walk', '1');
    expect(((await petHostAnswer('config')) as any).walks).toBe(true);
  });

  it('🔴 не гуляя, за две минуты делает мелочи безделья и ни разу не идёт', async () => {
    const { PET_FIDGETS } = require('@/src/components/pet/PetSprite');
    const r = await смонтировать();
    await идти(120);
    await TestRenderer.act(async () => { r.unmount(); });
    expect(показано.length).toBeGreaterThan(0);
    expect(показано.filter((s) => PET_FIDGETS.includes(s)).length).toBeGreaterThan(0);
    expect(показано).not.toContain('walk');
    expect(переходы).toEqual([]);
  });

  it('🔴 место — у правого края полосы, а не у кнопки отзыва слева', () => {
    const { petSeatX } = require('@/src/components/pet/WalkingPet');
    expect(petSeatX(390, 56)).toBeCloseTo(390 * 0.9 - 56);
    // Узкий экран: место не уезжает левее полосы прогулки.
    expect(petSeatX(120, 56)).toBeCloseTo(120 * 0.1 + 40);
  });

  it('прогулка включена — идёт, как раньше', async () => {
    await AsyncStorage.setItem('psygames_pet_walk', '1');
    const r = await смонтировать();
    await идти(60);
    await TestRenderer.act(async () => { r.unmount(); });
    expect(переходы.length).toBeGreaterThan(0);
  });

  it('🔴 тумблер настроек на лету: включили — пошёл без перезахода', async () => {
    const { DeviceEventEmitter } = require('react-native');
    const { PET_WALK_EVENT } = require('@/src/services/pet');
    const r = await смонтировать();
    await идти(30);
    expect(переходы).toEqual([]);
    await TestRenderer.act(async () => { DeviceEventEmitter.emit(PET_WALK_EVENT, true); });
    await идти(30);
    await TestRenderer.act(async () => { r.unmount(); });
    expect(переходы.length).toBeGreaterThan(0);
  });
});
