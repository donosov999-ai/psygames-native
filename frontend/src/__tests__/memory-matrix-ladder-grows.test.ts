/**
 * 🔴 ЛЕСТНИЦА РАЗЛИЧАЕТ СОСЕДНИЕ УРОВНИ — ДО САМОГО ВЕРХА.
 *
 * ПРАВИЛО РАЗДЕЛА (Денис, 06.09.2026): «никаких потолков нет нигде, всегда можно
 * растить сложность, вопрос подхода». Текст с таблицей осей —
 * `~/dev/psygames/span-chat/RULE_NO_CEILINGS.md`.
 *
 * ЗАМЕР ДО. С L21 по L60 поле показывало 17 клеток на КАЖДОМ уровне: число клеток
 * зажато `Math.floor((total-1)/2)` при двух сериях на 6×6. 39 уровней-клонов.
 * Подтверждено ИГРОЙ: L21, L22 и L24 на живом билде — один и тот же экран.
 *
 * ЗАМЕР ПОСЛЕ. Введена ось 3 — задержка между концом вспышек и открытием ввода.
 *
 * ⚠️ ЭТА ПРОБА НЕ ОТМЕНЯЕТ `memory-matrix-ladder-honest.test.ts`. Там стережётся
 * ДРУГОЕ: что `levelParams.baseFlashes` не обещает клеток больше, чем поле даст.
 * Это обещание всё ещё нарушено (43 против 17) и ждёт задачи 1787a034 — будильник
 * там взведён намеренно. Здесь же — что уровни РАЗЛИЧИМЫ, а это разные вопросы.
 */
import { levelParams, MM_VOLUME_TOP } from '@/app/games/memory-matrix';

const подпись = (l: number) => JSON.stringify(levelParams(l));

describe('memory-matrix: лестница различает соседние уровни', () => {
  it('замер ДО зафиксирован: с L15 скорость на дне, и оттуда идут клоны', () => {
    const top = levelParams(MM_VOLUME_TOP);
    expect(`сетка ${top.gridSize}, серий ${top.seriesCount}, показ ${top.flashMs}`)
      .toBe('сетка 6, серий 2, показ 500');
    // ⚠️ порог 15, а не 21: поле упирается в зажим на L21, но flashMs доходит до
    // дна на L15, и с этого места каждый второй уровень был копией предыдущего
    // (проба нашла «клонов: 2 — L16=L15, L19=L18», когда порог стоял на 21).
    expect(levelParams(14).flashMs).toBeGreaterThan(500);
    expect(levelParams(15).flashMs).toBe(500);
    expect(levelParams(60).gridSize).toBe(top.gridSize);
    expect(levelParams(60).flashMs).toBe(top.flashMs);
  });

  it('ниже плато сложность не тронута — задержки нет', () => {
    for (let L = 1; L <= MM_VOLUME_TOP; L++) {
      expect(`L${L} holdMs=${levelParams(L).holdMs}`).toBe(`L${L} holdMs=0`);
    }
  });

  it('🔴 ни одного уровня-клона на L1…L60', () => {
    const клоны: string[] = [];
    for (let L = 2; L <= 60; L++) if (подпись(L) === подпись(L - 1)) клоны.push(`L${L}=L${L - 1}`);
    expect(`клонов: ${клоны.length}${клоны.length ? ' — ' + клоны.slice(0, 6).join(', ') : ''}`)
      .toBe('клонов: 0');
  });

  it('🔴 выше плато растёт именно задержка, монотонно', () => {
    for (let L = MM_VOLUME_TOP + 1; L <= 60; L++) {
      expect(`L${L}: ${levelParams(L).holdMs}`).toBe(`L${L}: ${levelParams(L - 1).holdMs + 700}`);
    }
  });
});
