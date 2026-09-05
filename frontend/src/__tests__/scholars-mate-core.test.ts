/**
 * 🔴 «ДЕТСКИЙ МАТ»: ПОЗИЦИИ ОБЯЗАНЫ БЫТЬ РЕШАЕМЫ, А ПРЕ-ХОД — СЫГРАН.
 *
 * Упражнение просил Денис 05.09.2026: «чисто на скорость делать заученные
 * этюды», отдельно — «детский мат с жертвой». Данные пришли из двух источников:
 * свой генератор на python-chess и база задач Lichess (CC0, 6,1 млн задач).
 *
 * ⚠️ ЛОВУШКА, РАДИ КОТОРОЙ ЭТА ПРОБА И НАПИСАНА. В записи Lichess ПЕРВЫЙ ход
 * последовательности принадлежит СОПЕРНИКУ: поле `fen` — позиция ДО него.
 * Показать `fen` как есть — значит показать чужую позицию и спросить ход,
 * которого в ней нет. Задача выглядит нерешаемой, и человек винит себя.
 *
 * Проверить это чтением кода нельзя: и с пре-ходом, и без него всё «работает»,
 * просто во втором случае ни один ответ не засчитывается. Поэтому здесь
 * позиции реально разыгрываются на `chess.js`.
 */
import { buildDeck, counts, levelParams, puzzlesOf, LEVELS } from '@/src/games/scholars-mate/core/deck';
import { bestDefence, check, shownFen, sideToMove, threatAnswer, естьМатВОдин } from '@/src/games/scholars-mate/core/check';
import { Chess } from 'chess.js';

describe('«Детский мат»: данные', () => {
  it('есть что проверять: все пять видов заданий не пусты', () => {
    const c = counts();
    expect(c.mate).toBeGreaterThan(500);
    expect(c.defend).toBeGreaterThan(300);
    expect(c.threat).toBeGreaterThan(500);
    expect(c.fromGames).toBeGreaterThan(300);
    // Маты с жертвой — отдельная просьба Дениса; их заведомо меньше.
    expect(c.sacrifice).toBeGreaterThan(100);
  });

  it('🔴 каждая позиция — законный FEN, который chess.js разбирает', () => {
    const битые: string[] = [];
    for (const kind of ['mate', 'defend', 'threat', 'fromGames', 'sacrifice'] as const) {
      for (const p of puzzlesOf(kind).slice(0, 120)) {
        try { new Chess(p.fen); } catch { битые.push(`${kind}: ${p.fen}`); }
      }
    }
    expect(битые).toEqual([]);
  });
});

describe('«Детский мат»: жертва — это ТОТ ЖЕ узор, а не любой мат в два хода', () => {
  /**
   * 🔴 ПОЧЕМУ ЭТО ВАЖНО. Денис просил «детский мат с жертвой»: тот же узор —
   * жертвой вскрыть f7 и матовать ферзём. Выборка источника этого не даёт сама
   * по себе: 📍 замер 05.09.2026 по исходным 434 позициям — матуют на f7/f2
   * только 227 (52%), остальные ставят мат на f8, f1, e6, g6, и 306 из 434
   * помечены MIDDLEGAME, то есть к дебютному узору отношения не имеют.
   *
   * Задачи хорошие, но это ДРУГОЕ упражнение. Отбор по полю мата стоит в
   * сборщике; здесь он стережётся, потому что пересборка набора — это правка
   * скрипта, а не кода, и молча вернуть 207 чужих позиций проще всего.
   */
  it('🔴 мат в жертвенных позициях ставится на f7 или f2', () => {
    const чужие: string[] = [];
    for (const p of puzzlesOf('sacrifice')) {
      const линия = p.line ?? [];
      const последний = линия[линия.length - 1] ?? p.solutions[0] ?? '';
      const поле = последний.slice(2, 4);
      if (поле !== 'f7' && поле !== 'f2') чужие.push(`${поле}: ${p.fen}`);
    }
    expect(чужие.slice(0, 5)).toEqual([]);
  });

  /**
   * 🔴 РАЗДЕЛ НЕ ПУСТ — И ЭТО НЕ ПРИДИРКА.
   *
   * Исходник жертв читался из `/tmp`, а `/tmp` вычищается сам: сборка тогда
   * молча писала пустой раздел, и весь верх лестницы (уровни 31–40) оставался
   * без позиций. Ошибки при этом не было ни одной — просто «мат с жертвой»
   * исчезал. Теперь исходник в репозитории, а проба сторожит итог.
   */
  it('🔴 верхние ступени лестницы не остаются без позиций', () => {
    for (const L of [31, 35, 40]) {
      const колода = buildDeck(L, 5);
      const жертв = колода.filter((p) => p.kind === 'sacrifice').length;
      expect(`уровень ${L}: колода ${колода.length}, жертв ${жертв > 0}`)
        .toBe(`уровень ${L}: колода ${levelParams(L).count}, жертв true`);
    }
  });
});

describe('«Детский мат»: пре-ход соперника', () => {
  it('🔴 у позиций из партий пре-ход ЕСТЬ и он меняет позицию', () => {
    const из = puzzlesOf('fromGames').slice(0, 100);
    expect(из.length).toBeGreaterThan(50);
    const без = из.filter((p) => !p.pre);
    expect(без).toEqual([]);
    const неИграется = из.filter((p) => shownFen(p) === p.fen);
    expect(неИграется).toEqual([]);
  });

  it('🔴 у своих позиций пре-хода НЕТ — их показывают как есть', () => {
    for (const p of puzzlesOf('mate').slice(0, 50)) {
      expect(p.pre).toBeUndefined();
      expect(shownFen(p)).toBe(p.fen);
    }
  });

  it('🔴 БЕЗ пре-хода задача становится нерешаемой — вот цена ошибки', () => {
    /**
     * Мутация наоборот: берём позиции из партий и проверяем решение по СЫРОМУ
     * `fen`, как если бы пре-ход забыли сыграть. Если бы задача решалась и так,
     * вся эта возня была бы напрасной, а проба выше — украшением.
     */
    let решаетсяБезПреХода = 0;
    const проба = puzzlesOf('fromGames').slice(0, 60);
    for (const p of проба) {
      const g = new Chess(p.fen);
      const uci = p.solutions[0]!;
      try {
        if (g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) })) решаетсяБезПреХода++;
      } catch { /* ход незаконен — этого и ждём */ }
    }
    // Хотя бы у подавляющего большинства ход в сырой позиции просто НЕЗАКОНЕН.
    expect(решаетсяБезПреХода).toBeLessThan(проба.length * 0.2);
  });
});

describe('«Детский мат»: проверка ответа', () => {
  it('🔴 записанное решение действительно ставит мат — сверяем с доской', () => {
    const плохие: string[] = [];
    for (const p of [...puzzlesOf('mate').slice(0, 150), ...puzzlesOf('fromGames').slice(0, 150)]) {
      const v = check(p, p.solutions[0]!);
      if (!v.correct || !v.mated) плохие.push(`${p.kind}: ${p.fen} ← ${p.solutions[0]}`);
    }
    expect(плохие.slice(0, 5)).toEqual([]);
  });

  it('🔴 чужой законный ход НЕ засчитывается', () => {
    const p = puzzlesOf('mate')[0]!;
    const g = new Chess(shownFen(p));
    const другой = (g.moves({ verbose: true }) as { from: string; to: string }[])
      .map((m) => m.from + m.to)
      .find((u) => !p.solutions.includes(u));
    expect(другой).toBeTruthy();
    expect(check(p, другой!).correct).toBe(false);
  });

  /**
   * 🔴 СПИСОК РЕШЕНИЙ ГЕНЕРАТОРА — ПОДСКАЗКА, А НЕ ИСТИНА.
   *
   * 📍 Замер 05.09.2026 по всему набору: из 3977 ходов, записанных как
   * спасающие, реально спасают 3740 (94%) — 237 не спасают. При этом позиций,
   * где не спасает НИ ОДИН, нет: все 378 решаемы. Значит, позиции годные, а
   * разметка грязная, и вердикт обязан считаться по доске.
   *
   * Проба сторожит ровно это: `check` возвращает «верно» тогда и только тогда,
   * когда после хода мата в один действительно нет, — независимо от списка.
   */
  it('🔴 «защитись»: вердикт совпадает с доской, а не со списком', () => {
    const расхождения: string[] = [];
    let нашлось = 0;
    for (const p of puzzlesOf('defend').slice(0, 80)) {
      for (const uci of p.solutions.slice(0, 3)) {
        const v = check(p, uci);
        const g = new Chess(shownFen(p));
        try { g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) }); } catch { continue; }
        const поДоске = !естьМатВОдин(g.fen());
        if (v.correct !== поДоске) расхождения.push(`${p.fen} ← ${uci}`);
        if (!поДоске) нашлось++;              // грязная запись в списке
      }
    }
    expect(расхождения.slice(0, 5)).toEqual([]);
    // И проба не зелена вслепую: грязные записи в списке действительно есть.
    expect(нашлось).toBeGreaterThan(0);
  });

  it('🔴 у каждой позиции «защитись» есть хотя бы один спасающий ход', () => {
    const безвыходные: string[] = [];
    for (const p of puzzlesOf('defend').slice(0, 120)) {
      if (!bestDefence(p)) безвыходные.push(p.fen);
    }
    expect(безвыходные).toEqual([]);
  });

  /**
   * 🔴 «ГРОЗИТ ЛИ» СПРАШИВАЕТ ПРО СОПЕРНИКА, А НЕ ПРО ХОДЯЩЕГО.
   *
   * Первая редакция звала `естьМатВОдин` прямо на показанной позиции — то есть
   * спрашивала, может ли матовать сам ЗАЩИЩАЮЩИЙСЯ. Другой вопрос, другой
   * ответ: 7 расхождений на 120 позициях. Правильно — нулевым ходом.
   *
   * 📍 После правки расчёт по доске сходится с разметкой генератора в 726
   * случаях из 756. Оставшиеся 30 — ошибки разметки, поэтому проба сверяет
   * функцию с НЕЗАВИСИМЫМ расчётом, а не с полем `threat`.
   */
  it('🔴 «грозит ли мат» считается нулевым ходом, а не с точки зрения ходящего', () => {
    const расхождения: string[] = [];
    for (const p of puzzlesOf('threat').slice(0, 120)) {
      const fen = shownFen(p);
      const части = fen.split(' ');
      части[1] = части[1] === 'w' ? 'b' : 'w';
      части[3] = '-';
      const ожидание = new Chess(fen).inCheck() ? true : естьМатВОдин(части.join(' '));
      if (threatAnswer(p) !== ожидание) расхождения.push(p.fen);
    }
    expect(расхождения.slice(0, 5)).toEqual([]);
  });

  it('🔴 ответ «грозит ли» НЕ совпадает с вопросом «может ли матовать ходящий»', () => {
    // Если бы совпадал, различать их было бы незачем — и первая ошибка была бы
    // безвредной. Она не безвредна: на выборке эти два ответа расходятся.
    let разошлось = 0;
    for (const p of puzzlesOf('threat').slice(0, 120)) {
      if (threatAnswer(p) !== естьМатВОдин(shownFen(p))) разошлось++;
    }
    expect(разошлось).toBeGreaterThan(0);
  });

  it('🔴 у мата с жертвой ответ соперника разыгрывается, а не пропускается', () => {
    const сЛинией = puzzlesOf('sacrifice').filter((p) => (p.line?.length ?? 0) > 1).slice(0, 40);
    expect(сЛинией.length).toBeGreaterThan(10);
    const без = сЛинией.filter((p) => !check(p, p.line![0]!).reply);
    expect(без.slice(0, 3)).toEqual([]);
  });

  it('🔴 незаконный ход не роняет проверку, а возвращает «неверно»', () => {
    const p = puzzlesOf('mate')[0]!;
    for (const мусор of ['a1a1', 'zz99', '', 'h8h1']) {
      expect(check(p, мусор).correct).toBe(false);
    }
  });
});

describe('«Детский мат»: лестница', () => {
  it('🔴 время на позицию ПАДАЕТ с уровнем — в этом вся ось трудности', () => {
    const первый = levelParams(1).seconds;
    const десятый = levelParams(10).seconds;
    expect(десятый).toBeLessThan(первый);
    // …но не до нуля: ниже 4 секунд меряется скорость пальца, а не глаза.
    for (let L = 1; L <= LEVELS; L++) expect(levelParams(L).seconds).toBeGreaterThanOrEqual(4);
  });

  it('🔴 маты с жертвой появляются только в конце лестницы', () => {
    for (let L = 1; L <= 30; L++) expect(levelParams(L).kinds).not.toContain('sacrifice');
    expect(levelParams(31).kinds).toContain('sacrifice');
  });

  it('🔴 набор на подход не повторяет позиций — повтор решается памятью', () => {
    for (const L of [1, 12, 25, 35]) {
      const колода = buildDeck(L, 3);
      expect(колода.length).toBe(levelParams(L).count);
      const ключи = колода.map((p) => `${p.kind}:${p.fen}:${p.pre ?? ''}`);
      expect(new Set(ключи).size).toBe(ключи.length);
    }
  });

  it('🔴 набор повторим: тот же уровень и зерно дают тот же набор', () => {
    const a = buildDeck(14, 7).map((p) => p.fen).join('|');
    const b = buildDeck(14, 7).map((p) => p.fen).join('|');
    expect(a).toBe(b);
    expect(buildDeck(14, 8).map((p) => p.fen).join('|')).not.toBe(a);
  });

  it('🔴 чей ход в показанной позиции — определяется, а не угадывается', () => {
    for (const p of buildDeck(15, 2)) {
      expect(['w', 'b']).toContain(sideToMove(p));
    }
  });
});
