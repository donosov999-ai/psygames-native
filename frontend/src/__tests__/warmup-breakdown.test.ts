/**
 * @jest-environment node
 */
/**
 * РАЗБОР ЗАРЯДКИ ПО НАВЫКАМ — ЧТО ИМЕННО ЗДЕСЬ ЛОМАЕТСЯ МОЛЧА.
 *
 * Отчёт 0660eb0a: «развернуть статистику, сказать, где молодец и где провал,
 * дать тенденцию против вчера и рекомендации». Блок такого рода выглядит рабочим
 * при трёх разных дефектах, и ни один не виден на экране:
 *
 *  1. СЛОЖИТЬ ОЧКИ РАЗНЫХ ИГР. У «Шульте» и «Ханойской башни» разные шкалы;
 *     сумма выдаёт за вывод разницу масштабов. Считать надо отклонение КАЖДОЙ
 *     игры от её собственного прошлого.
 *  2. СРАВНИТЬ ИГРУ САМУ С СОБОЙ. Партии сегодняшней зарядки уже лежат в общей
 *     истории; если их не отсечь, отклонение всегда около нуля — блок исправно
 *     рисуется и всегда говорит «всё как обычно».
 *  3. ВЫВОД ПО ОДНОМУ ЗАМЕРУ. «Ты просел» после первой в жизни партии — это шум,
 *     а выглядит как персональная аналитика.
 */
import {
  разборПоНавыкам, МИНИМУМ_ПАРТИЙ, ПОРОГ_ПРОЦЕНТОВ,
} from '@/src/services/warmupBreakdown';

declare function require(m: string): any;
declare const __dirname: string;

const навык = (id: string): string | undefined =>
  ({ schulte: 'skillFocus', stroop: 'skillFocus', hanoi: 'skillPlanning' } as Record<string, string>)[id];

describe('разбор по навыкам', () => {
  it('🔴 шкалы игр не смешиваются: считается отклонение каждой от своего прошлого', () => {
    // «Ханой» набирает сотни, «Шульте» — десятки. Сегодня обе выросли ровно вдвое.
    const р = разборПоНавыкам(
      [{ game_type: 'schulte', score: 20 }, { game_type: 'hanoi', score: 2000 }],
      [
        { game_type: 'schulte', score: 10 }, { game_type: 'schulte', score: 10 },
        { game_type: 'hanoi', score: 1000 }, { game_type: 'hanoi', score: 1000 },
      ],
      навык,
    );
    const по = Object.fromEntries(р.навыки.map((н) => [н.skillKey, Math.round(н.delta)]));
    // рост одинаковый — +100% у обоих, несмотря на разницу шкал в сто раз
    expect(по).toEqual({ skillFocus: 100, skillPlanning: 100 });
  });

  it('🔴 без истории вывода нет: одна прошлая партия — не среднее', () => {
    const р = разборПоНавыкам(
      [{ game_type: 'schulte', score: 100 }],
      [{ game_type: 'schulte', score: 10 }],           // всего одна, а нужно МИНИМУМ_ПАРТИЙ
      навык,
    );
    expect(`навыков в разборе: ${р.навыки.length}`).toBe('навыков в разборе: 0');
    expect(`игр без истории: ${р.безИстории}`).toBe('игр без истории: 1');
    expect(МИНИМУМ_ПАРТИЙ).toBeGreaterThanOrEqual(2);
  });

  it('🔴 мелкое колебание не называется ни ростом, ни провалом', () => {
    const чутьЛучше = ПОРОГ_ПРОЦЕНТОВ - 3;
    const р = разборПоНавыкам(
      [{ game_type: 'schulte', score: 100 + чутьЛучше }],
      [{ game_type: 'schulte', score: 100 }, { game_type: 'schulte', score: 100 }],
      навык,
    );
    expect(р.навыки.length).toBe(1);
    expect(`лучший назван: ${!!р.лучший}`).toBe('лучший назван: false');
    expect(`худший назван: ${!!р.худший}`).toBe('худший назван: false');
  });

  it('🔴 провал называется провалом, когда он перешагнул порог', () => {
    const р = разборПоНавыкам(
      [{ game_type: 'schulte', score: 50 }, { game_type: 'hanoi', score: 1000 }],
      [
        { game_type: 'schulte', score: 100 }, { game_type: 'schulte', score: 100 },
        { game_type: 'hanoi', score: 1000 }, { game_type: 'hanoi', score: 1000 },
      ],
      навык,
    );
    expect(р.худший?.skillKey).toBe('skillFocus');
    expect(Math.round(р.худший!.delta)).toBe(-50);
    expect(`лучший назван: ${!!р.лучший}`).toBe('лучший назван: false');
  });

  it('🔴 игра без известного навыка не портит расчёт, а честно выпадает', () => {
    const р = разборПоНавыкам(
      [{ game_type: 'неизвестная', score: 10 }],
      [{ game_type: 'неизвестная', score: 1 }, { game_type: 'неизвестная', score: 1 }],
      навык,
    );
    expect(р.навыки).toEqual([]);
    expect(р.безИстории).toBe(1);
  });

  it('🔴 экран отсекает сегодняшние партии из истории, иначе игра сравнится с собой', () => {
    const fs = require('fs');
    const path = require('path');
    const экран: string = fs.readFileSync(
      path.join(__dirname, '../../app/warmup-complete.tsx'), 'utf8');
    // отсечение идёт по счётчику на игру — проверяем, что оно вообще есть
    expect(экран).toContain('убрать.set');
    expect(экран).toContain('разборПоНавыкам');
  });
});
