/* psygames-shop-host-model · VER 1 · 07.10.2026 */
/**
 * 🔴 «МАГАЗИН» ПОД ОБОЛОЧКОЙ ОТДАЁТ МОДЕЛЬ — ТО ЖЕ, ЧТО РИСУЕТ САМ (задача 9424da3a; приём —
 * `services/hostScreens.ts`).
 *
 * Экран монтируется целиком на настоящих провайдерах и настоящем хранилище; оболочка подменена.
 *   Состав: все способности, все косметические разделы, свой арт профиля не продаётся.
 *   Кнопки: доступность — решениями экрана (`abilityButtons`, `cosmeticRow`), а не заново.
 *   Действия: купить способность / товар, надеть, ставка, вкладка — те же функции экрана, баланс
 *   и отчёт о трате меняются в модели.
 * Образец модели — для проб Flutter (`flutter/test/fixtures/shop_model.json`).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const router = { canGoBack: () => true, back: () => {}, replace: () => {}, push: () => {} };
  const nav = { addListener: () => () => {}, setOptions: () => {} };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/shop',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    useNavigation: () => nav,
    Redirect: () => null,
    Stack: { Screen: () => null },
    router,
  };
});
// Плагин reanimated в babel принимает `c.value` в стиле (цвет товара) за общее значение анимации и
// вставляет предупреждение с ленивым require пакета; в jest нет его нативной части — нужна одна функция.
jest.mock('react-native-reanimated', () => ({ getUseOfValueInStyleWarning: () => '' }));
const mockBack = jest.fn();
jest.mock('@/src/utils/nav', () => ({ ...jest.requireActual('@/src/utils/nav'), goBackOrHome: () => mockBack() }));
jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');   // eslint-disable-line @typescript-eslint/no-require-imports
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: RN.View,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext: { Consumer: ({ children }: any) => children(insets) },
    initialWindowMetrics: { insets, frame },
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { ABILITIES } = require('@/src/services/abilities');
const { COSMETICS, unlockCosmetic, equipCosmetic, getUnlocked, getEquipped } = require('@/src/services/cosmetics');
const { addTokens, getTokens } = require('@/src/services/tokens');
const { abilityButtons } = require('../../app/shop');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROUTE = '/shop';
const PID = 'nzt48';

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  jest.clearAllMocks();
});

const осесть = async () => {
  await TestRenderer.act(async () => {
    for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
  });
};

async function смонтировать(host = true) {
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', ROUTE];
  }
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = require('../../app/shop').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen)))));
  });
  await осесть();
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === ROUTE)?.model;
  const act = async (name: string, ...args: any[]) => {
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi[ROUTE][name](...args); });
    await осесть();
  };
  return { sent, last, act };
}

function образец(name: string, m: object) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const file = path.resolve(__dirname, `../../../flutter/test/fixtures/${name}`);
  // Пути картинок в jest — относительные пути файловой системы (`../../…/frontend/assets/…`). В образец
  // (публичный репозиторий) они уходят адресом сборки `/assets/…`, без локальной части.
  const json = JSON.stringify(m, null, 1).replace(/"(?:\.\.\/)+[^"]*?\/frontend\/(assets\/[^"]+)"/g, '"/assets/$1"');
  if (process.env.WRITE === '1') fs.writeFileSync(file, `${json}\n`, 'utf8');
  expect(fs.existsSync(file)).toBe(true);
}

const items = (m: any) => m.sections.flatMap((s: any) => s.items);
const акцент = () => COSMETICS.find((c: any) => c.type === 'accent');

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', PID);
  await AsyncStorage.setItem('language', 'ru');
  await addTokens(PID, 350);
  // Купленный и надетый акцент — чтобы в образце была строка «надето» в рамке.
  await unlockCosmetic(PID, акцент().id);
  await equipCosmetic(PID, 'accent', акцент().id);
});

describe('«Магазин» под оболочкой', () => {
  it('без оболочки модели нет', async () => {
    const { sent } = await смонтировать(false);
    expect(sent).toEqual([]);
  });

  it('🔴 все способности и разделы; свой арт профиля не продаётся; кнопки — решениями экрана', async () => {
    // Образец обязан нести все три вида строки: надето, по карману, дорого (цены косметики 750…15000).
    await addTokens(PID, 700);
    const { last } = await смонтировать();
    const m = last();
    const b0 = await getTokens(PID);
    expect(m.balance).toBe(String(b0));
    expect(m.cats.length).toBe(12);
    expect(m.cats.filter((c: any) => c.on).map((c: any) => c.id)).toEqual([null]);
    expect(m.abilities.rows.map((a: any) => a.id)).toEqual(ABILITIES.map((a: any) => a.id));
    for (const a of ABILITIES) {
      const row = m.abilities.rows.find((r: any) => r.id === a.id);
      const st = abilityButtons({ have: 0, max: a.max, cost: a.cost, balance: b0, usable: a.id === 'streak_shield' });
      expect(row.buy.enabled).toBe(st.buy === 'buy');
      expect(row.use === null).toBe(st.use === null);
    }
    expect(m.sections.length).toBe(10);
    const все = items(m);
    expect(все.some((i: any) => i.id === акцент().id && i.owned && i.on)).toBe(true);
    const свой = COSMETICS.filter((c: any) => ['theme', 'background', 'badge'].includes(c.type) && c.value === PID).map((c: any) => c.id);
    expect(свой.length).toBeGreaterThan(0);
    expect(все.filter((i: any) => свой.includes(i.id))).toEqual([]);
    for (const i of все.filter((x: any) => !x.owned)) {
      const c = COSMETICS.find((x: any) => x.id === i.id);
      expect(i.btn.enabled).toBe(b0 >= c.cost);
    }
    expect([все.some((i: any) => !i.owned && i.btn.enabled), все.some((i: any) => !i.owned && !i.btn.enabled)]).toEqual([true, true]);
    // Картинки — адресами сборки, не пустые.
    expect(все.filter((i: any) => i.swatch.kind === 'image').every((i: any) => typeof i.swatch.uri === 'string' && i.swatch.uri.length > 0)).toBe(true);
    образец('shop_model.json', m);
  });

  it('🔴 купить способность — баланс и отчёт в модели; недоступную веб не продаёт', async () => {
    const { last, act } = await смонтировать();
    const b0 = Number(last().balance);
    const дешёвая = ABILITIES.filter((a: any) => a.cost <= b0).sort((a: any, b: any) => a.cost - b.cost)[0];
    await act('buyAbility', дешёвая.id);
    expect(last().balance).toBe(String(b0 - дешёвая.cost));
    expect(last().note).toContain(String(дешёвая.cost));
    expect(last().abilities.rows.find((r: any) => r.id === дешёвая.id).price).toContain('1');
    const before = last().balance;
    await act('buyAbility', 'нет_такой');
    expect(last().balance).toBe(before);
  });

  it('🔴 двойное нажатие «Купить» списывает один раз (9424da3a)', async () => {
    await addTokens(PID, 5000);   // хватает на два списания — второе отбивает только замок
    const { last } = await смонтировать();
    const b0 = Number(last().balance);
    // Хватает на ДВЕ штуки — иначе второе нажатие отбил бы баланс, и проба зеленела бы вслепую.
    const дешёвая = ABILITIES.filter((a: any) => a.cost * 2 <= b0 && a.max >= 2).sort((a: any, b: any) => a.cost - b.cost)[0];
    expect(дешёвая).toBeDefined();
    // Оба нажатия — в одном такте, как два действия оболочки подряд.
    await TestRenderer.act(async () => {
      const ui = (globalThis as any).__psyScreenUi[ROUTE];
      ui.buyAbility(дешёвая.id);
      ui.buyAbility(дешёвая.id);
    });
    await осесть();
    expect(await getTokens(PID)).toBe(b0 - дешёвая.cost);
    expect(last().balance).toBe(String(b0 - дешёвая.cost));
    const b1 = b0 - дешёвая.cost;
    const товар = items(last()).find((i: any) => !i.owned && COSMETICS.find((x: any) => x.id === i.id).cost * 2 <= b1);
    expect(товар).toBeDefined();
    const c = COSMETICS.find((x: any) => x.id === товар.id);
    const до = await getTokens(PID);
    await TestRenderer.act(async () => {
      const ui = (globalThis as any).__psyScreenUi[ROUTE];
      ui.buy(товар.id);
      ui.buy(товар.id);
    });
    await осесть();
    expect(await getTokens(PID)).toBe(до - c.cost);
  });

  it('🔴 купить товар и надеть/снять — те же функции экрана', async () => {
    const { last, act } = await смонтировать();
    const b0 = Number(last().balance);
    const товар = items(last()).find((i: any) => !i.owned && i.btn.enabled);
    const c = COSMETICS.find((x: any) => x.id === товар.id);
    await act('buy', товар.id);
    expect(await getUnlocked(PID)).toContain(товар.id);
    expect(last().balance).toBe(String(b0 - c.cost));
    expect(items(last()).find((i: any) => i.id === товар.id).owned).toBe(true);
    // Снять надетый акцент.
    await act('toggle', акцент().id);
    expect((await getEquipped(PID)).accent).toBeUndefined();
    expect(items(last()).find((i: any) => i.id === акцент().id).on).toBe(false);
  });

  it('🔴 вкладка раздела: только аватары, способностей нет; «все» — назад; чужая вкладка — мимо', async () => {
    const { last, act } = await смонтировать();
    await act('cat', 'avatar');
    expect(last().abilities).toBe(null);
    expect(last().sections.map((s: any) => s.type)).toEqual(['avatar']);
    expect(last().sections[0].first).toBe(true);
    await act('cat', 'нет_такой');
    expect(last().sections.map((s: any) => s.type)).toEqual(['avatar']);
    await act('cat', null);
    expect(last().sections.length).toBe(10);
  });

  it('ставка: −стоимость, карточка активна с точками дней; «назад» — goBackOrHome', async () => {
    const { last, act } = await смонтировать();
    expect(last().abilities.wager.active).toBe(false);
    await act('wager');
    expect(last().abilities.wager.active).toBe(true);
    expect(last().abilities.wager.dots).toMatch(/^[●○]+$/);
    await act('back');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
