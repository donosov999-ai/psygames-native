/* psygames-faces-names-teach · VER 1 · 24.09.2026 */
/**
 * 🎓 РАЗБОР «ЛИЦ И ИМЁН» УЧИТ НА ТЕХ, КОГО ИГРА СПРОСИТ.
 *
 * 🔴 ЧТО СТОРОЖИМ. Разбор показывает лицо, имя и черту — и если он возьмёт человека, которого
 * в этой партии не спросят, обучение окажется про других людей. Поэтому проба гоняет
 * настоящую партию: каждый показанный в разборе человек обязан быть и среди изучаемых, и
 * среди тех, кого игра спрашивает на опросе.
 *
 * ⚠️ ЧЕРТА — ИЗ ПОРТРЕТА, А НЕ ИЗ ГОЛОВЫ: описание берётся `describeSyntheticFace`, той же
 * функцией, что читает портрет экранному диктору.
 */
import {
  createFacesNamesSession,
  describeSyntheticFace,
  generateFacesNamesPuzzle,
  personById,
  startFacesNamesRound,
} from '@/src/games/faces-names/core';
import { собратьРазборЛиц } from '@/src/games/faces-names/teach';

const описаниеИз = (puzzle: ReturnType<typeof generateFacesNamesPuzzle>) => (id: string) => {
  const человек = personById(puzzle, id);
  return человек ? describeSyntheticFace('ru', человек.face) : '';
};

describe('разбор «Лиц и имён»', () => {
  it('🔴 разбор идёт по тем, кого игра И ПОКАЖЕТ, И СПРОСИТ', () => {
    for (const level of [1, 2, 3]) {
      const puzzle = generateFacesNamesPuzzle('teach-faces', level);
      const { люди } = собратьРазборЛиц(puzzle, описаниеИз(puzzle));
      const цели = new Set(puzzle.trials.map((t) => t.targetPersonId));
      expect(люди.length).toBeGreaterThan(0);
      for (const id of люди) {
        expect(puzzle.studiedPersonIds).toContain(id);
        expect(цели.has(id)).toBe(true);
      }
    }
  });

  it('🔴 черта берётся из НАСТОЯЩЕГО портрета этого человека', () => {
    const puzzle = generateFacesNamesPuzzle('teach-faces', 2);
    const описание = описаниеИз(puzzle);
    const { карточки } = собратьРазборЛиц(puzzle, описание);
    for (const к of карточки.filter((x) => x.вид === 'черта')) {
      expect(к.человек).not.toBeNull();
      expect(к.поля!.feature).toBe(описание(к.человек!));
      expect(String(к.поля!.feature).length).toBeGreaterThan(5);
      expect(к.поля!.name).toBe(personById(puzzle, к.человек!)!.name);
    }
  });

  it('🔴 помеха объяснена, а не замолчана: карточка есть и знает число примеров', () => {
    const puzzle = generateFacesNamesPuzzle('teach-faces', 6);
    const { карточки } = собратьРазборЛиц(puzzle, описаниеИз(puzzle));
    const помеха = карточки.find((к) => к.вид === 'помеха');
    expect(помеха).toBeDefined();
    expect(помеха!.поля!.n).toBe(puzzle.interferencePrompts.length);
  });

  it('на высоком уровне разбор говорит и про факт, на низком — нет', () => {
    const низкий = generateFacesNamesPuzzle('teach-faces', 3);
    const высокий = generateFacesNamesPuzzle('teach-faces', 9);
    expect(низкий.factRecallEnabled).toBe(false);
    expect(высокий.factRecallEnabled).toBe(true);
    expect(собратьРазборЛиц(низкий, описаниеИз(низкий)).карточки.find((к) => к.вид === 'имя')!.ключ)
      .toBe('teachFacesName');
    expect(собратьРазборЛиц(высокий, описаниеИз(высокий)).карточки.find((к) => к.вид === 'имя')!.ключ)
      .toBe('teachFacesNameAndFact');
  });

  it('🔴 длинный уровень не даёт длинный ролик: не больше трёх лиц', () => {
    const puzzle = generateFacesNamesPuzzle('teach-faces', 33);
    const { карточки, люди } = собратьРазборЛиц(puzzle, описаниеИз(puzzle));
    expect(puzzle.studiedPersonIds.length).toBe(12);
    expect(люди).toHaveLength(3);
    expect(карточки.length).toBeLessThanOrEqual(8);
  });

  it('партия с этим раскладом действительно начинается тем же составом', () => {
    const level = 2;
    const s = startFacesNamesRound(createFacesNamesSession({ seed: 'teach-faces', level }), 0);
    const { люди } = собратьРазборЛиц(s.puzzle, описаниеИз(s.puzzle));
    expect(s.puzzle.studiedPersonIds.slice(0, люди.length)).toEqual(люди);
  });
});
