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
import { puzzleLevelParams } from '@/src/games/chess-blind/core/puzzle';

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
  /**
   * 🔴 ХОД ВСЛЕПУЮ ВИДЕН НА ПЕРВОЙ СТУПЕНИ, А НЕ НА ШЕСТОЙ.
   *
   * Замер по базе партий 10.09.2026: дальше 4-го уровня не заходил никто (13 партий,
   * 4 человека), а ходы вслепую начинались с 6-го — то есть механику, ради которой игра
   * названа, не видел НИ ОДИН игравший. С 12.09 ходы монотонны с первой ступени.
   *
   * ⚠️ ПРОВЕРЯЕТСЯ ЧЕРЕЗ ЭКРАН, А НЕ ПО ТАБЛИЦЕ. Объявить число в лестнице и не
   * проверить, что оно доехало до игры, я уже пробовал: ось «отвлечение» обещала рост
   * вариантов на трети лестницы, которого в игре не было, и ядровая проба этого не
   * видела. Здесь проба ждёт на экране счётчик ходов и читает его числитель со
   * знаменателем.
   */
  it('🔴 на ПЕРВОМ уровне человек видит ход вслепую, а не только «запомни позицию»', async () => {
    mockУровень.n = 1;
    expect(`лестница обещает ходов на ур.1: ${puzzleLevelParams(1).moves}`)
      .toBe('лестница обещает ходов на ур.1: 1');

    const r = await монтировать(); mounted.push(r);
    await начать(r);

    /**
     * 🔴 ЖДЁМ ЧИСЛИТЕЛЬ, А НЕ ЗНАМЕНАТЕЛЬ, и это разница между пробой и пустышкой.
     * Первая редакция искала на экране счётчик «ходов вслепую: 0/1» и считала дело
     * сделанным. Но знаменатель рисуется из ОБЕЩАНИЯ ЛЕСТНИЦЫ (`prm.moves`), а не из
     * состоявшегося хода: мутация «одиночный ход не показывать» оставила надпись
     * «0/1» на месте и проба прошла её насквозь. Ход засчитан, только когда
     * ЧИСЛИТЕЛЬ дошёл до единицы — увеличивает его сама анимация хода.
     */
    const надо = puzzleLevelParams(1).moves;
    let дошло = 0;
    for (let i = 0; i < 40 && дошло < 1; i++) {
      await осесть(1, 400);
      for (const м of текст(r.toJSON()).matchAll(/(\d+)\s*\/\s*(\d+)/g)) {
        if (Number(м[2]) === надо) дошло = Math.max(дошло, Number(м[1]));
      }
    }
    expect(`ходов ПОКАЗАНО на ур.1: ${дошло} из ${надо}`)
      .toBe(`ходов ПОКАЗАНО на ур.1: ${надо} из ${надо}`);
  });

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

  /**
   * 🔴 МЕНЮ ПАУЗЫ ЕСТЬ И НА ЭКРАНЕ ПОМЕХИ — ЭТО ТРЕТИЙ КАРКАС ИГРЫ.
   *
   * Помеха рисуется своим `<GameShell>`: доски нет, на экране арифметика. Проведи
   * меню в два каркаса из трёх — и человек, нажавший стрелку во время примера,
   * по-прежнему вылетал бы из подхода одним касанием. Замер 09.09 до правки:
   * `grep -c pauseActions app/games/chess-blind.tsx` → 0 при трёх `<GameShell>`.
   */
  /**
   * 🔴 ПАУЗА ОБЯЗАНА ОСТАНАВЛИВАТЬ ИГРУ, А НЕ ТОЛЬКО ЧАСЫ.
   *
   * Найдено ГЛАЗАМИ 09.09, пробами — нет. Замер в браузере: уровень 11, фаза
   * «ходы вслепую», нажал стрелку — меню открылось, доска на месте. Через 12 секунд
   * С ОТКРЫТЫМ МЕНЮ на экране уже `9 - 6 = 3 ✓ ✗`: игра ушла на помеху, позиция
   * потеряна, а человек всё это время смотрел в меню паузы.
   *
   * ПРИЧИНА: полоска показа считает по `gameNow()` и замирает верно, а СМЕНУ ФАЗЫ
   * двигает `later()` — обычный `setTimeout` по настенным часам, паузы он не знает.
   * Пауза, которая не паузит, хуже её отсутствия: прежняя стрелка хотя бы честно
   * спрашивала «выйти?».
   *
   * ⚠️ ПОЧЕМУ ПРОБА ЖИВЁТ ЗДЕСЬ, А НЕ РЯДОМ С ОСТАЛЬНЫМИ ПРО МЕНЮ. Первая редакция
   * стояла в `chess-pause-menu` на первом уровне и требовала «доска на месте, 64
   * клетки». Она ЗАЗЕЛЕНЕЛА НА ДЕФЕКТНОМ КОДЕ: на первом уровне доска видна во всех
   * фазах, и признак «64 клетки» истинен всегда. Признак фазы должен различать фазы:
   * на 11-м уровне помеха УБИРАЕТ доску и приносит `interf-yes`, и вот это уже
   * ни с чем не спутать.
   */
  it('🔴 на паузе игра СТОИТ: за 18 секунд меню фаза не уезжает на помеху', async () => {
    mockУровень.n = 11;
    const r = await монтировать(); mounted.push(r);
    await начать(r);
    await осесть(2, 300);

    const метка = (id: string) => r.root.findAll((n: any) => n.props?.testID === id, { deep: false });
    expect(`доска до паузы: ${клеток(r)}`).toBe('доска до паузы: 64');
    expect(`помеха до паузы: ${кнопкаПримера(r, 'interf-yes').length}`).toBe('помеха до паузы: 0');

    await TestRenderer.act(async () => { метка('game-back')[0].props.onPress(); });
    await осесть(1, 100);
    expect(`меню открыто: ${метка('game-pause-menu').length > 0}`).toBe('меню открыто: true');

    // 18 секунд с открытым меню — дольше показа (8 с) и всей цепочки ходов вслепую.
    await осесть(30, 600);

    expect(`меню всё ещё открыто: ${метка('game-pause-menu').length > 0}`)
      .toBe('меню всё ещё открыто: true');
    expect(`доска на месте после 18 с паузы: ${клеток(r)}`)
      .toBe('доска на месте после 18 с паузы: 64');
    expect(`игра уехала на помеху под паузой: ${кнопкаПримера(r, 'interf-yes').length > 0}`)
      .toBe('игра уехала на помеху под паузой: false');

    await TestRenderer.act(async () => { метка('pause-action:resume')[0].props.onPress(); });
    await осесть(1, 100);
  });

  it('🔴 стрелка во время помехи открывает меню паузы, а не выкидывает', async () => {
    mockУровень.n = 11;
    const r = await монтировать(); mounted.push(r);
    await начать(r);

    let дошли = false;
    for (let i = 0; i < 60 && !дошли; i++) {
      await осесть(1, 400);
      дошли = кнопкаПримера(r, 'interf-yes').length > 0;
    }
    expect(`фаза помехи наступила: ${дошли}`).toBe('фаза помехи наступила: true');

    const метка = (id: string) => r.root.findAll((n: any) => n.props?.testID === id, { deep: false });
    expect(`меню до стрелки: ${метка('game-pause-menu').length > 0}`).toBe('меню до стрелки: false');
    await TestRenderer.act(async () => { метка('game-back')[0].props.onPress(); });
    await осесть(1, 100);
    expect(`меню после стрелки: ${метка('game-pause-menu').length > 0}`).toBe('меню после стрелки: true');
    const пункты = ['resume', 'restart', 'home'].map((id) => `${id}:${метка(`pause-action:${id}`).length > 0}`).join(' ');
    expect(пункты).toBe('resume:true restart:true home:true');

    // Отпускаем общий счётчик пауз: иначе он утечёт в следующую пробу файла.
    await TestRenderer.act(async () => { метка('pause-action:resume')[0].props.onPress(); });
    await осесть(1, 100);
    expect(`меню после «Продолжить»: ${метка('game-pause-menu').length > 0}`)
      .toBe('меню после «Продолжить»: false');
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

  /**
   * 🔴 ЧИСЛО КНОПОК ВЫБОРА БЕРЁТСЯ ИЗ ЛЕСТНИЦЫ — ПРОВЕРКА НА ТОМ УРОВНЕ, ГДЕ
   * ЧИСЛА РАСХОДЯТСЯ.
   *
   * 📍 Рядом, в `chess-blind-asked-square-visible`, кнопки уже считаются — но на
   * ПЕРВОМ уровне, где лестница велит те же шесть, что стояли зашитой
   * константой. Мутация «сборка игнорирует лестницу, всегда шесть» проходила ту
   * пробу насквозь. Нужен шестой уровень: там велено восемь.
   *
   * ⚠️ Уровень подменяется моком `usePersistentLevel`, а не кладётся в хранилище:
   * экран читает его по ключу профиля (`psygames_chess_blind_level_<id>`), а id
   * создаётся провайдером на монтировании и заранее неизвестен. Попытка положить
   * значение «наугад» уже дала пробу, зеленевшую на первом уровне вместо шестого.
   */
  it('🔴 на 6-м уровне кнопок выбора восемь, а не шесть', async () => {
    const УРОВЕНЬ = 6;
    const ждём = puzzleLevelParams(УРОВЕНЬ).optionCount;
    expect(`лестница велит на ур.${УРОВЕНЬ}: ${ждём}, на ур.1: ${puzzleLevelParams(1).optionCount}`)
      .toBe(`лестница велит на ур.${УРОВЕНЬ}: 8, на ур.1: 6`);

    mockУровень.n = УРОВЕНЬ;
    const r = await монтировать(); mounted.push(r);
    await начать(r);

    // Дожидаемся опроса: кнопки выбора появляются вместе с ним.
    let кнопки: any[] = [];
    for (let i = 0; i < 60 && !кнопки.length; i++) {
      await осесть(1, 400);
      const все = r.root.findAll((n: any) =>
        typeof n.props?.onPress === 'function'
        && !/^[a-h][1-8]$/.test(String(n.props?.accessibilityLabel ?? ''))
        && n.findAll((x: any) => typeof x.props?.xml === 'string').length > 0);
      const уник = new Set(все.map((n: any) => n.props.onPress));
      if (уник.size > 0) кнопки = [...уник];
    }
    expect(`кнопки выбора появились: ${кнопки.length > 0}`).toBe('кнопки выбора появились: true');
    expect(`ур.${УРОВЕНЬ}: нарисовано ${кнопки.length}, лестница велит ${ждём}`)
      .toBe(`ур.${УРОВЕНЬ}: нарисовано ${ждём}, лестница велит ${ждём}`);
  });
});
