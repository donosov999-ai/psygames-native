/* psygames-streak-goal-gate · VER 1 · 07.09.2026 */
/**
 * ЦЕЛЬ-ДНИ: ОКНО ПРИХОДИТ ТОГДА, КОГДА ДОЛЖНО, И НИЧЕГО НЕ ОБЕЩАЕТ.
 *
 * ⚠️ Проверяется ИСПОЛНЕНИЕМ, а не чтением: `askReason` гоняется по датам, а не
 * ищется словом в исходнике. Гейт, который сверяет строки, зеленеет и когда
 * функция выключена, — на этом за сутки 07.09.2026 споткнулись три пробы
 * подряд (переименование, дописанный аргумент, константа вместо литерала).
 */
import {
  ASK_EVERY_DAYS, GOAL_DAYS, askReason, daysBetween, goalProgress, goalReward,
  markAsked, noticeReached, startGoal, type StreakGoal,
} from '@/src/services/streakGoal';
import { DAY_GOAL_REWARD } from '@/src/services/earn';

declare const __dirname: string;
declare function require(id: string): any;

const день = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const цель = (over: Partial<StreakGoal> = {}): StreakGoal =>
  ({ days: 7, startedAt: '2026-9-1', askedAt: '2026-9-1', reachedAt: null, ...over });

describe('цель — сколько дней подряд', () => {
  it('вариантов ровно три и они растут', () => {
    expect([...GOAL_DAYS]).toEqual([7, 14, 30]);
  });

  it('расстояние между днями считается календарно, а не в миллисекундах', () => {
    expect(daysBetween('2026-9-1', '2026-9-8')).toBe(7);
    expect(daysBetween('2026-9-1', '2026-9-1')).toBe(0);
    // Через границу месяца — там ломается наивная арифметика по числу месяца.
    expect(daysBetween('2026-8-30', '2026-9-2')).toBe(3);
  });

  describe('когда показывать окно', () => {
    it('цели нет вовсе — спрашиваем', () => {
      expect(askReason({ goal: null, streak: 0 })).toBe('first');
    });

    it('серия оборвалась — спрашиваем заново', () => {
      expect(askReason({ goal: цель(), streak: 0, now: день(2026, 9, 3) })).toBe('broken');
    });

    it('дошёл до срока — окно зовёт поздравить', () => {
      expect(askReason({ goal: цель(), streak: 7, now: день(2026, 9, 8) })).toBe('reached');
      expect(askReason({ goal: цель({ days: 30 }), streak: 30, now: день(2026, 9, 8) })).toBe('reached');
    });

    it('🔴 достижение НЕ теряется, если серия оборвалась раньше, чем человек зашёл', () => {
      /*
       * Найдено КОНТРПРОБОЙ 07.09.2026, а не рассуждением. Сначала здесь стояла
       * проверка «порядок ветвей значим» — она не покраснела на перестановке,
       * потому что `streak >= days` (days ≥ 7) и `streak === 0` взаимоисключающи
       * и порядок между ними не решает ничего. Обоснование было выдумано.
       *
       * Настоящая дыра рядом: человек отходил семь дней, цель взята, но в тот
       * день он приложение не открыл. Назавтра серия 0 — и «достигнута ли»,
       * вычисленное по ТЕКУЩЕЙ серии, даёт «нет». Он получил бы упрёк вместо
       * поздравления, а награду не увидел бы никогда.
       */
      const дошёл = noticeReached(цель(), 7, день(2026, 9, 8));
      expect(дошёл.reachedAt).toBe('2026-9-8');
      // Назавтра серия обнулилась — но достижение зафиксировано и переживает это.
      expect(askReason({ goal: дошёл, streak: 0, now: день(2026, 9, 9) })).toBe('reached');
    });

    it('достижение отмечается один раз и не переезжает на новый день', () => {
      const дошёл = noticeReached(цель(), 7, день(2026, 9, 8));
      const снова = noticeReached(дошёл, 9, день(2026, 9, 10));
      expect(снова.reachedAt).toBe('2026-9-8');
    });

    it('недошедшая цель отметки не получает', () => {
      expect(noticeReached(цель(), 6, день(2026, 9, 7)).reachedAt).toBeNull();
    });

    it('🔴 не реже раза в неделю, даже если цель на 30 дней', () => {
      const g = цель({ days: 30, askedAt: '2026-9-1' });
      // Шесть дней — рано.
      expect(askReason({ goal: g, streak: 6, now: день(2026, 9, 7) })).toBeNull();
      // Седьмой — пора. Это прямое требование Дениса 07.09.2026.
      expect(askReason({ goal: g, streak: 6, now: день(2026, 9, 8) })).toBe('weekly');
    });

    it('идущая цель в середине недели окно не зовёт', () => {
      const g = цель({ days: 14, askedAt: '2026-9-5' });
      expect(askReason({ goal: g, streak: 3, now: день(2026, 9, 7) })).toBeNull();
    });

    it('показ окна не перезапускает цель — закрыл, не выбрав, серия цела', () => {
      const g = цель({ days: 14, startedAt: '2026-9-1', askedAt: '2026-9-1' });
      const после = markAsked(g, день(2026, 9, 8));
      expect(после.startedAt).toBe('2026-9-1');
      expect(после.days).toBe(14);
      expect(после.askedAt).toBe('2026-9-8');
      expect(askReason({ goal: после, streak: 6, now: день(2026, 9, 9) })).toBeNull();
    });
  });

  describe('прогресс', () => {
    it('без цели прогресса нет — показывать нечего', () => {
      expect(goalProgress(null, 5)).toBeNull();
    });

    it('считает пройденное и остаток, не перескакивая цель', () => {
      expect(goalProgress(цель({ days: 7 }), 3)).toEqual({ done: 3, left: 4, reached: false });
      expect(goalProgress(цель({ days: 7 }), 7)).toEqual({ done: 7, left: 0, reached: true });
      // Серия длиннее цели: «пройдено 9 из 7» — это чушь на экране.
      expect(goalProgress(цель({ days: 7 }), 9)).toEqual({ done: 7, left: 0, reached: true });
    });
  });

  describe('награда', () => {
    it('щит серии даётся за любую достигнутую цель', () => {
      expect(GOAL_DAYS.every((d) => goalReward(d).shield)).toBe(true);
    });

    it('токены растут вместе с обязательством', () => {
      const [a, b, c] = GOAL_DAYS.map((d) => goalReward(d).tokens);
      expect(`${a} < ${b} < ${c}: ${a < b && b < c}`).toBe(`${a} < ${b} < ${c}: true`);
    });

    it('по умолчанию считается от константы экономики', () => {
      expect(goalReward(7).tokens).toBe(7 * DAY_GOAL_REWARD);
      expect(goalReward(30).tokens).toBe(30 * DAY_GOAL_REWARD);
    });

    it('🔴 награда СЛЕДУЕТ за базой, а не написана числом', () => {
      /*
       * ⚠️ Первая редакция этой пробы сравнивала `goalReward(7).tokens` с
       * `7 * DAY_GOAL_REWARD` — и НЕ покраснела, когда я подменил выражение на
       * `days * 25`. Потому что DAY_GOAL_REWARD равен 25: проба сверяла
       * константу сама с собой. Привязку так не измерить.
       *
       * Здесь база подаётся снаружи: литерал в теле функции сразу разойдётся с
       * ожиданием. Литерал пережил бы правку экономики МОЛЧА и однажды сделал
       * бы дойти до срока выгоднее, чем играть.
       */
      expect(goalReward(7, 100).tokens).toBe(700);
      expect(goalReward(30, 1).tokens).toBe(30);
    });
  });

  it('новая цель начинается сегодня и сегодня же считается спрошенной', () => {
    const g = startGoal(14, день(2026, 9, 7));
    expect(g).toEqual({ days: 14, startedAt: '2026-9-7', askedAt: '2026-9-7', reachedAt: null });
    expect(askReason({ goal: g, streak: 0, now: день(2026, 9, 7) })).toBe('broken');
  });

  /**
   * 🔴 НАД ВЫБОРОМ НЕТ ОБЕЩАНИЙ — решение Дениса 07.09.2026.
   * У Duolingo там «ваши шансы пройти курс вырастут в 2 раза». У нас такого
   * замера нет, и выдуманная цифра на первом экране обесценивает соседнее.
   * Проба сторожит, чтобы обещание не завелось «из лучших побуждений».
   */
  it('🔴 в ядре цели нет ни одного обещания-множителя', () => {
    const fs = require('fs');
    const path = require('path');
    const src: string = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'streakGoal.ts'), 'utf8',
    );
    // ⚠️ Комментарии срезаем до поиска: в шапке этот запрет как раз ОБЪЯСНЯЕТСЯ,
    // и по сырому тексту проба обвинила бы собственное объяснение. За сутки
    // 07.09.2026 на это наступили дважды в других гейтах.
    const код = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const плохо = ['в 2 раза', 'вдвое', 'шансы', 'x2', '×2']
      .filter((s) => код.toLowerCase().includes(s.toLowerCase()));
    expect(плохо).toEqual([]);
  });

  it('неделя — это семь дней, а не «примерно неделя»', () => {
    expect(ASK_EVERY_DAYS).toBe(7);
  });
});
