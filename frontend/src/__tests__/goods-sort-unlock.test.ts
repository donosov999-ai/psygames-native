/**
 * КОЛЛЕКЦИЯ ТОВАРОВ: НАБОРЫ ОТКРЫВАЮТСЯ ПО ПРОГРЕССУ.
 *
 * Решение Дениса 20.08.2026. Порог не назначен вкусом — он ВЫВЕДЕН из замера
 * самой игры, и этот файл держит именно вывод, а не список чисел.
 *
 * ЗАМЕР, ИЗ КОТОРОГО СЛЕДУЮТ ПОРОГИ. Число видов товара в партии считается как
 *     types = min(размер пула, потолок доски, typeBudget(L)),  typeBudget = 4 + ⌊L/2⌋
 * Пул упирается в игру только тогда, когда бюджет уровня его перерастёт. Пока
 * `typeBudget(L) ≤ пул`, у набора из шести видов и у набора из тридцати двух
 * получается ОДНО И ТО ЖЕ число видов на доске — при любой форме доски и на
 * любом экране, потому что третий член минимума и так меньше обоих пулов.
 * Значит до этого уровня набор не может отличаться ничем, кроме картинок.
 *
 * Отсюда пороги: «Еда» (6 видов) — с 6-го уровня, «Напитки» (8) — с 10-го,
 * «Игрушки» и «Молочное» (9) — с 12-го. «Микс» (32) не упирается никогда: он и
 * ЕСТЬ «сколько уровень позволит», точка отсчёта, — поэтому открыт с первого.
 *
 * ⚠️ ПОРОГ — ЭТО «С КАКОГО УРОВНЯ НАБОР МОЖЕТ ОТЛИЧАТЬСЯ», А НЕ «ГДЕ ОН ТОЧНО
 * ОТЛИЧИТСЯ». Замер 20.08.2026: форма доски (shapeFor) режет ниши, и потолок
 * `slots − 2 − препятствия` часто оказывается ниже бюджета. Первое РЕАЛЬНОЕ
 * расхождение «Еды» с «Миксом» — L9 на телефоне и L7 на планшете. Обещать такое
 * числом нельзя: оно разное на разных экранах. А вот «до 6-го гарантированно
 * одинаково» — верно везде, и обещание опирается ровно на это.
 */
import {
  GOOD_SETS_KEYS, GOOD_SET_POOL_SIZE, WIDEST_POOL,
  typeBudget, poolBitesAt, setUnlockLevel, setAvailable, levelCfg,
  snapshotGoodsParty, restoreGoodsParty,
  type GoodsLiveParty, type GoodsResume,
} from '@/app/games/goods-sort';

declare const __dirname: string;
declare function require(id: string): any;

const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');
const ROOT = join(__dirname, '../..');

/** ⚠️ Комментарии срезаем ДО поиска: иначе гейт зеленеет от слова в разборе. */
function strip(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const SRC: string = strip(readFileSync(join(ROOT, 'app/games/goods-sort.tsx'), 'utf8') as string);

/** Оба экрана: на телефоне и на планшете доска разная, порог обязан быть один. */
const NARROW = [true, false];

// ─────────────────────── откуда берётся порог ───────────────────────

describe('порог выведен из числа видов в пуле, а не назначен', () => {
  it('есть что проверять — наборы и их пулы прочитаны', () => {
    expect(GOOD_SETS_KEYS.length).toBe(6);
    expect(GOOD_SETS_KEYS.map((k) => `${k}:${GOOD_SET_POOL_SIZE(k)}`))
    /**
     * ⚠️ 34, а не прежние 43: из «Микса» убраны девять молочных бутылок
     * (23…31) — в наборе по умолчанию они давали шесть пар одинакового
     * силуэта, различимых только оттенком этикетки. Различение оттенков
     * осталось в «Молочном», где оно и есть суть набора.
     */
      .toEqual(['mix:34', 'food:6', 'drinks:8', 'toys:8', 'dairy:9', 'pets:12']);
  });

  /**
   * 🔴 ГЛАВНАЯ СВЯЗЬ. Порог набора = первый уровень, на котором бюджет видов
   * ПЕРЕРАСТАЕТ его пул. Проверяем с двух сторон: на пороге перерос, на уровень
   * раньше — ещё нет. Назначь порог числом «от балды» — любая из двух половин
   * покраснеет, потому что она считается из размера пула, а не из порога.
   */
  it.each(['food', 'drinks', 'toys', 'dairy', 'pets'])('порог набора %s зажат размером его пула с обеих сторон', (key) => {
    const P = GOOD_SET_POOL_SIZE(key);
    const L = setUnlockLevel(key);
    expect(`${key}: пул ${P}, порог ${L}, бюджет на пороге ${typeBudget(L)}, на уровень раньше ${typeBudget(L - 1)}`)
      .toBe(`${key}: пул ${P}, порог ${L}, бюджет на пороге ${P + 1 <= typeBudget(L) ? typeBudget(L) : '≤пула — порог поздно'}, на уровень раньше ${typeBudget(L - 1) <= P ? typeBudget(L - 1) : 'уже перерос — порог рано'}`);
  });

  it('порог каждого набора совпадает с чистым выводом poolBitesAt(размер пула)', () => {
    const got = ['food', 'drinks', 'toys', 'dairy', 'pets'].map((k) => `${k}:${setUnlockLevel(k)}`);
    const want = ['food', 'drinks', 'toys', 'dairy', 'pets'].map((k) => `${k}:${poolBitesAt(GOOD_SET_POOL_SIZE(k))}`);
    expect(got).toEqual(want);
  });

  it('пороги — те самые, что дал замер', () => {
    expect(GOOD_SETS_KEYS.map((k) => `${k}:${setUnlockLevel(k)}`))
      // 30.08.2026: лиса выведена из «Игрушек» (пул 9→8, порог 12→10), заведён
      // набор «Зверята» из двенадцати новых — самый широкий после «Микса».
      .toEqual(['mix:1', 'food:6', 'drinks:10', 'toys:10', 'dairy:12', 'pets:18']);
  });

  it('шире пул — позже порог, и никаких совпадений «случайно»', () => {
    expect([4, 5, 6, 7, 8, 9, 10].map(poolBitesAt)).toEqual([2, 4, 6, 8, 10, 12, 14]);
    for (let P = 4; P < 32; P++) expect(poolBitesAt(P + 1)).toBeGreaterThan(poolBitesAt(P));
  });

  it('самый широкий набор — точка отсчёта, он открыт с первого уровня', () => {
    const widest = GOOD_SETS_KEYS.filter((k) => GOOD_SET_POOL_SIZE(k) >= WIDEST_POOL);
    expect(widest).toEqual(['mix']);
    expect(setUnlockLevel('mix')).toBe(1);
  });

  it('хотя бы один набор открыт на первом уровне — иначе играть нечем', () => {
    const open1 = GOOD_SETS_KEYS.filter((k) => setAvailable(k, 1));
    expect(`открыто на 1-м: ${open1.join(',') || 'НИЧЕГО'}`).toBe('открыто на 1-м: mix');
  });
});

// ───────────────── порог совпадает с механикой, а не с картинками ─────────────────

describe('до порога набор ничем не отличается, после — начинает', () => {
  /**
   * До порога `typeBudget(L) ≤ пул`, значит min(пул, потолок, бюджет) =
   * min(потолок, бюджет) — ровно то же, что у самого широкого набора. Это верно
   * при ЛЮБОЙ форме доски и на любом экране, потому и проверяем оба.
   */
  it.each(['food', 'drinks', 'toys', 'dairy', 'pets'])('%s до своего порога даёт то же число видов, что «Микс»', (key) => {
    const P = GOOD_SET_POOL_SIZE(key);
    const bad: string[] = [];
    for (const narrow of NARROW) {
      for (let L = 1; L < setUnlockLevel(key); L++) {
        const mine = levelCfg(L, P, narrow).types;
        const wide = levelCfg(L, WIDEST_POOL, narrow).types;
        if (mine !== wide) bad.push(`${narrow ? 'телефон' : 'планшет'} L${L}: ${mine}≠${wide}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it.each(['food', 'drinks', 'toys', 'dairy'])('%s с порога уже расходится с «Миксом» — набор перестал быть украшением', (key) => {
    const P = GOOD_SET_POOL_SIZE(key);
    const from = setUnlockLevel(key);
    const bad: string[] = [];
    for (const narrow of NARROW) {
      const hit = [];
      for (let L = from; L <= from + 8; L++) {
        if (levelCfg(L, P, narrow).types !== levelCfg(L, WIDEST_POOL, narrow).types) hit.push(L);
      }
      if (!hit.length) bad.push(`${narrow ? 'телефон' : 'планшет'}: с ${from} по ${from + 8} расхождений нет`);
    }
    expect(bad).toEqual([]);
  });

  it('бюджет видов — одно число на игру и на порог, а не две копии формулы', () => {
    expect(SRC).toContain('typeBudget(L)');
    expect(SRC.match(/4 \+ Math\.floor\(L \/ 2\)/g) ?? []).toHaveLength(1);
    expect(SRC).toMatch(/const types = Math\.min\(poolSize, typeCeiling, typeBudget\(L\)\)/);
  });
});

// ─────────────────────── что можно выбрать ───────────────────────

describe('выбрать можно только открытое', () => {
  it.each(['food', 'drinks', 'toys', 'dairy', 'pets'])('%s закрыт на уровень раньше порога и открыт на пороге', (key) => {
    const L = setUnlockLevel(key);
    expect(`${key}: ур.${L - 1} ${setAvailable(key, L - 1)}, ур.${L} ${setAvailable(key, L)}`)
      .toBe(`${key}: ур.${L - 1} false, ур.${L} true`);
  });

  it('на первом уровне закрыты все тематические наборы', () => {
    expect(GOOD_SETS_KEYS.filter((k) => !setAvailable(k, 1))).toEqual(['food', 'drinks', 'toys', 'dairy', 'pets']);
  });

  it('на двенадцатом открыто всё, кроме «Зверят» — они самые широкие', () => {
    expect(GOOD_SETS_KEYS.filter((k) => !setAvailable(k, 12))).toEqual(['pets']);
    expect(GOOD_SETS_KEYS.filter((k) => !setAvailable(k, setUnlockLevel('pets')))).toEqual([]);
  });

  it('карточки идут по возрастанию порога — открытое сверху, замки ниже', () => {
    const order = GOOD_SETS_KEYS.map((k) => setUnlockLevel(k));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

// ─────────────────────── начатую партию не отбирают ───────────────────────

describe('уже начатая партия закрытым набором не обрывается', () => {
  it('набор поднятой партии доступен, даже если по нынешнему потолку он закрыт', () => {
    // Сохранился «Зверятами» на их пороге, три провала опустили потолок ниже.
    const L = setUnlockLevel('pets');
    expect(setAvailable('pets', L - 1)).toBe(false);
    expect(setAvailable('pets', L - 1, 'pets')).toBe(true);
    expect(setAvailable('pets', 3, 'pets')).toBe(true);
  });

  it('поблажка распространяется ТОЛЬКО на свой набор, а не открывает соседей', () => {
    expect(setAvailable('dairy', 3, 'toys')).toBe(false);
    expect(setAvailable('drinks', 3, 'toys')).toBe(false);
  });

  it('подъём партии не спрашивает про открытость и не подменяет набор', () => {
    const body = SRC.slice(SRC.indexOf('const applyResume ='), SRC.indexOf("setPhase('playing');", SRC.indexOf('const applyResume =')));
    expect(body).toContain('setGrantedSet(r.setKey)');
    expect(body).not.toMatch(/setAvailable|setUnlockLevel|poolBitesAt/);
  });

  it('снимок партии возвращает СВОЙ набор и СВОЙ уровень, а не подменённые открытым', () => {
    const NOW = 1_000_000;
    const party: GoodsLiveParty = {
      phase: 'playing', bannerUp: false,
      level: 12, setKey: 'toys',
      cols: 3, rows: 3, mask: Array(9).fill(true),
      cells: [[14, 14], [15], [], [16], [], [], [], [], []],
      obstacles: Array(9).fill(null), covered: [], frozen: null,
      goal: { kind: 'all' },
      moves: 3, moveLimit: 0, score: 40, cleared: 1,
      shuffles: 2, hints: 2, canUndo: true,
      history: { past: [], future: [] },
      startedAt: NOW - 60_000,
    };
    const snap = snapshotGoodsParty(party, NOW) as GoodsResume;
    expect(snap).not.toBeNull();
    const back = restoreGoodsParty(snap, NOW + 1000);
    expect(`${back!.setKey} ур.${back!.level}`).toBe('toys ур.12');
  });
});

// ─────────────────────── что видит человек до открытия ───────────────────────

describe('закрытая карточка говорит, ЧТО откроется и КОГДА', () => {
  /** Кусок разметки выбора набора — от витрины до конца карточки. */
  const CARD = SRC.slice(SRC.indexOf('setRows(GOOD_SETS)'), SRC.indexOf('</TouchableOpacity>', SRC.indexOf('setRows(GOOD_SETS)')));

  it('есть что проверять — разметка карточки найдена', () => {
    expect(CARD.length).toBeGreaterThan(400);
    expect(CARD).toContain('styles.setBtn');
  });

  it('КОГДА: срок берётся из порога и печатается словами', () => {
    expect(CARD).toContain("t('goodsSetFromLevel').replace('{n}', String(setUnlockLevel(s.key)))");
    expect(CARD).toContain('styles.setBtnWhen');
  });

  it('срок показан ИМЕННО у закрытых, а не спрятан за выключенным условием', () => {
    // 🔴 `{false && …}` зеленил гейт дважды за два дня: строка в исходнике есть,
    // а на экране её нет никогда. Здесь условие обязано быть «набор закрыт».
    expect(CARD).toMatch(/\{!open && \(\s*<Text style=\{\[styles\.setBtnWhen/);
    expect(CARD).not.toMatch(/\{\s*false\s*&&/);
    expect(CARD).not.toMatch(/display: 'none'/);
  });

  it('ЧТО: витрина и число видов остаются и у закрытой карточки', () => {
    // Приглушить можно, спрятать нельзя: человек обязан видеть, что ему откроется.
    expect(CARD).toContain('s.preview.slice(0, THUMBS_PER_CARD)');
    expect(CARD).toContain('`🛒 ${s.pool.length}');
    expect(CARD).toMatch(/setThumbLocked/);
    expect(SRC).toMatch(/setThumbLocked: \{ opacity: 0\.\d+ \}/);
    // ⚠️ И НЕ через display/height — иначе «приглушение» станет исчезновением.
    expect(SRC.slice(SRC.indexOf('setThumbLocked:'), SRC.indexOf('setThumbLocked:') + 60)).not.toMatch(/display|height/);
  });

  it('закрытую карточку не нажать, и скринридер об этом знает', () => {
    expect(CARD).toContain('disabled={!open}');
    expect(CARD).toContain('accessibilityState={{ selected: on, disabled: !open }}');
    expect(CARD).toMatch(/accessibilityLabel=\{`[^`]*\$\{open \? '' : ` · \$\{when\}`\}`\}/);
  });

  it('открытость считается по достигнутому потолку, а не по выбранному на тропинке', () => {
    expect(CARD).toContain('setAvailable(s.key, reachedLevel, grantedSet)');
    expect(SRC).toMatch(/const reachedLevel = Math\.max\(lvl\.best, level\)/);
  });
});

// ─────────────────────── прогресс один, чужого счётчика нет ───────────────────────

describe('прогресс берётся из существующего механизма', () => {
  it('уровень тут один — ни второго счётчика, ни дорог сложности', () => {
    expect(SRC.match(/usePersistentLevel\(/g) ?? []).toHaveLength(1);
    expect(SRC).toContain("usePersistentLevel('goods_sort')");
    // Никаких своих ключей хранилища под наборы: прогресс двигает та же лесенка.
    expect(SRC).not.toMatch(/psygames_goods_sort_(sets|unlock|collection)/);
    expect(SRC).not.toMatch(/AsyncStorage\.setItem\(\s*['"`]psygames_goods/);
  });

  it('набор по умолчанию — первый в списке, и он открыт с первого уровня', () => {
    expect(SRC).toContain('useState(GOOD_SETS[0].key)');
    expect(setUnlockLevel(GOOD_SETS_KEYS[0])).toBe(1);
    expect(setAvailable(GOOD_SETS_KEYS[0], 1)).toBe(true);
  });

  it('порог не записан в сам набор числом — иначе он разъедется с пулом', () => {
    const table = SRC.slice(SRC.indexOf('const GOOD_SETS:'), SRC.indexOf('export function typeBudget'));
    expect(table).not.toMatch(/unlock|fromLevel|minLevel/);
  });
});

// ─────────────────────── словарь ───────────────────────

describe('срок открытия переведён на все двенадцать языков', () => {
  const BASE = readFileSync(join(ROOT, 'src/contexts/LanguageContext.tsx'), 'utf8') as string;

  it('в базовом словаре есть ru и en, и оба с подстановкой', () => {
    // ⚠️ Берём строку целиком: `[^}]*` спотыкается о `}` внутри самой подстановки {n}.
    const block = (BASE.match(/^\s*goodsSetFromLevel:.*$/m) || [''])[0];
    expect(block).toContain('ru:');
    expect(block).toContain('en:');
    expect((block.match(/\{n\}/g) ?? []).length).toBe(2);
  });

  it('в каждой из десяти локалей ключ есть и подстановка на месте', () => {
    const dir = join(ROOT, 'src/contexts/translations');
    const bad: string[] = [];
    for (const f of readdirSync(dir) as string[]) {
      if (!f.endsWith('.ts')) continue;
      const line = ((readFileSync(join(dir, f), 'utf8') as string)
        .match(/"goodsSetFromLevel":\s*"([^"]*)"/) || [])[1];
      if (!line) bad.push(`${f}: ключа нет`);
      else if (!line.includes('{n}')) bad.push(`${f}: нет {n} → ${line}`);
    }
    expect(bad).toEqual([]);
  });
});
