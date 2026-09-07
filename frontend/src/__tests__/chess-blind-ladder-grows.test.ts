/**
 * 🔴 ЛЕСТНИЦА РАСТЁТ НА КАЖДОЙ СТУПЕНИ, А НЕ ЧИСЛИТСЯ РАСТУЩЕЙ.
 *
 * 📍 ЗАЧЕМ. 07.09.2026 лестница продлена с 15 до 25 уровней. Мутации показали,
 * что этого НИКТО НЕ СТЕРЕЖЁТ: заменяю все десять новых ступеней на плато
 * (фигуры 12 везде) — 122 пробы из 122 остаются зелёными. То же с ходами
 * вслепую. То есть можно было дописать десять одинаковых уровней, и раздел
 * отчитался бы «лестница продлена».
 *
 * ⚠️ Ровно об этом предупреждает ТЗ §5 на примере соседнего раздела: там
 * тридцать четыре уровня выглядели растущими, ничем не отличаясь друг от друга.
 *
 * ⚠️ МОНОТОННОСТЬ ТРЕБУЕТСЯ НЕ ВЕЗДЕ. На шестом уровне доска намеренно
 * сбрасывается (12 фигур → 6), потому что там начинаются ходы вслепую и объём
 * уступает место новой оси. Поэтому монотонность проверяется ВНУТРИ полос, а
 * «нет двух одинаковых ступеней» — по всей лестнице.
 */
import { puzzleLevelParams, PUZZLE_MIN_LEVEL, PUZZLE_MAX_LEVEL } from '@/src/games/chess-blind/core/puzzle';
import { примеровНаПодход } from '@/src/games/chess-blind/core/interference';

/** Все параметры уровня одной строкой — по ней и сравниваем ступени. */
function ступень(L: number): string {
  const п = puzzleLevelParams(L);
  return [п.pieces, п.exposeSec, п.moves, п.quizType, п.questions, п.optionCount,
    п.sameColorShare, примеровНаПодход(L)].join('|');
}

describe('«Доска в уме»: лестница действительно растёт', () => {
  it('🔴 нет ДВУХ ОДИНАКОВЫХ соседних ступеней ни на одном участке', () => {
    const близнецы: string[] = [];
    for (let L = PUZZLE_MIN_LEVEL + 1; L <= PUZZLE_MAX_LEVEL; L++) {
      if (ступень(L) === ступень(L - 1)) близнецы.push(`${L - 1}=${L}`);
    }
    expect(`пар одинаковых ступеней: ${близнецы.length} → ${близнецы.join(', ')}`)
      .toBe('пар одинаковых ступеней: 0 → ');
    expect(`ступеней всего: ${PUZZLE_MAX_LEVEL}`).toBe('ступеней всего: 25');
  });

  /**
   * 🔴 И РАЗЛИЧИЕ НЕ ДЕКОРАТИВНОЕ. Соседние ступени обязаны отличаться тем, что
   * человек ЧУВСТВУЕТ: числом фигур, временем показа, ходами вслепую, числом
   * вопросов или помехой. Смена, скажем, одного лишь `sameColorShare` там, где
   * вариантов не показывают, различием не считается.
   */
  it('🔴 каждая ступень отличается ощутимой осью, а не бухгалтерией', () => {
    const пустые: string[] = [];
    for (let L = PUZZLE_MIN_LEVEL + 1; L <= PUZZLE_MAX_LEVEL; L++) {
      const a = puzzleLevelParams(L - 1); const b = puzzleLevelParams(L);
      const ощутимо = a.pieces !== b.pieces || a.exposeSec !== b.exposeSec
        || a.moves !== b.moves || a.quizType !== b.quizType || a.questions !== b.questions
        || примеровНаПодход(L - 1) !== примеровНаПодход(L)
        || (b.quizType === 'pick' && (a.optionCount !== b.optionCount || a.sameColorShare !== b.sameColorShare));
      if (!ощутимо) пустые.push(`${L - 1}→${L}`);
    }
    expect(`переходов без ощутимого различия: ${пустые.length} → ${пустые.join(', ')}`)
      .toBe('переходов без ощутимого различия: 0 → ');
  });

  it('🔴 в ПРОДЛЁННОЙ полосе (16–25) объём и ходы растут монотонно', () => {
    const сбои: string[] = [];
    for (let L = 17; L <= PUZZLE_MAX_LEVEL; L++) {
      const a = puzzleLevelParams(L - 1); const b = puzzleLevelParams(L);
      if (b.pieces < a.pieces) сбои.push(`ур.${L}: фигур ${a.pieces} → ${b.pieces}`);
      if (b.moves < a.moves) сбои.push(`ур.${L}: ходов ${a.moves} → ${b.moves}`);
      if (b.exposeSec > a.exposeSec) сбои.push(`ур.${L}: показ ${a.exposeSec} → ${b.exposeSec}`);
    }
    expect(`провалов монотонности в 16–25: ${сбои.length} → ${сбои.join(' | ')}`)
      .toBe('провалов монотонности в 16–25: 0 → ');

    // И рост не нулевой: край полосы заметно выше её начала.
    const н = puzzleLevelParams(16); const в = puzzleLevelParams(PUZZLE_MAX_LEVEL);
    expect(`фигур ${н.pieces} → ${в.pieces}, ходов ${н.moves} → ${в.moves}, показ ${н.exposeSec} → ${в.exposeSec}`)
      .toBe('фигур 12 → 22, ходов 13 → 24, показ 6 → 4');
  });

  it('🔴 верх лестницы труднее прежнего верха по КАЖДОЙ несущей оси', () => {
    const был = puzzleLevelParams(15);      // прежний потолок
    const стал = puzzleLevelParams(PUZZLE_MAX_LEVEL);
    expect(`фигур ${был.pieces} → ${стал.pieces}: ${стал.pieces > был.pieces}`)
      .toBe(`фигур ${был.pieces} → ${стал.pieces}: true`);
    expect(`ходов ${был.moves} → ${стал.moves}: ${стал.moves > был.moves}`)
      .toBe(`ходов ${был.moves} → ${стал.moves}: true`);
    expect(`вопросов ${был.questions} → ${стал.questions}: ${стал.questions > был.questions}`)
      .toBe(`вопросов ${был.questions} → ${стал.questions}: true`);
    expect(`показ ${был.exposeSec} → ${стал.exposeSec}: ${стал.exposeSec < был.exposeSec}`)
      .toBe(`показ ${был.exposeSec} → ${стал.exposeSec}: true`);
    expect(`примеров помехи ${примеровНаПодход(15)} → ${примеровНаПодход(PUZZLE_MAX_LEVEL)}: ${примеровНаПодход(PUZZLE_MAX_LEVEL) > примеровНаПодход(15)}`)
      .toBe(`примеров помехи ${примеровНаПодход(15)} → ${примеровНаПодход(PUZZLE_MAX_LEVEL)}: true`);
  });
});
