/* psygames-mahjong-silhouettes-gate · VER 1 · 22.08.2026 */
/**
 * СИЛУЭТ РАСКЛАДКИ: их семь, они РАЗНЫЕ, и каждый даёт РАЗБИРАЕМУЮ доску.
 *
 * 🔴 ЧТО БЫЛО. Силуэт был один — ромб. Первый уровень и сороковой отличались только
 * числом плиток: форма, то есть единственное, чем раскладки в маджонге вообще
 * различаются, была всегда одна. У образцов (Vita Mahjong — 100 млн установок,
 * Mahjong Blast — 50 млн) витринная строка магазина ровно про это: «сотни вручную
 * проработанных раскладок».
 *
 * ⚠️ ЗАЧЕМ ВСТРЕЧНАЯ СТОРОНА. «Добавить формы» ломается двумя способами сразу, и
 * проверять надо ОБА:
 *   1. Форма красивая, а доска не разбирается — игра встаёт намертво.
 *   2. Доски разбираются, а формы на глаз одинаковые — работа сделана впустую.
 * Поэтому здесь и «каждый силуэт решаем», и «силуэты не совпадают», и у второй
 * проверки есть своя проверка: силуэт, сравнённый САМ С СОБОЙ, обязан её завалить.
 *
 * ЗАМЕР 22.08.2026, по 200 сборок на силуэт (уровни 1/6/12/20/40, худшее по уровням):
 *   черепаха 20,0 % · пирамида 25,0 % · крепость 13,5 % · бабочка 15,5 %
 *   мост 13,5 % · паук 16,0 % · ромб 22,5 %
 * Это доля сборок, УПЁРШИХСЯ В ТУПИК и честно вернувших пустое (см. `generateDeal`),
 * а не доля кривых досок: экран пересобирает до двадцати раз, то есть шанс дойти до
 * игрока — 0,25²⁰ ≈ 10⁻¹². До набора силуэтов ромб давал 12–22 % на тех же уровнях,
 * так что формы не ухудшили сборку, а разложили её по той же полке.
 */
import { generateDeal } from '@/app/games/mahjong';
import { isFree, tilePlacement } from '@/src/games/mahjong/board';
import { buildPositions, silhouetteForLevel, SILHOUETTE_KEYS } from '@/src/games/mahjong/silhouettes';
import { mahjongLevel } from '@/src/services/mahjongLevels';

declare const __dirname: string;
declare function require(m: string): any;

/**
 * Проигрываем порядок снятия, которым генератор собирал доску: каждая пара в свой
 * черёд обязана быть свободной и одинаковой по символу, а после разбора не должно
 * остаться ничего. Это полная проверка обещания, а не жадный разбор (он в маджонге
 * НЕ полон и краснеет на решаемых досках — см. mahjong-solvable.test.ts).
 */
function replayHolds(deal: ReturnType<typeof generateDeal>): string[] {
  const { tiles, peelOrder } = deal;
  if (tiles.length === 0) return ['доска пуста'];
  if (peelOrder.length * 2 !== tiles.length) return [`снято пар ${peelOrder.length}, а плиток ${tiles.length}`];
  const alive = new Array(tiles.length).fill(true);
  const issues: string[] = [];
  for (let step = 0; step < peelOrder.length; step += 1) {
    const [a, b] = peelOrder[step] as [number, number];
    if (tiles[a]?.symbol !== tiles[b]?.symbol) issues.push(`шаг ${step}: символы разные`);
    if (!isFree(tiles, alive, a)) issues.push(`шаг ${step}: левая закрыта`);
    if (!isFree(tiles, alive, b)) issues.push(`шаг ${step}: правая закрыта`);
    alive[a] = false; alive[b] = false;
  }
  if (alive.some(Boolean)) issues.push('после разбора остались плитки');
  return issues;
}

/** Собрать доску ТЕМ ЖЕ путём, что и экран: до двадцати пересборок при тупике. */
function dealLikeScreen(level: number, shape: (typeof SILHOUETTE_KEYS)[number]) {
  const p = mahjongLevel(level);
  let deal = generateDeal(p.layers, p.pairs, p.cols, shape);
  for (let tries = 0; tries < 20 && deal.tiles.length === 0; tries += 1) {
    deal = generateDeal(p.layers, p.pairs, p.cols, shape);
  }
  return deal;
}

describe('силуэты: каждая форма даёт разбираемую доску', () => {
  it('семь форм, не меньше шести обещанных', () => {
    expect(SILHOUETTE_KEYS.length).toBeGreaterThanOrEqual(6);
    for (const need of ['turtle', 'pyramid', 'fortress', 'butterfly', 'bridge', 'spider']) {
      expect(SILHOUETTE_KEYS).toContain(need);
    }
  });

  it.each(SILHOUETTE_KEYS)('%s: двенадцать досок на уровнях 6 и 20 разбираются до конца', (shape) => {
    const bad: string[] = [];
    for (const level of [6, 20]) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const deal = dealLikeScreen(level, shape);
        if (deal.tiles.length === 0) { bad.push(`ур.${level} попытка ${attempt}: не собралось за 20 заходов`); continue; }
        const issues = replayHolds(deal);
        if (issues.length) bad.push(`ур.${level} попытка ${attempt}: ${issues[0]}`);
      }
    }
    expect(`${shape}: ${bad.length} → ${bad.slice(0, 3).join(' | ')}`).toBe(`${shape}: 0 → `);
  }, 120000);

  /**
   * Доля тупиков — величина ЗАМЕРЕННАЯ, а не назначенная. Потолок 45 % при замеренном
   * худшем 25 % оставляет запас на случайность тридцати сборок и всё ещё краснеет,
   * если форма станет собираться вдвое хуже.
   */
  it.each(SILHOUETTE_KEYS)('%s: тупиков при сборке заметно меньше половины', (shape) => {
    const p = mahjongLevel(12);
    let dead = 0;
    for (let i = 0; i < 30; i += 1) if (generateDeal(p.layers, p.pairs, p.cols, shape).tiles.length === 0) dead += 1;
    expect(`${shape}: тупиков ${dead}/30`).toBe(`${shape}: тупиков ${Math.min(dead, 13)}/30`);
  }, 120000);

  it.each(SILHOUETTE_KEYS)('%s: ровно заказанное число плиток и ВСЕ обещанные слои', (shape) => {
    const wrong: string[] = [];
    for (const level of [1, 6, 12, 20, 40]) {
      const p = mahjongLevel(level);
      const pos = buildPositions(p.layers, p.pairs * 2, p.cols, shape);
      if (pos.length !== p.pairs * 2) wrong.push(`ур.${level}: плиток ${pos.length}, заказано ${p.pairs * 2}`);
      for (let k = 0; k < p.layers; k += 1) {
        const cnt = pos.filter((q) => q.layer === k).length;
        // Слой в одну плитку — это слой, из которого нельзя снять пару, и правила
        // уровня («Четыре слоя») в таком случае врут игроку про доску.
        if (cnt < 2) wrong.push(`ур.${level}: слой ${k} — ${cnt} плиток`);
      }
    }
    expect(`${shape}: ${wrong.length} → ${wrong.join(' | ')}`).toBe(`${shape}: 0 → `);
  });

  it('🔴 ни одна плитка не уезжает за верхний край поля', () => {
    /**
     * Силуэты кладут слои ровно друг на друга, и прежняя формула подъёма
     * (`y * half - layer * offset`) уводила плитку верхнего слоя в самой верхней
     * строке в МИНУС — крепость и ромб на 1 уровне, бабочка на 6-м. Контейнер поля
     * обрезал её по краю: половина плитки просто не показывалась.
     */
    const outside: string[] = [];
    for (const shape of SILHOUETTE_KEYS) {
      for (const level of [1, 3, 6, 12, 16, 20, 40]) {
        const p = mahjongLevel(level);
        const pos = buildPositions(p.layers, p.pairs * 2, p.cols, shape);
        const maxLayer = pos.reduce((m, q) => Math.max(m, q.layer), 0);
        for (const q of pos) {
          const { left, top } = tilePlacement(q, maxLayer, 14, 5);
          if (top < 0 || left < 0) outside.push(`${shape} ур.${level}: ${left}/${top}`);
        }
      }
    }
    expect(`за краем: ${outside.length} → ${outside.slice(0, 3).join(' | ')}`).toBe('за краем: 0 → ');
  });

  it('каждая верхняя плитка ЛЕЖИТ на нижней, а не висит над пустотой', () => {
    const floating: string[] = [];
    for (const shape of SILHOUETTE_KEYS) {
      const p = mahjongLevel(20);
      const pos = buildPositions(p.layers, p.pairs * 2, p.cols, shape);
      const at = new Set(pos.map((q) => `${q.x}:${q.y}:${q.layer}`));
      for (const q of pos) {
        if (q.layer === 0) continue;
        if (!at.has(`${q.x}:${q.y}:${q.layer - 1}`)) floating.push(`${shape}: ${q.x}/${q.y} слой ${q.layer}`);
      }
    }
    expect(`висящих: ${floating.length} → ${floating.slice(0, 3).join(' | ')}`).toBe('висящих: 0 → ');
  });
});

/** Отпечаток раскладки: где именно лежат плитки. */
const stamp = (pos: { x: number; y: number; layer: number }[]) => new Set(pos.map((q) => `${q.x}:${q.y}:${q.layer}`));

/** Доля общих клеток от объединения: 1 — раскладки совпали, 0 — не пересекаются вовсе. */
function sameness(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  a.forEach((k) => { if (b.has(k)) inter += 1; });
  return inter / (a.size + b.size - inter);
}

/** Профиль формы: ширина каждой строки нижнего слоя. Это и читает глаз. */
function profile(pos: { x: number; y: number; layer: number }[]): string {
  const rows = new Map<number, number>();
  for (const q of pos) if (q.layer === 0) rows.set(q.y, (rows.get(q.y) ?? 0) + 1);
  return [...rows.entries()].sort((x, y) => x[0] - y[0]).map((e) => e[1]).join('-');
}

describe('силуэты: формы действительно разные', () => {
  const LEVELS = [1, 3, 6, 12, 20, 40];

  /**
   * Потолок 0,85 против замеренного худшего 0,78 (черепаха и паук на первом уровне,
   * где под форму всего 20 плиток и 4×4 клетки — там любая форма ужимается в пятно).
   * Ниже опускать нельзя: гейт покраснеет на исправном коде, а такой гейт перестают
   * читать. Выше — перестанет ловить «добавил форму, а она копия соседней».
   */
  it.each(LEVELS)('уровень %i: никакие две формы не совпадают раскладкой', (level) => {
    const p = mahjongLevel(level);
    const stamps = SILHOUETTE_KEYS.map((k) => stamp(buildPositions(p.layers, p.pairs * 2, p.cols, k)));
    const tooClose: string[] = [];
    for (let i = 0; i < stamps.length; i += 1) {
      for (let j = i + 1; j < stamps.length; j += 1) {
        const v = sameness(stamps[i] as Set<string>, stamps[j] as Set<string>);
        if (v > 0.85) tooClose.push(`${SILHOUETTE_KEYS[i]}/${SILHOUETTE_KEYS[j]} = ${v.toFixed(2)}`);
      }
    }
    expect(`слишком похожих: ${tooClose.length} → ${tooClose.join(' | ')}`).toBe('слишком похожих: 0 → ');
  });

  it('профиль нижнего слоя у всех семи форм свой', () => {
    const p = mahjongLevel(20);
    const seen = new Map<string, string>();
    const clash: string[] = [];
    for (const key of SILHOUETTE_KEYS) {
      const pr = profile(buildPositions(p.layers, p.pairs * 2, p.cols, key));
      if (seen.has(pr)) clash.push(`${seen.get(pr)} и ${key}: ${pr}`);
      seen.set(pr, key);
    }
    expect(`совпавших профилей: ${clash.length} → ${clash.join(' | ')}`).toBe('совпавших профилей: 0 → ');
  });

  /**
   * ⚠️ ПРОВЕРКА ПРОВЕРКИ. Мера сходства обязана признавать копию копией — иначе она
   * зеленеет на семи одинаковых формах, и весь заход выше не значит ничего.
   */
  it('форма, сравнённая сама с собой, меру сходства не проходит', () => {
    const p = mahjongLevel(20);
    const one = stamp(buildPositions(p.layers, p.pairs * 2, p.cols, 'turtle'));
    const copy = stamp(buildPositions(p.layers, p.pairs * 2, p.cols, 'turtle'));
    expect(sameness(one, copy)).toBe(1);
    expect(sameness(one, copy)).toBeGreaterThan(0.85);
    expect(profile(buildPositions(p.layers, p.pairs * 2, p.cols, 'turtle')))
      .toBe(profile(buildPositions(p.layers, p.pairs * 2, p.cols, 'turtle')));
  });

  it('раскладка уровня не пляшет от запуска к запуску', () => {
    const p = mahjongLevel(12);
    const a = [...stamp(buildPositions(p.layers, p.pairs * 2, p.cols, 'bridge'))].sort();
    const b = [...stamp(buildPositions(p.layers, p.pairs * 2, p.cols, 'bridge'))].sort();
    // Иначе поднятая из хранилища недоигранная партия оживала бы другой формой.
    expect(a).toEqual(b);
  });
});

describe('силуэт выбирается номером уровня', () => {
  it('соседние уровни НИКОГДА не одной формы', () => {
    const same: string[] = [];
    for (let L = 1; L <= 200; L += 1) {
      if (silhouetteForLevel(L) === silhouetteForLevel(L + 1)) same.push(`${L}→${L + 1}: ${silhouetteForLevel(L)}`);
    }
    expect(`подряд одинаковых: ${same.length} → ${same.slice(0, 3).join(' | ')}`).toBe('подряд одинаковых: 0 → ');
  });

  it('любые семь подряд дают все семь форм', () => {
    const gaps: string[] = [];
    for (let L = 1; L <= 60; L += 1) {
      const win = new Set(Array.from({ length: SILHOUETTE_KEYS.length }, (_, i) => silhouetteForLevel(L + i)));
      if (win.size !== SILHOUETTE_KEYS.length) gaps.push(`с ${L}: только ${win.size}`);
    }
    expect(`неполных окон: ${gaps.length} → ${gaps.slice(0, 3).join(' | ')}`).toBe('неполных окон: 0 → ');
  });

  it('один и тот же уровень — всегда одна и та же форма', () => {
    for (const L of [1, 7, 13, 40, 99]) expect(silhouetteForLevel(L)).toBe(silhouetteForLevel(L));
    expect(silhouetteForLevel(0)).toBe(silhouetteForLevel(1));   // мусор на входе не роняет доску
  });
});

describe('экран берёт форму по уровню, а не одну на всех', () => {
  const read = (rel: string): string => require('fs').readFileSync(
    require('path').join(__dirname, rel), 'utf8',
  ) as string;
  const code = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const screen = code(read('../../app/games/mahjong.tsx'));

  /**
   * ⚠️ ПРАВКА 23.08.2026. Форма доски переехала из формул в БИБЛИОТЕКУ раскладок
   * (`src/games/mahjong/layouts.ts` — 84 рисованные вручную доски из ffalt/mah,
   * MIT). Силуэт остался ЗАПАСНЫМ путём и передаётся по-прежнему: если для уровня
   * годной раскладки не нашлось, места рисует формула. Проверка сторожит ОБА
   * конца провода — уберут раскладку или уберут запасной путь, станет красно.
   */
  it('загрузка уровня берёт раскладку по уровню и отдаёт её генератору', () => {
    expect(screen).toMatch(/const shape = silhouetteForLevel\(L\)/);
    expect(screen).toMatch(/const layout = layoutForLevel\(L\)/);
    expect(screen).toMatch(/generate\(p\.layers, p\.pairs, p\.cols, shape, layout\?\.places\)/);
  });

  it('своей геометрии на экране больше нет — она в ядре', () => {
    // Копия построителя в экране разъедется с проверками при первой же правке.
    expect(screen).not.toMatch(/function buildPositions/);
    expect(screen).not.toMatch(/function layerCells/);
  });
});
