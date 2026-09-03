/*
 * eslint-disable @typescript-eslint/no-require-imports — экран и контексты берутся
 * ПОСЛЕ подмен, иначе в дерево попадут настоящие роутер и запись сессий.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ВИТРИНА КОЛЛЕКЦИИ — задача 6e564484, шаг 2 «место, куда возвращаешься».
 *
 * 🔴 ЧТО ПРОВЕРЯЕТСЯ. Сундук на главной говорил «собрано 3 из 12», и на этом цель
 * кончалась: посмотреть на собранное было негде, число не становилось предметом.
 * Проба рендерит настоящий экран витрины и смотрит нарисованное дерево — все
 * двенадцать мест на полке, собранные отличаются от пустых, у пустых написана цена.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIGURES } from '@/src/services/collection';

const TestRenderer = require('react-test-renderer');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => { const React2 = require('react'); React2.useEffect(cb, []); },
  router: { canGoBack: () => true, back: () => {}, replace: () => {}, push: () => {} },
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function монтировать(заработано: number) {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  // Заработанное за всё время лежит в хранилище — кладём до монтажа.
  const { EARNED_KEY } = require('@/src/services/collection');
  if (EARNED_KEY) await AsyncStorage.setItem(`${EARNED_KEY}_free`, String(заработано));
  const Screen = require('@/app/collection').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  for (let i = 0; i < 6; i += 1) {
    await TestRenderer.act(async () => { for (let k = 0; k < 40; k += 1) await Promise.resolve(); });
  }
  return r;
}

function мест(r: any, testID: string): number {
  const по = new Set<string>();
  for (const n of r.root.findAll((x: any) => x.props?.testID === testID)) {
    по.add(String(n.props?.accessibilityLabel ?? Math.random()));
  }
  return по.size;
}

/**
 * ⚠️ ТОЛЬКО ВИДИМЫЙ ТЕКСТ, без подписей для скринридера.
 *
 * Первый вид пробы сериализовал всё дерево — и остался ЗЕЛЁНЫМ, когда мутация
 * убрала имена с пустых полок: имя всё ещё лежало в `accessibilityLabel`. Проба
 * проверяла не то, что видит глаз.
 */
function текст(r: any): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'Text') { walk(n.children); return; }
    walk(n.children);
  };
  walk(r.toJSON());
  return out.join(' | ');
}

describe('витрина коллекции', () => {
  it('🔴 на полке ровно двенадцать мест — и пустые тоже видны', async () => {
    const r = await монтировать(0);
    expect(мест(r, 'figure-owned') + мест(r, 'figure-locked')).toBe(FIGURES.length);
    expect(мест(r, 'figure-locked')).toBeGreaterThan(0);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('🔴 у пустой полки написано ИМЯ и цена: силуэт без имени — просто дырка', async () => {
    const r = await монтировать(0);
    const весь = текст(r);
    // ⚠️ Язык проб — базовый ('en'), поэтому имя проверяем в обоих вариантах:
    // проба про НАЛИЧИЕ имени, а не про то, на каком языке идёт интерфейс.
    expect(весь).toMatch(/Acorn|Жёлудь/);   // имя первой фигурки
    expect(весь).toMatch(/150/);            // её порог виден рядом с именем
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('выход есть и он не в прокрутке', async () => {
    const r = await монтировать(0);
    const выход = r.root.findAll((n: any) => n.props?.testID === 'collection-exit');
    expect(выход.length).toBeGreaterThan(0);
    const прокрутки = r.root.findAll((n: any) => {
      const имя = typeof n.type === 'string' ? n.type : (n.type?.displayName || n.type?.name || '');
      return /ScrollView/.test(String(имя));
    });
    expect(прокрутки.some((sv: any) => sv.findAll((n: any) => n.props?.testID === 'collection-exit').length > 0)).toBe(false);
    await TestRenderer.act(async () => { r.unmount(); });
  });
});
