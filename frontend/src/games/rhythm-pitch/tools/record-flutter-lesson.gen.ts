/* psygames-rhythm-pitch-record-flutter-lesson · VER 1 · 01.10.2026 */
/**
 * ЭТАЛОН РАЗБОРА «РИТМА И ВЫСОТЫ» ДЛЯ FLUTTER-ПОЛОВИНЫ.
 *
 * 🔴 ЗАЧЕМ. «Ритм и высота» нативные с 30.09 (#67), и в них стояла общая демо-карточка вместо разбора
 * по шагам (`frontend/src/games/rhythm-pitch/teach.ts`, задача d651a95c). Разбор переносится в
 * `flutter/lib/games/rhythm_pitch/lesson.dart` и сверяется с этим эталоном: на уровнях 1–6 и 30
 * зёрнах на уровень — режим раунда, «ровный ли ряд» и карточки (или `null`, когда разбору нечего
 * сказать: неровный ряд с 4-го уровня, задание высоты не «выше/ниже»). Генератор у Dart — перенос
 * «Языков» (`rhythm_pitch/core.dart`), его сверка — их эталон; здесь сверяется только разбор.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `teach.ts` или генератора — ПЕРЕЗАПУСТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`):
 *   npx jest --testMatch '**\/rhythm-pitch/tools/record-flutter-lesson.gen.ts'
 */
import { generateRhythmPitchRound } from '../core';
import { ровныйРяд, собратьРазборРитма } from '../teach';

declare const __dirname: string;
declare function require(m: string): any;
const { mkdirSync, writeFileSync } = require('fs');
const { dirname, join } = require('path');
const ROOT = join(__dirname, '../../../../..');

/** Виды латиницей: в Dart кириллица только в видимом тексте. */
const ВИД: Record<string, string> = {
  приём: 'intro', слушаем: 'listen', такт: 'beat', повтор: 'tap', сравнение: 'compare', готово: 'done',
};

describe('эталон разбора «Ритма и высоты» для Flutter', () => {
  it('пишет режим, ровность ряда и карточки по уровням и зёрнам', () => {
    const lessons: unknown[] = [];
    for (let level = 1; level <= 6; level++) {
      for (let n = 1; n <= 30; n++) {
        const seed = `lesson-${level}-${n}`;
        const round = generateRhythmPitchRound(seed, level);
        const р = собратьРазборРитма(level, seed);
        lessons.push({
          level, seed, mode: round.mode, even: ровныйРяд(round),
          cards: р?.карточки.map((к) => ({
            kind: ВИД[к.вид], key: к.ключ,
            fields: Object.fromEntries(Object.entries(к.поля ?? {}).map(([f, v]) => [f, String(v)])),
            sound: к.звук,
          })) ?? null,
        });
      }
    }
    // «Ровный ряд» = промежутки равны И акцентов нет. Чтобы проба различала оба условия, нужны ряды,
    // где нарушено только одно. Замер 01.10.2026 на 360 рядах уровней 2–10: пауза без акцентов — 40;
    // равные шаги с акцентом генератор не даёт ни разу — этот случай Dart-проба собирает руками.
    const forced: unknown[] = [];
    for (let level = 2; level <= 10; level++) {
      for (let n = 1; n <= 40; n++) {
        const seed = `forced-${level}-${n}`;
        const round = generateRhythmPitchRound(seed, level, 'rhythm-echo');
        if (round.mode !== 'rhythm-echo') continue;
        const шаги = new Set(round.beats.slice(1).map((б, i) => Math.round(б.onsetMs - round.beats[i]!.onsetMs)));
        forced.push({ level, seed, even: ровныйРяд(round), equalGaps: шаги.size <= 1, accents: round.accentCount });
      }
    }
    const путь = join(ROOT, 'flutter/test/fixtures/rhythm-pitch-lesson-reference.json');
    mkdirSync(dirname(путь), { recursive: true });
    writeFileSync(путь, `${JSON.stringify({ source: 'frontend/src/games/rhythm-pitch/tools/record-flutter-lesson.gen.ts', lessons, forced }, null, 1)}\n`);
    expect(lessons.length).toBe(180);
  });
});
