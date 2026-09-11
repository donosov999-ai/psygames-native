/* psygames-chess-pause-menu · VER 1 · 09.09.2026 */
/**
 * МЕНЮ ПАУЗЫ В ОБЕИХ ИГРАХ РАЗДЕЛА — ПРОВЕРЕНО НАЖАТИЕМ СТРЕЛКИ, А НЕ ЧТЕНИЕМ
 * ИСХОДНИКА.
 *
 * Каркас приехал в выпуске 2.52.2 и сторожится своей пробой
 * (`game-shell-pause-menu`). Сторожит он ИМЕННО КАРКАС: даёт игра список
 * `pauseActions` — стрелка открывает меню, не даёт — стрелка сразу спрашивает
 * про выход. Проводку каждой игры каркасная проба не видит вовсе.
 *
 * 🔴 ЗАМЕР 09.09.2026 ДО правки: `grep -rl pauseActions app/games/` → ОДИН файл
 * из 96 (судоку). У «Детского мата» и «Доски в уме» — ноль при четырёх живых
 * `<GameShell>`. То есть стрелка выкидывала из живой партии по одному касанию,
 * а часы при этом продолжали идти: ровно та беда, из-за которой меню и завели.
 *
 * ⚠️ ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ СТРОЧКА В СОСЕДНЕЙ ПРОБЕ. Обе мои экранные
 * пробы «Детского мата» (`chess-run-leads-to-next-level`, `chess-modes-one-list`)
 * ПОДМЕНЯЮТ `GameShell` заглушкой — там меню паузы нечему появиться, и проба
 * зеленела бы, ничего не проверив. Здесь каркас настоящий.
 *
 * ⚠️ И `gamePause` тоже настоящий: это общий счётчик задержек на всё приложение.
 * Оставленная задержка утекла бы в следующую пробу файла и остановила бы там
 * часы навсегда — поэтому каждая проба обязана дожать «Продолжить» и убедиться,
 * что счётчик отпущен.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isGameHeld } from '@/src/services/gamePause';

declare function require(m: string): any;

const TestRenderer = require('react-test-renderer');

jest.setTimeout(120000);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => '/games',
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
jest.mock('@/src/services/api', () => ({ saveSession: () => Promise.resolve() }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function осесть(кругов = 6, мс = 600) {
  for (let i = 0; i < кругов; i += 1) {
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(мс);
      for (let k = 0; k < 40; k += 1) await Promise.resolve();
    });
  }
}

async function монтировать(путь: string) {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require(путь).default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  await осесть();
  return r;
}

function текст(node: any): string {
  const out: string[] = [];
  const идти = (n: any) => {
    if (n == null || n === false) return;
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(идти); return; }
    if (n.props?.children) идти(n.props.children);
    if (n.children) идти(n.children);
  };
  идти(node);
  return out.join(' ').replace(/\s+/g, ' ');
}

function есть(r: any, метка: string): boolean {
  return r.root.findAll((n: any) => n.props?.testID === метка, { deep: false }).length > 0;
}

async function жать(r: any, метка: string) {
  const к = r.root.findAll(
    (n: any) => n.props?.testID === метка && typeof n.props?.onPress === 'function',
    { deep: false },
  )[0];
  if (!к) throw new Error(`кнопки «${метка}» на экране нет`);
  await TestRenderer.act(async () => { к.props.onPress(); });
  await осесть(2);
}

/** Нажать первое, что похоже на «начать партию», и дать экрану осесть. */
async function начатьПартию(r: any) {
  for (let шаг = 0; шаг < 8; шаг += 1) {
    if (есть(r, 'game-back')) return true;
    const кнопки = r.root.findAll((n: any) =>
      typeof n.props?.onPress === 'function' && !n.props?.disabled
      && /(начать|start|играть|play|уровень\s*\d|level\s*\d)/i.test(текст(n)));
    if (кнопки.length === 0) { await осесть(3); continue; }
    await TestRenderer.act(async () => { кнопки[0].props.onPress(); });
    await осесть(6);
  }
  return есть(r, 'game-back');
}

/**
 * Одно и то же требование к обеим играм: стрелка не выкидывает, а открывает меню;
 * в меню есть «Продолжить», «Заново» и уход; «Продолжить» отпускает часы.
 */
async function проверитьМеню(r: any, ожидаемые: string[]) {
  expect(`меню до нажатия стрелки: ${есть(r, 'game-pause-menu')}`)
    .toBe('меню до нажатия стрелки: false');
  expect(`часы держат до нажатия: ${isGameHeld()}`).toBe('часы держат до нажатия: false');

  await жать(r, 'game-back');

  expect(`меню после стрелки: ${есть(r, 'game-pause-menu')}`).toBe('меню после стрелки: true');
  expect(`часы держат на паузе: ${isGameHeld()}`).toBe('часы держат на паузе: true');
  const пункты = ожидаемые.map((id) => `${id}:${есть(r, `pause-action:${id}`)}`).join(' ');
  expect(пункты).toBe(ожидаемые.map((id) => `${id}:true`).join(' '));

  await жать(r, 'pause-action:resume');
  expect(`меню после «Продолжить»: ${есть(r, 'game-pause-menu')}`)
    .toBe('меню после «Продолжить»: false');
  expect(`часы отпущены: ${isGameHeld()}`).toBe('часы отпущены: false');
}

describe('меню паузы проведено в обе игры раздела «Шахматы»', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 «Детский мат»: стрелка в живой партии открывает меню, а не выкидывает', async () => {
    const r = await монтировать('@/app/games/scholars-mate');
    try {
      expect(`партия началась: ${await начатьПартию(r)}`).toBe('партия началась: true');
      await проверитьМеню(r, ['resume', 'restart', 'home']);
    } finally { await TestRenderer.act(async () => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('🔴 «Доска в уме»: то же на экране головоломки', async () => {
    const r = await монтировать('@/app/games/chess-blind');
    try {
      expect(`партия началась: ${await начатьПартию(r)}`).toBe('партия началась: true');
      await проверитьМеню(r, ['resume', 'restart', 'home']);
    } finally { await TestRenderer.act(async () => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });
});
