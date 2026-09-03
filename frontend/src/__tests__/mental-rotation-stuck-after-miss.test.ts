/*
 * eslint-disable @typescript-eslint/no-require-imports — экран и его контексты
 * берутся ПОСЛЕ подмен, иначе в дерево попадут настоящие роутер и запись сессий.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 🔴 «ОШИБКА — И ДАЛЬШЕ ИГРАТЬ НЕВОЗМОЖНО» (отчёты 02.09 и 03.09.2026).
 *
 * Игра вставала не из-за зависания: кнопка «дальше» лежала ВНУТРИ прокручиваемого
 * поля, под развёрнутым разбором, и на телефоне уезжала ниже экрана. С 2.34.0 поле
 * каркаса не отдаёт касание прокрутке — дотянуться пальцем стало нечем, и
 * единственный выход из разбора оказался за краем.
 *
 * ⚠️ ЧТО ИМЕННО ПРОВЕРЯЕТСЯ. Не «есть ли кнопка» — она была и раньше, — а ГДЕ она
 * нарисована: внутри закреплённого нижнего ряда каркаса (`game-bottom-actions` или
 * ряд вариантов), который не может уехать за край. Проба, спрашивающая лишь о
 * наличии кнопки, осталась бы зелёной весь месяц, пока игра стояла.
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

async function осесть(r: any, кругов = 6) {
  for (let i = 0; i < кругов; i += 1) {
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(500);
      for (let k = 0; k < 30; k += 1) await Promise.resolve();
    });
  }
}

async function монтировать() {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { PlayerLevelValue } = require('@/src/contexts/PlayerLevelContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/mental-rotation').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(PlayerLevelValue, { level: 30 },
                React.createElement(Screen)))))),
    );
  });
  await осесть(r);
  return r;
}

/** Кнопки-варианты ответа: у них подпись «вариант N» для скринридера. */
function варианты(r: any): any[] {
  return r.root.findAll((n: any) => /вариант|option/i.test(String(n.props?.accessibilityLabel ?? '')));
}

/**
 * Промахнуться НАМЕРЕННО. Верный вариант пробе неизвестен, поэтому жмём по очереди,
 * пока не появится выход из разбора: попадание в верный просто подаёт новую фигуру.
 *
 * ⚠️ После ВЕРНОГО ответа игра ждёт 700 мс и лишь потом подаёт новую фигуру. Пока
 * пауза не истекла, варианты отключены, и цикл жал бы по мёртвым узлам: первый вид
 * пробы прокручивал время по 300 мс и до новой фигуры не доживал — отсюда и плавание
 * («то зелено, то красно» на четырёх прогонах подряд).
 *
 * ⚠️ Список вариантов перечитывается ПЕРЕД каждым нажатием. Первый вид пробы жал по
 * сохранённому списку и падал, когда ответ случайно оказывался верным: экран уже
 * сменился, а узлы в руках остались от прошлой фигуры.
 */
async function промахнуться(r: any, попыток = 12): Promise<boolean> {
  for (let i = 0; i < попыток; i += 1) {
    if (r.root.findAll((n: any) => n.props?.testID === 'mr-next').length > 0) return true;
    const живые = варианты(r).filter((n: any) => typeof n.props?.onPress === 'function' && !n.props?.disabled);
    if (живые.length === 0) return false;
    await TestRenderer.act(async () => { живые[i % живые.length].props.onPress(); });
    await осесть(r, 3);   // 1500 мс — заведомо больше паузы в 700 мс после верного
  }
  return r.root.findAll((n: any) => n.props?.testID === 'mr-next').length > 0;
}

/** Войти в партию: нажать «Начать»/«Play», если экран показывает настройку. */
async function начать(r: any) {
  const старт = r.root.findAll((n: any) =>
    n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function'
    && /начать|start|play|играть/i.test(текст(n)));
  if (старт.length > 0) {
    await TestRenderer.act(async () => { старт[0].props.onPress(); });
    await осесть(r);
  }
}

function текст(node: any): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    walk(n.props?.children ?? n.children);
  };
  walk(node);
  return out.join(' ');
}

/** Есть ли узел с таким testID ВНУТРИ поддерева. */
function внутри(корень: any, testID: string): boolean {
  return корень.findAll((n: any) => n.props?.testID === testID).length > 0;
}

describe('ротация: после промаха игра не встаёт', () => {
  it('🔴 выход из разбора нарисован в ЗАКРЕПЛЁННОМ нижнем ряду, а не в прокрутке', async () => {
    const r = await монтировать();
    await начать(r);
    const опции = варианты(r);
    expect(опции.length).toBeGreaterThanOrEqual(2);   // проба вправду вошла в партию

    expect(await промахнуться(r)).toBe(true);          // разбор вправду открылся
    const кнопка = r.root.findAll((n: any) => n.props?.testID === 'mr-next');
    expect(кнопка.length).toBeGreaterThan(0);          // выход из разбора существует

    // 🔴 И он ВНУТРИ закреплённого ряда каркаса — того, что не уезжает за край.
    const ряды = r.root.findAll((n: any) =>
      n.props?.testID === 'game-toolbar' || n.props?.testID === 'game-bottom-actions');
    expect(ряды.length).toBeGreaterThan(0);
    expect(ряды.some((ряд: any) => внутри(ряд, 'mr-next'))).toBe(true);
  });

  it('🔴 в прокручиваемом поле выхода больше НЕТ: там он и уезжал за экран', async () => {
    const r = await монтировать();
    await начать(r);
    expect(await промахнуться(r)).toBe(true);
    const поле = r.root.findAll((n: any) => n.props?.testID === 'game-field');
    if (поле.length > 0) expect(внутри(поле[0], 'mr-next')).toBe(false);
  });
});
