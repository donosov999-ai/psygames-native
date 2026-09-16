/* psygames-ospan-ladder · VER 1 · 16.09.2026 */
/**
 * ЛЕСТНИЦА OSpan — вынесена из экрана `app/games/ospan.tsx` без изменения, чтобы её читал и «Числовой забег»
 * (станция «память в пути»: сколько знаков держать — `setSize`). Экран реэкспортирует `levelParams` для гейтов
 * level-rule-threshold, level-step-explained и ospan-ladder — они берут её оттуда, как брали.
 */

// Уровень (1..16 и дальше БЕЗ потолка), v3 07.09.2026 (правило §R: способов считать
// бесконечно — счётная ось не замирает никогда; поручение Дениса 07.09):
//   · setSize 3→9 (охват, ось методики — cap НЕ трогаем, это вопрос развилки R7);
//   · letterMs 1100→500 плавно (500 мс — пол восприятия буквы, дальше ось несёт счёт);
//   · счётная нагрузка mathLoad растёт ПЛАВНО и БЕЗ КЛАМПА: за L16 равенства идут по
//     школьной оси — квадраты n² (≈L16+) → корни √N (≈L20+) → цепочки a×b±c (≈L24+),
//     числа растут с load всегда. Кнопки те же (верно/неверно) — span-механика цела.
/** Экспортирован для гейта `level-rule-threshold`: порог правила сверяется ИСПОЛНЕНИЕМ этой функции. */
export function levelParams(level: number): { setSize: number; letterMs: number; hardMath: boolean; mathLoad: number } {
  const setSize = Math.min(9, 2 + level);               // L1=3 → L7=9
  const fast = Math.max(0, level - 5);
  const letterMs = Math.max(500, 1100 - fast * 55);
  const hardMath = level >= 6;                          // порог карточки: с L6 «×, числа крупнее»
  const mathLoad = Math.max(0, (level - 4) / 8);        // 0 → 1,5 (L16) → дальше без потолка
  return { setSize, letterMs, hardMath, mathLoad };
}
