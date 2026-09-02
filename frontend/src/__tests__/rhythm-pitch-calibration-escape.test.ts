import { createRhythmPitchSession, skipCalibration, continueAfterCalibration } from '@/src/games/rhythm-pitch/core/session';

/**
 * Отчёт тестировщика 02.09.2026: «ни хера вообще не понимаю» (rhythm-pitch).
 * На кадре — тупик: не набрал двух попаданий в такт, значит упражнение НЕ
 * начинается, и другого пути со служебного экрана не было.
 */
describe('калибровка не запирает упражнение', () => {
  const наКалибровке = () => {
    const s: any = createRhythmPitchSession({ seed: 'калибровка', level: 2 });
    return s.phase === 'calibration' ? s : { ...s, phase: 'calibration' };
  };

  it('🔴 без замера всё равно можно начать', () => {
    const после = skipCalibration(наКалибровке() as any) as any;
    expect(после.phase).toBe('ready');
  });

  it('поправка при пропуске — ноль, а не мусор от неудачной попытки', () => {
    const после = skipCalibration(наКалибровке() as any) as any;
    expect(после.calibrationOffsetMs).toBe(0);
    expect(после.calibrationComplete).toBe(false);
  });

  it('во время сигналов пропуск не срабатывает: иначе он оборвал бы замер на полпути', () => {
    const идёт = { ...(наКалибровке() as any), calibrationPlaying: true };
    expect((skipCalibration(идёт as any) as any).phase).toBe('calibration');
  });

  it('обычный путь остался: с завершённым замером продолжение работает', () => {
    const готово = { ...(наКалибровке() as any), calibrationComplete: true, calibrationPlaying: false };
    expect((continueAfterCalibration(готово as any) as any).phase).toBe('ready');
  });
});
