/* psygames-proofreading-hud-keeps-its-shape · VER 1 · 17.09.2026 */
/**
 * ПОЛОСА ПОКАЗАТЕЛЕЙ «КОРРЕКТУРЫ» НЕ МЕНЯЕТ ФОРМУ ПО ХОДУ ПАРТИИ.
 *
 * 📍 ЗАМЕР ДО (17.09.2026, живая сборка 96faa69f, настоящие касания через CDP, прибор
 * ~/dev/psygames/attention-chat/поле-прыгает-после-ошибки.mjs): в режиме филвордов после первой
 * ошибки поле уезжало вниз на 54 точки — 360×640 L1 и L46, 390×844 L46; на 390×844 L1 сетка +27
 * при сдвиге верха поля +54. Причина: счётчик «Ошибок» появлялся только при ошибках > 0, а у
 * счётчиков без значка каркас печатает слово, и четвёртая плашка со словом переносила полосу на
 * второй ряд. Человек в этот момент ведёт следующее слово по полю.
 *
 * ЧТО СТЕРЕЖЁТСЯ ЗДЕСЬ, РЕНДЕРОМ ЭКРАНА: в партии обоих режимов полоса, которую экран отдаёт
 * каркасу, с первой секунды содержит «Ошибок» (значение 0) значком, счётчиков в ней три (при
 * четырёх кнопка подсказки уходила за край), а главный счётчик сохраняет слово.
 * Ширину плашек проба не меряет — это делает живой прибор выше; здесь стережётся то, из-за чего
 * форма менялась.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  usePathname: () => '/games/proofreading',
  useFocusEffect: () => {},
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
  router: { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { getFillwordsStrings } = require('@/src/games/fillwords/core/i18n');
/* eslint-enable @typescript-eslint/no-require-imports */

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
});
const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); }); };

const текстУзла = (n: any): string => n.findAll((x: any) => typeof x.props?.children === 'string', { deep: true })
  .map((x: any) => x.props.children).join(' ');

type Счётчик = { key: string; icon?: string; value: unknown };

async function партия(режим: 'letters' | 'fillwords'): Promise<Счётчик[][]> {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/proofreading').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, {
      initialMetrics: { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
    }, React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen))))));
  });
  await осесть();
  поднятые.push(r);
  const нажимаемые = () => r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function', { deep: true });
  if (режим === 'fillwords') {
    const имя = getFillwordsStrings('en').modeName;
    // текст узла собирается и с композита, и с хост-узла («Fillwords Fillwords») — повтор допустим
    const ровно = new RegExp(`^(${имя.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*)+$`);
    const кнопка = нажимаемые().find((b: any) => ровно.test(текстУзла(b).trim()));
    expect(`кнопка режима «${имя}» найдена: ${!!кнопка}`).toBe(`кнопка режима «${имя}» найдена: true`);
    await TestRenderer.act(async () => { кнопка.props.onPress(); });
    await осесть();
  }
  const старт = нажимаемые().find((b: any) => String(b.props.accessibilityLabel) === 'Start');
  expect(`кнопка Start найдена: ${!!старт}`).toBe('кнопка Start найдена: true');
  await TestRenderer.act(async () => { старт.props.onPress(); });
  await осесть();
  /* Полоса, которую экран ОТДАЁТ каркасу: проп `hud` у GameShell. Их на экране два (партия и
     серия); в идущей партии смонтирован ровно один. */
  const оболочки = r.root.findAll((n: any) => typeof n.type !== 'string' && Array.isArray(n.props?.hud), { deep: true });
  return оболочки.map((o: any) => o.props.hud as Счётчик[]);
}

describe('«Корректура»: полоса показателей одной формы с начала партии', () => {
  for (const режим of ['letters', 'fillwords'] as const) {
    it(`🔴 ${режим}: «Ошибок» значком с первой секунды, счётчиков три, у главного — слово`, async () => {
      const полосы = await партия(режим);
      expect(`полос в партии: ${полосы.length}`).toBe('полос в партии: 1');
      const hud: Счётчик[] = полосы[0];
      /* Режим проверяется ПО ПОЛОСЕ, а не по нажатой кнопке: без этого случай «филворды» прошёл
         бы на полосе букв, если бы режим не включился. Признак филвордов — подпись счётчика «Слова». */
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- словарь после моков
      const { translateFor } = require('@/src/contexts/LanguageContext');
      const найдено = hud.find((h) => h.key === 'found') as (Счётчик & { label?: string }) | undefined;
      const режимПоПолосе = найдено?.label === translateFor('en', 'label_words') ? 'fillwords' : 'letters';
      expect(`идёт партия режима: ${режимПоПолосе}`).toBe(`идёт партия режима: ${режим}`);
      const ошибок = hud.find((h) => h.key === 'errors');
      expect(`«Ошибок» в полосе с начала: ${ошибок ? `да, значение ${String(ошибок.value)}` : 'НЕТ'}`)
        .toBe('«Ошибок» в полосе с начала: да, значение 0');
      /* Плашка сжата по содержимому, справа от неё — кнопка подсказки. При четырёх счётчиках она
         начиналась с 326 и на 360 уходила за край (замер 17.09: видно 71 % даже компактной). */
      expect(`счётчиков в полосе: ${hud.length} (${hud.map((h) => h.key).join(', ')})`).toBe(`счётчиков в полосе: 3 (${hud.map((h) => h.key).join(', ')})`);
      expect(`у «Ошибок» значок вместо слова: ${ошибок?.icon ? 'да' : 'НЕТ'}`).toBe('у «Ошибок» значок вместо слова: да');
      /* Главный счётчик держит слово: отчёт Дениса 23.08.2026 «непонятно, сколько слов ждёт
         система» чинился подписью рядом с числом. Значок вместо неё вернул бы вопрос. */
      expect(`у главного счётчика слово, а не значок: ${найдено && !найдено.icon && найдено.label ? 'да' : 'НЕТ'}`)
        .toBe('у главного счётчика слово, а не значок: да');
    });
  }
});
