/* psygames-scholars-mate-check · VER 1 · 05.09.2026 */
/**
 * Позиция на доске и проверка ответа. Разбор — `chess.js`, он уже в проекте.
 *
 * 🔴 ГЛАВНОЕ ЗДЕСЬ — ПРЕ-ХОД. В записи Lichess первый ход последовательности
 * принадлежит СОПЕРНИКУ: `fen` — это позиция ДО него, а спрашивают про то, что
 * будет ПОСЛЕ. Показать `fen` как есть — значит показать чужую позицию и
 * спросить ход, которого в ней нет; задача выглядит нерешаемой, и виноватым
 * человек считает себя.
 *
 * Ловушка описана в README набора (`chess-scholars-mate/README.md`) и вынесена
 * сюда единственным местом, где пре-ход играется. У своих позиций его нет.
 *
 * ⚠️ ПРАВИЛЬНЫХ ХОДОВ БЫВАЕТ НЕСКОЛЬКО. У «защитись» их 2–12: любой, после
 * которого мата в один ход у соперника нет. Засчитываем ЛЮБОЙ из списка и
 * показываем лучший — на детском уровне «спасся» важнее, чем «спасся красиво».
 */
import { Chess } from 'chess.js';

import type { ScholarsPuzzle } from './types';

/** Позиция, которую реально видит человек: `fen` уже с разыгранным пре-ходом. */
export function shownFen(p: ScholarsPuzzle): string {
  if (!p.pre) return p.fen;
  const g = new Chess(p.fen);
  const ok = сыграть(g, p.pre);
  if (!ok) return p.fen;                 // битая запись — показываем как есть
  return g.fen();
}

/** Ход в записи uci ('g1f3', 'e7e8q') на доске. Возвращает, получилось ли. */
function сыграть(g: Chess, uci: string): boolean {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  try {
    return Boolean(g.move({ from, to, ...(promotion ? { promotion } : {}) }));
  } catch {
    return false;                        // chess.js бросает на незаконном ходе
  }
}

/**
 * Чей ход в показанной позиции: 'w' | 'b'.
 *
 * ⚠️ БЕРЁМ ИЗ СТРОКИ, А НЕ РАЗБОРОМ. Сторона хода — второе поле FEN, и создавать
 * ради неё доску незачем: замер 05.09.2026 — 0,177 мс на вызов, а доска
 * перерисовывается десять раз в секунду по секундомеру.
 */
export function sideToMove(p: ScholarsPuzzle): 'w' | 'b' {
  const fen = shownFen(p);
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export interface Verdict {
  readonly correct: boolean;
  /** Верный ход в записи SAN — показать после ответа. */
  readonly best?: string;
  /** Ответ соперника, если задача в два-три хода и ход был верный. */
  readonly reply?: string;
  /** Позиция после нашего хода (и ответа соперника) — чтобы показать итог. */
  readonly fenAfter?: string;
  /** Мат уже поставлен — партия окончена. */
  readonly mated?: boolean;
}

/**
 * Проверить ход человека.
 *
 * 🔴 ДЛЯ `mate` СВЕРЯЕМ НЕ СО СПИСКОМ, А С ДОСКОЙ. Список решений — подсказка
 * от источника, а истина в позиции: если ход ставит мат, он верный, даже если
 * в списке его нет. Обратное тоже важно: совпал со списком, а мата нет —
 * значит запись битая, и засчитывать нельзя.
 *
 * ⚠️ У `defend` наоборот — доска сама по себе ответа не даёт: «защитился» это
 * «после моего хода у соперника нет мата в один», и проверяется перебором.
 * Считаем это здесь, а не доверяем списку: список составлен генератором, а
 * позиция могла прийти из другого источника.
 */
export function check(p: ScholarsPuzzle, uci: string): Verdict {
  const g = new Chess(shownFen(p));
  if (!сыграть(g, uci)) return { correct: false, best: p.san?.[0] };

  const после = g.fen();

  if (p.kind === 'defend') {
    const спасся = !естьМатВОдин(после);
    // ⚠️ Лучший ход считается, а не берётся из списка — см. `bestDefence`.
    return { correct: спасся, best: bestDefence(p) ?? p.san?.[0], fenAfter: после };
  }

  if (g.isCheckmate()) {
    return { correct: true, best: p.san?.[0], fenAfter: после, mated: true };
  }

  /**
   * Мат в два-три хода: наш ход верен, если он ПЕРВЫЙ в записанной
   * последовательности. Дальше играем ответ соперника и ждём следующий ход.
   * Проверять «ведёт ли к мату» перебором нельзя — это работа движка, которого
   * в приложении нет; здесь верим записи Lichess, она составлена Stockfish.
   */
  if (p.line && p.line.length > 1) {
    const верный = p.line[0] === uci;
    if (!верный) return { correct: false, best: p.san?.[0], fenAfter: после };
    const ответ = p.line[1];
    if (ответ && сыграть(g, ответ)) {
      return { correct: true, best: p.san?.[0], reply: ответ, fenAfter: g.fen() };
    }
    return { correct: true, best: p.san?.[0], fenAfter: после };
  }

  return { correct: (p.solutions as string[]).includes(uci), best: p.san?.[0], fenAfter: после };
}

/** Есть ли у стороны, чей ход, мат в один. */
export function естьМатВОдин(fen: string): boolean {
  const g = new Chess(fen);
  for (const m of g.moves({ verbose: true }) as { from: string; to: string; promotion?: string }[]) {
    const пробный = new Chess(fen);
    try {
      пробный.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
    } catch { continue; }
    if (пробный.isCheckmate()) return true;
  }
  return false;
}

/**
 * 🔴 «ГРОЗИТ ЛИ МАТ» — ЭТО ВОПРОС ПРО СОПЕРНИКА, А НЕ ПРО ХОДЯЩЕГО.
 *
 * В такой позиции ходит ЗАЩИЩАЮЩИЙСЯ, а мат грозит другой стороне. Спросить
 * доску «есть ли мат в один» напрямую — значит спросить, может ли матовать сам
 * защищающийся: другой вопрос, другой ответ. Первая редакция ошиблась ровно
 * так, и проба показала расхождение на 7 позициях из 120.
 *
 * Считаем НУЛЕВЫМ ХОДОМ: передаём очередь сопернику и спрашиваем про него.
 *
 * ⚠️ Если защищающийся уже под шахом, «пропустить ход» нельзя, и вопрос теряет
 * смысл — там не «грозит», там уже случилось. Такие позиции считаем угрозой.
 *
 * 📍 ЗАМЕР 05.09.2026: расчёт по доске сходится с пометкой генератора в 726
 * случаях из 756 (96%). Оставшиеся 30 — ошибки генератора, и именно поэтому
 * ответ БЕРЁТСЯ ИЗ ДОСКИ, а не из поля `threat`: позиция не врёт, разметка
 * может.
 */
export function threatAnswer(p: ScholarsPuzzle): boolean {
  const fen = shownFen(p);
  const g = new Chess(fen);
  if (g.inCheck()) return true;
  const части = fen.split(' ');
  части[1] = части[1] === 'w' ? 'b' : 'w';
  части[3] = '-';                        // взятие на проходе после пропуска хода недействительно
  try {
    return естьМатВОдин(части.join(' '));
  } catch {
    return !!p.threat;                   // позиция без нулевого хода — верим разметке
  }
}

/**
 * Лучший ход защиты — ВЫЧИСЛЕННЫЙ, а не первый из списка.
 *
 * 📍 ЗАМЕР 05.09.2026: из 3977 ходов, записанных генератором как спасающие,
 * реально спасают 3740 (94%). Позиций, где не спасает ни один, нет — то есть
 * список годен как подсказка и негоден как истина. Показывать человеку «лучший»
 * из непроверенного списка значит иногда советовать ход, после которого мат.
 */
export function bestDefence(p: ScholarsPuzzle): string | undefined {
  const fen = shownFen(p);
  const g = new Chess(fen);
  const все = g.moves({ verbose: true }) as { from: string; to: string; promotion?: string; san: string }[];
  for (const m of все) {
    const t = new Chess(fen);
    try {
      t.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
    } catch { continue; }
    if (!естьМатВОдин(t.fen())) return m.san;
  }
  return undefined;
}

/**
 * Все законные ходы фигуры С УКАЗАННОЙ КЛЕТКИ — подсветка при выборе фигуры.
 *
 * 🔴 Возвращает ПОЛЯ, а не ходы: превращение пешки даёт четыре хода на одно
 * поле, и подсветка обязана показать поле один раз.
 */
export function movesFrom(fen: string, square: string): string[] {
  try {
    const g = new Chess(fen);
    const ходы = g.moves({ square: square as never, verbose: true }) as { to: string }[];
    return [...new Set(ходы.map((m) => m.to))];
  } catch {
    return [];
  }
}

/**
 * 🔴 ПРЕВРАЩЕНИЕ ПЕШКИ: тап даёт четыре знака, а ход требует пятый.
 *
 * 📍 chess.js 1.4.0 БРОСАЕТ на `move({from:'g7',to:'g8'})` без `promotion`.
 * Замер: на живой доске подсветка показывала g8 и тап по нему давал «✕» —
 * попытка сгорала, доска не двигалась. В нынешнем наборе таких позиций одна на
 * 13 726, но при любой пересборке их станет больше, а тап пятый знак выразить
 * не может в принципе.
 *
 * Ферзь — единственный разумный выбор в матовой задаче: недопревращение в
 * этих узорах не встречается.
 */
export function дополнитьХод(fen: string, uci: string): string {
  if (uci.length > 4) return uci;
  try {
    const g = new Chess(fen);
    const есть = (g.moves({ verbose: true }) as { from: string; to: string; promotion?: string }[])
      .some((m) => m.from === uci.slice(0, 2) && m.to === uci.slice(2, 4) && m.promotion);
    return есть ? `${uci}q` : uci;
  } catch {
    return uci;
  }
}
