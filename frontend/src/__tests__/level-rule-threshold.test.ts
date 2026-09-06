/**
 * 🔴 ЧИСЛО В ПРАВИЛЕ = ПОРОГ В КОДЕ. ВСЕ ИГРЫ, ИСПОЛНЕНИЕМ.
 *
 * ЗАЧЕМ. `fromLevel` в списке правил — это ОБЕЩАНИЕ: «с этого уровня механика
 * есть, и вот её объяснение». Само по себе это число ничем не связано с кодом,
 * который механику включает. Пока оба места пишет один человек в один заход,
 * они совпадают; когда график потом двигают — расходятся молча, и игрок
 * получает механику без объяснения либо объяснение без механики.
 *
 * 06.09.2026 так и нашлось в сортировке товаров: пороги правил подняли 02.09,
 * а таблицу целей не тронули — «освободить ниши» приходило на L7 при правиле с
 * L12, лимит ходов на L9 и L13 при правиле с L18. Препятствия там прикрыты
 * фильтром, цели были открыты. Тот случай закрыт точечным гейтом
 * `goods-sort-silent-goal`; этот — обобщает проверку на все игры.
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ СОСЕДНИХ ГЕЙТОВ. `level-rules-reachable`,
 * `level-rule-badge-alive`, `level-rules-i18n` и `rules-not-during-recall`
 * стерегут ДОСТАВКУ правила: доедет ли окно до экрана, не потерялся ли бейдж,
 * есть ли перевод, не лезет ли окно во время воспроизведения. Ни один из них не
 * смотрит, ПРАВДУ ли правило говорит. Это — единственный про содержание.
 *
 * ⚠️ КАК ПРОВЕРЯЕТСЯ. Обе стороны ИСПОЛНЯЮТСЯ, ни одна не разбирается из
 * исходника: слева настоящий массив правил игры (`*_RULES`), справа настоящая
 * функция плана уровня (`levelParams` и родня). Гейт прогоняет L1…L60 и
 * спрашивает у кода, с какого уровня механика реально включается.
 */
import { CS_RULES } from '@/app/games/cake-sort';
import { CHESSBLIND_RULES } from '@/app/games/chess-blind';
import { CORSI_RULES, levelParams as corsi } from '@/app/games/corsi';
import { CPT_RULES, levelParams as cpt } from '@/app/games/cpt';
import { DS_RULES, levelParams as digitSpan } from '@/app/games/digit-span';
import { GS_RULES, goalPlan, levelCfg as gsCfg, strictPlacement, hiddenInfo, jokerNiches, movingNiches, monochromeLevel } from '@/app/games/goods-sort';
import { HN_RULES, levelParams as hanoi } from '@/app/games/hanoi';
import { WATER_SORT_RULES } from '@/app/games/water-sort';
import { скрытоНаУровне } from '@/src/games/water-sort/core/hidden';
import { levelParams } from '@/src/games/water-sort/core/generate';
import { LISTENINGSPAN_RULES, levelParams as listening } from '@/app/games/listening-span';
import { MAHJONG_RULES } from '@/app/games/mahjong';
import { MS_RULES, opsFor } from '@/app/games/math-sprint';
import { MEMORYMATRIX_RULES, levelParams as matrix } from '@/app/games/memory-matrix';
import { MR_RULES } from '@/app/games/mental-rotation';
import { MNEMONICS_RULES } from '@/app/games/mnemonics';
import { NB_RULES, levelParams as nback } from '@/app/games/n-back';
import { OSPAN_RULES, levelParams as ospan } from '@/app/games/ospan';
import { PAIRS_RULES, levelCfg as pairs } from '@/app/games/picture-pairs';
import { PRL_RULES } from '@/app/games/prl';
import { PSEUDOWORDECHO_RULES, levelParams as echo } from '@/app/games/pseudoword-echo';
import { READINGSPAN_RULES } from '@/app/games/reading-span';
import { SEMANTICSORT_RULES, levelParams as semantic } from '@/app/games/semantic-sort';
import { SG_RULES, levelParams as setGame } from '@/app/games/set-game';
import { SS_RULES, levelParams as spatial } from '@/app/games/spatial-span';
import { VS_RULES, levelParams as visual } from '@/app/games/visual-search';
import { WORDPAIRS_RULES, levelParams as wordPairs } from '@/app/games/word-pairs';
import { LevelRule } from '@/src/components/LevelRules';
import { puzzleLevelParams } from '@/src/games/chess-blind/core/puzzle';
import { levelParams as rotation } from '@/src/games/mental-rotation/core/rotation';
import { mahjongLevel, mahjongHidden } from '@/src/services/mahjongLevels';
import { levelCfg as cakeLevel } from '@/src/games/cake-sort/core/level';

const LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);

/** Все игры с правилами уровня. Ключ — имя игры, значение — её настоящий массив правил. */
const RULES: Record<string, LevelRule[]> = {
  'cake-sort': CS_RULES,
  'chess-blind': CHESSBLIND_RULES, corsi: CORSI_RULES, cpt: CPT_RULES, 'digit-span': DS_RULES,
  'goods-sort': GS_RULES, hanoi: HN_RULES, 'listening-span': LISTENINGSPAN_RULES,
  'water-sort': WATER_SORT_RULES,
  mahjong: MAHJONG_RULES, 'math-sprint': MS_RULES, 'memory-matrix': MEMORYMATRIX_RULES,
  'mental-rotation': MR_RULES, mnemonics: MNEMONICS_RULES, 'n-back': NB_RULES, ospan: OSPAN_RULES,
  'picture-pairs': PAIRS_RULES, prl: PRL_RULES, 'pseudoword-echo': PSEUDOWORDECHO_RULES,
  'reading-span': READINGSPAN_RULES, 'semantic-sort': SEMANTICSORT_RULES, 'set-game': SG_RULES,
  'spatial-span': SS_RULES, 'visual-search': VS_RULES, 'word-pairs': WORDPAIRS_RULES,
};

/**
 * Механика правила, выраженная ИСПОЛНИМЫМ вопросом к плану уровня.
 *
 * `вид` решает, что именно сверяется:
 *   'порог'    — механика включается и дальше остаётся; сверяется только `fromLevel`.
 *                `toLevel` у такой записи значит «карточку сменила следующая», а не
 *                «механика кончилась»: у `math-sprint` умножение живёт и после L4,
 *                просто с L5 показывается правило про деление.
 *   'состояние'— механика занимает ОТРЕЗОК уровней (четыре колышка, три слоя, две
 *                оси); сверяются оба конца, и `toLevel` тоже обязан совпасть.
 */
type Вид = 'порог' | 'состояние';
interface Механика { игра: string; ключ: string; вид: Вид; есть: (L: number) => boolean }

const МЕХАНИКИ: Механика[] = [
  // ── дискретные переключатели ────────────────────────────────────────────────
  { игра: 'cake-sort', ключ: 'queue', вид: 'порог', есть: (L) => cakeLevel(L).queue > 0 },
  { игра: 'chess-blind', ключ: 'moves', вид: 'порог', есть: (L) => puzzleLevelParams(L).moves > 0 },
  { игра: 'chess-blind', ключ: 'locate', вид: 'порог', есть: (L) => puzzleLevelParams(L).quizType === 'locate' },
  { игра: 'corsi', ключ: 'reverse', вид: 'порог', есть: (L) => corsi(L).reverse },
  { игра: 'cpt', ключ: 'lookalike', вид: 'порог', есть: (L) => cpt(L).confusableRatio > 0 },
  { игра: 'digit-span', ключ: 'reverse', вид: 'порог', есть: (L) => digitSpan(L).reverse },
  { игра: 'hanoi', ключ: 'pegs4', вид: 'состояние', есть: (L) => hanoi(L).pegs === 4 },
  { игра: 'hanoi', ключ: 'pegs5', вид: 'порог', есть: (L) => hanoi(L).pegs === 5 },
  { игра: 'listening-span', ключ: 'span8', вид: 'порог', есть: (L) => listening(L).span >= 8 },
  { игра: 'mahjong', ключ: 'layers2', вид: 'состояние', есть: (L) => mahjongLevel(L).layers === 2 },
  { игра: 'mahjong', ключ: 'layers3', вид: 'состояние', есть: (L) => mahjongLevel(L).layers === 3 },
  { игра: 'mahjong', ключ: 'layers4', вид: 'состояние', есть: (L) => mahjongLevel(L).layers === 4 },
  { игра: 'mahjong', ключ: 'layers5', вид: 'порог', есть: (L) => mahjongLevel(L).layers === 5 },
  { игра: 'mahjong', ключ: 'hidden', вид: 'порог', есть: (L) => mahjongHidden(L) },
  { игра: 'math-sprint', ключ: 'mult', вид: 'порог', есть: (L) => opsFor(L).includes('*') },
  { игра: 'math-sprint', ключ: 'div', вид: 'порог', есть: (L) => opsFor(L).includes('/') },
  { игра: 'memory-matrix', ключ: 'grid6', вид: 'порог', есть: (L) => matrix(L).gridSize >= 6 },
  // Правило обещает буквально «вспышка длится меньше секунды» — это и проверяем.
  { игра: 'memory-matrix', ключ: 'fast', вид: 'порог', есть: (L) => matrix(L).flashMs < 1000 },
  { игра: 'mental-rotation', ключ: 'axes2', вид: 'состояние', есть: (L) => rotation(L).axes.length === 2 },
  { игра: 'mental-rotation', ключ: 'axes3', вид: 'порог', есть: (L) => rotation(L).axes.length === 3 },
  { игра: 'n-back', ключ: 'dual', вид: 'порог', есть: (L) => nback(L).modality === 'dual' },
  { игра: 'ospan', ключ: 'hardmath', вид: 'порог', есть: (L) => ospan(L).hardMath },
  { игра: 'picture-pairs', ключ: 'triple', вид: 'состояние', есть: (L) => pairs(L).groupSize === 3 },
  { игра: 'picture-pairs', ключ: 'quad', вид: 'порог', есть: (L) => pairs(L).groupSize === 4 },
  { игра: 'pseudoword-echo', ключ: 'longer6', вид: 'порог', есть: (L) => echo(L).lenMin >= 6 },
  { игра: 'pseudoword-echo', ключ: 'longer8', вид: 'порог', есть: (L) => echo(L).lenMin >= 8 },
  { игра: 'semantic-sort', ключ: 'three', вид: 'порог', есть: (L) => semantic(L).catsPerRound >= 3 },
  { игра: 'semantic-sort', ключ: 'four', вид: 'порог', есть: (L) => semantic(L).catsPerRound >= 4 },
  { игра: 'set-game', ключ: 'timelimit', вид: 'порог', есть: (L) => setGame(L).timeLimit > 0 },
  { игра: 'spatial-span', ключ: 'grid5', вид: 'порог', есть: (L) => spatial(L).gridSize >= 5 },
  // `targetCount` зажат ещё и номером раунда; берём двадцатый, где потолок уровня уже раскрыт.
  { игра: 'visual-search', ключ: 'multi', вид: 'состояние', есть: (L) => visual(L, 20).targetCount === 2 },
  { игра: 'visual-search', ключ: 'conj', вид: 'порог', есть: (L) => visual(L, 1).conjunction },
  // Правило обещает «список дорос до предела — пятнадцать пар».
  { игра: 'word-pairs', ключ: 'fifteen', вид: 'порог', есть: (L) => wordPairs(L).pairCount >= 15 },

  // ── сортировка товаров: цели и препятствия ──────────────────────────────────
  { игра: 'goods-sort', ключ: 'goalpick', вид: 'порог', есть: (L) => goalPlan(L).kind === 'pick' },
  { игра: 'goods-sort', ключ: 'goalfree', вид: 'порог', есть: (L) => goalPlan(L).kind === 'free' },
  { игра: 'goods-sort', ключ: 'movelimit', вид: 'порог', есть: (L) => goalPlan(L).kind === 'moves' },
  { игра: 'goods-sort', ключ: 'blocked', вид: 'порог', есть: (L) => gsCfg(L, 8, false).obst.blocked > 0 },
  { игра: 'goods-sort', ключ: 'covered', вид: 'порог', есть: (L) => gsCfg(L, 8, false).obst.covered > 0 },
  { игра: 'goods-sort', ключ: 'locked', вид: 'порог', есть: (L) => gsCfg(L, 8, false).obst.locked > 0 },
  { игра: 'goods-sort', ключ: 'frozen', вид: 'порог', есть: (L) => gsCfg(L, 8, false).obst.frozenRow },
  { игра: 'goods-sort', ключ: 'strict', вид: 'порог', есть: (L) => strictPlacement(L) },
  { игра: 'goods-sort', ключ: 'hidden', вид: 'порог', есть: (L) => hiddenInfo(L) },
  { игра: 'goods-sort', ключ: 'joker', вид: 'порог', есть: (L) => jokerNiches(L, 14).length > 0 },
  { игра: 'goods-sort', ключ: 'moving', вид: 'порог', есть: (L) => movingNiches(L) },
  { игра: 'goods-sort', ключ: 'mono', вид: 'порог', есть: (L) => monochromeLevel(L) },
  /**
   * ⚠️ ПЕРЕЛИВАЛКА ЗАРЕГИСТРИРОВАНА ЗДЕСЬ 06.09.2026, В ТОТ ЖЕ ЗАХОД, ЧТО И
   * МЕХАНИКА. Первым делом её правило было НЕ ВИДНО этому гейту: массив не был
   * экспортирован, и новое правило стояло вне той самой проверки, ради которой
   * гейт написан. Ровно так дыра и заводится — не злым умыслом, а тем, что
   * регистрацию откладывают «на потом».
   */
  { игра: 'water-sort', ключ: 'hidden', вид: 'порог', есть: (L) => скрытоНаУровне(L) },
  /**
   * Три оси верхней полосы, заведённые 06.09.2026. Проверяются НЕ по числам из
   * таблицы правил, а по тому, что реально выдаёт `levelParams`: разъедутся —
   * человек прочтёт про камни за четыре уровня до первого камня.
   */
  { игра: 'water-sort', ключ: 'short', вид: 'порог', есть: (L) => levelParams(L).shortBy > 0 },
  { игра: 'water-sort', ключ: 'stones', вид: 'порог', есть: (L) => levelParams(L).stones > 0 },
  { игра: 'water-sort', ключ: 'sealed', вид: 'порог', есть: (L) => levelParams(L).deferred > 0 },
];

/**
 * 🔴 ЧТО СОЗНАТЕЛЬНО НЕ ПРОВЕРЯЕТСЯ — И ПОЧЕМУ ИМЕННО ЭТИ.
 *
 * Гейт умеет спросить «с какого уровня механика включается» только там, где
 * включение ДИСКРЕТНО. У пяти правил механики нет вовсе: величина растёт
 * гладко, шага нет ни на одном уровне, и `fromLevel` там — редакторское
 * решение «вот теперь про это уместно сказать», а не отражение кода.
 *
 * ⚠️ Разница видна по тексту самого правила. «Вспышка длится меньше секунды» и
 * «список дорос до предела — пятнадцать пар» — утверждения про ЭТОТ уровень, их
 * можно проверить, и они проверяются выше. «С семи-восьми элементов простое
 * проговаривание уже не держит» — утверждение про человеческую память вообще, а
 * не про то, что на этом уровне ровно семь элементов; проверять нечего.
 *
 * Список закрытый: тест ниже требует, чтобы КАЖДОЕ правило каждой игры было
 * либо в `МЕХАНИКИ`, либо здесь. Новое правило молча мимо гейта не пройдёт.
 */
const РЕДАКЦИОННЫЕ: Record<string, string> = {
  'mnemonics:method': 'itemCount растёт на 1 за уровень без шага; текст говорит о пределе памяти вообще, а не о числе на этом уровне',
  'prl:reversal': 'реверс есть с первого уровня всегда — порога не существует, правило вводное',
  'prl:noisy': 'rewardProb ползёт 0,90 → 0,68 линейно, revMin 8 → 3; ступени нет ни на одном уровне',
  'reading-span:load': 'setSize = 2 + уровень, плюс один за уровень без ступени; «длиннее, чем удержишь» — про человека, не про число',
  'word-pairs:faster': 'perPairMs ползёт 7000 → 2500 линейно; ступени нет',
};

const адрес = (и: string, к: string) => `${и}:${к}`;
const первый = (m: Механика) => LEVELS.find((L) => m.есть(L));
const последний = (m: Механика) => [...LEVELS].reverse().find((L) => m.есть(L));

describe('правило уровня не врёт про свой номер', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(Object.keys(RULES).length).toBeGreaterThanOrEqual(24);
    const всего = Object.values(RULES).reduce((n, r) => n + r.length, 0);
    expect(всего).toBeGreaterThanOrEqual(49);
    expect(МЕХАНИКИ.length).toBeGreaterThanOrEqual(45);
    expect(Object.keys(РЕДАКЦИОННЫЕ).length).toBeGreaterThan(0);
  });

  /**
   * 🔴 БЕЗ ЭТОГО ГЕЙТ ДЫРЯВ: новая игра или новое правило прошли бы мимо, просто
   * не попав в карту, и гейт остался бы зелёным на неполном множестве.
   */
  it('🔴 каждое правило каждой игры либо проверяется, либо названо редакционным', () => {
    const мимо: string[] = [];
    for (const [игра, правила] of Object.entries(RULES)) {
      for (const r of правила) {
        const a = адрес(игра, r.key);
        const есть = МЕХАНИКИ.some((m) => адрес(m.игра, m.ключ) === a);
        if (!есть && !(a in РЕДАКЦИОННЫЕ)) мимо.push(a);
      }
    }
    expect(мимо).toEqual([]);
  });

  it('карта не ссылается на правила, которых нет', () => {
    const лишние = МЕХАНИКИ
      .filter((m) => !(RULES[m.игра] ?? []).some((r) => r.key === m.ключ))
      .map((m) => адрес(m.игра, m.ключ));
    expect(лишние).toEqual([]);
  });

  /**
   * Вопрос, отвечающий одинаково на всех шестидесяти уровнях, ничего не меряет.
   * Такой предикат зеленил бы проверку ниже вслепую — например, если поле
   * переименовали и `p.reverse` стало `undefined` на каждом уровне.
   */
  it('🔴 каждый вопрос к плану различает уровни — иначе он вырожден', () => {
    const мёртвые: string[] = [];
    for (const m of МЕХАНИКИ) {
      const да = LEVELS.filter((L) => m.есть(L)).length;
      if (да === 0 || да === LEVELS.length) мёртвые.push(`${адрес(m.игра, m.ключ)}: ${да} из 60`);
    }
    expect(мёртвые).toEqual([]);
  });

  it('🔴 механика включается ровно на том уровне, что обещан правилом', () => {
    const врут: string[] = [];
    for (const m of МЕХАНИКИ) {
      const r = RULES[m.игра].find((x) => x.key === m.ключ)!;
      const факт = первый(m);
      if (факт !== r.fromLevel) {
        врут.push(`${адрес(m.игра, m.ключ)}: правило с L${r.fromLevel}, механика с L${факт ?? '∞'}`);
      }
    }
    expect(врут).toEqual([]);
  });

  it('🔴 механика-отрезок кончается там, где кончается её правило', () => {
    const врут: string[] = [];
    for (const m of МЕХАНИКИ.filter((x) => x.вид === 'состояние')) {
      const r = RULES[m.игра].find((x) => x.key === m.ключ)!;
      const факт = последний(m);
      if (r.toLevel === undefined) { врут.push(`${адрес(m.игра, m.ключ)}: помечена отрезком, а toLevel не задан`); continue; }
      if (факт !== r.toLevel) врут.push(`${адрес(m.игра, m.ключ)}: правило до L${r.toLevel}, механика до L${факт ?? '∞'}`);
    }
    expect(врут).toEqual([]);
  });

  /**
   * 🔴 ДВА ПРАВИЛА НА ОДНОМ ПОРОГЕ = ОДНО ИЗ НИХ НЕ ПОКАЖЕТСЯ НИКОГДА.
   *
   * `activeLevelRule` берёт ПОСЛЕДНЕЕ подошедшее. Совпали `fromLevel` — младшее
   * по порядку не выигрывает ни на одном уровне и молчит навсегда, а гейты про
   * доставку этого не видят: окно на месте, перевод есть, бейдж рисуется.
   * Ловушка близкая: 06.09.2026, подбирая порог для `covered`, я чуть не
   * поставил его на L16 — туда же, куда уехал `movelimit`.
   */
  it('🔴 в одной игре нет двух правил с одинаковым порогом', () => {
    const столкновения: string[] = [];
    for (const [игра, правила] of Object.entries(RULES)) {
      const по: Record<number, string[]> = {};
      for (const r of правила) (по[r.fromLevel] ??= []).push(r.key);
      for (const [L, ключи] of Object.entries(по)) {
        if (ключи.length > 1) столкновения.push(`${игра} L${L}: ${ключи.join(' и ')}`);
      }
    }
    expect(столкновения).toEqual([]);
  });

  /**
   * 🔴 ЦЕЛЬ, ЧЬЁ ПРАВИЛО НАЧИНАЕТСЯ ПОЗЖЕ КОНЦА ПЕРВОГО КРУГА, НЕДОСТИЖИМА.
   *
   * Цикл целей сортировки расписан от L5 и длиной `GOAL_PLANS`, значит первый
   * круг кончается на L(5 + длина − 1) = L16. Правило с порогом позже этого
   * означает, что цель вычёркивается фильтром на КАЖДОМ месте первого круга и
   * приходит только со второго — никакая перестановка таблицы не помогает.
   * Именно так `movelimit` с L18 давал первую цель «ходы» на L21.
   */
  it('🔴 порог цели укладывается в первый круг цикла', () => {
    const конецКруга = 5 + 12 - 1;   // якорь L5, длина GOAL_PLANS = 12
    const поздние = ['goalpick', 'goalfree', 'movelimit']
      .map((k) => GS_RULES.find((r) => r.key === k)!)
      .filter((r) => r.fromLevel > конецКруга)
      .map((r) => `${r.key}: порог L${r.fromLevel} позже конца круга L${конецКруга}`);
    expect(поздние).toEqual([]);
  });
});
