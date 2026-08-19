/**
 * ЦВЕТ ТЕКСТА ПОВЕРХ ЦВЕТНОГО ГРАДИЕНТА — СЧИТАЕТСЯ, А НЕ УГАДЫВАЕТСЯ.
 *
 * 🔴 ЗАЧЕМ. У каждой игры свой градиент — это её опознавательный знак в каталоге,
 * и трогать его нельзя. А текст поверх был зашит белым (`color: '#FFF'`) у всех
 * подряд. Замер 19.08.2026 по обоим концам каждого градиента:
 *
 *   ospan        #cb356b→#bdfff3 — 1.12
 *   anagrams     #ee9ca7→#ffdde1 — 1.26
 *   counter      #fa709a→#fee140 — 1.31
 *   proofreading #a8edea→#fed6e3 — 1.32
 *
 * Единица — это «белым по белому». Из 65 градиентов 53 были ниже AA 4.5, из них
 * 40 — ниже 3.0, порога даже для крупного текста. Страдали название игры (22 pt)
 * и кнопка «Начать» — ровно то, по чему человек решает, играть ли.
 *
 * ⚠️ ТЕНЬ ПОД ТЕКСТОМ КОНТРАСТ НЕ ЗАМЕНЯЕТ. Она размывает края буквы, а WCAG
 * считает светлоту. Здесь считается светлота.
 *
 * 🔴 ГЛАВНАЯ ЛОВУШКА — «светлый или тёмный» решает НЕ ВСЁ.
 * Порог AA 4.5 достижим сплошным цветом только если:
 *   · тёмный текст — когда ТЁМНЫЙ конец градиента ещё достаточно светлый
 *     (относительная яркость ≥ 0.175), иначе на нём буква сольётся;
 *   · светлый текст — когда СВЕТЛЫЙ конец достаточно тёмный (≤ 0.183).
 * Градиент вроде `#43cea2→#185a9d` (бирюза→тёмно-синий) не проходит НИ ТАК НИ ТАК:
 * белый даёт 1.98 на бирюзе, чёрный — 2.99 на синем. Это арифметика, а не лень.
 * Таких 21 из 65. Для них одного цвета мало — нужна вуаль (см. ниже).
 *
 * ЧТО ДЕЛАЕМ.
 *  1. Пробуем сплошной цвет. Берём направление (светлый/тёмный) и слегка тонируем
 *     его оттенком самого градиента — чтобы текст выглядел задуманным, а не
 *     «чёрным по умолчанию». Тонируем ЧУТЬ-ЧУТЬ и только пока держится порог.
 *     Образец руками уже был: anagrams — тёмно-фиолетовый `#3f2b96` на розовом.
 *  2. Если сплошным порог недостижим — кладём поверх плашки ВУАЛЬ: полупрозрачный
 *     слой ЦВЕТОМ САМОГО ГРАДИЕНТА (его же тёмный или светлый конец). Градиент при
 *     этом остаётся собой — оттенок узнаваем, меняется только глубина. Прозрачность
 *     подбирается МИНИМАЛЬНАЯ из тех, что дают AA, а из двух направлений выбирается
 *     то, что меньше сдвигает яркость плашки. Вуаль — это НЕ тень: она честно
 *     меняет светлоту фона, и контраст после неё пересчитан по обоим концам.
 *
 * Проверка живёт в `src/__tests__/on-gradient-contrast.test.ts`: она считает
 * контраст заново по исходникам игр, а не ищет имя этой функции в коде.
 */

/** AA для обычного текста. */
export const AA_NORMAL = 4.5;
/** AA для крупного текста (≥ 24 px, либо ≥ 18.66 px жирного). */
export const AA_LARGE = 3;

/** Насколько сильно уводим тонированный цвет к краю (0 — чистый оттенок, 1 — чистый чёрный/белый). */
const TINT_START = { dark: 0.82, light: 0.86 } as const;
/** Запас над порогом при ПОДБОРЕ: чтобы округление не роняло проверку на самой границе. */
const PICK_MARGIN = 0.05;

function toRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);          // #rrggbbaa → альфу игнорируем
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: number[]): string {
  return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Относительная яркость по WCAG 2.x (не «средняя яркость на глаз» — именно WCAG). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Контраст по WCAG: от 1 (не отличить) до 21 (чёрное на белом). */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Наложение `fg` с прозрачностью `alpha` на `bg`.
 * Смешивание идёт в sRGB — так же, как это делают браузер и React Native для
 * `backgroundColor: 'rgba(...)'`. Считать в линейном пространстве было бы
 * «правильнее» физически, но разошлось бы с тем, что видно на экране.
 */
export function blend(fg: string, bg: string, alpha: number): string {
  const F = toRgb(fg); const B = toRgb(bg);
  return toHex([0, 1, 2].map((i) => F[i] * alpha + B[i] * (1 - alpha)));
}

/** Цвет в `rgba()` — вуаль кладётся полупрозрачной. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

const towardBlack = (c: string, k: number) => toHex(toRgb(c).map((v) => v * (1 - k)));
const towardWhite = (c: string, k: number) => toHex(toRgb(c).map((v) => v + (255 - v) * k));
const midpoint = (a: string, b: string) => toHex([0, 1, 2].map((i) => (toRgb(a)[i] + toRgb(b)[i]) / 2));
const worstContrast = (c: string, ends: string[]) => Math.min(...ends.map((e) => contrastRatio(c, e)));

/**
 * Воспринимаемая светлота L* (CIE Lab), 0..100.
 * ⚠️ ГРАБЛЯ, на которой я обжёгся: сравнивать «насколько вуаль изменила плашку»
 * по сырой яркости Y — неверно. Глаз к тёмному куда чувствительнее: поднять
 * почти-чёрный `#1A2980` на 0.14 по Y — заметная перемена, а опустить яркую
 * бирюзу на 0.32 по Y — почти нет. По Y выигрывала светлая вуаль, и глубокий
 * синий у «Пространственного объёма» выцветал. По L* выбор становится честным.
 */
function lightness(hex: string): number {
  const y = relativeLuminance(hex);
  const f = y > 0.008856 ? Math.cbrt(y) : (7.787 * y + 16 / 116);
  return 116 * f - 16;
}

/**
 * Самый «живой» (наименее выбеленный/зачернённый) оттенок, который ещё держит порог.
 * Не хватило даже чистого края — возвращаем край: он максимум из возможного.
 */
function tinted(base: string, dir: 'dark' | 'light', ends: string[], target: number): string {
  for (let k = TINT_START[dir]; k <= 1.0001; k += 0.02) {
    const c = dir === 'dark' ? towardBlack(base, k) : towardWhite(base, k);
    if (worstContrast(c, ends) >= target) return c;
  }
  return dir === 'dark' ? '#000000' : '#ffffff';
}

export interface OnGradient {
  /** Цвет текста и иконок поверх этого градиента. */
  color: string;
  /** Цвет вуали на всю плашку, или null — если сплошного цвета хватило. */
  veil: string | null;
  /** Прозрачность вуали 0..1 (0, когда вуали нет). */
  veilAlpha: number;
  /** Фактические концы фона ПОД текстом — уже с учётом вуали. По ним и проверяют. */
  ends: [string, string];
  /** Фактический минимальный контраст текста к обоим концам. */
  ratio: number;
  /** Взят ли порог. false — значит цвет лучший из возможных, но AA не достигнут. */
  ok: boolean;
}

/** Кэш: функция чистая, а зовут её из module scope десятков экранов. */
const cache = new Map<string, OnGradient>();

/**
 * Цвет текста (и при нужде — вуаль) для текста поверх градиента `c1 → c2`.
 *
 * @param c1 первый конец градиента
 * @param c2 второй конец
 * @param target требуемый контраст; по умолчанию AA 4.5 для обычного текста
 */
export function onGradientText(c1: string, c2: string, target: number = AA_NORMAL): OnGradient {
  const key = `${c1}|${c2}|${target}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = compute(c1, c2, target);
  cache.set(key, out);
  return out;
}

function compute(c1: string, c2: string, target: number): OnGradient {
  const ends: [string, string] = [c1, c2];
  const base = midpoint(c1, c2);
  const seek = target + PICK_MARGIN;

  // 1. Хватает ли сплошного цвета? Чистые чёрный и белый — предел возможного,
  //    если не берут они, не возьмёт никакой другой сплошной цвет.
  const darkOk = worstContrast('#000000', ends) >= seek;
  const lightOk = worstContrast('#ffffff', ends) >= seek;
  if (darkOk || lightOk) {
    const dir: 'dark' | 'light' = darkOk && lightOk
      ? (worstContrast('#000000', ends) >= worstContrast('#ffffff', ends) ? 'dark' : 'light')
      : (darkOk ? 'dark' : 'light');
    const color = tinted(base, dir, ends, seek);
    return { color, veil: null, veilAlpha: 0, ends, ratio: worstContrast(color, ends), ok: true };
  }

  // 2. Сплошным не берётся — ищем вуаль. Из двух направлений выбираем то, что
  //    МЕНЬШЕ сдвигает яркость плашки: цель — сделать текст читаемым, а не
  //    перекрасить игру. Внутри направления берём минимальную прозрачность.
  let best: (OnGradient & { cost: number }) | null = null;
  for (const veilDir of ['dark', 'light'] as const) {
    const l1 = relativeLuminance(c1); const l2 = relativeLuminance(c2);
    // Вуаль красим концом САМОГО градиента — тем, что уже в нужную сторону.
    const endBase = veilDir === 'dark' ? (l1 < l2 ? c1 : c2) : (l1 > l2 ? c1 : c2);
    const textDir: 'dark' | 'light' = veilDir === 'dark' ? 'light' : 'dark';
    let found = false;
    for (let a = 0.04; a <= 1.0001 && !found; a += 0.01) {
      // k — насколько сам цвет вуали доведён до крайности. 0 = чистый конец градиента.
      for (const k of [0, 0.15, 0.3, 0.45, 0.6, 0.8]) {
        const veil = veilDir === 'dark' ? towardBlack(endBase, k) : towardWhite(endBase, k);
        const veiled: [string, string] = [blend(veil, c1, a), blend(veil, c2, a)];
        const color = tinted(base, textDir, veiled, seek);
        const ratio = worstContrast(color, veiled);
        if (ratio < seek) continue;
        const cost = Math.abs(lightness(veiled[0]) - lightness(c1))
                   + Math.abs(lightness(veiled[1]) - lightness(c2));
        if (!best || cost < best.cost) {
          best = { color, veil, veilAlpha: Math.round(a * 100) / 100, ends: veiled, ratio, ok: true, cost };
        }
        found = true;
        break;
      }
    }
  }
  if (best) { const { cost, ...rest } = best; return rest; }

  // 3. Не должно случаться (вуаль до непрозрачной всегда решает), но молча врать нельзя:
  //    отдаём лучший из чистых краёв и честно ставим ok:false — проверка это поймает.
  const color = worstContrast('#000000', ends) >= worstContrast('#ffffff', ends) ? '#000000' : '#ffffff';
  return { color, veil: null, veilAlpha: 0, ends, ratio: worstContrast(color, ends), ok: false };
}

/**
 * Приглушённый вариант того же цвета — для подписей второго плана
 * (в исходнике это были `rgba(255,255,255,0.8)` и `opacity: 0.9`, которые
 * съедали как раз тот контраст, ради которого всё затевалось).
 * Приглушаем ровно настолько, насколько позволяет порог.
 */
export function onGradientTextMuted(g: OnGradient, target: number = AA_NORMAL): string {
  const toward = midpoint(g.ends[0], g.ends[1]);
  for (let k = 0.35; k > 0; k -= 0.05) {
    const c = toHex([0, 1, 2].map((i) => toRgb(g.color)[i] * (1 - k) + toRgb(toward)[i] * k));
    if (worstContrast(c, g.ends) >= target + PICK_MARGIN) return c;
  }
  return g.color;
}
