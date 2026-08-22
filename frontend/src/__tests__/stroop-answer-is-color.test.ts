/* psygames-stroop-answer-is-color · VER 1 · 23.08.2026 */
/**
 * ОТВЕТ В СТРУПЕ — ЦВЕТ, А НЕ СЛОВО. ПРОВЕРЯЕМ ПО ЖИВОМУ ДЕРЕВУ.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. Кнопка ответа была залита своим цветом И ПОДПИСАНА названием
 * этого цвета. Смысл пробы Струпа — подавить чтение слова и ответить по ЦВЕТУ
 * КРАСКИ. Подписанные варианты возвращают в ответ ровно то чтение, которое проба
 * гасит: «увидел цвет → назвал его про себя → нашёл ЭТО СЛОВО среди четырёх».
 * Лишний шаг ложится во ВРЕМЯ РЕАКЦИИ, а `interference_ms` считается как разность
 * времён конгруэнтных и конфликтных проб — то есть портится сам биомаркер, ради
 * которого игра и существует. В нормативных компьютерных вариантах ответ — либо
 * клавиша, либо ЦВЕТНАЯ ПЛАШКА БЕЗ ПОДПИСИ.
 *
 * ⚠️ ПОЧЕМУ ПО ОТРИСОВАННОМУ ДЕРЕВУ, А НЕ ПОИСКОМ СТРОКИ В ИСХОДНИКЕ. Поиск по
 * файлу здесь бесполезен по устройству: название цвета в исходнике ОБЯЗАНО
 * остаться — оно рисуется словом-стимулом, зачитывается скринридером и печатается
 * на плашке в режиме дальтоника. Разница между «слово на кнопке» и «слово на
 * стимуле» видна только в том, ЧТО ГДЕ НАРИСОВАНО. Поэтому экран монтируется
 * целиком, партия доводится до поля, и плашки опознаются не по testID (его можно
 * повесить куда угодно), а по признаку самой плашки: нажимаемый узел, залитый
 * цветом из палитры игры.
 *
 * ⚠️ ЗЕЛЁНОЕ ВСЛЕПУЮ ЗДЕСЬ ОСОБЕННО ДЁШЕВО: «на кнопке нет слова» правда и тогда,
 * когда не отрисовалось вообще ничего. Поэтому каждая проба ниже сначала
 * доказывает, что есть что смотреть: плашек ровно четыре, а слово-стимул на
 * экране ЕСТЬ — тем же обходом дерева, той же меркой.
 */
declare function require(m: string): any;
import React from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STROOP_PALETTES } from '@/app/games/stroop';

const TestRenderer = require('react-test-renderer');

type Swatch = { name: string; ru: string; en: string; hex: string };

/** Порог живого аудита `scripts/tap-target-audit.mjs` НА ПОЛЕ (Material, 48 dp). */
const MIN_TAP = 48;

/** Каркас GameShell спрашивает безопасные поля — без метрик он падает на монтаже. */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/**
 * Язык теста — база приложения (`useState<Language>('en')` в LanguageContext),
 * поэтому названия цветов ждём английские. Русское написание тоже держим под
 * рукой: проба «на плашке нет названия» обязана не пропустить и его.
 */
const EN = (c: Swatch) => c.en;

async function mountStroop(colorblind: boolean) {
  await AsyncStorage.clear();
  if (colorblind) await AsyncStorage.setItem('psygames_colorblind', 'true');
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/stroop').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  // Тема (флаг дальтонизма) и уровень приезжают из хранилища асинхронно — даём кадр.
  await TestRenderer.act(async () => { await new Promise((res) => setTimeout(res, 10)); });
  return r;
}

/** Все строки, РЕАЛЬНО нарисованные внутри узла (числа считаем тоже: «1/20»). */
function textsIn(node: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string') { out.push(n); return; }
    if (typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) (n.children as any[]).forEach(walk);
  };
  walk(node);
  return out;
}

const joined = (node: any) => textsIn(node).join('');

/**
 * Номер текущей пробы из шапки («Round 1/20»). Читаем с экрана, а НЕ сверяем с
 * ожидаемым числом трейлов: раскладку уровней (`levelParams`) правят отдельной
 * задачей, и проба про кнопку не должна краснеть от того, что проб стало 24.
 */
function roundNo(r: any): number {
  const m = joined(r.root).match(/(\d+)\/(\d+)/);
  if (!m) throw new Error('счётчика проб на экране нет — проверять нечего');
  return Number(m[1]);
}

/**
 * ⚠️ ТОЛЬКО ВНЕШНИЕ СОВПАДЕНИЯ. `TouchableOpacity` в RN 0.85 отдаёт ВТОРОЙ узел с
 * теми же пропами (обёртка forwardRef над классом), и без этого каждая кнопка
 * находилась бы дважды: «плашек четыре» превратилось бы в восемь, а проба
 * «кнопка входа одна» роняла бы прогон на исправном экране.
 */
const OUTER = { deep: false };

/** Вход в партию ищем по подписи кнопки, а не по testID: экран его не держит. */
function pressStart(r: any) {
  const btns = r.root.findAll((n: any) =>
    typeof n.props?.onPress === 'function' && textsIn(n).includes('Start'), OUTER);
  if (btns.length !== 1) throw new Error(`кнопку входа не опознать: найдено ${btns.length}`);
  TestRenderer.act(() => { btns[0].props.onPress(); });
}

/**
 * ПЛАШКА ОТВЕТА = нажимаемый узел, ЗАЛИТЫЙ цветом из палитры. Именно заливка, а
 * не `color`: зелёный счётчик попаданий в шапке красится тем же `#22c55e`.
 */
function plates(r: any, palette: readonly Swatch[]) {
  const hexes = palette.map((c) => c.hex);
  return r.root.findAll((n: any) => {
    if (typeof n.props?.onPress !== 'function') return false;
    const st = StyleSheet.flatten(n.props.style) as any;
    return !!st && typeof st.backgroundColor === 'string' && hexes.includes(st.backgroundColor);
  }, OUTER);
}

const swatchOf = (palette: readonly Swatch[], node: any): Swatch => {
  const bg = (StyleSheet.flatten(node.props.style) as any).backgroundColor;
  return palette.find((c) => c.hex === bg)!;
};

/** Все названия цветов, какие игра вообще знает, — на обоих её языках. */
const ALL_NAMES = [...new Set([...STROOP_PALETTES.normal, ...STROOP_PALETTES.colorblind]
  .flatMap((c) => [c.ru, c.en]))];

describe('Струп: набор ответов — цветные плашки', () => {
  const PAL = STROOP_PALETTES.normal;

  it('есть что проверять: партия дошла до поля, плашек ровно четыре', async () => {
    const r = await mountStroop(false);
    try {
      expect(plates(r, PAL)).toHaveLength(0);       // на настройках поля ещё нет
      pressStart(r);
      expect(plates(r, PAL)).toHaveLength(4);
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  it('🔴 на плашке НЕТ названия цвета — ни английского, ни русского', async () => {
    const r = await mountStroop(false);
    try {
      pressStart(r);
      const found: string[] = [];
      for (const p of plates(r, PAL)) {
        const text = joined(p);
        for (const name of ALL_NAMES) {
          if (text.toUpperCase().includes(name.toUpperCase())) {
            found.push(`${swatchOf(PAL, p).name}: на кнопке написано «${text}»`);
          }
        }
      }
      expect(found).toEqual([]);
      // И это чистая плашка, а не «слово другими буквами»: текста нет вовсе.
      expect(plates(r, PAL).map((p: any) => joined(p).trim())).toEqual(['', '', '', '']);
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  /**
   * 🔴 БЕЗ ЭТОЙ ПРОБЫ ПРЕДЫДУЩАЯ НИЧЕГО НЕ СТОИТ. «Слова на кнопке нет» — правда
   * и для пустого экрана, и для сломанного обхода дерева. Здесь тем же обходом и
   * той же меркой доказывается: слова игра рисует, и одно из них на экране есть —
   * это сам стимул. Значит проба выше отличает «не нарисовано» от «нарисовано не
   * на кнопке», а не молчит вхолостую.
   */
  it('🔴 и это не зелёное вслепую: слово-стимул на экране ЕСТЬ', async () => {
    const r = await mountStroop(false);
    try {
      pressStart(r);
      const screen = joined(r.root).toUpperCase();
      const shown = PAL.filter((c) => screen.includes(c.en.toUpperCase()));
      expect(`слово-стимул на экране: ${shown.length > 0}`).toBe('слово-стимул на экране: true');
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  it('🔴 у каждой плашки accessibilityLabel — и назван ИМЕННО её цвет', async () => {
    const r = await mountStroop(false);
    try {
      pressStart(r);
      const said = plates(r, PAL).map((p: any) => `${swatchOf(PAL, p).name}=${p.props.accessibilityLabel}`);
      expect(said.sort()).toEqual(PAL.map((c) => `${c.name}=${EN(c)}`).sort());
      // Скринридер обязан назвать её кнопкой, а не картинкой.
      for (const p of plates(r, PAL)) expect(p.props.accessibilityRole).toBe('button');
      // Четыре разные подписи: одинаковые означали бы два верных ответа на пробу.
      expect(new Set(plates(r, PAL).map((p: any) => p.props.accessibilityLabel)).size).toBe(4);
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  /**
   * Ширину держал текст (`minWidth: 140` + подпись). Текст ушёл — размер обязан
   * остаться: живой аудит `tap-target-audit --mode=field` ходит по игровому полю
   * с порогом 48 и покраснел бы на пустой плашке высотой в два отступа.
   */
  it('🔴 пустая плашка не мельче нормы попадания пальцем', async () => {
    const r = await mountStroop(false);
    try {
      pressStart(r);
      const small: string[] = [];
      for (const p of plates(r, PAL)) {
        const st = StyleSheet.flatten(p.props.style) as any;
        const w = st.minWidth ?? st.width ?? 0;
        const h = st.minHeight ?? st.height ?? 0;
        if (w < MIN_TAP || h < MIN_TAP) small.push(`${swatchOf(PAL, p).name}: ${w}×${h} < ${MIN_TAP}`);
      }
      expect(small).toEqual([]);
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  /** Плашка без подписи обязана остаться РАБОЧИМ ответом, а не украшением. */
  it('🔴 нажатие по плашке засчитывается как ответ — проба сменяется', async () => {
    const r = await mountStroop(false);
    try {
      pressStart(r);
      const before = roundNo(r);
      TestRenderer.act(() => { plates(r, PAL)[0].props.onPress(); });
      expect(`проба ${before} → ${roundNo(r)}`).toBe(`проба ${before} → ${before + 1}`);
    } finally { TestRenderer.act(() => r.unmount()); }
  });
});

/**
 * РЕЖИМ ДАЛЬТОНИКА — ОТДЕЛЬНОЕ РЕШЕНИЕ, А НЕ ЗАБЫТЫЙ УГОЛ.
 *
 * Там различать ответ по одному тону ненадёжно по определению режима, и плашка
 * без подписи сделала бы игру неиграбельной. Замер измерения в этом режиме и так
 * идёт с оговоркой (палитра подобрана под имитацию дальтонизма), а вот
 * невозможность ответить — не оговорка, а стена. Поэтому подпись остаётся, и
 * держится это пробой, а не обещанием в комментарии экрана.
 */
describe('Струп при дальтонизме: подпись на плашке остаётся', () => {
  const CB = STROOP_PALETTES.colorblind;

  it('🔴 плашки взяты из палитры дальтонизма, и на каждой написан её цвет', async () => {
    const r = await mountStroop(true);
    try {
      pressStart(r);
      const p = plates(r, CB);
      expect(p).toHaveLength(4);
      const said = p.map((n: any) => `${swatchOf(CB, n).name}=${joined(n).trim()}`);
      expect(said.sort()).toEqual(CB.map((c) => `${c.name}=${EN(c)}`).sort());
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  it('🔴 обычная палитра в этом режиме не используется — иначе флаг ничего не значит', async () => {
    const r = await mountStroop(true);
    try {
      pressStart(r);
      expect(plates(r, STROOP_PALETTES.normal)).toHaveLength(0);
    } finally { TestRenderer.act(() => r.unmount()); }
  });

  it('🔴 подпись есть ТОЛЬКО здесь: в обычном режиме тот же обход её не находит', async () => {
    const cb = await mountStroop(true);
    const cbText = (() => { pressStart(cb); const t = plates(cb, CB).map((n: any) => joined(n).trim()); TestRenderer.act(() => cb.unmount()); return t; })();
    const normal = await mountStroop(false);
    const normalText = (() => { pressStart(normal); const t = plates(normal, STROOP_PALETTES.normal).map((n: any) => joined(n).trim()); TestRenderer.act(() => normal.unmount()); return t; })();
    expect(`дальтоник подписан: ${cbText.every((s: string) => s.length > 0)}`).toBe('дальтоник подписан: true');
    expect(`обычный подписан: ${normalText.some((s: string) => s.length > 0)}`).toBe('обычный подписан: false');
  });
});
