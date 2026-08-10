/**
 * failure — модель провала как ПАРАМЕТР режима, а не константа экрана.
 *
 * ЗАЧЕМ. В судоку стояло `const LIVES = 3` прямо в теле экрана: третья ошибка обрывала
 * партию и уровень начинался заново. Для партии на пять минут это честный вызов.
 *
 * Для длинного режима — нет. Самурай и фрактальная судоку решаются час и больше; отдать
 * час из-за третьего промаха пальцем — не сложность, а наказание, и первый же тестировщик
 * напишет об этом. Значит «сколько ошибок до конца» — свойство РЕЖИМА, а не игры, и должно
 * задаваться снаружи.
 *
 * ЧТО ЭТО НЕ ДЕЛАЕТ. Не отменяет счёт ошибок. В длинном режиме ошибки по-прежнему считаются
 * и по-прежнему бьют по очкам — просто не обрывают партию.
 */

export type FailureKind =
  /** Короткая партия: ошибки тратят жизни, жизни кончились — партия окончена. */
  | 'standard'
  /** Длинная партия (босс, самурай, фрактал): ошибки считаются, но партию не обрывают. */
  | 'longform';

/** Жизней в короткой партии. Столько стояло в судоку до вынесения политики наружу. */
export const STANDARD_LIVES = 3;

export interface FailurePolicy {
  /** Сколько ошибок до провала. `Infinity` — партия не обрывается никогда. */
  lives: number;
  /** Обрывается ли партия по ошибкам вообще. Экрану удобнее спрашивать это, чем сравнивать с Infinity. */
  fatal: boolean;
}

export function failurePolicy(kind: FailureKind): FailurePolicy {
  return kind === 'longform'
    ? { lives: Infinity, fatal: false }
    : { lives: STANDARD_LIVES, fatal: true };
}

/** Кончились ли жизни при таком числе ошибок. */
export function isOver(policy: FailurePolicy, errors: number): boolean {
  return policy.fatal && errors >= policy.lives;
}

/** Сколько жизней осталось. В нефатальном режиме — `Infinity`, рисовать сердечки не нужно. */
export function livesLeft(policy: FailurePolicy, errors: number): number {
  if (!policy.fatal) return Infinity;
  return Math.max(0, policy.lives - errors);
}
