/* psygames-goal-pet-lines-gate · VER 1 · 07.09.2026 */
/**
 * ПИТОМЕЦ В ОКНЕ ЦЕЛИ ГОВОРИТ РАЗНОЕ И НЕ ОБЕЩАЕТ ЛИШНЕГО.
 *
 * Требование Дениса 07.09.2026: «питомец должен общаться с пользователем».
 * Общение проверяется не наличием строки, а тем, что на разные поводы приходят
 * РАЗНЫЕ слова: одна фраза на все случаи — это табличка, а не разговор.
 */
import { pickGoalLine, goalLineLanguages, type GoalPetState } from '@/src/services/goalPetLines';
import { GOAL_DAYS, type AskReason } from '@/src/services/streakGoal';

const ПОВОДЫ: AskReason[] = ['first', 'weekly', 'reached', 'broken'];

describe('реплики питомца в окне цели', () => {
  it('на каждый повод есть своя реплика и облик', () => {
    for (const r of ПОВОДЫ) {
      const l = pickGoalLine('ru', r);
      expect(`${r}: текст ${l.text.length > 0} · облик ${!!l.state}`)
        .toBe(`${r}: текст true · облик true`);
    }
  });

  it('🔴 на разные поводы — РАЗНЫЕ слова, иначе это не общение', () => {
    const тексты = ПОВОДЫ.map((r) => pickGoalLine('ru', r).text);
    expect(new Set(тексты).size).toBe(ПОВОДЫ.length);
    const облики = ПОВОДЫ.map((r) => pickGoalLine('ru', r).state);
    expect(new Set(облики).size).toBe(ПОВОДЫ.length);
  });

  it('🔴 сорвавшегося не стыдят', () => {
    // Приложение, которое за оборванную серию упрекает, закрывают вместе со
    // всем остальным. Проверяем по словам-упрёкам, а не «на глаз».
    for (const lang of goalLineLanguages()) {
      const t = pickGoalLine(lang, 'broken').text.toLowerCase();
      const упрёки = ['подвёл', 'провалил', 'опять', 'снова сорвал', 'failed', 'you lost', 'again you'];
      expect(`${lang}: ${упрёки.filter((u) => t.includes(u)).join(', ') || 'упрёков нет'}`)
        .toBe(`${lang}: упрёков нет`);
    }
  });

  it('🔴 ни одна реплика ничего не обещает', () => {
    // Решение Дениса: над выбором обещаний нет. У Duolingo там «шансы вырастут
    // в 2 раза» — у нас такого замера нет ни в каком виде.
    const обещания = ['в 2 раза', 'вдвое', 'шанс', 'гаранти', 'twice', 'double', 'chances'];
    for (const lang of goalLineLanguages()) {
      for (const r of ПОВОДЫ) {
        const t = pickGoalLine(lang, r).text.toLowerCase();
        expect(`${lang}/${r}: ${обещания.filter((o) => t.includes(o)).join(', ') || 'чисто'}`)
          .toBe(`${lang}/${r}: чисто`);
      }
    }
  });

  it('незнакомый язык падает на английский, а не на пустоту', () => {
    const t = pickGoalLine('ko', 'first');
    expect(t.text).toBe(pickGoalLine('en', 'first').text);
  });

  it('облик — из списка, который умеет спрайт', () => {
    const умеет: GoalPetState[] = ['wave', 'point', 'cheer', 'sad'];
    for (const r of ПОВОДЫ) expect(умеет).toContain(pickGoalLine('ru', r).state);
  });

  /**
   * 🔴 СКЛОНЕНИЕ. 7, 14 и 30 по-русски все берут «дней» — поэтому подпись
   * варианта пишется без помощника склонения, и это осознанно. Но 21 даст
   * «21 день», а 22 — «22 дня»: добавит кто-нибудь такой вариант, и подпись
   * молча станет неграмотной. Проба напомнит.
   */
  it('🔴 все варианты дней берут форму «дней» — иначе нужен помощник склонения', () => {
    const беретДней = (n: number) => {
      const c = n % 100, d = n % 10;
      return (c >= 11 && c <= 14) || d === 0 || (d >= 5 && d <= 9);
    };
    const плохо = GOAL_DAYS.filter((d) => !беретДней(d));
    expect(плохо).toEqual([]);
  });
});
