/* eslint-disable @typescript-eslint/no-require-imports -- модули берутся после подмен и сброса */
/**
 * 🔴 ПЕРЕКЛЮЧАТЕЛЬ ПОД ОБОЛОЧКОЙ РИСУЕТ FLUTTER, А РЕШАЕТ ЭТОТ ЖЕ КОМПОНЕНТ (задача 5b3513bd).
 *
 * `ProfileSwitcherModal` смонтирован на Главной; под оболочкой (`window.PsyBridge`,
 * `window.__psyHostScreens` с `#switcher`) он отдаёт модель листа и принимает действия:
 *   · без оболочки — ни модели, ни действий (браузер работает как раньше);
 *   · модель: только переключаемые профили (без «владельца»), активный отмечен, закрытые — замком,
 *     у каждого — карточка с тем, что показывает веб-лист;
 *   · действие `switch` переключает профиль — модель отражает новый активный;
 *   · `switch` на закрытый профиль не открывает его (доступ решает веб, а не нажатие) — ⚠️ на 07.10.2026
 *     закрытых профилей нет (бесплатно всё), ветка исполнится, когда они появятся;
 *   · неверный код — ошибка в модели, без закрытия окна.
 */
declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  router: { push: () => {}, replace: () => {}, back: () => {} },
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function смонтировать(host: boolean) {
  jest.resetModules();
  const sent: any[] = [];
  const g = globalThis as any;
  if (host) {
    g.PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    g.__psyHostScreens = ['/', '#switcher'];
  }
  const хранилище = require('@react-native-async-storage/async-storage');
  await (хранилище.default ?? хранилище).clear();
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Modal = require('@/src/components/ProfileSwitcherModal').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
      React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
        React.createElement(LanguageProvider, null, React.createElement(Modal, { visible: false, onClose: () => {} }))))));
  });
  await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === '#switcher')?.model;
  return { r, sent, last, TestRenderer };
}

afterEach(() => {
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
});

describe('переключатель профилей под оболочкой', () => {
  it('без оболочки — ни модели, ни действий', async () => {
    const { sent, r, TestRenderer } = await смонтировать(false);
    expect(sent).toEqual([]);
    expect((globalThis as any).__psyScreenUi).toBeUndefined();
    await TestRenderer.act(async () => r.unmount());
  });

  it('🔴 модель: переключаемые профили, активный отмечен, у каждого карточка', async () => {
    const { last, r, TestRenderer } = await смонтировать(true);
    const m = last();
    expect(m).toBeTruthy();
    const { PROFILES, isSwitchable } = require('@/src/constants/profiles');
    const ids = Object.values(PROFILES as Record<string, any>).filter(isSwitchable).map((p: any) => p.id).sort();
    expect([...m.profiles.map((p: any) => p.id)].sort()).toEqual(ids);
    expect(m.profiles.filter((p: any) => p.active).map((p: any) => p.id)).toEqual([m.activeId]);
    for (const p of m.profiles) expect([p.id, typeof m.details[p.id]?.name]).toEqual([p.id, 'string']);
    expect(typeof (globalThis as any).__psyScreenUi?.['#switcher']?.switch).toBe('function');
    await TestRenderer.act(async () => r.unmount());
  });

  it('🔴 switch переключает открытый профиль (закрытый — не открывает, если такие есть)', async () => {
    const { last, r, TestRenderer } = await смонтировать(true);
    const m = last();
    const открытый = m.profiles.find((p: any) => !p.locked && !p.active);
    const закрытый = m.profiles.find((p: any) => p.locked);
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['#switcher'].switch(открытый.id); });
    await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    expect(last().activeId).toBe(открытый.id);
    if (закрытый) {
      await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['#switcher'].switch(закрытый.id); });
      await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
      expect(last().activeId).toBe(открытый.id);
    }
    await TestRenderer.act(async () => r.unmount());
  });

  it('образец модели для пробы Flutter совпадает с живым компонентом', async () => {
    const { last, r, TestRenderer } = await смонтировать(true);
    const fs = require('fs');
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/switcher_model.json');
    const now = `${JSON.stringify(last(), null, 1)}\n`;
    if (process.env.WRITE === '1') fs.writeFileSync(file, now, 'utf8');
    const was = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/profile-switcher-host-model.test.tsx' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
    await TestRenderer.act(async () => r.unmount());
  });

  it('неверный код — ошибка в модели', async () => {
    const { last, r, TestRenderer } = await смонтировать(true);
    const before = last().code.redeemed;
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['#switcher'].redeem('NOT-A-CODE'); });
    await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 10)); });
    expect(typeof last().code.error).toBe('string');
    expect(last().code.redeemed).toBe(before);
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['#switcher'].clearError(); });
    expect(last().code.error).toBeNull();
    await TestRenderer.act(async () => r.unmount());
  });
});
