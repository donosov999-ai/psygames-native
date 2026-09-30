/* psygames-rhythm-pitch-teach · VER 1 · 30.09.2026 */
/**
 * 🎓 РАЗБОР ПО ШАГАМ «РИТМА И ВЫСОТЫ»: В РИТМЕ ДЕРЖАТЬ ТЕМП, В ВЫСОТЕ СЛЕДИТЬ ЗА ЛИНИЕЙ.
 *
 * 📍 Денис 17.09.2026: для слуховых игр — «на что слушать и чем отличаются варианты». Уровни игры
 * чередуют режимы: нечётные — «эхо ритма», чётные — «путь высоты» (rhythmPitchModeForLevel). Разбор
 * доступен на уровнях 1–3 и учит тому режиму, который на этом уровне.
 *
 * 🔴 ТЕКСТЫ СТОЯТ НА ЗАМЕРЕ ГЕНЕРАТОРА. 30.09.2026, 600 рядов уровней 1 и 3: все промежутки равны,
 * акцентов нет (длинная пауза появляется с 4-го уровня, акценты — с 5-го). Поэтому разбор ритма
 * говорит «промежутки одинаковые — держите темп». На уровне 2 задание — две ноты, «выше/ниже», и
 * разбор называет направление из самого раунда (directionAnswer). Если генератор изменится, проба
 * rhythm-pitch-teach покраснеет раньше, чем разбор начнёт говорить неправду.
 *
 * ПРИМЕР — СВОЙ РАУНД ТЕМ ЖЕ ГЕНЕРАТОРОМ И УРОВНЕМ (generateRhythmPitchRound), звучит на том же
 * движке, что и партия (engine.playRound).
 */
import { generateRhythmPitchRound } from '@/src/games/rhythm-pitch/core';
import type { RhythmPitchRound } from '@/src/games/rhythm-pitch/core/types';

export interface КарточкаРитма {
  вид: 'приём' | 'слушаем' | 'такт' | 'повтор' | 'сравнение' | 'готово';
  ключ: string;
  поля?: Record<string, string | number>;
  /** Проиграть пример при показе карточки. */
  звук: boolean;
}

export interface РазборРитма {
  пример: RhythmPitchRound;
  карточки: КарточкаРитма[];
}

/** Промежутки ряда равны (до миллисекунды). */
export function ровныйРяд(пример: RhythmPitchRound): boolean {
  if (пример.mode !== 'rhythm-echo') return false;
  const промежутки = пример.beats.slice(1).map((б, i) => Math.round(б.onsetMs - пример.beats[i]!.onsetMs));
  return new Set(промежутки).size <= 1 && пример.accentCount === 0;
}

export function собратьРазборРитма(уровень: number, семя: string): РазборРитма | null {
  const пример = generateRhythmPitchRound(семя, уровень);
  if (пример.mode === 'rhythm-echo') {
    if (!ровныйРяд(пример)) return null;   // разбор говорит «ровно» — на неровном ряде ему нечего сказать
    return {
      пример,
      карточки: [
        { вид: 'приём', ключ: 'teachRpRhythmIntro', звук: false },
        { вид: 'слушаем', ключ: 'teachRpListen', поля: { n: пример.beatCount }, звук: true },
        { вид: 'такт', ключ: 'teachRpEven', звук: false },
        { вид: 'повтор', ключ: 'teachRpTap', звук: true },
        { вид: 'готово', ключ: 'teachRpRhythmDone', звук: false },
      ],
    };
  }
  if (пример.task !== 'direction' || !пример.directionAnswer) return null;
  return {
    пример,
    карточки: [
      { вид: 'приём', ключ: 'teachRpPitchIntro', звук: false },
      { вид: 'слушаем', ключ: 'teachRpListenTones', поля: { n: пример.toneCount }, звук: true },
      { вид: 'сравнение', ключ: пример.directionAnswer === 'higher' ? 'teachRpHigher' : 'teachRpLower', звук: true },
      { вид: 'готово', ключ: 'teachRpPitchDone', звук: false },
    ],
  };
}
