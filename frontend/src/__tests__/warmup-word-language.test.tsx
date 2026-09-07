/**
 * ЗАРЯДКА НЕ ДОЛЖНА ДАВАТЬ АНГЛИЙСКИЕ СЛОВА РУССКОМУ ЧЕЛОВЕКУ.
 *
 * 📍 РЕПОРТ ДЕНИСА 07.09.2026: «режим зарядка, после первого упражнения ошибка
 * по словам». Воспроизведено живьём на собранном вебе:
 *   /games/anagrams?wu=1&diff=medium&length=5
 *   интерфейс русский («Анаграммы», «Подсказка», «Сбросить»), а слово
 *   АНГЛИЙСКОЕ: буквы K T R C U, подсказка «big goods vehicle» (TRUCK).
 * Тот же экран, открытый руками, даёт русские слова — в списке языков подсвечен
 * «Русский». То есть банк неверен только на пути зарядки.
 *
 * 🔴 ПРИЧИНА — ЖДАЛИ ОДНУ АСИНХРОННУЮ ЦЕПОЧКУ, А ИХ ДВЕ.
 * `LanguageContext` стартует с `'en'` (LanguageContext.tsx:3395) и доезжает до
 * настоящего языка промисом из хранилища; язык СЛОВ берётся от него
 * (`defaultWordLang`). Автостарт зарядки ждал только загрузку уровня
 * (`lvl.loaded`) и успевал сработать раньше языка: банк собирался английским, а
 * когда язык доезжал, партия УЖЕ ШЛА и не пересобиралась.
 *
 * ⚠️ ПОЧЕМУ ОДНОГО `wordLang.ready` МАЛО. Он поднимается и на значении по
 * умолчанию — то есть на английском, если язык интерфейса к тому моменту не
 * доехал. Ждать надо ОБА признака, иначе гонка та же, только уже.
 *
 * ЧТО СТЕРЕЖЁТ ПРОБА: язык интерфейса приходит ПОЗЖЕ уровня (ровно порядок из
 * репорта), и партия зарядки обязана начаться на русских буквах. Мутация:
 * убрать `языкГотов` из условия автостарта — проба краснеет с латиницей.
 */
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileProvider } from '@/src/contexts/ProfileContext';
import { ThemeProvider } from '@/src/contexts/ThemeContext';
import { LanguageProvider } from '@/src/contexts/LanguageContext';
import { PlayerLevelProvider } from '@/src/contexts/PlayerLevelContext';
import { WarmupProvider } from '@/src/contexts/WarmupContext';

/** Параметры шага зарядки — ровно те, что строит `stepToParams`. */
const mockПараметры: Record<string, string> = { wu: '1', diff: 'medium', length: '5' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockПараметры,
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
}));

/**
 * ЯЗЫК ПРИХОДИТ ПОЗЖЕ ОСТАЛЬНОГО — это и есть воспроизведение репорта.
 * Остальные ключи отдаются сразу, ключ `language` — через такт. Без задержки
 * гонки не будет и проба станет зелёной при любом коде.
 */
const ЗАДЕРЖКА_ЯЗЫКА_МС = 40;
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k: string) => (k === 'language'
      ? new Promise((r) => setTimeout(() => r('ru'), 40))
      : Promise.resolve(null))),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve()),
  },
}));

/** Круг букв подменён — из него и читаем, на каком языке собралась партия. */
let mockКруг: { letters: string[] } | null = null;
jest.mock('@/src/components/letterWheel/LetterWheel', () => ({
  LetterWheel: (props: { letters: string[] }) => { mockКруг = props; return null; },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock
const TestRenderer = require('react-test-renderer');
const МЕТРИКИ = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) {
    const r = поднятые.pop();
    try { TestRenderer.act(() => { r.unmount(); }); } catch { /* уже погашено */ }
  }
  mockКруг = null;
});

const КИРИЛЛИЦА = /^[А-ЯЁ]$/i;
const ЛАТИНИЦА = /^[A-Z]$/i;

it('🔴 шаг зарядки начинается на языке человека, а не на английском по умолчанию', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const Экран = require('@/app/games/anagrams').default;
  let root: any;
  await TestRenderer.act(async () => {
    root = TestRenderer.create(
      <SafeAreaProvider initialMetrics={МЕТРИКИ}>
        <ProfileProvider><ThemeProvider><LanguageProvider>
          <PlayerLevelProvider><WarmupProvider><Экран /></WarmupProvider></PlayerLevelProvider>
        </LanguageProvider></ThemeProvider></ProfileProvider>
      </SafeAreaProvider>);
  });
  поднятые.push(root);

  // Даём доехать ОБЕИМ цепочкам: уровню (сразу) и языку (с задержкой).
  await TestRenderer.act(async () => {
    await new Promise((r) => setTimeout(r, ЗАДЕРЖКА_ЯЗЫКА_МС * 3));
  });

  expect(mockКруг).toBeTruthy();                       // партия вообще началась
  const буквы = mockКруг!.letters;
  expect(буквы.length).toBeGreaterThan(0);

  const латинских = буквы.filter((c) => ЛАТИНИЦА.test(c)).length;
  const кириллических = буквы.filter((c) => КИРИЛЛИЦА.test(c)).length;
  // Сообщение печатает сами буквы: увидев «K,T,R,C,U», сразу понятно, что это
  // тот же TRUCK из репорта, а не какая-то другая поломка.
  expect(`${кириллических}к/${латинских}л [${буквы.join(',')}]`)
    .toBe(`${буквы.length}к/0л [${буквы.join(',')}]`);
});

/**
 * 🔴 ВТОРАЯ ПОЛОВИНА: `ready` СТЕРЕЖЁТ СОХРАНЁННЫЙ ВЫБОР.
 *
 * Проба выше проверяет язык ПО УМОЛЧАНИЮ и после починки уже не различает
 * отстающий флаг: язык слов вычисляется в рендере, поэтому в кадре смены языка
 * он верен и без `ready`. Мутация это показала честно — она выжила.
 *
 * Но `ready` держит ДРУГОЕ свойство, ради которого и заведён: у человека с
 * профилем есть СОХРАНЁННЫЙ выбор языка слов, и он приезжает из хранилища
 * промисом. Стартовать раньше — значит сыграть первый круг не на том языке, а
 * человек решит, что выбор не сохраняется. Здесь это и проверяется, вместе с
 * запретом на отставание: сменился язык интерфейса — `ready` обязан упасть В ТОМ
 * ЖЕ кадре, а не через один.
 */
it('🔴 ready ложен, пока сохранённый выбор не прочитан, и падает сразу при смене языка', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- после jest.mock
  const { useWordLanguage } = require('@/src/hooks/useWordLanguage');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- после jest.mock
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  // Сохранённый выбор — АНГЛИЙСКИЙ при русском интерфейсе, приезжает не сразу.
  AsyncStorage.getItem.mockImplementation((k: string) => (k.includes('wordlang')
    ? new Promise((r) => setTimeout(() => r('en'), 40))
    : Promise.resolve(null)));

  const снимки: { lang: string; ready: boolean }[] = [];
  const Проба = ({ ui }: { ui: string }) => {
    const w = useWordLanguage('anagrams', 'профиль-1', ui);
    снимки.push({ lang: w.lang, ready: w.ready });
    return null;
  };

  let root: any;
  await TestRenderer.act(async () => { root = TestRenderer.create(<Проба ui="ru" />); });
  поднятые.push(root);
  // Пока выбор не прочитан — стартовать нельзя.
  expect(снимки[снимки.length - 1].ready).toBe(false);

  await TestRenderer.act(async () => { await new Promise((r) => setTimeout(r, 120)); });
  expect(снимки[снимки.length - 1]).toEqual({ lang: 'en', ready: true });

  // Смена языка интерфейса: `ready` обязан упасть СРАЗУ, в том же кадре.
  await TestRenderer.act(async () => { root.update(<Проба ui="de" />); });
  expect(снимки[снимки.length - 1].ready).toBe(false);
});
