/* psygames-chess-blind-questions · VER 1 · 07.09.2026 */
/**
 * ВОПРОСЫ ПАРТИИ по АКТУАЛЬНОЙ (после всех ходов) позиции.
 *
 * 🔴 ПОЧЕМУ В ЯДРЕ, А НЕ В ФАЙЛЕ МАРШРУТА. Здесь живёт единственное место, где
 * обещание лестницы («вопросов пять») превращается в факт («вопросов три»):
 * список режется по `Math.min(questions, …)`. Пока сборка сидела в экране,
 * наружу торчал только компонент, и проверить это было нечем — ровно так дефект
 * и прожил незамеченным. Тот же довод уже записан рядом, в `options.ts`.
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО (замер 07.09.2026 по корпусу 2000 позиций). Вид «розыск»
 * спрашивает «где стоит ♕», поэтому годятся только фигуры в ЕДИНСТВЕННОМ
 * экземпляре своего вида и цвета. Требование к позиции стояло константой ТРИ
 * (`puzzleMinUnique`), а число вопросов 06.09 подняли до пяти — и связь порвалась:
 *
 *   уровни 11, 12, 14 (10 фигур): в полосе 149 позиций, с пятью уникальными — 45;
 *   уровни 13, 15 (12 фигур):     в полосе 194 позиции,  с пятью уникальными — 89.
 *
 * То есть в 104 случаях из 149 партия молча шла на 3–4 вопроса, счётчик в шапке
 * показывал «3/5», дойти до «5/5» было нельзя, а доля верных делилась на пять.
 * Ошибка ровно та, о которой предупреждала шапка `puzzleMinUnique`: «недобор НЕ
 * ПАДАЕТ И НЕ РУГАЕТСЯ».
 */
import { type PuzzlePiece, type PuzzleQuizType } from './puzzle';
import { buildOptions, type Combo, type PieceType } from './options';

/** Вопрос: клетка, верный ответ и варианты (у «розыска» их нет — тапают доску). */
export interface Question { sq: number; answer: Combo; options: Combo[] }

const comboKey = (c: { type: PieceType; white: boolean }) => `${c.type}${c.white ? 'w' : 'b'}`;

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Сколько фигур в позиции стоят в единственном экземпляре своего вида и цвета.
 * Та же величина, которой отбирается позиция (`puzzleMinUnique`), — считать её
 * двумя разными способами значило бы дать им разъехаться.
 */
export function уникальныхФигур(final: readonly PuzzlePiece[]): number {
  const c = new Map<string, number>();
  final.forEach((p) => c.set(comboKey(p), (c.get(comboKey(p)) ?? 0) + 1));
  return [...c.values()].filter((v) => v === 1).length;
}

export function buildQuestions(
  final: readonly PuzzlePiece[], quizType: PuzzleQuizType, questions: number, level: number,
): Question[] {
  if (quizType === 'pick') {
    return shuffle([...final]).slice(0, Math.min(questions, final.length)).map((p) => ({
      sq: p.sq,
      answer: { type: p.type, white: p.white },
      options: buildOptions(final, { type: p.type, white: p.white }, level),
    }));
  }
  // locate: только фигуры в ЕДИНСТВЕННОМ экземпляре типа+цвета (K/Q гарантированы, R/N/B если один)
  const cnt = new Map<string, number>();
  final.forEach((p) => cnt.set(comboKey(p), (cnt.get(comboKey(p)) || 0) + 1));
  const uniques = [...final].filter((p) => cnt.get(comboKey(p)) === 1);
  return shuffle([...uniques]).slice(0, Math.min(questions, uniques.length)).map((p) => ({
    sq: p.sq,
    answer: { type: p.type, white: p.white },
    options: [],
  }));
}

