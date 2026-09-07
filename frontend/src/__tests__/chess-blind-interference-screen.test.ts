/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 🔴 ПОМЕХА ДОХОДИТ ДО ЭКРАНА, А НЕ ТОЛЬКО ДО ЛЕСТНИЦЫ.
 *
 * Числа в `core/interference.ts` — ещё не поведение. Ровно на этом я уже
 * спотыкался в этом же разделе: лестница вариантов ответа была верной, а экран
 * её не читал, и мутация «всегда шесть» проходила пробу насквозь, потому что на
 * первом уровне числа совпадали.
 *
 * ⚠️ УРОВЕНЬ ПОДМЕНЯЕТСЯ МОКОМ, а не кладётся в хранилище: экран читает его по
 * ключу профиля (`psygames_chess_blind_level_<id>`), а id профиля создаётся
 * провайдером на монтировании и заранее неизвестен — попытка положить значение
 * «наугад» уже дала пробу, зеленевшую на первом уровне вместо одиннадцатого.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { примеровНаПодход } from '@/src/games/chess-blind/core/interference';

const TestRenderer = require('react-test-renderer');

const mockУровень = { n: 1 };
jest.mock('@/src/hooks/usePersistentLevel', () => ({
  usePersistentLevel: () => ({
    level: mockУровень.n, best: mockУровень.n, loaded: true,
    reach: () => {}, fail: () => {}, pick: () => {},
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

jest.useFakeTimers();
const METRICS = { frame: { x: 0, y: 0, width: 430, height: 932 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function осесть(кругов = 6, мс = 600) {
  for (let i = 0; i < кругов; i += 1) {
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(мс);
      for (let k = 0; k < 40; k += 1) await Promise.resolve();
    });
  }
}
function текст(node: any): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    walk(Array.isArray(n.children) && n.children.length > 0 ? n.children : n.props?.children);
  };
  walk(node);
  return out.join(' ');
}
async function монтировать() {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/chess-blind').default;
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
/**
 * Клетки доски — по РАЗНЫМ подписям, а не по числу узлов: `findAll` отдаёт и
 * композитные, и хостовые узлы с теми же пропсами, и одна доска насчитывается
 * как 320 «клеток». Считать надо интерфейс, а не дерево.
 */
const клеток = (r: any) => new Set(r.root.findAll(
  (n: any) => /^[a-h][1-8]$/.test(String(n.props?.accessibilityLabel ?? '')))
  .map((n: any) => String(n.props.accessibilityLabel))).size;
const кнопкаПримера = (r: any, метка: string) => r.root.findAll(
  (n: any) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === метка);

async function начать(r: any) {
  const кнопки = r.root.findAll((n: any) =>
    typeof n.props?.onPress === 'function' && !n.props?.disabled
    && /(начать|start|play|играть|уровень\s*\d|level\s*\d)/i.test(текст(n)));
  expect(`кнопка старта есть: ${кнопки.length > 0}`).toBe('кнопка старта есть: true');
  await TestRenderer.act(async () => { кнопки[0].props.onPress(); });
}

let mounted: any[] = [];
afterEach(() => {
  TestRenderer.act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted = []; mockУровень.n = 1;
});

describe('помеха на экране', () => {
  it('🔴 на 11-м уровне между показом и опросом появляется пример, доски нет', async () => {
    mockУровень.n = 11;
    expect(`лестница велит примеров: ${примеровНаПодход(11)}`).toBe('лестница велит примеров: 1');
    const r = await монтировать(); mounted.push(r);
    await начать(r);

    // Идём малыми шагами до появления кнопок ответа на пример.
    let дошли = false;
    for (let i = 0; i < 60 && !дошли; i++) {
      await осесть(1, 400);
      дошли = кнопкаПримера(r, 'interf-yes').length > 0;
    }
    expect(`фаза помехи наступила: ${дошли}`).toBe('фаза помехи наступила: true');

    // 🔴 Доски на экране нет: в этом и смысл — позицию держишь в голове.
    expect(`клеток доски во время помехи: ${клеток(r)}`).toBe('клеток доски во время помехи: 0');
    // И на экране действительно арифметика.
    expect(`выражение видно: ${/\d+\s*[+\-×]\s*\d+\s*=\s*-?\d+/.test(текст(r.toJSON()))}`)
      .toBe('выражение видно: true');

    // Ответили — доска возвращается, начинается опрос.
    await TestRenderer.act(async () => { кнопкаПримера(r, 'interf-yes')[0].props.onPress(); });
    await осесть(2, 300);
    expect(`доска вернулась после ответа: ${клеток(r) === 64}`).toBe('доска вернулась после ответа: true');
  });

  it('🔴 на первом уровне помехи нет — подход идёт как прежде', async () => {
    mockУровень.n = 1;
    expect(`лестница велит примеров: ${примеровНаПодход(1)}`).toBe('лестница велит примеров: 0');
    const r = await монтировать(); mounted.push(r);
    await начать(r);
    for (let i = 0; i < 30; i++) {
      await осесть(1, 400);
      expect(`кнопок помехи на первом уровне: ${кнопкаПримера(r, 'interf-yes').length}`)
        .toBe('кнопок помехи на первом уровне: 0');
    }
  });
});
