/**
 * ГЕЙТ СБОРКИ: каждый уровень судоку решаем и решается ЕДИНСТВЕННЫМ образом.
 *
 * Требование Дениса 07.08: решатель должен не просто выдавать сложность, а гарантировать
 * при каждой сборке, что (1) решение есть и (2) оно одно. На второе Валя жаловалась не раз:
 *   «Игра в текущем моменте имеет несколько вариантов победы»
 *   «Вот сейчас в итоге произошла ошибка, а могло быть оба варианта»
 * Такой пазл нечестен вдвойне: человек ставит цифру второго решения и получает «ошибку»,
 * потому что ввод сверяется с зашитым решением.
 *
 * Как это проверяется дёшево. Если пазл добирается ЛОГИКОЙ (лестница техник), то каждый
 * шаг вынужден — второму решению взяться неоткуда, единственность выходит по построению.
 * Дорогой перебор countSolutions нужен только там, где конкретной попытке логики не
 * хватило. Sandwich теперь распространяет суммы по маскам и обязан оставаться на
 * логическом пути; отдельная проверка ниже не даст ему тихо вернуться к fallback.
 *
 * Проверяются ВСЕ уровни от 1 до LAST_LEVEL — по одному пазлу на уровень.
 *
 * Живёт в src/__gates__, а НЕ в src/__tests__: прогон стоит ~210 с (генерация 52 досок,
 * плюс перебор там, где логики не хватило). В общем наборе это сделало бы локальный
 * `npm test` невыносимым — он идёт 5 с. Запускается отдельно: `npm run test:levels`,
 * и этим же шагом в CI на каждой сборке.
 */
import { levelConfig, countSolutions, Variant } from '@/src/services/sudoku-core';
import { generateLogical, gradePuzzle, TECHNIQUE_TIER } from '@/src/services/sudoku-grade';

const LAST_LEVEL = 52;   // 52 = уже фаза jigsaw, дальше правило не меняется
const LEVELS = Array.from({ length: LAST_LEVEL }, (_, i) => i + 1);

describe('гейт: все уровни судоку решаемы и решение единственно', () => {
  jest.setTimeout(600_000);

  it.each(LEVELS)('уровень %i', (level) => {
    const cfg = levelConfig(level);
    const r = generateLogical(level, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: 2200 });
    const { puzzle, solution } = r.gen;

    // L38–41 обязаны идти новым логическим путём. Без этого sandwich незаметно
    // откатится к прежнему «число дырок + перебор», хотя общий гейт останется зелёным.
    if (cfg.variant === 'sandwich') {
      expect(r.fellBack).toBe(false);
      expect(r.grade.tier).toBeGreaterThanOrEqual(TECHNIQUE_TIER.sandwich_sum);
    }

    // 1. Доска вообще получилась: не пустая и не полностью заполненная.
    let blanks = 0;
    for (let i = 0; i < cfg.N; i++) for (let j = 0; j < cfg.N; j++) if (puzzle[i][j] === 0) blanks++;
    expect(blanks).toBeGreaterThanOrEqual(cfg.size === 6 ? 8 : 24);
    expect(blanks).toBeLessThan(cfg.N * cfg.N);

    // 2. Открытые клетки совпадают с решением — иначе честный ход считался бы ошибкой.
    for (let i = 0; i < cfg.N; i++) for (let j = 0; j < cfg.N; j++) {
      if (puzzle[i][j] !== 0) expect(puzzle[i][j]).toBe(solution[i][j]);
    }

    // 3. Решение единственно. Логический путь даёт это по построению (каждый шаг вынужден);
    //    где логики не хватило — досчитываем перебором.
    const solvedByLogic = r.grade.solved && r.grade.tier < TECHNIQUE_TIER.guess;

    // 3a. Если решатель дошёл логикой — он обязан прийти РОВНО к эталонному решению.
    //     Это ловит неверный пруннинг: с ним решатель «решит» чужую сетку и объявит
    //     единственность там, где её нет. Без этой сверки гарантия была бы на слово.
    if (solvedByLogic && r.grade.grid) {
      for (let i = 0; i < cfg.N; i++) expect(r.grade.grid[i]).toEqual(solution[i]);
    }

    if (!solvedByLogic) {
      const eff: Variant = (cfg.variant === 'jigsaw' && !r.gen.regions)
        || (cfg.variant === 'thermo' && !r.gen.thermo)
        || (cfg.variant === 'arrow' && !r.gen.arrow) ? 'none' : cfg.variant;
      const n = countSolutions(
        puzzle.map((row) => [...row]), cfg.N, cfg.BR, cfg.BC, eff, r.gen.regions,
        2, { steps: 60_000 }, r.gen.thermo, r.gen.arrow,
      );
      expect(n).toBe(1);
    }
  });
});

describe('гейт: сложность растёт по уровням, а не стоит', () => {
  jest.setTimeout(600_000);

  // Берём фазы, которые решатель понимает уверенно, включая новый sandwich-путь.
  const PROBES = [8, 12, 19, 28, 33, 37, 41];

  it('поздние уровни не легче ранних', () => {
    const tiers = PROBES.map((lv) => {
      const cfg = levelConfig(lv);
      const r = generateLogical(lv, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: 2200 });
      return { lv, tier: r.grade.tier, variant: cfg.variant };
    });
    // eslint-disable-next-line no-console
    console.log('\nсложность по уровням: ' + tiers.map((t) => `L${t.lv}=${t.tier}`).join('  '));
    const early = tiers[0].tier;
    const late = tiers[tiers.length - 1].tier;
    expect(late).toBeGreaterThan(early);
  });
});
