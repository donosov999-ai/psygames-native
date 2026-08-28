/* psygames-game-picker-test · VER 1 · 28.08.2026 */
/**
 * ПОДБОР ИГР НОВИЧКУ — скоринг гоняется по ВСЕМ 27 сочетаниям ответов.
 *
 * Идея Валентины (1cd2d132), одобрена Денисом 28.08. Что обязано держаться:
 *   · каждое сочетание даёт ровно три СУЩЕСТВУЮЩИЕ видимые карточки — рекомендация
 *     в пустоту или в скрытую игру хуже отсутствия подбора;
 *   · ответы влияют: «слова» приводят словесную игру, «час и больше» — судоку-хаб,
 *     «азарт» — скоростную; иначе это не подбор, а гороскоп;
 *   · детерминизм: одни ответы — один результат;
 *   · каждый id в матрицах весов существует в каталоге (выдуманная карта копит
 *     мёртвый вес молча);
 *   · профиль-подсказка — настоящий id профиля.
 */
import { GAMES } from '@/src/constants/games';
import { PROFILES } from '@/src/constants/profiles';
import { pickGames, pickProfile, recommendableGames, PICKER_WEIGHTS, type PickerAnswers } from '@/src/services/gamePicker';

const ALL: PickerAnswers[] = [];
for (const mood of [0, 1, 2] as const) for (const time of [0, 1, 2] as const) for (const taste of [0, 1, 2] as const) {
  ALL.push({ mood, time, taste });
}

describe('подбор игр новичку', () => {
  it('🔴 все 27 сочетаний дают три существующие видимые карточки', () => {
    const visible = new Set(recommendableGames().map((g) => g.id));
    for (const a of ALL) {
      const { games } = pickGames(a);
      expect(`${JSON.stringify(a)}: ${games.length}`).toBe(`${JSON.stringify(a)}: 3`);
      for (const g of games) expect(`${g.id}: ${visible.has(g.id)}`).toBe(`${g.id}: true`);
      expect(new Set(games.map((g) => g.id)).size).toBe(3);   // без повторов
    }
  });

  it('детерминизм: одни ответы — один результат', () => {
    for (const a of ALL.slice(0, 5)) {
      expect(pickGames(a).games.map((g) => g.id)).toEqual(pickGames(a).games.map((g) => g.id));
    }
  });

  it('ответы влияют: слова → словесная игра, час+ → судоку-хаб, азарт → скорость', () => {
    const words = pickGames({ mood: 1, time: 1, taste: 0 }).games.map((g) => g.id);
    expect(`слова: ${words.some((id) => ['anagrams', 'proofreading', 'word_pairs'].includes(id))}`).toBe('слова: true');
    const long = pickGames({ mood: 1, time: 2, taste: 1 }).games.map((g) => g.id);
    expect(`час+: ${long.includes('sudoku_group')}`).toBe('час+: true');
    const thrill = pickGames({ mood: 2, time: 0, taste: 2 }).games;
    expect(`азарт: ${thrill.some((g) => g.category === 'action')}`).toBe('азарт: true');
    // и хотя бы два разных топа среди всех сочетаний — не гороскоп с одним ответом
    expect(new Set(ALL.map((a) => pickGames(a).games.map((g) => g.id).join('+'))).size).toBeGreaterThan(3);
  });

  it('каждый id в матрицах весов существует в каталоге', () => {
    const ids = new Set(GAMES.map((g) => g.id));
    for (const layer of [...PICKER_WEIGHTS.GAME]) {
      for (const variant of Object.values(layer)) {
        for (const id of Object.keys(variant)) {
          expect(`${id}: ${ids.has(id)}`).toBe(`${id}: true`);
        }
      }
    }
  });

  it('профиль-подсказка — настоящий id профиля, для «расслабиться» — Микро-релакс', () => {
    const pids = new Set<string>(PROFILES.map((p) => p.id));
    for (const a of ALL) expect(pids.has(pickProfile(a))).toBe(true);
    expect(pickProfile({ mood: 0, time: 0, taste: 2 })).toBe('women');
  });
});
