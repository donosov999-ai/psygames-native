/* psygames-crumbs · VER 1 · 29.08.2026 */
/**
 * КРОШКИ ДЛЯ РЕПОРТА — приём багфикс-чата (контракт APP_BUILD_RULES §3.1, VER 3),
 * перенесённый в нашу трубу: их SDK собирает steps+consoleErrors сам, у нас
 * своя (appFeedback), значит и собирать нам.
 *
 * ЗАЧЕМ. Репорт «Ур.45/8» разбирался час, потому что не был виден ПУТЬ до бага:
 * какие экраны и партии человек прошёл перед жалобой. game_state дал точку,
 * крошки дают траекторию. consoleErrors — те 10 строк, которые в живом WebView
 * никто никогда не увидит: console.error уходит в пустоту устройства.
 *
 * Кольцевые буферы в памяти процесса: живут ровно сессию, в хранилище не пишутся
 * (репорт снимает срез в момент отправки). Никакого PII: шаги — имена экранов и
 * game_state-ярлыки, ошибки режутся до 200 символов.
 */

export const STEPS_MAX = 20;
export const CONSOLE_ERRORS_MAX = 10;

interface Crumb { t: string; s: string }

const steps: Crumb[] = [];
const errors: Crumb[] = [];

const stamp = () => new Date().toISOString().slice(11, 19);   // HH:MM:SS — дата есть у самого репорта

/** Шаг человека: смена экрана, вход в партию, фаза игры. Дёшево и без PII. */
export function pushCrumb(step: string): void {
  const s = String(step).slice(0, 120);
  // Подряд одинаковые не копим: фокус-эффекты любят стрелять дважды.
  if (steps.length && steps[steps.length - 1]!.s === s) return;
  steps.push({ t: stamp(), s });
  if (steps.length > STEPS_MAX) steps.shift();
}

/** Срез для context репорта: последние шаги, старые сверху. */
export function readCrumbs(): Crumb[] {
  return [...steps];
}

export function readConsoleErrors(): Crumb[] {
  return [...errors];
}

let hooked = false;

/**
 * Перехват console.error — ставится ОДИН раз (модульный флаг переживает
 * повторные вызовы). Оригинал зовётся всегда: перехват наблюдает, не глотает.
 */
export function hookConsoleErrors(): void {
  if (hooked || typeof console === 'undefined') return;
  hooked = true;
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const m = args.map((a) => {
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' ').slice(0, 200);
      errors.push({ t: stamp(), s: m });
      if (errors.length > CONSOLE_ERRORS_MAX) errors.shift();
    } catch { /* наблюдатель не имеет права уронить console.error */ }
    orig(...args);
  };
}

/** Для тестов: чистый лист между кейсами (буферы + флаг перехвата — тест
 *  восстанавливает console.error, и старый перехват умирает вместе с ним).
 *  Боевой код не зовёт. */
export function __resetCrumbs(): void {
  steps.length = 0;
  errors.length = 0;
  hooked = false;
}
