/**
 * 🔴 ЦЕЛЬ НЕ ПРИХОДИТ РАНЬШЕ СВОЕГО ПРАВИЛА.
 *
 * Ровно тот же дефект, что уже чинили у препятствий, и ровно по той же причине.
 * Цикл `GOAL_PLANS` расписан от L5 с шагом 12 и ничего не знает про график ввода
 * механик; пока правила и цикл шли по подряд идущим уровням, они сходились
 * СЛУЧАЙНО. 02.09.2026 график растянули по канону рынка, `fromLevel` подняли —
 * и совпадение рассыпалось. Препятствия тогда прикрыли фильтром `ruleFrom`,
 * цели — забыли.
 *
 * Замер до правки (прогон L1…L60 этими же функциями):
 *   free  впервые L7, правило `goalfree`  показывалось с L12 → молчал L7;
 *   moves впервые L9, правило `movelimit` показывалось с L18 → молчали L9 и L13.
 * То есть на L9 игрок получал лимит ходов и провал по нему, а карточку «Лимит
 * ходов» видел только на L18. Про это же место в файле сказано прямо: «Человек
 * собирал доску и узнавал о лимите постфактум, из экрана провала. Это не
 * сложность, а подстава».
 *
 * ⚠️ ГЕЙТ ИСПОЛНЯЕТ, А НЕ ЧИТАЕТ ИСХОДНИК. Берутся настоящие `goalPlan` и
 * настоящий отбор правил экрана — `activeLevelRule(gsRulesForLevel(L), L)`,
 * та же пара, что стоит в `useLevelRules` на строке 2569. Гейт, повторивший
 * формулу своей копией, зелен вслепую.
 */
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { goalPlan, gsRulesForLevel, GS_RULES, clampGoalToRule } from '@/src/games/goods-sort/core/level';
import { activeLevelRule } from '@/src/components/LevelRules';

const LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);

/** Какое правило объясняет какой вид цели. `all` — база, ей учат первые уровни. */
const RULE_OF_GOAL: Record<string, string | null> = {
  all: null, pick: 'goalpick', free: 'goalfree', moves: 'movelimit',
};

/** Уровень, на котором правило ВПЕРВЫЕ показывается игроку (отбор — настоящий, экранный). */
function ruleShownAt(): Record<string, number> {
  const at: Record<string, number> = {};
  for (const L of LEVELS) {
    const active = activeLevelRule(gsRulesForLevel(L), L);
    if (active && at[active.key] === undefined) at[active.key] = L;
  }
  return at;
}

/** Уровень, на котором вид цели ВПЕРВЫЕ достаётся игроку. */
function goalFirstAt(): Record<string, number> {
  const at: Record<string, number> = {};
  for (const L of LEVELS) {
    const kind = goalPlan(L).kind;
    if (at[kind] === undefined) at[kind] = L;
  }
  return at;
}

describe('механика цели объяснена прежде, чем спрошена', () => {
  it('есть что проверять: все четыре вида целей встречаются, все правила показываются', () => {
    const goals = goalFirstAt();
    const shown = ruleShownAt();
    // Обе стороны непусты — иначе проверка ниже зеленела бы на пустом множестве.
    expect(Object.keys(goals).sort()).toEqual(['all', 'free', 'moves', 'pick']);
    for (const key of Object.values(RULE_OF_GOAL)) {
      if (key) expect(shown[key]).toBeDefined();
    }
  });

  it('🔴 на уровне первой встречи цели её правило уже показано', () => {
    const goals = goalFirstAt();
    const shown = ruleShownAt();
    const silent: string[] = [];
    for (const [kind, firstLevel] of Object.entries(goals)) {
      const key = RULE_OF_GOAL[kind];
      if (!key) continue;
      const shownAt = shown[key];
      if (shownAt === undefined || shownAt > firstLevel) {
        silent.push(`цель «${kind}» впервые на L${firstLevel}, правило «${key}» показывается с L${shownAt ?? '∞'}`);
      }
    }
    expect(silent).toEqual([]);
  });

  /**
   * ⚠️ ЗАСЛОН ПРОВЕРЯЕТСЯ НАПРЯМУЮ, А НЕ ТОЛЬКО ЧЕРЕЗ `goalPlan`.
   *
   * Ровно та ошибка, что уже случилась в этом файле с `clampGoalToLevel`: при
   * тогдашней раскладке первый `moves` и так приходился на L9, страховка была
   * НЕДОСТИЖИМА, и мутация «убрать проверку» прошла мимо гейта (19.08.2026).
   * Здесь то же самое: подгонят таблицу под пороги — и фильтр перестанет
   * срабатывать через `goalPlan`, а стеречь его будет нечем. Поэтому вход
   * подаётся руками.
   */
  it('заслон подменяет цель базовой ниже порога правила и пропускает с порога', () => {
    /**
     * 🔴 ПОРОГИ БЕРУТСЯ ИЗ `GS_RULES`, А НЕ ЗАШИТЫ ЧИСЛАМИ. Так и было обещано в
     * шапке — и 06.09.2026 обещание не выполнилось: числа 17/18 остались в коде,
     * `movelimit` уехал 18 → 16, и проба покраснела на верной правке. Пороги
     * двигают по замыслу продукта; проверять надо ОТНОШЕНИЕ «до порога базовая,
     * с порога своя», а не конкретный уровень.
     */
    const порог = (key: string): number => GS_RULES.find((r) => r.key === key)!.fromLevel;
    for (const [цель, ключ] of [['free', 'goalfree'], ['moves', 'movelimit'], ['pick', 'goalpick']] as const) {
      const L = порог(ключ);
      expect(`${цель} на ${L - 1}: ${clampGoalToRule({ kind: цель, count: 1 }, L - 1).kind}`)
        .toBe(`${цель} на ${L - 1}: all`);
      expect(`${цель} на ${L}: ${clampGoalToRule({ kind: цель, count: 1 }, L).kind}`)
        .toBe(`${цель} на ${L}: ${цель}`);
    }
  });

  it('заслон не трогает базовую цель — иначе играть было бы нечем', () => {
    for (const L of [1, 5, 30, 60]) expect(clampGoalToRule({ kind: 'all', count: 0 }, L).kind).toBe('all');
  });

  /**
   * Пороги берутся из `GS_RULES`, а не зашиты числом: опустят `fromLevel` —
   * цель обязана поехать за правилом сама, без правки этого файла.
   */
  it('заслон читает порог из списка правил, а не из константы', () => {
    for (const [kind, key] of [['free', 'goalfree'], ['moves', 'movelimit'], ['pick', 'goalpick']] as const) {
      const from = GS_RULES.find((r) => r.key === key)!.fromLevel;
      expect(clampGoalToRule({ kind, count: 1 }, from - 1).kind).toBe('all');
      expect(clampGoalToRule({ kind, count: 1 }, from).kind).toBe(kind);
    }
  });

  it('🔴 и ни на одном уровне из шестидесяти цель не опережает своё правило', () => {
    const silent: string[] = [];
    for (const L of LEVELS) {
      const kind = goalPlan(L).kind;
      const key = RULE_OF_GOAL[kind];
      if (!key) continue;
      const from = GS_RULES.find((r) => r.key === key)?.fromLevel;
      if (from === undefined || L < from) silent.push(`L${L}: цель «${kind}» при правиле «${key}» с L${from ?? '∞'}`);
    }
    expect(silent).toEqual([]);
  });
});
