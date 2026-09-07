/* psygames-pet-greeting-gate · VER 1 · 07.09.2026 */
/**
 * ВСТРЕЧА ПРИ ЗАХОДЕ: ЕСТЬ ЧИСЛО — ГОВОРИТ, НЕТ ЧИСЛА — МОЛЧИТ.
 *
 * ⚠️ Проверяется исполнением: `greetKind` гоняется по состояниям, а не ищется
 * словом в исходнике. И отдельно — что обещание «одна партия засчитывает день»
 * не разошлось с механикой начисления: это единственная фраза встречи, которая
 * утверждает что-то о правилах, и она проверяется НАСТОЯЩЕЙ партией.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  greetKind, pickGreeting, greetLanguages, greetedKey, greetedToday,
  loadGreetedDay, markGreeted, type GreetKind, type GreetInput,
} from '@/src/services/petGreeting';
import { goalProgress, startGoal, type StreakGoal } from '@/src/services/streakGoal';
import { dayKey, loadDayMarks, recordRound } from '@/src/services/earn';
import type { GoalPetState } from '@/src/services/goalPetLines';

const день = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const цель = (days: 7 | 14 | 30 = 7): StreakGoal =>
  ({ days, startedAt: '2026-9-1', askedAt: '2026-9-6', reachedAt: null });

/** Состояние человека: цель на `days`, серия `streak`, сегодня играл или нет. */
const состояние = (days: 7 | 14 | 30, streak: number, playedToday: boolean): GreetInput =>
  ({ ask: null, progress: goalProgress(цель(days), streak), playedToday });

describe('встреча при заходе', () => {
  describe('когда питомец молчит', () => {
    it('🔴 говорит окно цели — питомец молчит, даже когда ему есть что сказать', () => {
      // Случай `weekly`: цель идёт, серия жива, число есть — то есть все прочие
      // условия встречи выполнены. Молчит ИМЕННО из-за окна.
      const свой = состояние(30, 4, true);
      expect(greetKind(свой)).toBe('on_track');
      expect(greetKind({ ...свой, ask: 'weekly' })).toBeNull();
      // И на остальных трёх поводах тоже.
      for (const a of ['first', 'broken', 'reached'] as const) {
        expect(greetKind({ ...свой, ask: a })).toBeNull();
      }
    });

    it('цели нет — числа нет, встречи нет', () => {
      expect(greetKind({ ask: null, progress: null, playedToday: true })).toBeNull();
      expect(pickGreeting('ru', { ask: null, progress: null, playedToday: true })).toBeNull();
    });

    it('бессмысленный пузырь не рисуется: «до цели 0» и «серия 0»', () => {
      // Страховка, а не поведение: при согласованном вызове `askReason` увела бы
      // эти состояния в окно раньше. Проба сторожит саму страховку.
      expect(greetKind({ ask: null, progress: { done: 7, left: 0, reached: true }, playedToday: true })).toBeNull();
      expect(greetKind({ ask: null, progress: { done: 0, left: 7, reached: false }, playedToday: false })).toBeNull();
    });
  });

  describe('о чём говорит', () => {
    it('до цели остался один день — говорит про это, играл сегодня или нет', () => {
      expect(greetKind(состояние(7, 6, true))).toBe('one_left');
      expect(greetKind(состояние(7, 6, false))).toBe('one_left');
    });

    it('сегодня ещё не играл — зовёт сыграть', () => {
      expect(greetKind(состояние(14, 5, false))).toBe('go_today');
    });

    it('сегодня уже сыграл — говорит, сколько осталось', () => {
      expect(greetKind(состояние(14, 5, true))).toBe('on_track');
    });

    it('🔴 в реплике стоят ЕГО числа, а не образец', () => {
      const l = pickGreeting('ru', состояние(30, 4, true));
      expect(l?.text).toBe('Серия 4 дн., до цели 26 💜');
      const g = pickGreeting('ru', состояние(14, 9, false));
      expect(g?.text).toBe('Серия 9 дн. Одна партия — и день засчитан');
      // Ни одного незаполненного места.
      for (const t of [l?.text, g?.text]) {
        expect(`${t}`.includes('{')).toBe(false);
      }
    });

    it('🔴 на разные поводы — разные слова и разный облик', () => {
      const поводы: GreetKind[] = ['one_left', 'go_today', 'on_track'];
      const пары = [состояние(7, 6, true), состояние(14, 5, false), состояние(14, 5, true)];
      expect(пары.map(greetKind)).toEqual(поводы);
      const тексты = пары.map((s) => pickGreeting('ru', s)?.text);
      expect(new Set(тексты).size).toBe(3);
      const облики = пары.map((s) => pickGreeting('ru', s)?.state);
      expect(new Set(облики).size).toBe(3);
    });

    it('облик — из списка, который умеет спрайт', () => {
      const умеет: GoalPetState[] = ['wave', 'point', 'cheer', 'sad'];
      for (const s of [состояние(7, 6, true), состояние(14, 5, false), состояние(14, 5, true)]) {
        expect(умеет).toContain(pickGreeting('ru', s)!.state);
      }
    });

    it('незнакомый язык падает на английский, а не на пустоту', () => {
      const ко = pickGreeting('ko', состояние(14, 5, true));
      const en = pickGreeting('en', состояние(14, 5, true));
      expect(ко?.text).toBe(en?.text);
      expect(`${en?.text}`.length).toBeGreaterThan(0);
    });

    /**
     * 🔴 НИ ДАВЛЕНИЯ, НИ ОБЕЩАНИЙ. Duolingo на этом месте пишет «не потеряй
     * серию» и «шансы вырастут вдвое». От первого отказались решением Дениса
     * («ни одной формулировки вины»), второго у нас нет чем подтвердить.
     */
    it('🔴 ни одной угрозы потерей и ни одного обещания', () => {
      const запрещено = [
        'не потеряй', 'потеряешь', 'сгорит', 'сгорает', 'успей', 'последний шанс',
        'в 2 раза', 'вдвое', 'шанс', 'гаранти',
        'don’t lose', "don't lose", 'you will lose', 'burn', 'hurry', 'twice', 'double', 'chances',
      ];
      const поводы = [состояние(7, 6, true), состояние(14, 5, false), состояние(14, 5, true)];
      for (const lang of greetLanguages()) {
        for (const s of поводы) {
          const t = pickGreeting(lang, s)!.text.toLowerCase();
          expect(`${lang}: ${запрещено.filter((w) => t.includes(w)).join(', ') || 'чисто'}`)
            .toBe(`${lang}: чисто`);
        }
      }
    });

    /**
     * 🔴 ЕДИНСТВЕННОЕ УТВЕРЖДЕНИЕ О ПРАВИЛАХ — И ОНО ПРОВЕРЯЕТСЯ ПАРТИЕЙ.
     *
     * «Одна партия — и день засчитан» звучит как ободрение, но это ЗАМЕР: день
     * отмечается любой партией, даже нулевой. Правило живёт в `recordRound` и
     * может быть изменено чужой правкой экономики — тогда встреча начнёт врать
     * человеку о его же серии. Проба ловит расхождение.
     */
    it('🔴 «одна партия засчитывает день» — не бодрость, а поведение earn', async () => {
      await AsyncStorage.clear();
      const в = день(2026, 9, 7);
      expect(await loadDayMarks('p1')).toEqual([]);
      // Худшая партия, какая бывает: ноль очков и ошибки.
      await recordRound({ profileId: 'p1', game: 'schulte', score: 0, errors: 3, warmupStep: false, now: в });
      expect(await loadDayMarks('p1')).toContain(dayKey(в));
    });
  });

  describe('не чаще раза в сутки', () => {
    beforeEach(async () => { await AsyncStorage.clear(); });

    it('отметка ставится и читается', async () => {
      expect(await loadGreetedDay('p1')).toBeNull();
      await markGreeted('p1', день(2026, 9, 7));
      expect(await loadGreetedDay('p1')).toBe('2026-9-7');
    });

    it('🔴 сегодня уже здоровались — второй раз за день нет, назавтра да', async () => {
      await markGreeted('p1', день(2026, 9, 7));
      const отмечено = await loadGreetedDay('p1');
      expect(greetedToday(отмечено, день(2026, 9, 7))).toBe(true);
      expect(greetedToday(отмечено, день(2026, 9, 8))).toBe(false);
    });

    it('пустая отметка — это «ещё не здоровались», а не «неизвестно»', () => {
      expect(greetedToday(null, день(2026, 9, 7))).toBe(false);
    });

    it('🔴 у каждого профиля своя отметка', async () => {
      await markGreeted('p1', день(2026, 9, 7));
      expect(await loadGreetedDay('p2')).toBeNull();
      expect(greetedKey('p1')).not.toBe(greetedKey('p2'));
    });

    it('🔴 ключ встречи не совпадает с ключом цели — иначе одна затрёт другую', async () => {
      const g = startGoal(7, день(2026, 9, 7));
      expect(greetedKey('p1')).not.toContain('streak_goal');
      expect(g.days).toBe(7);
    });
  });
});
