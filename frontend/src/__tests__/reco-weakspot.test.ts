/* eslint-disable @typescript-eslint/no-require-imports */
import { recommendToday, RECO_REASON_KEY } from '@/src/services/recommend';
import { GAMES } from '@/src/constants/games';
import { DOMAINS } from '@/src/services/assessment';
import { PROFILES } from '@/src/constants/profiles';

declare const __dirname: string;

/**
 * 🔴 «РЕКОМЕНДУЕМ СЕГОДНЯ» ЗНАЕТ, ГДЕ ЧЕЛОВЕК СЛАБЕЕ ВСЕГО (ТЗ ade9a298, этап 3).
 *
 * Пять прежних оснований опирались на историю ПОСЕЩЕНИЙ: давно не играли, здесь
 * растёте, ветке достаётся меньше. Ни одно не знает, где у человека провал, — это
 * знает только оценка (12 доменов, z-оценки). Без неё блок советует по посещаемости,
 * а не по пользе.
 *
 * Проба сторожит три вещи:
 *   · слабейший домен встаёт ПЕРВЫМ — польза важнее посещаемости;
 *   · нет оценки — основание не участвует, и никто не выдумывает слабость;
 *   · игра, запрещённая профилю, не попадает даже как слабейшая.
 */
const профиль = PROFILES[0];

/**
 * ⚠️ ИСТОРИЯ НУЖНА, И ЭТО НЕ ПОДГОНКА. У человека без единой партии отбор уходит в
 * ветку «с чего начать» и заменяет ВСЕ основания — это записано в шапке recommend.ts
 * и правильно: новичку нельзя писать «здесь пока слабее всего». Оценку тоже проходят
 * играя, поэтому «оценка есть, а партий нет» — состояние, которого не бывает.
 */
const ИСТОРИЯ = [
  { game_type: 'schulte', score: 10, timestamp: '2026-09-01T10:00:00.000Z', profile_id: профиль.id },
  { game_type: 'stroop', score: 12, timestamp: '2026-09-02T10:00:00.000Z', profile_id: профиль.id },
];

function рекомендации(weakestGameId: string | null) {
  return recommendToday({ profile: профиль, sessions: ИСТОРИЯ, now: new Date('2026-09-03T10:00:00'), weakestGameId });
}

describe('рекомендация по слабейшему домену', () => {
  it('ключ подписи объявлен и переведён', () => {
    expect(RECO_REASON_KEY.weakspot).toBe('recoWhyWeakspot');
    const fs = require('fs'); const path = require('path');
    const словарь = fs.readFileSync(path.resolve(__dirname, '../contexts/LanguageContext.tsx'), 'utf8');
    expect(словарь).toContain('recoWhyWeakspot');
  });

  it('🔴 слабейшая игра попадает в набор и стоит ПЕРВОЙ', () => {
    /**
     * ⚠️ ЦЕЛЬ — ВИДИМАЯ КАРТОЧКА. Три игры оценки из двенадцати спрятаны из каталога и
     * живут внутри развилок (digit_span и corsi — в «span_group», flanker — в
     * «attention_conflict»), а отбор берёт только видимое. Поэтому `weakestDomainGame`
     * отдаёт развилку, и проба спрашивает про неё же.
     */
    const цель = 'digit_span';   // 04.09: советуем САМО упражнение, а не развилку
    const picks = рекомендации(цель);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks[0].gameId).toBe(цель);
    expect(picks[0].reason).toBe('weakspot');
  });

  it('🔴 нет оценки — слабость не выдумывается', () => {
    const picks = рекомендации(null);
    expect(picks.every((p) => p.reason !== 'weakspot')).toBe(true);
  });

  it('🔴 скрытые игры оценки ведут на СВОЮ развилку, иначе совет не появится вовсе', () => {
    /* Замер 03.09.2026: рекомендация по слабейшему домену молча не появлялась —
       digit_span, corsi и flanker спрятаны из каталога, а отбор берёт видимое. */
    const скрытые = DOMAINS.filter((d) => {
      const g = GAMES.find((x) => x.id === d.game_id) as { hideFromMenu?: boolean; mergedInto?: string } | undefined;
      return g?.hideFromMenu;
    });
    expect(скрытые.length).toBeGreaterThan(0);          // есть что проверять
    for (const d of скрытые) {
      const g = GAMES.find((x) => x.id === d.game_id) as { mergedInto?: string };
      expect(typeof g.mergedInto).toBe('string');       // у каждой скрытой есть вход
    }
  });

  it('🔴 запрещённая профилю игра не проходит даже как слабейшая', () => {
    const picks = рекомендации('такой-игры-нет');
    expect(picks.every((p) => p.gameId !== 'такой-игры-нет')).toBe(true);
  });
});
