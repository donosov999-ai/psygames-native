/* psygames-game-picker · VER 1 · 28.08.2026 */
/**
 * ПОДБОР ИГР НОВИЧКУ — три вопроса вместо каталога на 73 карточки.
 *
 * Идея Валентины (app_feedback 1cd2d132, 22.08), одобрена Денисом 28.08: новичок
 * заходит, игр много, он выбирает наугад. Здесь он отвечает на три вопроса —
 * настроение / время / склонность — и получает три игры «под себя» плюс подсказку,
 * какой профиль ему ближе.
 *
 * ⚠️ ЧИСТАЯ ФУНКЦИЯ, НЕ ЭКРАН. Скоринг лежит отдельно от онбординга, потому что
 * его надо гонять тестом по всем 27 сочетаниям ответов: каждый обязан дать три
 * СУЩЕСТВУЮЩИЕ и ДОСТИЖИМЫЕ с меню карточки. Экран только рисует ответ.
 *
 * КАК СЧИТАЕТСЯ. У каждого варианта ответа два слоя весов: по осям каталога
 * (category игр — память/внимание/логика/скорость) и точечные бонусы конкретным
 * картам (category слишком груба: «слова» — это анаграммы и корректура, а не вся
 * логика). Сумма по трём ответам ранжирует ВИДИМЫЕ карточки каталога; хабы
 * (групп-карты) участвуют наравне — судоку живёт именно за хабом.
 */
import { GAMES, type GameConfig } from '@/src/constants/games';

/** Три вопроса по три варианта — индексы ответов. */
export interface PickerAnswers {
  /** 0 расслабиться · 1 прокачать мозг · 2 азарт и скорость */
  mood: 0 | 1 | 2;
  /** 0 пять минут · 1 десять-пятнадцать · 2 час и больше */
  time: 0 | 1 | 2;
  /** 0 слова · 1 числа и логика · 2 картинки и память */
  taste: 0 | 1 | 2;
}

export interface PickerResult {
  games: GameConfig[];           // ровно три, по убыванию балла
  profileId: string;             // подсказка «какой профиль твой»
}

/** Веса категорий каталога за вариант ответа. */
const CAT: Record<string, Record<string, number>>[] = [
  { // mood
    0: { memory: 2, attention: 2, intuition: 1 },            // расслабиться — «найди/собери»
    1: { memory: 2, logic: 2, attention: 1 },                // прокачать — рабочая память и логика
    2: { action: 3, attention: 1 },                          // азарт — скорость
  },
  { // time
    0: { action: 1, attention: 1 },                          // пять минут — быстрые раунды
    1: {},                                                   // среднее — нейтрально
    2: { logic: 2 },                                         // час и больше — глубокая логика
  },
  { // taste
    0: {},                                                   // слова — категории нет, только точечные
    1: { logic: 2 },
    2: { memory: 2, attention: 1 },
  },
];

/** Точечные бонусы картам за вариант ответа — там, где категория слишком груба. */
const GAME: Record<string, Record<string, number>>[] = [
  { // mood
    0: { picture_pairs: 2, find_differences: 2, goods_sort: 2, sudoku_group: 1 },
    1: { n_back: 2, schulte_table: 2, memory_matrix: 1, stroop: 1 },
    2: { targets: 3, math_sprint: 2 },
  },
  { // time
    0: { targets: 1, schulte_table: 1, picture_pairs: 1 },
    1: {},
    2: { sudoku_group: 3, hanoi: 2, chess_blind: 2 },
  },
  { // taste
    0: { anagrams: 4, proofreading: 3, word_pairs: 3, phonemic_fluency: 2, mnemonics: 2 },
    1: { sudoku_group: 3, math_sprint: 2, hanoi: 1, set_game: 1 },
    2: { picture_pairs: 2, memory_matrix: 2, find_differences: 2, visual_search: 1 },
  },
];

/** Профиль-подсказка: настроение решает, вкус уточняет. */
export function pickProfile(a: PickerAnswers): string {
  if (a.mood === 0) return 'women';                          // «Микро-релакс»
  if (a.mood === 2) return 'drivers';                        // скорость и реакция
  return a.taste === 0 ? 'polyglot' : a.taste === 1 ? 'chess' : 'students';
}

/** Карточки, которые вообще можно рекомендовать: видимые в меню (хабы — тоже карточки). */
export function recommendableGames(catalog: GameConfig[] = GAMES): GameConfig[] {
  return catalog.filter((g) => !g.hideFromMenu && g.category !== 'recovery');
}

/** Матрицы наружу — гейт проверяет, что каждый упомянутый id существует в каталоге. */
export const PICKER_WEIGHTS = { CAT, GAME } as const;

export function pickGames(a: PickerAnswers, catalog: GameConfig[] = GAMES): PickerResult {
  const pool = recommendableGames(catalog);
  const answers = [a.mood, a.time, a.taste];
  const scored = pool.map((g, idx) => {
    let s = 0;
    for (let q = 0; q < 3; q++) {
      s += CAT[q]![answers[q]!]?.[g.category] ?? 0;
      s += GAME[q]![answers[q]!]?.[g.id] ?? 0;
    }
    // Стабильный хвост: при равном балле побеждает более ранняя карточка каталога —
    // порядок там курируется руками, случайности в рекомендации не место.
    return { g, s, idx };
  });
  scored.sort((x, y) => y.s - x.s || x.idx - y.idx);
  return { games: scored.slice(0, 3).map((x) => x.g), profileId: pickProfile(a) };
}
