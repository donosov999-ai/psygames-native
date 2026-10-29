/* eslint-disable @typescript-eslint/no-require-imports -- модули берутся после подмен и сброса */
/**
 * 🔴 ПЕРЕКЛЮЧАТЕЛЬ ПОД ОБОЛОЧКОЙ РИСУЕТ FLUTTER, А РЕШАЕТ ЭТОТ ЖЕ КОМПОНЕНТ (задача 5b3513bd).
 *
 * `ProfileSwitcherModal` смонтирован на Главной; под оболочкой (`window.PsyBridge`,
 * `window.__psyHostScreens` с `#switcher`) он отдаёт модель листа и принимает действия:
 *   · без оболочки — ни модели, ни действий (браузер работает как раньше);
 *   · модель: все профили, активный отмечен, у каждого — то, что показывает веб-лист;
 *   · действие `switch` переключает профиль — модель отражает новый активный;
 *   · 🔴 сторож монетизации (d5e5814a, решение Дениса 21.10.2026): на ru и en, на iOS, Android и в
 *     браузере в модели нет замка, «Скоро», цены, «/год», кода, Telegram и «PRO». Слова сторожа —
 *     `flutter/test/fixtures/no_monetization_words.json`, их же читает проба Dart.
 */
declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  router: { push: () => {}, replace: () => {}, back: () => {} },
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function смонтировать(host: boolean, language = 'en', os?: string) {
  jest.resetModules();
  if (os) Object.defineProperty(require('react-native').Platform, 'OS', { value: os, configurable: true });
  const sent: any[] = [];
  const g = globalThis as any;
  if (host) {
    g.PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    g.__psyHostScreens = ['/', '#switcher'];
  }
  const хранилище = require('@react-native-async-storage/async-storage');
  await (хранилище.default ?? хранилище).clear();
  await (хранилище.default ?? хранилище).setItem('language', language);
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider, useLanguage } = require('@/src/contexts/LanguageContext');
  let languageContext: any;
  function LanguageProbe() { languageContext = useLanguage(); return null; }
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Modal = require('@/src/components/ProfileSwitcherModal').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
      React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
        React.createElement(LanguageProvider, null, React.createElement(LanguageProbe), React.createElement(Modal, { visible: false, onClose: () => {} }))))));
  });
  await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === '#switcher')?.model;
  return { r, sent, last, TestRenderer, setLanguage: (value: string) => languageContext.setLanguage(value) };
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

  it('🔴 модель: все профили, активный отмечен, у каждого имя и описание', async () => {
    const { last, r, TestRenderer } = await смонтировать(true);
    const m = last();
    expect(m).toBeTruthy();
    const { PROFILES } = require('@/src/constants/profiles');
    expect([...m.profiles.map((p: any) => p.id)].sort()).toEqual(PROFILES.map((p: any) => p.id).sort());
    expect(m.profiles.filter((p: any) => p.active).map((p: any) => p.id)).toEqual([m.activeId]);
    for (const p of m.profiles) expect([p.id, typeof p.name, typeof p.desc]).toEqual([p.id, 'string', 'string']);
    expect(Object.keys((globalThis as any).__psyScreenUi?.['#switcher'] ?? {})).toEqual(['switch']);
    await TestRenderer.act(async () => r.unmount());
  });

  it('🔴 switch переключает любой профиль; чужой id — ничего не меняет', async () => {
    const { last, r, TestRenderer } = await смонтировать(true);
    const другой = last().profiles.find((p: any) => !p.active);
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['#switcher'].switch(другой.id); });
    await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    expect(last().activeId).toBe(другой.id);
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['#switcher'].switch('no-such-profile'); });
    await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    expect(last().activeId).toBe(другой.id);
    await TestRenderer.act(async () => r.unmount());
  });

  it.each(['en', 'es', 'pt', 'hi', 'zh', 'de', 'fr', 'it', 'ja', 'ko', 'ar'])
   ('%s: весь лист — без русского текста', async (language) => {
      const { last, r, TestRenderer } = await смонтировать(true, language);
      const russian = strings(last()).filter(([, v]) => /[А-Яа-яЁё]/.test(v));
      expect(russian).toEqual([]);
      await TestRenderer.act(async () => r.unmount());
    });

  it.each(['ru', 'en'])('%s: в листе нет неподставленных шаблонов «{…}» (ODV999 «Все игры ({n})», 09c3ded8)', async (language) => {
    const { last, r, TestRenderer } = await смонтировать(true, language);
    expect(strings(last()).filter(([, v]) => v.includes('{'))).toEqual([]);
    await TestRenderer.act(async () => r.unmount());
  });

  describe('🔴 сторож монетизации (d5e5814a)', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/no_monetization_words.json');

    it('слова сторожа для пробы Dart — те же, что здесь', () => {
      const now = `${JSON.stringify({ patterns: NO_MONEY.map((r) => ({ source: r.source, caseSensitive: !r.flags.includes('i') })) }, null, 1)}\n`;
      if (process.env.WRITE === '1') fs.writeFileSync(file, now, 'utf8');
      const was = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/profile-switcher-host-model.test.tsx' })
        .toEqual({ fresh: true, regenerate: expect.any(String) });
    });

    it('сторож видит каждый признак продажи — проверка самого сторожа', () => {
      const samples = ['Reaction PRO', 'Скорочтение PRO', '990 ₽ / год', '$9.99/year', 'Скоро', 'Coming soon', 'Enter access code',
        'Ввести код доступа', 'Купить в Telegram', 'Годовой доступ'];
      expect(samples.filter((v) => sold({ profiles: [{ desc: v }] }).length === 0)).toEqual([]);
      expect(sold({ profiles: [{ badge: '🔒' }] }).length).toBe(1);
      // Обычные слова листа сторож не трогает: иначе он красный на ровном месте.
      expect(sold({ profiles: [{ name: 'Скорочтение', desc: 'Reaction · Students · Programs' }] })).toEqual([]);
    });

    for (const os of ['ios', 'android', 'web']) {
      for (const language of ['ru', 'en']) {
        it(`${os}/${language}: в листе нет замка, «Скоро», цены, «/год», кода, Telegram и «PRO»`, async () => {
          const { last, r, TestRenderer } = await смонтировать(true, language, os);
          expect(last().profiles.length).toBeGreaterThan(8);
          expect(sold(last())).toEqual([]);
          await TestRenderer.act(async () => r.unmount());
        });
      }
    }
  });

  it('образец модели для пробы Flutter совпадает с живым компонентом', async () => {
    const { last, r, TestRenderer } = await смонтировать(true);
    const fs = require('fs');
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/switcher_model.json');
    // Картинка в jest — путь файла ОТНОСИТЕЛЬНО папки проверки (`../../…/<папка>/frontend/assets/…`):
    // в образце он зависел бы от того, где лежит копия, и на CI образец «устаревал» бы сам. Приводим
    // к виду адреса сборки без хеша (`/assets/assets/…` — его отдаёт AssetServer по имени).
    const now = `${JSON.stringify(last(), null, 1)}\n`.replace(/"(?:\.\.\/)+(?:[^"]*?\/frontend\/)?(assets\/[^"]+)"/g, '"/assets/$1"');
    if (process.env.WRITE === '1') fs.writeFileSync(file, now, 'utf8');
    const was = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/profile-switcher-host-model.test.tsx' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
    await TestRenderer.act(async () => r.unmount());
  });
});

/** Все строки модели с путём — кроме адресов картинок и цветов: там слов человек не видит. */
function strings(value: any, at = 'switcher'): [string, string][] {
  if (typeof value === 'string') return /(^|\.)(badge|color|id|activeId)$/.test(at) ? [] : [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${at}.${k}`));
  return [];
}

/**
 * Признаки продажи в тексте листа. Список — из решения «убрать монетизацию»: замок, «Скоро», цена,
 * «в год», код доступа, покупка в Telegram, ярус «PRO». Значок 🔒 ищется и в адресах значков.
 */
const NO_MONEY: RegExp[] = [
  /🔒/u, /(?<!\p{L})(скоро|soon)(?!\p{L})/iu, /[₽$€₸]/u, /\d\s*(руб|rub|usd)/iu, /\/\s*(год|year|yr)(?!\p{L})/iu,
  /per year|в год|(?<!\p{L})annual|годов/iu, /(?<!\p{L})(код|code)/iu, /telegram|телеграм/iu, /(?<!\p{L})PRO(?!\p{L})/u,
];

function sold(model: any): string[] {
  const all = [...strings(model), ...JSON.stringify(model).includes('🔒') ? [['*', '🔒'] as [string, string]] : []];
  return [...new Set(all.flatMap(([at, v]) => NO_MONEY.filter((re) => re.test(v)).map((re) => `${at}: ${re.source} ← ${v}`)))];
}
