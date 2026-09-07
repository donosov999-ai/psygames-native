/**
 * 🔴 МИКС УЗОРОВ — «КАКОЙ ТУТ ВООБЩЕ МАТ?».
 *
 * Просьба Дениса 07.09.2026, дословно: «чтобы в режиме поток было не один режим,
 * а случайно разные подавались, любой из тех приёмов что есть — типа тренировка
 * на реакцию, увидеть какой мат доступен».
 *
 * Отличие от отработки одного узора не в пуле, а в ЗАДАЧЕ. При отработке человек
 * знает, что ищет, и меряется скорость исполнения знакомого. В миксе он не знает
 * и первым делом должен узнать картинку среди девятнадцати — тот самый навык,
 * ради которого упражнение заводилось (Chase & Simon), спрошенный в лоб.
 *
 * ⚠️ Поэтому имя узора до ответа СКРЫТО: подпись «Арабский мат» над доской
 * выдаёт ответ, и от «увидеть, какой» не остаётся ничего.
 */
import { buildMixedMotifDeck, buildNamedDeck, levelParams, mixedMotifCount, namedMotifCount, NAMED_MOTIFS } from '@/src/games/scholars-mate/core/deck';
import { sideToMove } from '@/src/games/scholars-mate/core/check';

describe('микс узоров: набор', () => {
  it('🔴 в подходе встречаются РАЗНЫЕ узоры, а не один', () => {
    const узоры = new Set<string>();
    for (let s = 1; s <= 8; s++) {
      for (const p of buildMixedMotifDeck(15, s, 40)) if (p.motif) узоры.add(p.motif);
    }
    // Отработка одного узора для сравнения: там узор ровно один.
    const одного = new Set(buildNamedDeck(NAMED_MOTIFS[0]!, 15, 1, 40).map((p) => p.motif));
    expect(`узоров в миксе ${узоры.size} > 1, в отработке ${одного.size}`)
      .toBe(`узоров в миксе ${узоры.size} > 1, в отработке 1`);
    expect(`узоров в миксе больше одного: ${узоры.size > 1}`).toBe('узоров в миксе больше одного: true');
    // И берутся не два-три, а заметная часть библиотеки.
    expect(`узоров задействовано ${узоры.size} из ${NAMED_MOTIFS.length}, не меньше половины: ${узоры.size >= NAMED_MOTIFS.length / 2}`)
      .toBe(`узоров задействовано ${узоры.size} из ${NAMED_MOTIFS.length}, не меньше половины: true`);
  });

  it('🔴 весь подход за ОДНУ сторону — узнавание и так нагружено', () => {
    const беда: string[] = [];
    for (const L of [1, 8, 15, 25, 40]) {
      for (let s = 1; s <= 5; s++) {
        const d = buildMixedMotifDeck(L, s, 30);
        if (!d.length) { беда.push(`ур.${L} сид ${s}: пусто`); continue; }
        const цвета = new Set(d.map((p) => sideToMove(p)));
        if (цвета.size !== 1) беда.push(`ур.${L} сид ${s}: цветов ${цвета.size}`);
      }
    }
    expect(`подходов со сменой стороны: ${беда.length} → ${беда.slice(0, 3).join(' | ')}`)
      .toBe('подходов со сменой стороны: 0 → ');
  });

  it('🔴 позиции не повторяются и набор набирается до нужной длины', () => {
    for (const L of [1, 15, 40]) {
      const п = levelParams(L);
      const d = buildMixedMotifDeck(L, 3);
      expect(`ур.${L}: длина ${d.length}`).toBe(`ур.${L}: длина ${п.count}`);
      const ключи = new Set(d.map((p) => `${p.fen}|${p.pre ?? ''}`));
      expect(`ур.${L}: повторов ${d.length - ключи.size}`).toBe(`ур.${L}: повторов 0`);
    }
    // Длинный набор потока тоже собирается.
    expect(`поток: ${buildMixedMotifDeck(15, 1, 200).length}`).toBe('поток: 200');
  });

  it('🔴 набор воспроизводим по семени — иначе «дальше» подсунет другой подход', () => {
    const a = buildMixedMotifDeck(15, 7, 20).map((p) => p.fen).join('|');
    const b = buildMixedMotifDeck(15, 7, 20).map((p) => p.fen).join('|');
    const c = buildMixedMotifDeck(15, 8, 20).map((p) => p.fen).join('|');
    expect(`одно семя даёт одно: ${a === b}`).toBe('одно семя даёт одно: true');
    expect(`разные семена — разное: ${a !== c}`).toBe('разные семена — разное: true');
  });

  it('счётчик микса — сумма по всем пулам', () => {
    const сумма = NAMED_MOTIFS.reduce((s, имя) => s + namedMotifCount(имя), 0);
    expect(`микс: ${mixedMotifCount()}, сумма пулов: ${сумма}`).toBe(`микс: ${сумма}, сумма пулов: ${сумма}`);
    expect(`пулов больше десяти: ${NAMED_MOTIFS.length > 10}`).toBe('пулов больше десяти: true');
  });
});
