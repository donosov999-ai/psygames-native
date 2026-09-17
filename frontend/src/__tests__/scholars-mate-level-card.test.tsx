/* psygames-scholars-mate-level-card · VER 2 · 17.09.2026 */
/**
 * 🔴 КАРТОЧКА УРОВНЯ НАЗЫВАЕТ, ЧЕМУ УЧИТ СТУПЕНЬ, А НЕ ТОЛЬКО ЕЁ НОМЕР.
 *
 * Замер 12.09.2026 до правки: карточка «Детского мата» показывала «Уровень 19 · 13 с ·
 * 10 · ✕ ≤1» и общий на все сорок ступеней абзац описания. Видов задания, которые на
 * этой ступени стоят, названо было НОЛЬ — человек узнавал, что здесь спрашивают
 * «грозит ли мат» и «защитись», только начав играть. У соседней игры такая строка есть
 * с самого начала (`chess-blind.tsx`, `descBits`).
 *
 * Разбор соседей по нише (`chess-chat/COMPETITORS.md`, 12.09): у DarkSquares шестнадцать
 * упражнений названы поимённо, у Coach четырнадцать «этапов». У нас именованных
 * упражнений уже десять, но игрок видел только номер.
 *
 * 🔴 ГЛАВНОЕ, ЧТО СТЕРЕЖЁТ ЭТА ПРОБА, — НЕ НАЛИЧИЕ СТРОКИ, А СОГЛАСИЕ ДВУХ МЕСТ.
 * Подпись вида нужна на карточке и в партии. Держать два перечисления «вид → надпись»
 * значит завести расхождение: правишь одно, второе тихо остаётся прежним (ровно так у
 * меня разошлась колода потока в сентябре). Поэтому карта одна — `КЛЮЧ_ВИДА` в ядре, —
 * а проба сверяет, что подпись с карточки СОВПАДАЕТ с той, что игра показывает над
 * доской. Не совпало — значит появился второй список.
 *
 * ⚠️ `t` ВОЗВРАЩАЕТ КЛЮЧ С ХВОСТОМ, а не сам ключ. Экран прячет имя узора, когда
 * перевода нет (`имяУзора` сравнивает `t(ключ) === ключ` и отдаёт пустую строку). С
 * мокой «ключ в ключ» строка нового узора не отрисовалась бы никогда, и проба зеленела
 * бы на пустом месте.
 */
import React from 'react';

import ScholarsMateScreen from '@/app/games/scholars-mate';
import {
  КЛЮЧ_ВИДА, NAMED_MOTIFS, buildDeck, buildMixedMotifDeck, buildNamedDeck, counts, mixedMotifCount,
  namedMotifCount, newMotifAt, видыУровня,
} from '@/src/games/scholars-mate/core/deck';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

const mockУровень = { n: 1 };
jest.mock('@/src/hooks/usePersistentLevel', () => ({
  usePersistentLevel: () => ({
    level: mockУровень.n, best: mockУровень.n, loaded: true,
    reach: () => {}, fail: () => {}, pick: () => {},
  }),
}));
jest.mock('@/src/hooks/useGamePreset', () => ({
  /* `bool`/`str` — часть настоящего API хука: экран читает ими `?flow=1`,
     `?mix=1` и `?motif=`. Урезанный мок падал на первом же чтении. */
  useGamePreset: () => ({ isPreset: false, autostart: false, num: (_k: string, d: number) => d, isCalm: false, bool: (_k: string, d = false) => d, str: (_k: string, d = '') => d }),
  useAutostartWhenReady: () => {},
}));
jest.mock('@/src/hooks/useGameMode', () => ({
  useGameMode: () => 'levels',
  shouldChainNextLevel: (m: string) => m === 'levels',
}));
jest.mock('@/src/hooks/useCalmHush', () => ({ useCalmHush: () => {} }));
jest.mock('@/src/hooks/useScreenWidth', () => ({ useScreenWidth: () => 390, useScreenSize: () => ({ w: 390, h: 844 }) }));
jest.mock('@/src/services/api', () => ({ saveSession: () => Promise.resolve() }));
jest.mock('@/src/services/gamePause', () => ({
  gameNow: () => 1_000_000, holdGame: () => () => {}, isGameHeld: () => false, onGameHold: () => () => {},
}));
jest.mock('@/src/utils/nav', () => ({ goBackOrHome: () => {} }));
jest.mock('expo-router', () => ({ usePathname: () => '/games/scholars-mate', useRouter: () => ({ push: () => {}, back: () => {} }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#fff', surface: '#fff', card: '#eee', border: '#ccc',
    text: '#000', textSecondary: '#666', primary: '#07c',
  } }),
}));
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({ active: false, stopWarmup: () => {}, next: () => {}, step: 0, total: 0 }),
}));
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'p1', display_name: 'Денис' } }),
  useProfileOptional: () => ({ profile: { id: 'p1', display_name: 'Денис' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({
  /* `scholarsBank` — с местом под число: иначе число позиций на карточке не доезжает
     до текста, и пробе нечего сравнивать (экран подставляет его в `{n}`). */
  useLanguage: () => ({ t: (k: string) => (k === 'scholarsBank' ? 'bank={n}' : `${k}·т`), language: 'ru' }),
}));
jest.mock('@/src/components/GameShell', () => {
  const R = require('react'); const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: any) => R.createElement(View, null, children) };
});
jest.mock('@/src/components/GradientSurface', () => {
  const R = require('react'); const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: any) => R.createElement(View, null, children) };
});
jest.mock('@/src/components/LevelProgressMap', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/GameSetupBar', () => {
  const R = require('react'); const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    SETUP_BAR_SPACE: 0,
    default: ({ onStart }: any) => R.createElement(
      Pressable, { accessibilityRole: 'button', accessibilityLabel: 'НАЧАТЬ', onPress: onStart },
      R.createElement(Text, null, 'НАЧАТЬ'),
    ),
  };
});
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, default: () => null }));

let mounted: any[] = [];
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => {
  TestRenderer.act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted = []; mockУровень.n = 1;
  jest.useRealTimers();
});

function текст(tree: any): string {
  const out: string[] = [];
  const идти = (n: any) => {
    if (n == null || n === false) return;
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(идти); return; }
    if (n.children) идти(n.children);
  };
  идти(tree.toJSON());
  return out.join(' ').replace(/\s+/g, ' ');
}

function нажать(tree: any, метка: string) {
  const у = tree.root.findAll(
    (n: any) => typeof n.props?.onPress === 'function'
      && String(n.props.accessibilityLabel ?? '').split(',')[0] === метка,
    { deep: true },
  )[0];
  if (!у) throw new Error(`нет кнопки «${метка}»`);
  TestRenderer.act(() => { у.props.onPress(); });
}

/** Открыть выпадающий список режима и выбрать пункт — так, как это делает человек. */
function выбрать(tree: any, ключ: string) {
  for (const id of ['scholars-mode-select', `scholars-mode-${ключ}`]) {
    const у = tree.root.findAll(
      (n: any) => n.props?.testID === id && typeof n.props.onPress === 'function',
      { deep: true },
    )[0];
    if (!у) throw new Error(`нет «${id}»`);
    TestRenderer.act(() => { у.props.onPress(); });
  }
}

/** Все подписи видов, какие вообще бывают: у двух видов подпись одна, поэтому через множество. */
const ВСЕ_ПОДПИСИ = [...new Set(Object.values(КЛЮЧ_ВИДА))].sort();

function открыть(уровень: number) {
  mockУровень.n = уровень;
  let tree: any;
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(ScholarsMateScreen as any));
    mounted.push(tree);
  });
  return tree;
}

describe('«Детский мат»: карточка уровня называет, чему учит ступень', () => {
  it('🔴 на карточке названы ВСЕ виды задания этой ступени, а не ноль из них', () => {
    for (const уровень of [1, 10, 19, 25, 29, 40]) {
      const tree = открыть(уровень);
      const t = текст(tree);
      const виды = видыУровня(уровень);
      const названо = виды.filter((k) => t.includes(`${КЛЮЧ_ВИДА[k]}·т`));
      expect(`ур.${уровень}: названо ${названо.length} видов из ${виды.length}`)
        .toBe(`ур.${уровень}: названо ${виды.length} видов из ${виды.length}`);
      TestRenderer.act(() => { tree.unmount(); });
    }
  });

  it('🔴 подпись с карточки СОВПАДАЕТ с той, что игра показывает над доской', () => {
    /**
     * Здесь ловится второй список. Если кто-то поправит подпись в одном месте и
     * забудет другое, карточка и партия начнут называть одно и то же по-разному —
     * и это ровно тот род расхождения, который однажды уже стоил мне захода.
     *
     * ⚠️ ТОЛЬКО ДО 29-го УРОВНЯ, и это не послабление. С 29-го вид задания намеренно
     * НЕ ОБЪЯВЛЯЕТСЯ (`объявлятьВид`, ось «непредсказуемость», 07.09.2026): игра
     * показывает «?», и человек сам должен увидеть, что перед ним. Первая редакция
     * этой пробы требовала подпись и на 29-м — то есть требовала того, чего по
     * устройству быть не должно, и краснела на исправном коде.
     */
    for (const уровень of [1, 19, 25]) {
      const tree = открыть(уровень);
      const наКарточке = текст(tree);
      нажать(tree, 'НАЧАТЬ');
      TestRenderer.act(() => { jest.advanceTimersByTime(300); });
      const вПартии = текст(tree);

      const подписи = видыУровня(уровень).map((k) => `${КЛЮЧ_ВИДА[k]}·т`);
      const вПартииЕсть = подписи.filter((п) => вПартии.includes(п));
      expect(`ур.${уровень}: подписей партии, встреченных и на карточке: ${вПартииЕсть.filter((п) => наКарточке.includes(п)).length} из ${вПартииЕсть.length}`)
        .toBe(`ур.${уровень}: подписей партии, встреченных и на карточке: ${вПартииЕсть.length} из ${вПартииЕсть.length}`);
      expect(`ур.${уровень}: партия вообще что-то спросила: ${вПартииЕсть.length > 0}`)
        .toBe(`ур.${уровень}: партия вообще что-то спросила: true`);
      TestRenderer.act(() => { tree.unmount(); });
    }
  });

  it('🔴 карточка называет виды ступени, но партия на 29+ по-прежнему их ПРЯЧЕТ', () => {
    /**
     * Встречная проверка к предыдущей: строка на карточке не должна отменять ось
     * «непредсказуемость». Список видов ступени секретом никогда не был — это
     * лестница; секрет в том, КАКОЙ из них перед тобой сейчас. Проба стережёт, что
     * одно не подменило другое.
     */
    const tree = открыть(29);
    const наКарточке = текст(tree);
    expect(`ур.29: виды названы на карточке: ${видыУровня(29).every((k) => наКарточке.includes(`${КЛЮЧ_ВИДА[k]}·т`))}`)
      .toBe('ур.29: виды названы на карточке: true');

    нажать(tree, 'НАЧАТЬ');
    TestRenderer.act(() => { jest.advanceTimersByTime(300); });
    const вПартии = текст(tree).slice(наКарточке.length >= 0 ? 0 : 0);
    const названоВПартии = видыУровня(29).filter((k) => вПартии.includes(`${КЛЮЧ_ВИДА[k]}·т`));
    expect(`ур.29: партия называет вид: ${названоВПартии.length > 0}`)
      .toBe('ур.29: партия называет вид: false');
  });

  it('🔴 «Новый узор» стоит РОВНО на той ступени, где узор открывается', () => {
    const открывают = [1, 6, 10, 14, 18, 23, 28].filter((L) => newMotifAt(L));
    expect(`ступеней с новым узором в лестнице: ${открывают.length}`)
      .toBe('ступеней с новым узором в лестнице: 7');

    for (const уровень of [1, 6, 7, 14, 15, 28, 29]) {
      const tree = открыть(уровень);
      const есть = текст(tree).includes('scholarsNewMotif·т');
      expect(`ур.${уровень}: строка нового узора ${есть ? 'есть' : 'нет'}`)
        .toBe(`ур.${уровень}: строка нового узора ${newMotifAt(уровень) ? 'есть' : 'нет'}`);
      TestRenderer.act(() => { tree.unmount(); });
    }
  });
  it('🔴 подпись вида стоит на карточке ОДИН раз, даже когда два вида подписаны одинаково', () => {
    /**
     * 📍 Замер 17.09.2026 ДО правки: на ступенях 6–18 у лестницы два вида, `mate` и
     * `fromGames`, а подпись у них одна (`КЛЮЧ_ВИДА`) — и карточка писала её дважды:
     * «Поставь мат в один ход · Поставь мат в один ход». Тринадцать ступеней из сорока.
     * Первая проба карточки этого не видела: она спрашивала, НАЗВАНА ли каждая подпись,
     * и не спрашивала, СКОЛЬКО раз.
     */
    for (const уровень of [1, 6, 10, 18, 19, 29, 40]) {
      const tree = открыть(уровень);
      const t = текст(tree);
      const повторы = ВСЕ_ПОДПИСИ
        .map((к) => `${к}×${t.split(`${к}·т`).length - 1}`)
        .filter((x) => !x.endsWith('×0') && !x.endsWith('×1'));
      expect(`ур.${уровень}: подписей, написанных больше одного раза: ${повторы.join(', ') || 0}`)
        .toBe(`ур.${уровень}: подписей, написанных больше одного раза: 0`);
      TestRenderer.act(() => { tree.unmount(); });
    }
  });

  it('🔴 выбранный режим ПЕРЕПИСЫВАЕТ карточку: виды, «новый узор» и число позиций — по режиму', () => {
    /**
     * 📍 Замер 17.09.2026 ДО правки, кадр 390×844 статической сборки: выбран «Мат с
     * жертвой», а карточка над списком — «Поставь мат в один ход · Новый узор: Детский
     * мат · Позиций в наборе: 31350». Пока строка режима запускала партию сразу, врать
     * карточке было нечему: «Начать» запускало ровно лестницу. Выпадающий список
     * (2d414ddb) завёл состояние «выбрано, но не начато», и карточка стала описывать
     * не то, что сейчас начнётся.
     *
     * ⚠️ ОЖИДАНИЕ СЧИТАЕТСЯ ПО НАСТОЯЩЕЙ КОЛОДЕ режима — по видам позиций, которые
     * соберёт игра, — а не той функцией, что рисует карточку. Иначе проба сверяла бы
     * функцию саму с собой.
     *
     * ⚠️ СТУПЕНЬ 23 — НАРОЧНО. На ней три подписи лестницы (угроза, защита, мат) и
     * открывается узор, то есть каждая из трёх строк карточки ОБЯЗАНА смениться. На
     * первой ступени подпись лестницы совпадает с подписью узора, и проба зеленела бы
     * на неисправленном экране.
     */
    const L = 23;
    expect(`ступень ${L} открывает узор: ${Boolean(newMotifAt(L))}`).toBe(`ступень ${L} открывает узор: true`);
    const узор = NAMED_MOTIFS[0]!;
    const c = counts();
    const режимы = [
      { ключ: 'sacrifice', колода: buildDeck(L, 1, 'sacrifice'), позиций: c.sacrifice },
      { ключ: `motif:${узор}`, колода: buildNamedDeck(узор, L), позиций: namedMotifCount(узор) },
      { ключ: 'mix', колода: buildMixedMotifDeck(L), позиций: mixedMotifCount() },
      { ключ: 'levels', колода: null, позиций: c.mate + c.fromGames + c.defend + c.threat + c.sacrifice },
    ];
    const tree = открыть(L);
    for (const р of режимы) {
      if (р.колода) expect(`${р.ключ}: позиций в колоде ${р.колода.length > 0 ? 'есть' : 'ноль'}`).toBe(`${р.ключ}: позиций в колоде есть`);
      выбрать(tree, р.ключ);
      const t = текст(tree);
      const виды = р.колода ? [...new Set(р.колода.map((x) => x.kind))] : видыУровня(L);
      const ждём = [...new Set(виды.map((k) => КЛЮЧ_ВИДА[k]))].sort();
      const есть = ВСЕ_ПОДПИСИ.filter((к) => t.includes(`${к}·т`));
      expect(`${р.ключ}: подписи на карточке [${есть.join(', ')}]`).toBe(`${р.ключ}: подписи на карточке [${ждём.join(', ')}]`);
      expect(`${р.ключ}: «новый узор» ${t.includes('scholarsNewMotif·т') ? 'есть' : 'нет'}`)
        .toBe(`${р.ключ}: «новый узор» ${р.ключ === 'levels' ? 'есть' : 'нет'}`);
      expect(`${р.ключ}: позиций на карточке ${(t.match(/bank=(\d+)/) ?? [])[1]}`).toBe(`${р.ключ}: позиций на карточке ${р.позиций}`);
    }
  });

  it('🔴 в выбранном режиме подпись над доской — из тех, что назвала карточка', () => {
    /**
     * Та же сверка «карточка ↔ партия», что выше для лестницы, но для режимов
     * отработки. Здесь и видно враньё карточки: выбран жертвенный мат, над доской
     * спрашивают жертву, а карточка обещала угрозу и защиту.
     */
    const L = 23;
    for (const ключ of ['sacrifice', `motif:${NAMED_MOTIFS[0]}`, 'mix']) {
      const tree = открыть(L);
      выбрать(tree, ключ);
      const наКарточке = текст(tree);
      нажать(tree, 'НАЧАТЬ');
      TestRenderer.act(() => { jest.advanceTimersByTime(300); });
      const вПартии = текст(tree);
      const спросила = ВСЕ_ПОДПИСИ.filter((к) => вПартии.includes(`${к}·т`));
      expect(`${ключ}: партия что-то спросила: ${спросила.length > 0}`).toBe(`${ключ}: партия что-то спросила: true`);
      expect(`${ключ}: подписей партии, которых нет на карточке: ${спросила.filter((к) => !наКарточке.includes(`${к}·т`)).join(', ') || 0}`)
        .toBe(`${ключ}: подписей партии, которых нет на карточке: 0`);
      TestRenderer.act(() => { tree.unmount(); });
    }
  });
});
