/**
 * 🔴 ПРАВИЛО УРОВНЯ ОБЯЗАНО ПРИХОДИТЬ ДО ПОКАЗА, А НЕ ПОСЛЕ.
 *
 * ОТЧЁТ: app_feedback 7d506dbe, 08.09.2026, «Релакс»: «Для запоминания слишком мало
 * времени». Задача 0d6d8b28.
 *
 * ЧТО БЫЛО. Карточка правила уровня включалась при `!previewActive`, то есть ПОСЛЕ
 * фото-показа. Кадр живой сборки 390×844, L14: карты уже закрыты, секундомер 2 с,
 * поверх — «Четвёрки: совпадение — это ЧЕТЫРЕ одинаковые». На уровнях, где правило
 * меняется (тройки L10, четвёрки L13), человек проходил показ, НЕ ЗНАЯ, что
 * запоминать, а правило читал при закрытых картах и под секундомером, который
 * входит в счёт.
 *
 * ЧТО ЗДЕСЬ СТОРОЖИТСЯ, ПОВЕДЕНИЕМ НАСТОЯЩЕГО ЭКРАНА:
 *   1. пока карточка правила открыта — ни одна карта не открыта и секундомер стоит;
 *   2. после «Понятно» показ идёт ЦЕЛИКОМ заново — все карты лицом вверх;
 *   3. после показа карты закрываются, и секундомер стартует с нуля.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

jest.setTimeout(90000);

// ── Подстановки внешнего мира ────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async () => ({ ok: true }),
}));
/**
 * ⚠️ УРОВЕНЬ ПОДСТАВЛЕН, А НЕ ЗАПИСАН В ХРАНИЛИЩЕ. Ключ уровня собирается из id
 * профиля, а какой профиль поднимет провайдер в пробе, заранее не известно —
 * запись по угаданному ключу молча дала бы L1, где правила нет, и проба
 * зеленела бы, ничего не проверив. L13 — первый уровень «четвёрок».
 */
jest.mock('@/src/hooks/usePersistentLevel', () => ({
  ...jest.requireActual('@/src/hooks/usePersistentLevel'),
  usePersistentLevel: () => ({ level: 13, best: 13, loaded: true, reach: () => false, fail: () => false, pick: () => {} }),
}));

function mount() {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/picture-pairs').default;
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: metrics },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(WarmupProvider, null, React.createElement(Screen)))))));
  });
  return r;
}

const settle = async () => {
  await TestRenderer.act(async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); });
};
const tick = async (ms: number) => {
  await TestRenderer.act(async () => {
    for (let left = ms; left > 0; left -= 50) {
      jest.advanceTimersByTime(Math.min(50, left));
      await Promise.resolve(); await Promise.resolve();
    }
  });
};
/** Карты — по пропам FlipCard: у каждой есть булевы flipped и matched. */
const карты = (r: any) => r.root.findAll((n: any) => typeof n.props?.flipped === 'boolean' && typeof n.props?.matched === 'boolean' && typeof n.props?.onPress === 'function');
const открыто = (r: any) => карты(r).filter((n: any) => n.props.flipped).length;
/** Секундомер — бейдж со значком часов; его значение и есть «сколько идёт партия». */
const секундомер = (r: any) => String(r.root.findAll((n: any) => n.props?.icon === 'time' && n.props?.value !== undefined)[0]?.props.value ?? '');
const цифрыСекундомера = (r: any) => Number((секундомер(r).match(/\d+(\.\d+)?/) || ['NaN'])[0]);
const правилоОткрыто = (r: any) => r.root.findAll((n: any) => n.props?.lr?.open === true).length > 0;

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
});
afterEach(() => { jest.useRealTimers(); });

describe('picture-pairs: правило уровня приходит до показа', () => {
  it('🔴 пока карточка правила открыта — карты закрыты и секундомер стоит; после «Понятно» показ заново, потом часы с нуля', async () => {
    const r = mount();
    try {
      await settle();
      const старт = r.root.findAll((n: any) => typeof n.props?.onStart === 'function')[0];
      expect(`кнопка старта найдена: ${!!старт}`).toBe('кнопка старта найдена: true');
      await TestRenderer.act(async () => { старт.props.onStart(); });
      await settle();
      await tick(50);

      const всего = карты(r).length;
      expect(`карт на поле L13: ${всего > 0}`).toBe('карт на поле L13: true');
      expect(`карточка правила открыта: ${правилоОткрыто(r)}`).toBe('карточка правила открыта: true');

      // 1. под карточкой правила — ни показа, ни часов. Смотрим СРАЗУ: показ на L13
      //    длится 280 мс, и через полторы секунды он кончился бы сам — открытые под
      //    правилом карты к тому моменту уже закрылись бы и проба их не увидела.
      expect(`открытых карт сразу под правилом: ${открыто(r)}`).toBe('открытых карт сразу под правилом: 0');
      await tick(1500);
      expect(`открытых карт под правилом: ${открыто(r)}`).toBe('открытых карт под правилом: 0');
      expect(`секундомер под правилом: ${цифрыСекундомера(r)}`).toBe('секундомер под правилом: 0');

      // 2. «Понятно» → показ целиком заново
      const lr = r.root.findAll((n: any) => n.props?.lr?.open === true)[0].props.lr;
      await TestRenderer.act(async () => { lr.setOpen(false); });
      await settle();
      await tick(50);
      expect(`после «Понятно» открыто карт: ${открыто(r)} из ${всего}`).toBe(`после «Понятно» открыто карт: ${всего} из ${всего}`);

      // 3. показ кончился → карты закрыты, часы пошли с нуля
      await tick(600);
      expect(`после показа открыто карт: ${открыто(r)}`).toBe('после показа открыто карт: 0');
      await tick(1200);
      const с = цифрыСекундомера(r);
      expect(`секундомер пошёл с нуля: ${с >= 1 && с < 3}`).toBe('секундомер пошёл с нуля: true');
    } finally {
      TestRenderer.act(() => r.unmount());
    }
  });
});
