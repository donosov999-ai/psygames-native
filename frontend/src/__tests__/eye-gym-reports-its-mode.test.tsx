/* psygames-eye-gym-reports-its-mode · VER 1 · 23.09.2026 */
/**
 * «ГИМНАСТИКА ДЛЯ ГЛАЗ» НАЗЫВАЕТ СВОЙ РЕЖИМ В ОТЧЁТЕ ТЕСТИРОВЩИКА.
 *
 * 📍 ПОВОД. В отчётах по этому экрану было видно только «eye-gym»: по кадру не
 * понять, шло «Слежение», «Фокус», «Расслабление» или полный круг, и играл ли
 * человек по уровням или свободно. Разбор таких отчётов шёл догадками.
 *
 * ⚠️ ЧЕГО ПРОБА НЕ ВИДИТ: она читает опубликованное состояние, а не сам отчёт.
 * Что ярлык доедет до `app_feedback`, проверяется отправкой отчёта с устройства.
 */
import { readFeedbackGameState } from '@/src/services/feedbackGameState';

// В tsconfig проекта нет типов узла — объявляем так же, как соседние пробы.
declare const __dirname: string;
declare function require(m: string): any;

describe('«Гимнастика для глаз»: состояние экрана для отчёта', () => {
  it('🔴 экран публикует режим, уровень и фазу', () => {
    const code = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'app/games/eye-gym.tsx'), 'utf8',
    ) as string;
    // Публикация есть и стоит в эффекте, а не в обработчике: иначе отчёт,
    // снятый до первого действия, остался бы без режима.
    expect(code).toMatch(/publishFeedbackGameState\(\{[\s\S]{0,200}mode/);
    expect(code).toMatch(/return \(\) => publishFeedbackGameState\(null\)/);
    // Поля — те же, что у соседних экранов, чтобы шаги читались одинаково.
    // ⚠️ Ищем внутри самого вызова: `mode` пишется сокращённо, без двоеточия,
    // и проверка `'mode:'` по всему файлу дала бы ложный результат в обе стороны.
    const call = code.slice(code.indexOf('publishFeedbackGameState({'));
    const block = call.slice(0, call.indexOf('})') + 2);
    for (const field of ['mode', 'level', 'phase', 'variant', 'road']) {
      expect(block).toContain(field);
    }
  });

  it('ярлык собирается из говорящих полей, а не из дампа состояния', () => {
    const { publishFeedbackGameState } = require('@/src/services/feedbackGameState');
    publishFeedbackGameState({ mode: 'pursuit', level: 4, phase: 'playing', variant: 'levels' });
    const s = readFeedbackGameState();
    expect(s).toMatchObject({ mode: 'pursuit', level: 4, phase: 'playing' });
    publishFeedbackGameState(null);
    expect(readFeedbackGameState()).toBeNull();
  });
});
