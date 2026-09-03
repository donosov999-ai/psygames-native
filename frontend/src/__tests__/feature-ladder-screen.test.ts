/*
 * eslint-disable @typescript-eslint/no-require-imports — ввоз через `require` здесь намеренный: экран и его контексты берутся ПОСЛЕ
 * подмен, иначе в дерево попадут настоящие роутер и запись сессий.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ЗАМОК НА НАСТОЯЩЕМ ЭКРАНЕ, А НЕ НА ОТДЕЛЬНОЙ КНОПКЕ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ `feature-ladder-locks`. Та проба берёт `GameAuxAction`
 * саму по себе, и она бы осталась зелёной, даже если бы провайдер уровня стоял
 * НЕ ТАМ. А он и стоял не там: сперва внутри каркаса игры — и подсказка судоку,
 * которая нарисована в самом экране, уровня не видела вовсе. Замок молча не
 * появлялся, и ни одна проба этого не замечала.
 *
 * Поэтому здесь монтируется настоящий экран судоку целиком, и проверяется то,
 * что увидит игрок: при уровне 0 на кнопке подсказки замок и условие, при
 * уровне 10 — обычная подсказка.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TestRenderer = require('react-test-renderer');

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

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function тексты(node: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    walk(n.children ?? n.props?.children);
  };
  walk(node);
  return out;
}

async function монтировать(level: number | null) {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { PlayerLevelValue } = require('@/src/contexts/PlayerLevelContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/sudoku').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(PlayerLevelValue, { level },
                React.createElement(Screen)))))),
    );
  });
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });

  /**
   * Кнопка подсказки живёт на ИГРОВОМ экране, а после монтирования судоку
   * показывает настройку. Партию поэтому запускаем — иначе проба зеленела бы,
   * ни разу не увидев ту кнопку, ради которой заведена.
   */
  const старт = r.root.findAll((n: any) =>
    typeof n.props?.style !== 'undefined' && n.props?.accessibilityRole === 'button' && n.props?.onPress
    // Вход в партию — это и «Начать», и «Продолжить»: после первой пробы
    // сохранена незаконченная партия, и кнопка меняет подпись. Нам нужен сам
    // вход, а не конкретное слово.
    && /начать|play|играть|продолж|continue|resume/i.test(тексты(n).join(' ')));
  if (старт.length === 0) throw new Error('кнопка старта не найдена — проба не смогла войти в партию');
  await TestRenderer.act(async () => { старт[0].props.onPress(); });
  // Доска судоку рождается не в том же кадре: даём и микрозадачам, и таймерам.
  for (let круг = 0; круг < 8; круг += 1) {
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(400);
      for (let i = 0; i < 40; i += 1) await Promise.resolve();
    });
    if (иконки(r).some((n: string) => n === 'bulb' || n === 'lock-closed')) break;
  }
  return r;
}

/** Иконки, нарисованные на экране: по ним видно замок, а не по словам. */
function иконки(r: any): string[] {
  return r.root.findAll((n: any) => typeof n.props?.name === 'string' && typeof n.type !== 'string')
    .map((n: any) => n.props.name);
}

/**
 * ⚠️ ЯВНЫЙ ЗАПАС ВРЕМЕНИ. Проба рисует настоящий экран судоку и под общей нагрузкой
 * укладывается в 7 секунд при умолчании jest в 5 — 03.09.2026 она уронила полный
 * прогон, а отдельным запуском проходила за 1,3 с. Гейт, краснеющий по жребию, стоит
 * выпуска: ровно этим в тот же день обошлась проба судоку про доливку.
 */
const ЗАПАС_МС = 30_000;

describe('лестница замков на экране судоку', () => {
  it('🔴 новичок: на подсказке замок и условие открытия', async () => {
    const r = await монтировать(0);
    const весьТекст = тексты(r.toJSON()).join(' ');
    expect(иконки(r)).toContain('lock-closed');
    // На кнопке — КОРОТКАЯ форма: полная фраза вылезала за край на 27 px и
    // обрезалась (браузерный гейт, 360 px). Проверяем обе: короткую видно…
    expect(весьТекст).toMatch(/Lv 2|Ур\. 2/);
    // …а полную обязан услышать скринридер, иначе смысл замка потерян.
    const подписи = r.root.findAll((n: any) => typeof n.props?.accessibilityLabel === 'string')
      .map((n: any) => n.props.accessibilityLabel).join(' | ');
    expect(подписи).toMatch(/Unlocks at level 2|Откроется на уровне 2/);
    await TestRenderer.act(async () => { r.unmount(); });
  }, ЗАПАС_МС);

  it('🔴 опытный игрок: подсказка обычная, замка нет', async () => {
    const r = await монтировать(10);
    // 🔴 Сначала доказываем, что кнопка ВООБЩЕ нарисована. Без этого «замка нет»
    // зеленело бы на экране, куда проба просто не дошла, — самый частый способ
    // получить зелёный гейт, ничего не проверив.
    expect(иконки(r)).toContain('bulb');
    expect(иконки(r)).not.toContain('lock-closed');
    expect(тексты(r.toJSON()).join(' ')).not.toMatch(/level 2|уровне 2/);
    await TestRenderer.act(async () => { r.unmount(); });
  }, ЗАПАС_МС);

  it('уровень неизвестен — замка нет: экран не мигает запертым на первом кадре', async () => {
    const r = await монтировать(null);
    expect(иконки(r)).toContain('bulb');
    expect(иконки(r)).not.toContain('lock-closed');
    await TestRenderer.act(async () => { r.unmount(); });
  }, ЗАПАС_МС);
});
