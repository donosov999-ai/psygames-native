/* psygames-rhythm-pitch-teach · VER 1 · 30.09.2026 */
/**
 * 🎓 РАЗБОР «РИТМА И ВЫСОТЫ» ГОВОРИТ ТОЛЬКО ТО, ЧТО ВЕРНО ДЛЯ МАТЕРИАЛА УРОВНЕЙ 1–3.
 *
 * Тексты разбора стоят на замере генератора: на уровнях 1 и 3 ряд ровный и без акцентов, на уровне 2
 * задание «выше/ниже». Проба гоняет настоящий генератор и краснеет, если это перестанет быть правдой.
 */
import { generateRhythmPitchRound, rhythmPitchModeForLevel } from '@/src/games/rhythm-pitch/core';
import { собратьРазборРитма, ровныйРяд } from '@/src/games/rhythm-pitch/teach';

describe('разбор «Ритма и высоты»', () => {
  it('🔴 уровни 1 и 3 — «эхо ритма» с ровным рядом без акцентов: 300 рядов на уровень', () => {
    for (const уровень of [1, 3]) {
      expect(rhythmPitchModeForLevel(уровень)).toBe('rhythm-echo');
      for (let s = 0; s < 300; s++) expect(ровныйРяд(generateRhythmPitchRound(`проба-${s}`, уровень))).toBe(true);
    }
  });

  it('🔴 уровень 2 — «выше/ниже» из двух нот, и разбор называет направление самого раунда', () => {
    expect(rhythmPitchModeForLevel(2)).toBe('pitch-path');
    let выше = 0; let ниже = 0;
    for (let s = 0; s < 200; s++) {
      const р = собратьРазборРитма(2, `проба-${s}`)!;
      expect(р).not.toBeNull();
      const пример = р.пример;
      if (пример.mode !== 'pitch-path') throw new Error('не тот режим');
      expect(пример.task).toBe('direction');
      const сравнение = р.карточки.find((к) => к.вид === 'сравнение')!;
      // Игра засчитывает directionAnswer; разбор обязан назвать его же.
      expect(сравнение.ключ).toBe(пример.directionAnswer === 'higher' ? 'teachRpHigher' : 'teachRpLower');
      // И направление совпадает со звуком: частота второй ноты выше/ниже первой.
      const [f0, f1] = пример.sequence.map((i) => пример.frequenciesHz[i]!);
      expect(пример.directionAnswer === 'higher' ? f1! > f0! : f1! < f0!).toBe(true);
      if (пример.directionAnswer === 'higher') выше++; else ниже++;
    }
    expect(выше).toBeGreaterThan(0);
    expect(ниже).toBeGreaterThan(0);
  });

  it('на уровнях 1–3 разбор собирается всегда, звучит на «слушаем» и называет приём на каждом шаге', () => {
    const ПРИЁМЫ = new Set(['teachRpListen', 'teachRpEven', 'teachRpTap', 'teachRpListenTones', 'teachRpHigher', 'teachRpLower']);
    for (const уровень of [1, 2, 3]) {
      for (let s = 0; s < 30; s++) {
        const р = собратьРазборРитма(уровень, `вид-${s}`)!;
        expect(р).not.toBeNull();
        expect(р.карточки.find((к) => к.вид === 'слушаем')!.звук).toBe(true);
        const середина = р.карточки.slice(1, -1);
        expect(середина.every((к) => ПРИЁМЫ.has(к.ключ))).toBe(true);
      }
    }
  });
});
