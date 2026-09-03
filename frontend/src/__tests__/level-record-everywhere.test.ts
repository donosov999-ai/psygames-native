/* eslint-disable @typescript-eslint/no-require-imports */
import { levelBoardId, LEVEL_BOARD_MIN, LEVEL_BOARD_MAX } from '@/src/services/leaderboard';
import { GAMES } from '@/src/constants/games';

declare const __dirname: string;

/**
 * 🔴 РЕКОРД ПОКАЗЫВАЕТСЯ У КАЖДОЙ ИГРЫ, А НЕ У ДЕВЯТИ (ТЗ ade9a298, этап 2).
 *
 * Строку «свой лучший · лучший среди игроков» видели шесть игр из семидесяти трёх —
 * там, где сравниваемая ВЕЛИЧИНА подобрана вручную. Уровень лестницы есть у всех,
 * считается одинаково и от настроек партии не зависит, поэтому доска уровней общая.
 *
 * Проба сторожит три вещи, без которых это снова станет фичей шести экранов:
 *   · отправка и показ живут в ОБЩЕЙ обвязке итога, а не в отдельных играх;
 *   · своя строка игры сильнее общей (у настроенных досок величина точнее уровня);
 *   · границы правдоподобия покрывают самую длинную лестницу проекта.
 */
function читать(rel: string): string {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
}

describe('рекорд уровня — у каждой игры', () => {
  it('идентификатор доски отделён от досок величины', () => {
    // Доски величины зовутся именем игры; уровневая — с суффиксом, иначе она
    // затёрла бы секунды Шульте номером уровня.
    expect(levelBoardId('schulte')).toBe('schulte_level');
    expect(levelBoardId('sudoku')).not.toBe('sudoku');
  });

  it('🔴 отправка и чтение стоят в ОБЩЕЙ обвязке итога', () => {
    const общая = читать('src/components/LevelCleared.tsx');
    expect(общая).toContain('submitLevelRecord(');
    expect(общая).toContain('readLevelBenchmark(');
  });

  it('🔴 своя строка игры сильнее общей — иначе замеры настроенных досок обнулятся', () => {
    const общая = читать('src/components/LevelCleared.tsx');
    // Отправка не идёт, когда игра принесла свою строку рекорда.
    expect(общая).toMatch(/if \(passed && gameId && !recordLine\)/);
    // И показ общей строки тоже под этим условием.
    expect(общая).toMatch(/\{!recordLine && !compact && уровеньРекорд\?\.own/);
  });

  it('🔴 потолок правдоподобия покрывает самую длинную лестницу проекта', () => {
    // Судоку — 92 уровня (комбо-пояс до killerdiag). Потолок ниже означал бы, что
    // рекорд сильнейшего игрока сервер отвергнет как неправдоподобный.
    expect(LEVEL_BOARD_MIN).toBe(1);
    expect(LEVEL_BOARD_MAX).toBeGreaterThanOrEqual(92);
  });

  it('есть что показывать: игр в реестре больше, чем настроенных досок', () => {
    expect(GAMES.length).toBeGreaterThan(60);
  });
});
