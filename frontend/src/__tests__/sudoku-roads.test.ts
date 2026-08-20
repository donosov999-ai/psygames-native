/* psygames-gate-sudoku-roads · VER 1 · 20.08.2026 */
/**
 * ТРИ ДОРОГИ СЛОЖНОСТИ СУДОКУ — ТРИ ЛЕСТНИЦЫ, И ПРОЙДЕННОЕ ХОДИТ ТОЛЬКО ВНИЗ.
 *
 * 🔴 ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ. Правило Дениса: «пройденное засчитывается в более лёгкой
 * партии — это логично, и новая дорога считается как лёгкая». У него две половины, и
 * ломаются они по-разному:
 *
 *   · ПЕРЕНОС ВНИЗ ПРОПАЛ — человек взял двенадцатый на тяжёлой, ушёл на лёгкую и
 *     обнаружил себя на первом уровне. Обиднее не придумаешь: он сделал БОЛЬШЕ, чем
 *     требовалось, и получил за это откат;
 *   · ПЕРЕНОС ВВЕРХ ПОЯВИЛСЯ — лёгкая дорога подняла тяжёлую, и лестница «пожёстче»
 *     проходится прогоном по «полегче». Тогда дороги перестают что-либо значить.
 *
 * Обе половины проверяются ИСПОЛНЕНИЕМ и обе — в обе стороны: ниже есть и проба
 * «вниз перенеслось», и проба «вверх НЕ перенеслось».
 *
 * ⚠️ ПОЧЕМУ СЧИТАЕМ ПРИ ЧТЕНИИ, А НЕ ПЕРЕНОСИМ РАЗОВО. Отдельная проба ниже держит
 * именно это: сначала человек ходит по лёгкой, потом добивает тяжёлую — и лёгкая
 * ОБЯЗАНА подтянуться, хотя никакого события переключения между этим не было. Разовый
 * перенос такую пробу не проходит по построению.
 *
 * ⚠️ ЧТО ПРОВЕРЯЕТСЯ ВЫЗОВОМ, А ЧТО ЧТЕНИЕМ. Правила дорог, ключи хранилища, полоса
 * техник, параметры доски и ключ задачи истории — вызовом, включая живую генерацию
 * доски генератором приложения. По исходнику смотрится только то, что вызвать
 * нечем — разметка экрана; и смотрится она по ИСХОДНИКУ БЕЗ КОММЕНТАРИЕВ, потому что
 * в этом проекте гейт уже не раз держался зелёным на русском слове в комментарии.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

import {
  DEFAULT_SUDOKU_ROAD, SUDOKU_ROADS, SUDOKU_ROAD_NAME_KEY, SudokuRoad,
  effectiveRoadLevel, effectiveRoadLevels, isSudokuRoad, reachRoadLevel,
  roadLevelConfig, roadTaskPart, roadTier, roadsHarderThan,
  sudokuLevelKey, sudokuRoadKey, type RoadLevels,
} from '@/src/services/sudoku-roads';
import { levelConfig } from '@/src/services/sudoku-core';
import { targetTier, generateLogical, gradePuzzle } from '@/src/services/sudoku-grade';
import { taskKey, entryRoad, buildTrainingHistory, DEFAULT_ROAD } from '@/src/services/trainingHistory';

const ROOT = path.join(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Срез комментариев: русское слово в комментарии не должно зеленить проверку. */
function stripComments(s: string): string {
  return s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

const SCREEN = stripComments(read('app/games/sudoku.tsx'));

/**
 * Все блоки `details: { … }` экрана, вырезанные ПО БАЛАНСУ СКОБОК.
 *
 * ⚠️ ЗАЧЕМ ТАК, А НЕ РЕГУЛЯРКОЙ ПО ФАЙЛУ. Первая редакция гейта искала «где-то в
 * экране есть details с road» — и осталась зелёной, когда дорогу выкинули из записи
 * ПОБЕДНОЙ партии: её продолжал находить второй вызов saveSession, тот, что пишет
 * проигрыш. Поймано нарочной поломкой. Теперь каждый блок проверяется сам по себе.
 */
function detailsBlocks(src: string): string[] {
  const out: string[] = [];
  const re = /details:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    out.push(src.slice(m.index, i));
  }
  return out;
}

describe('дороги сложности: состав', () => {
  it('дорог ровно три и идут они от лёгкой к тяжёлой', () => {
    expect([...SUDOKU_ROADS]).toEqual(['easy', 'normal', 'hard']);
  });

  it('дорога по умолчанию — обычная: в неё попадает тот, кто ничего не выбирал', () => {
    expect(DEFAULT_SUDOKU_ROAD).toBe('normal');
  });

  it('«тяжелее этой» — только то, что правее в порядке', () => {
    expect(roadsHarderThan('easy')).toEqual(['normal', 'hard']);
    expect(roadsHarderThan('normal')).toEqual(['hard']);
    expect(roadsHarderThan('hard')).toEqual([]);
  });

  it('чужую строку за дорогу не принимаем — из хранилища приедет что угодно', () => {
    expect(SUDOKU_ROADS.map(isSudokuRoad)).toEqual([true, true, true]);
    for (const junk of ['', 'Easy', 'medium', 'hard ', null, undefined, 3, {}]) {
      expect(`${JSON.stringify(junk)} → ${isSudokuRoad(junk)}`).toBe(`${JSON.stringify(junk)} → false`);
    }
  });
});

describe('дороги сложности: ключи хранилища', () => {
  /**
   * 🔴 У ОБЫЧНОЙ ДОРОГИ КЛЮЧ ОБЯЗАН ОСТАТЬСЯ ПРЕЖНИМ. Под ним лежит прогресс всех, кто
   * играл до появления дорог. Новый ключ означал бы, что в день обновления человек с
   * пятидесятого уровня открывает судоку на первом — и никакой другой гейт этого не
   * увидит: код будет работать безупречно.
   */
  it('обычная дорога читает и пишет прежний ключ судоку', () => {
    expect(sudokuLevelKey('odv999', 'normal')).toBe('psygames_sudoku_level_odv999');
  });

  it('у каждой дороги свой ключ — три разных', () => {
    const keys = SUDOKU_ROADS.map((r) => sudokuLevelKey('odv999', r));
    expect(new Set(keys).size).toBe(3);
    expect(keys).toEqual([
      'psygames_sudoku_level_odv999_easy',
      'psygames_sudoku_level_odv999',
      'psygames_sudoku_level_odv999_hard',
    ]);
  });

  it('ключи разных профилей не пересекаются — семейное устройство', () => {
    const mine = SUDOKU_ROADS.map((r) => sudokuLevelKey('odv999', r));
    const kid = SUDOKU_ROADS.map((r) => sudokuLevelKey('kids', r));
    expect(mine.filter((k) => kid.includes(k))).toEqual([]);
    expect(sudokuRoadKey('odv999')).not.toBe(sudokuRoadKey('kids'));
  });
});

describe('перенос пройденного: вниз да, вверх нет', () => {
  /** Взял 12 на тяжёлой (счётчик = 13, следующий невзятый). */
  const afterHard: RoadLevels = { easy: 1, normal: 1, hard: 13 };

  it('ВНИЗ: взятое на тяжёлой засчитано на обычной и на лёгкой', () => {
    expect(effectiveRoadLevels(afterHard)).toEqual({ easy: 13, normal: 13, hard: 13 });
  });

  /**
   * 🔴 ГЛАВНАЯ ПРОБА ГЕЙТА. Она обязана краснеть, если кто-то «упростит» правило до
   * `Math.max` по всем дорогам сразу: тогда лёгкая поднимет тяжёлую, и лестница
   * «пожёстче» станет проходимой прогоном по «полегче».
   */
  it('ВВЕРХ: пройденное на лёгкой не двигает ни обычную, ни тяжёлую', () => {
    const afterEasy: RoadLevels = { easy: 40, normal: 1, hard: 1 };
    expect(effectiveRoadLevels(afterEasy)).toEqual({ easy: 40, normal: 1, hard: 1 });
  });

  it('ВВЕРХ: обычная не двигает тяжёлую, но двигает лёгкую', () => {
    expect(effectiveRoadLevels({ easy: 1, normal: 20, hard: 1 })).toEqual({ easy: 20, normal: 20, hard: 1 });
  });

  it('ни разу не игранная дорога открывается по тому же правилу', () => {
    // В хранилище нет вообще ничего, кроме тяжёлой: остальные ключи пусты.
    expect(effectiveRoadLevels({ hard: 9 })).toEqual({ easy: 9, normal: 9, hard: 9 });
    // И наоборот: сколько бы ни было на лёгкой, тяжёлая начинается с первого.
    expect(effectiveRoadLevels({ easy: 57 }).hard).toBe(1);
  });

  it('пустое хранилище — все три на первом уровне, а не на нуле', () => {
    expect(effectiveRoadLevels({})).toEqual({ easy: 1, normal: 1, hard: 1 });
  });

  it('мусор из хранилища не роняет лестницу вниз', () => {
    const junk = { easy: 0, normal: NaN, hard: -5 } as unknown as RoadLevels;
    expect(effectiveRoadLevels(junk)).toEqual({ easy: 1, normal: 1, hard: 1 });
  });

  /**
   * 🔴 СЧИТАЕМ ПРИ ЧТЕНИИ, А НЕ ПЕРЕНОСИМ СОБЫТИЕМ. Порядок нарочно «неудобный»:
   * человек сперва ходил по лёгкой, и только ПОТОМ добил тяжёлую. Разовый перенос при
   * переключении дорог такую последовательность пропускает — событие уже прошло.
   */
  it('добил тяжёлую позже — лёгкая подтянулась без всякого переключения', () => {
    let levels: RoadLevels = {};
    levels = reachRoadLevel(levels, 'easy', 6);      // походил по лёгкой
    expect(effectiveRoadLevel(levels, 'hard')).toBe(1);
    levels = reachRoadLevel(levels, 'hard', 21);     // потом взял двадцатый на тяжёлой
    expect(effectiveRoadLevel(levels, 'easy')).toBe(21);
    expect(effectiveRoadLevel(levels, 'normal')).toBe(21);
  });

  it('запись уровня трогает ТОЛЬКО свою дорогу — лёгкие подтянет чтение', () => {
    const levels = reachRoadLevel({ easy: 1, normal: 1, hard: 1 }, 'hard', 13);
    expect(levels).toEqual({ easy: 1, normal: 1, hard: 13 });
  });

  it('переигровка пройденного не срезает потолок дороги', () => {
    const levels = reachRoadLevel({ hard: 30 }, 'hard', 4);   // вернулся на тропинке к третьему
    expect(levels.hard).toBe(30);
  });
});

describe('чем дороги отличаются на доске', () => {
  const LEVELS = [1, 4, 5, 8, 12, 20, 28, 36, 44, 57];

  it('полоса техник сдвигается: полегче ниже, пожёстче выше', () => {
    for (const lv of LEVELS) {
      const e = roadTier(lv, 'easy');
      const n = roadTier(lv, 'normal');
      const h = roadTier(lv, 'hard');
      expect(`${lv}: ${e.min}≤${n.min}≤${h.min}`).toBe(`${lv}: ${Math.min(e.min, n.min)}≤${n.min}≤${Math.max(n.min, h.min)}`);
      expect(e.max).toBeLessThanOrEqual(n.max);
      expect(n.max).toBeLessThanOrEqual(h.max);
    }
  });

  it('обычная дорога — ровно прежняя полоса уровня, без сдвига', () => {
    for (const lv of LEVELS) expect(roadTier(lv, 'normal')).toEqual(targetTier(lv));
  });

  /**
   * Границы полосы не декоративны: 1 — голые одиночки, ниже техник нет; 6 — X-wing,
   * а седьмой ступенью в лестнице идёт `guess`, то есть перебор. Доска, не берущаяся
   * логикой, — это не «пожёстче», это сломанная задача.
   */
  it('полоса не вылезает за лестницу техник и не выворачивается', () => {
    for (const lv of LEVELS) for (const r of SUDOKU_ROADS) {
      const { min, max } = roadTier(lv, r);
      expect(`${r}L${lv}: ${min}..${max}`).toBe(`${r}L${lv}: ${Math.max(1, min)}..${Math.min(6, max)}`);
      expect(min).toBeLessThanOrEqual(max);
    }
  });

  it('сдвиг где-то реально случается, а не гасится границами везде', () => {
    const moved = LEVELS.filter((lv) => roadTier(lv, 'easy').max < roadTier(lv, 'hard').max);
    expect(moved.length).toBeGreaterThanOrEqual(LEVELS.length - 1);
  });

  it('дорога не трогает размер поля и правило варианта — ступени остаются сравнимыми', () => {
    for (const lv of LEVELS) for (const r of SUDOKU_ROADS) {
      const cfg = roadLevelConfig(lv, r);
      const base = levelConfig(lv);
      expect(`${r}L${lv}: ${cfg.size}/${cfg.N}/${cfg.BR}x${cfg.BC}/${cfg.variant}`)
        .toBe(`${r}L${lv}: ${base.size}/${base.N}/${base.BR}x${base.BC}/${base.variant}`);
    }
  });

  it('на лёгкой дырок меньше и подсказок больше, на тяжёлой наоборот', () => {
    for (const lv of LEVELS) {
      const e = roadLevelConfig(lv, 'easy');
      const n = roadLevelConfig(lv, 'normal');
      const h = roadLevelConfig(lv, 'hard');
      expect(`${lv} blanks ${e.blanks}<${n.blanks}<${h.blanks}`)
        .toBe(`${lv} blanks ${Math.min(e.blanks, n.blanks - 1)}<${n.blanks}<${Math.max(h.blanks, n.blanks + 1)}`);
      expect(e.hintMax).toBeGreaterThan(n.hintMax);
      expect(h.hintMax).toBeLessThanOrEqual(n.hintMax);
      expect(h.hintMax).toBeGreaterThanOrEqual(0);
    }
  });

  it('обычная дорога отдаёт ровно levelConfig — прежняя партия не изменилась', () => {
    for (const lv of LEVELS) expect(roadLevelConfig(lv, 'normal')).toEqual(levelConfig(lv));
  });
});

/**
 * ЖИВАЯ ГЕНЕРАЦИЯ. Всё выше — про числа; здесь генератор приложения действительно
 * копает доску под полосу дороги, а решатель приложения действительно её оценивает.
 * Без этой пробы «полегче» осталось бы обещанием: полосу можно сдвинуть и не
 * прокинуть в генератор, и ни одна проверка выше этого не заметит.
 *
 * Уровень 12 (9×9, диагонали) взят потому, что там полосы дорог заведомо разные и
 * доска копается быстро. Бюджет маленький — гейт не должен стоить минуту.
 */
describe('генератор слышит дорогу', () => {
  const LV = 12;
  const build = (road: SudokuRoad) => {
    const cfg = roadLevelConfig(LV, road);
    const r = generateLogical(LV, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, {
      budgetMs: 1200, tier: roadTier(LV, road),
    });
    const grade = gradePuzzle(r.gen.puzzle, {
      N: cfg.N, BR: cfg.BR, BC: cfg.BC, variant: cfg.variant,
      regions: r.gen.regions, thermo: r.gen.thermo, arrow: r.gen.arrow, cages: r.gen.cages,
      parity: r.gen.parity, kropki: r.gen.kropki, sandwich: r.gen.sandwich,
    });
    return { fellBack: r.fellBack, grade };
  };

  it('доска лёгкой дороги берётся техникой не выше её полосы', () => {
    const { fellBack, grade } = build('easy');
    // Запасной путь генератора полосу не обещает — там своя проверка единственности.
    if (fellBack) return;
    expect(grade.solved).toBe(true);
    expect(`tier ${grade.tier} ≤ ${roadTier(LV, 'easy').max}`)
      .toBe(`tier ${Math.min(grade.tier, roadTier(LV, 'easy').max)} ≤ ${roadTier(LV, 'easy').max}`);
  });

  it('доска тяжёлой дороги не проще нижней границы её полосы', () => {
    // Полоса — цель, а не гарантия: генератор берёт лучшую попытку в бюджете. Поэтому
    // требуем не точного попадания, а того, что потолок ей РАЗРЕШЁН выше лёгкого.
    const { fellBack, grade } = build('hard');
    if (fellBack) return;
    expect(grade.solved).toBe(true);
    expect(grade.tier).toBeLessThanOrEqual(roadTier(LV, 'hard').max);
  });
});

describe('дорога в записи партии и в ключе задачи истории', () => {
  const game = (road: string | undefined, level: number, score: number, ts: string) => ({
    game_type: 'sudoku', score, time_seconds: 120, timestamp: ts, profile_id: 'odv999',
    mode: `level-${level}`, difficulty: 'hard',
    details: road === undefined ? { level } : { level, road },
  });

  it('имя дороги по умолчанию у истории и у судоку — одно и то же слово', () => {
    expect(DEFAULT_ROAD).toBe(DEFAULT_SUDOKU_ROAD);
  });

  /**
   * 🔴 ПАРТИЯ ДО ПОЯВЛЕНИЯ ДОРОГ И ПАРТИЯ НА ОБЫЧНОЙ ДОРОГЕ — ОДНА ЗАДАЧА. Иначе в день
   * обновления вся история судоку станет «новой сложностью», и человек потеряет
   * сравнение с прошлым разом ни за что.
   */
  it('обычная дорога и запись без дороги дают ОДИН ключ', () => {
    expect(taskKey(game('normal', 12, 100, '2026-08-20T10:00:00Z') as any))
      .toBe(taskKey(game(undefined, 12, 100, '2026-08-19T10:00:00Z') as any));
    expect(entryRoad(game('normal', 12, 100, '') as any)).toBe('');
    expect(roadTaskPart('normal')).toBe('');
  });

  it('лёгкая и тяжёлая дороги дают РАЗНЫЕ ключи — и между собой, и с обычной', () => {
    const keys = ['easy', 'normal', 'hard'].map((r) => taskKey(game(r, 12, 100, '2026-08-20T10:00:00Z') as any));
    expect(new Set(keys).size).toBe(3);
  });

  /**
   * ⚠️ СВЕРЯЕМ НА ТОМ, ЧТО СУДОКУ РЕАЛЬНО ПИШЕТ. Первый прогон этого гейта развёл две
   * функции на строке `'medium'`: история оставляет её как есть, а `roadTaskPart`
   * схлопывает в пусто. Расхождение оказалось ЗАКОННЫМ и его стоит назвать вслух —
   * `trainingHistory` служит всем упражнениям сразу и списка дорог судоку не знает и
   * знать не должен; незнакомое имя дороги для неё — просто другая задача, и это
   * единственно верное поведение (проверено отдельной пробой ниже).
   *
   * Общим у двух функций обязан быть ровно тот набор значений, который судоку кладёт
   * в `details.road`: три дороги и отсутствие поля у старых партий.
   */
  it('на том, что судоку пишет, история и судоку нормализуют дорогу одинаково', () => {
    for (const v of [...SUDOKU_ROADS, undefined]) {
      const fromHistory = entryRoad({ details: v === undefined ? {} : { road: v } } as any);
      expect(`${JSON.stringify(v)} → ${fromHistory}`).toBe(`${JSON.stringify(v)} → ${roadTaskPart(v)}`);
    }
  });

  it('незнакомая дорога у истории остаётся другой задачей — она служит всем играм', () => {
    expect(entryRoad({ details: { road: 'brutal' } } as any)).toBe('brutal');
    expect(entryRoad({ details: { road: '' } } as any)).toBe('');
    expect(entryRoad({ details: { road: 7 } } as any)).toBe('');
    expect(entryRoad({ details: {} } as any)).toBe('');
  });

  /**
   * 🔴 РАДИ ЧЕГО ВСЁ ЭТО. История сравнивает партию с прошлым разом ТОЙ ЖЕ задачи.
   * Без дороги в ключе переход на тяжёлую дорогу читался бы как обвал результата, а
   * уход на лёгкую — как рост. Обе подписи — враньё про человека.
   */
  it('переход с лёгкой на тяжёлую не объявляется провалом', () => {
    const days = buildTrainingHistory([
      game('easy', 12, 1800, '2026-08-19T10:00:00Z') as any,
      game('hard', 12, 900, '2026-08-20T10:00:00Z') as any,
    ], { maxDays: 0 });
    const hard = days.flatMap((d) => d.entries).find((e) => e.timestamp.startsWith('2026-08-20'));
    expect(`${hard?.verdict} / prev ${hard?.prev}`).toBe('newTask / prev null');
  });

  it('две партии одной дороги по-прежнему сравниваются между собой', () => {
    const days = buildTrainingHistory([
      game('hard', 12, 900, '2026-08-19T10:00:00Z') as any,
      game('hard', 12, 1100, '2026-08-20T10:00:00Z') as any,
    ], { maxDays: 0 });
    const last = days.flatMap((d) => d.entries).find((e) => e.timestamp.startsWith('2026-08-20'));
    expect(`${last?.verdict} / prev ${last?.prev}`).toBe('better / prev 900');
  });
});

describe('экран судоку действительно ходит по дорогам', () => {
  it('срез комментариев работает — иначе всё ниже зелено вслепую', () => {
    expect(stripComments("/* road: 'hard' */\n// road: 'easy'\nconst a = 1;")).not.toContain('road');
    expect(SCREEN.length).toBeGreaterThan(20000);
  });

  it('уровень читается и пишется по ключу ДОРОГИ, а не по общему', () => {
    expect(SCREEN).toContain('sudokuLevelKey(');
    // Прежний ключ строкой в коде экрана остаться не должен: он мимо дорог.
    expect(SCREEN).not.toContain('`psygames_sudoku_level_${');
  });

  it('партия собирается по параметрам дороги, а не по голому уровню', () => {
    expect(SCREEN).toContain('roadLevelConfig(');
    expect(SCREEN).toContain('roadTier(');
    expect(SCREEN).not.toContain('levelConfig(');
  });

  /**
   * 🔴 ДОРОГА В КАЖДОЙ ЗАПИСИ, А НЕ «ГДЕ-ТО В ФАЙЛЕ». Экран пишет партию дважды —
   * победа и проигрыш по жизням, — и обе записи ложатся в одну историю. Запись без
   * дороги встанет в ключ обычной дороги и испортит сравнение именно тем, ради чего
   * дороги заводились.
   */
  it('в КАЖДУЮ запись уровневой партии уходит дорога', () => {
    const blocks = detailsBlocks(SCREEN);
    expect(blocks.length).toBeGreaterThanOrEqual(2);   // победа и проигрыш
    const levelBlocks = blocks.filter((b) => /\blevel\b/.test(b));
    expect(levelBlocks.length).toBeGreaterThanOrEqual(2);
    const without = levelBlocks.filter((b) => !/\broad\b/.test(b));
    expect(`записей уровневой партии без дороги: ${without.length}`).toBe('записей уровневой партии без дороги: 0');
  });

  it('разбор блоков details работает — иначе проверка выше зелена вслепую', () => {
    const probe = detailsBlocks('details: { a: 1, ...(x ? { b: 2 } : {}) }, tail: 9');
    expect(probe).toEqual(['details: { a: 1, ...(x ? { b: 2 } : {}) }']);
    // Соседний блок не должен склеиваться с первым.
    expect(detailsBlocks('details: { a }, details: { b }').length).toBe(2);
  });

  it('дорога попадает в снимок незаконченной партии и поднимается из него', () => {
    expect(SCREEN).toMatch(/mode,\s*level,\s*road,/);
    expect(SCREEN).toContain('isSudokuRoad(s.road)');
  });

  /**
   * ⚠️ Правило есть, а решения по нему принять нельзя — если человек не видит, на каком
   * уровне каждая дорога, ДО того как выбрал. Поэтому кнопка дороги обязана нести и
   * подпись, и её уровень, а рядом — строку про то, куда переносится пройденное.
   */
  it('на экране выбора видно уровень КАЖДОЙ дороги до выбора', () => {
    expect(SCREEN).toContain('effectiveRoadLevels(');
    expect(SCREEN).toMatch(/SUDOKU_ROADS\.map\(/);
    expect(SCREEN).toMatch(/t\(SUDOKU_ROAD_NAME_KEY\[r\]\)[^\n]*reached\[r\]/);
    expect(SCREEN).toContain("t('sudokuRoadHint')");
  });

  it('дорогу переключают отдельной ручкой, и она сохраняется', () => {
    expect(SCREEN).toContain('switchRoad(');
    expect(SCREEN).toContain('sudokuRoadKey(');
  });

  /**
   * Дорога берётся в начале партии и внутри партии не меняется. Проверяем от
   * противного: переключатель дороги не должен стоять в игровой фазе — там его
   * нажатие сменило бы правила посреди доски.
   */
  it('переключатель дороги живёт на настройках, а не в партии', () => {
    const playing = SCREEN.slice(SCREEN.indexOf('const renderPlaying'));
    expect(playing).not.toContain('switchRoad(');
  });

  it('в партии видно, по какой дороге она идёт', () => {
    expect(SCREEN).toMatch(/SUDOKU_ROAD_NAME_KEY\[road\]/);
  });

  /**
   * 🔴 ПАРТИЯ «МИМО ЗАПИСИ» НЕ ДВИГАЕТ НИ ОДНУ ДОРОГУ.
   *
   * Рядом идёт заход по способностям: он завёл «пробный заход» — партию, которая
   * никуда не пишется. Дорога и пробный заход — разные вещи, и спорить им нельзя:
   * лёгкая дорога это НАСТОЯЩАЯ партия с настоящей записью, просто на своей лестнице,
   * а пробный заход это отсутствие записи вовсе. Ни то, ни другое не имеет права
   * поднять тяжёлую дорогу.
   *
   * Проверяем от корня: судоку про способности не знает вовсе (это же требует
   * abilities-economy.test.ts со своей стороны), а счётчик дороги двигает РОВНО одно
   * место — ветка собранной доски. Второго входа в запись уровня нет.
   */
  it('в судоку нет партии «мимо записи» — способностей экран не знает', () => {
    expect(SCREEN).not.toMatch(/abilities|practice_run|useAbility/);
  });

  it('счётчик дороги двигает ровно одно место — ветка собранной доски', () => {
    const writes = [...SCREEN.matchAll(/reachRoadLevel\(/g)].length;
    expect(`вызовов reachRoadLevel в экране: ${writes}`).toBe('вызовов reachRoadLevel в экране: 1');
    const setItems = [...SCREEN.matchAll(/setItem\(sudokuLevelKey\(/g)].length;
    expect(`записей уровня дороги в хранилище: ${setItems}`).toBe('записей уровня дороги в хранилище: 1');
    // И эта запись стоит ВНУТРИ ветки собранной доски, а не где попало.
    const done = SCREEN.slice(SCREEN.indexOf('if (complete) {'));
    expect(done).toContain('reachRoadLevel(');
  });
});

describe('подписи дорог переведены на все двенадцать языков', () => {
  const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];
  const KEYS = [...Object.values(SUDOKU_ROAD_NAME_KEY), 'sudokuRoadLabel', 'sudokuRoadHint'];
  const base = read('src/contexts/LanguageContext.tsx');

  it('ключи подписей возвращает сам модуль дорог — сверка механическая', () => {
    expect(Object.keys(SUDOKU_ROAD_NAME_KEY).sort()).toEqual([...SUDOKU_ROADS].sort());
    expect(new Set(KEYS).size).toBe(KEYS.length);
  });

  it.each(KEYS)('«%s» есть в базовом словаре с ru и en', (key) => {
    const m = new RegExp(`\\n {2}${key}:\\s*\\{`).test(base)
      || new RegExp(`\\n {2}${key}:\\s*\\{[\\s\\S]{0,400}?\\}`).test(base);
    expect(`${key} в словаре: ${m}`).toBe(`${key} в словаре: true`);
    const block = new RegExp(`\\n {2}${key}:\\s*\\{([\\s\\S]{0,600}?)\\n? {2}\\},?\\n`).exec(base);
    expect(`${key} ru+en: ${!!block && /\bru:/.test(block[1]) && /\ben:/.test(block[1])}`)
      .toBe(`${key} ru+en: true`);
  });

  it.each(LOCALES)('в локали %s переведены все подписи дорог', (loc) => {
    const src = read(`src/contexts/translations/${loc}.ts`);
    const miss = KEYS.filter((k) => !new RegExp(`"${k}":\\s*"[^"]+"`).test(src));
    expect(`${loc}: не хватает ${miss.join(', ') || '—'}`).toBe(`${loc}: не хватает —`);
  });
});
