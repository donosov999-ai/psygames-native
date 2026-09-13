/* psygames-level-rule-vs-measurement · VER 1 · 13.09.2026 */
/**
 * ПРАВИЛО УРОВНЯ ПРИМЕНЯЕТСЯ К ТРЕНИРОВКЕ И НЕ ПРИМЕНЯЕТСЯ К ЗАМЕРУ.
 *
 * 🔴 ЗАЧЕМ ГЕЙТ. 13.09.2026 Денис раскинул правило «освоенный минус 20 %» по всем
 * тринадцати профилям. Для разминки это верно: заходить чуть ниже потолка. Но то
 * же правило, применённое к ЗАМЕРУ, тихо рвёт ряд сравнения — вчера ядро-снимок
 * шло на двадцатом уровне, сегодня на шестнадцатом, и кривая прогресса покажет
 * падение, которого не было. Ошибка не видна ни в логах, ни на экране: числа
 * есть, сравнивать их просто не с чем.
 *
 * ⚠️ Проба смотрит НА ПАРАМЕТРЫ ЗАПУСКА, а не на исходник: уровень уезжает в
 * игру строкой `level=…`, и меряться должна именно она.
 */
import { stepToParams, установитьПравилоУровня, уровеньПоПравилу, type PlaylistStep } from '@/src/services/warmup';
import { rememberLevelValue } from '@/src/services/levelCache';

const ПРОФИЛЬ = 'chess';
const ОСВОЕНО = 20;

const шаг = (extra: Partial<PlaylistStep> = {}): PlaylistStep => ({
  game_id: 'schulte_table', game_route: '/games/schulte', difficulty: 'easy',
  est_duration_sec: 40, ...extra,
} as PlaylistStep);

describe('правило уровня: тренировка да, замер нет', () => {
  beforeEach(() => {
    rememberLevelValue(`psygames_schulte_table_level_${ПРОФИЛЬ}`, String(ОСВОЕНО));
    установитьПравилоУровня({ как: 'процент', сколько: 20 }, ПРОФИЛЬ);
  });
  afterEach(() => установитьПравилоУровня(null, ПРОФИЛЬ));

  it('чистый расчёт: освоено 20, минус 20 % → 16', () => {
    expect(уровеньПоПравилу({ как: 'процент', сколько: 20 }, ОСВОЕНО)).toBe(16);
  });

  it('🔴 обычный шаг зарядки получает уровень по правилу', () => {
    expect(stepToParams(шаг(), 'morning', 'training').level).toBe('16');
  });

  it('🔴 шаг ядра-снимка (is_fixed_baseline) уровень по правилу НЕ получает', () => {
    expect(stepToParams(шаг({ is_fixed_baseline: true }), 'morning', 'measure-peak').level).toBeUndefined();
  });

  it('🔴 мерные дорожки целиком: оценка профиля и FIN BRAIN идут без правила', () => {
    for (const дорожка of ['assessment', 'financial-battery', 'measure-peak', 'measure-baseline'] as const) {
      expect(`${дорожка}: ${stepToParams(шаг(), 'morning', дорожка).level}`).toBe(`${дорожка}: undefined`);
    }
  });

  it('прибитый в шаге уровень правило не перебивает — ни в тренировке, ни в замере', () => {
    expect(stepToParams(шаг({ settings: { level: 7 } }), 'morning', 'training').level).toBe('7');
    expect(stepToParams(шаг({ settings: { level: 7 } }), 'morning', 'assessment').level).toBe('7');
  });

  /**
   * ⚠️ БЕЗ ПРАВИЛА УРОВЕНЬ НЕ ПЕРЕДАЁТСЯ ВОВСЕ — это решение Дениса 09.09.2026
   * («зарядка с личного уровня»), и правило его только перекрывает, а не отменяет.
   */
  it('правило снято → строки level нет, экран берёт личный уровень сам', () => {
    установитьПравилоУровня(null, ПРОФИЛЬ);
    expect(stepToParams(шаг(), 'morning', 'training').level).toBeUndefined();
  });
});
