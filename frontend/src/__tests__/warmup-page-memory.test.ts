/* psygames-warmup-page-memory-gate · VER 1 · 29.08.2026 */
/**
 * ПАМЯТЬ ПЛАНИРОВЩИКА «ГЛАЗА И ДЫХАНИЕ» — гейт привозной страницы.
 *
 * public/warmup — ПРИВОЗНОЕ (sync-warmup-page.mjs из лаборатории будильника);
 * правки в нём не живут. Память формата (просьба Дениса 29.08) сделана в
 * ИСХОДНИКЕ лаборатории (коммит «Будильник 0.1.6»). Этот гейт ловит один
 * конкретный откат: прогон синка из СТАРОЙ лаборатории молча привёз бы
 * страницу без памяти — и функция исчезла бы без единого красного теста.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const APP = join(__dirname, '..', '..', 'public', 'warmup', 'app', 'app.mjs');

describe('привозная страница зарядки несёт память планировщика', () => {
  const src = readFileSync(APP, 'utf8');

  it('🔴 ключ и обе стороны памяти на месте (запись + применение)', () => {
    expect(src).toContain('smart_alarm_recharge_prefs_v1');
    expect(src).toContain('function saveRechargePrefs');
    expect(src).toContain('function applyRechargePrefs');
  });

  it('запись стоит в renderPlan (единая точка), применение — в boot до рендера', () => {
    const renderPlanBody = src.slice(src.indexOf('function renderPlan()'), src.indexOf('function renderPlan()') + 600);
    expect(renderPlanBody).toContain('saveRechargePrefs()');
    const bootBody = src.slice(src.indexOf('async function boot()'), src.indexOf('async function boot()') + 400);
    expect(bootBody.indexOf('applyRechargePrefs()')).toBeGreaterThan(-1);
    expect(bootBody.indexOf('applyRechargePrefs()')).toBeLessThan(bootBody.indexOf('renderCatalog()'));
  });

  it('галочки безопасности НЕ сохраняются (код не ставит «я прочитал» за человека)', () => {
    const saveBody = src.slice(src.indexOf('function saveRechargePrefs'), src.indexOf('function applyRechargePrefs'));
    expect(saveBody).not.toContain('warningsAcknowledged');
    expect(saveBody).not.toContain('priorExperienceConfirmed');
  });
});
