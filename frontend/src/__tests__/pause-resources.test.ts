/* psygames-test-pause-resources · VER 1 · 30.09.2026 · psygames-warmup-claude-mac */
/**
 * ЗАНЯТЫЙ РЕСУРС — ОСЬ СОВМЕСТИМОСТИ ПРАКТИК В ПАРАЛЛЕЛИ (задача f5dfd582).
 *
 * ТЗ Дениса, отчёт 819e911b от 24.09.2026: «надо понять, где стоит развилка — либо-либо,
 * а где „и“; максимально пять упражнений параллельно: дыхание, зрение, поза всадника,
 * вакуум живота и Кегель». До этого вакуум живота был «только отдельно», и пятёрка не
 * собиралась. Меряем ровно его пример и развилку «либо-либо» на общем ресурсе.
 */
import {
  RESOURCE_TEXT,
  createPracticePlan,
  getPracticeResources,
  getRequiredPriorExperience,
  getRequiredWarnings,
  getResourceConflict,
  validatePlanRequest,
  type PlanRequest,
  type PracticeSelection,
} from '@/src/games/pause/core/engine';

const ALL = ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ar', 'hi', 'ja', 'ko', 'zh'] as const;

function request(mode: PlanRequest['mode'], selections: PracticeSelection[]): PlanRequest {
  return {
    mode,
    selections,
    durationMs: 5 * 60_000,
    locale: 'ru',
    guideMode: 'both',
    context: 'home',
    acknowledgedWarnings: getRequiredWarnings(selections),
    confirmedPriorExperience: getRequiredPriorExperience(selections),
    allowExperimental: true,
    soloCompletions: Object.fromEntries(selections.map((s) => [s.setId, 3])),
  };
}

/** Пятёрка Дениса дословно: дыхание, зрение, поза всадника, вакуум живота, Кегель. */
const FIVE: PracticeSelection[] = [
  { setId: 'breathing', programId: 'box' },
  { setId: 'eye-gym', programId: 'desk' },
  { setId: 'postures', programId: 'horse-shallow' },
  { setId: 'abdomen', programId: 'level-4' },
  { setId: 'pelvic-floor', programId: 'balanced' },
];

describe('занятый ресурс', () => {
  it('🔴 пятёрка Дениса собирается в параллельный план', () => {
    const r = request('parallel', FIVE);
    expect(validatePlanRequest(r)).toEqual([]);
    const plan = createPracticePlan(r);
    expect(plan.blocks).toHaveLength(1);
    expect(new Set(plan.timeline.map((step) => step.lane)).size).toBe(5);
  });

  it('🔴 две практики внимания целиком — развилка «либо-либо», а не молчаливый пропуск', () => {
    const selections: PracticeSelection[] = [{ setId: 'relaxation' }, { setId: 'feldenkrais' }];
    expect(getResourceConflict(selections[0], selections[1])).toEqual(['attention']);
    const codes = validatePlanRequest(request('parallel', selections)).map((i) => i.code);
    expect(codes).toContain('RESOURCE_CONFLICT');
  });

  it('общий ресурс называется по имени: изометрия целиком и живот делят кор', () => {
    const a = { setId: 'isometrics', programId: 'general-gentle' } as const;
    const b = { setId: 'abdomen', programId: 'level-1' } as const;
    expect(getResourceConflict(a, b)).toEqual(['core']);
    expect(validatePlanRequest(request('parallel', [a, b])).map((i) => i.code)).toContain('RESOURCE_CONFLICT');
  });

  it('маршрут не кладёт в один параллельный блок практики с общим ресурсом', () => {
    const plan = createPracticePlan(request('charge', [
      { setId: 'isometrics', programId: 'general-gentle' },
      { setId: 'abdomen', programId: 'level-1' },
    ]));
    expect(plan.blocks).toHaveLength(2);
  });

  it('у программы — своё, если задано: подвижность кистей занимает руки, а не шею', () => {
    expect(getPracticeResources({ setId: 'mobility', programId: 'wrists-desk' })).toEqual(['hands']);
    expect(getPracticeResources({ setId: 'mobility', programId: 'neck-shoulders' })).toEqual(['neck']);
    expect(getPracticeResources({ setId: 'breathing', programId: 'breath-awareness' })).toEqual(['attention']);
  });

  it('подпись каждого ресурса есть на всех 12 языках — её показывают обе нативные половины', () => {
    for (const [resource, label] of Object.entries(RESOURCE_TEXT)) {
      for (const locale of ALL) {
        expect(`${resource}/${locale}: ${(label as unknown as Record<string, string | undefined>)[locale] ?? ''}`).not.toMatch(/: $/);
      }
    }
  });
});
