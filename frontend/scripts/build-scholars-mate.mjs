/* psygames-build-scholars-mate · VER 2 · 05.09.2026 */
/**
 * Сборка набора позиций для упражнения «Детский мат».
 *
 * 🔴 VER 2 ПЕРЕПИСАН ПОСЛЕ РЕЦЕНЗИИ. В VER 1 отбор шёл по ТЕМЕ Lichess
 * `attackingF2F7` и по ПОЛЮ мата, а обещание было про УЗОР. Проверка движком по
 * всем 12 321 отобранным задачам: узор (ферзь матует на f7/f2 при поддержке
 * СВОЕГО СЛОНА) оказался у 3 749 — 30,4%. Остальные две трети — ферзь при
 * поддержке коня, мат слоном, ферзь без поддержки. То есть упражнение «на
 * скорость узнавания заученного узора» в двух случаях из трёх показывало
 * незнакомую позицию.
 *
 * Причина промаха названа точно: тема `attackingF2F7` описана у Lichess как
 * «атака на ПЕШКУ f2/f7». Она не стоит НИ У ОДНОЙ задачи, где ферзь матует на
 * уже пустое поле, и покрывает 41,6% узора. Отбор по теме потерял 12 678
 * настоящих детских матов из 16 427.
 *
 * Теперь пул отбирается ДВИЖКОМ по узору — `chess-scholars-mate/scan_pattern_m1.py`
 * и `scan_sacrifice.py` + `scan_sacrifice_pattern.py`. Здесь только упаковка.
 *
 * ⚠️ ФОРМАТ LICHESS: в `moves` ПЕРВЫЙ ХОД — ХОД СОПЕРНИКА. Его надо сыграть из
 * `fen`, и только потом спрашивать решение. Позиция, показанная человеку, — это
 * НЕ `fen` из файла. Первый ход сохраняется полем `p` (пре-ход).
 *
 * ЗАПУСК: node scripts/build-scholars-mate.mjs
 * ПИШЕТ:  src/games/scholars-mate/data/puzzles.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Chess } from 'chess.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = join(HERE, '..');
const ИСХ = join(FRONT, '..', 'chess-scholars-mate');

function читать(имя) {
  const p = join(ИСХ, имя);
  if (!existsSync(p)) {
    console.log(`🔴 нет исходника ${p}`);
    console.log('   Их готовят scan_pattern_m1.py / scan_sacrifice.py — см. README рядом.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

const свои = читать('scholars_mate_generated.json');
const узор = читать('lichess_scholar_pattern_m1.json').puzzles;
const жертвы = читать('lichess_sacrifice_scholar.json').puzzles;

/** Ход uci на доске. Возвращает объект хода chess.js или null. */
function сыграть(g, uci) {
  try {
    return g.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci[4] } : {}),
    });
  } catch { return null; }
}

/**
 * 🔴 SAN СЧИТАЕТСЯ ЗДЕСЬ, А НЕ ОСТАЁТСЯ ПУСТЫМ.
 *
 * 📍 В VER 1 поле `n` заполнялось только у своих позиций: 12 630 записей из
 * 14 482 (87%) приезжали без него. На уровнях 11–40 это 100% позиций, и после
 * ошибки человек видел голый «✕» — без ответа, который он не нашёл. Упражнение
 * на узнавание, которое не показывает узор после промаха, не учит ничему.
 */
function записьИзLichess(z, { линия = false } = {}) {
  const ходы = Array.isArray(z.moves) ? z.moves : z.moves.split(' ');
  const g = new Chess(z.fen);
  if (!сыграть(g, ходы[0])) return null;               // битая запись — выбрасываем
  const san = [];
  const остаток = ходы.slice(1);
  for (const uci of остаток) {
    const ход = сыграть(g, uci);
    if (!ход) return null;
    san.push(ход.san);
  }
  if (!g.isCheckmate()) return null;                    // линия обязана матовать
  const запись = {
    f: z.fen,
    p: ходы[0],
    s: [остаток[0]],
    n: [san[0]],
    d: линия ? (z.mateIn ?? Math.ceil(остаток.length / 2)) : 1,
    r: z.rating,
  };
  if (линия) {
    запись.a = остаток;
    запись.n = san;                                     // весь путь, а не только первый ход
    запись.o = z.opening ? 1 : 0;
    запись.u = z.url;
  }
  return запись;
}

const мат = свои.mate.map((x) => ({ f: x.fen, s: x.solutions, n: x.solutions_san, d: 1, r: 0 }));
const защита = свои.defend.map((x) => ({ f: x.fen, s: x.solutions, n: x.solutions_san, r: 0 }));

/**
 * 🔴 «ГРОЗИТ ЛИ» БОЛЬШЕ НЕ БЕРЁТ ПОЗИЦИИ ИЗ «ЗАЩИТИСЬ».
 *
 * 📍 В VER 1 все 378 позиций с ответом «да» были ТЕМИ ЖЕ позициями, что в
 * блоке «защитись» — совпадение по FEN 378 из 378. Генератор копил в `threat`
 * только «нет», а «да» дописывались копией `defend`. Два блока показывали одни
 * и те же доски, а на уровнях 21–30, где оба вида в одной колоде, позиция
 * попадала в подход ДВАЖДЫ (замер: 8 случаев на 200 подходов).
 *
 * Теперь «да» берутся из пула узора: позиция ДО пре-хода — это ход
 * защищающегося, и если у соперника там уже есть мат в один, значит мат
 * ГРОЗИТ. Проверяется нулевым ходом, тем же способом, что и в игре.
 */
function грозитЛи(fen) {
  const части = fen.split(' ');
  части[1] = части[1] === 'w' ? 'b' : 'w';
  части[3] = '-';
  try {
    const g = new Chess(части.join(' '));
    for (const m of g.moves({ verbose: true })) {
      const t = new Chess(части.join(' '));
      try { t.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) }); } catch { continue; }
      if (t.isCheckmate()) return true;
    }
  } catch { return false; }
  return false;
}

/**
 * 🔴 «НЕТ» ОБЯЗАНО ВЫГЛЯДЕТЬ КАК «ДА».
 *
 * 📍 ЗАМЕР 05.09.2026. Блок «грозит ли мат» решался ПОВЕРХНОСТНЫМ ПРИЗНАКОМ:
 * «ферзь и слон соперника бьют моё f7/f2» давало 656 верных ответов из 756
 * (87%) вообще без счёта. Признак сам по себе правильный — это и есть узор, —
 * но если он решает задачу, то оставшегося (поле защищено, диагональ перекрыта,
 * королю есть куда уйти) человек не увидит НИКОГДА.
 *
 * Поэтому «нет» набирается из позиций, где ГЕОМЕТРИЯ ЕСТЬ, а мата нет: ферзь и
 * слон целятся в f7/f2, и всё равно ответ отрицательный. На таких признак
 * ошибается, и остаётся только посчитать.
 */
function целятсяВПоле(fen) {
  const части = fen.split(' ');
  const я = части[1] === 'w' ? 'w' : 'b';
  const соперник = я === 'w' ? 'b' : 'w';
  const цель = соперник === 'w' ? 'f7' : 'f2';
  части[1] = соперник;
  части[3] = '-';
  try {
    const g = new Chess(части.join(' '));
    let ферзь = false; let слон = false;
    for (const m of g.moves({ verbose: true })) {
      if (m.to !== цель) continue;
      if (m.piece === 'q') ферзь = true;
      if (m.piece === 'b') слон = true;
    }
    return ферзь && слон;
  } catch { return false; }
}

const узорЗаписи = [];
const угрозаДа = [];
const угрозаНетТрудные = [];
for (const z of узор) {
  const запись = записьИзLichess(z);
  if (!запись) continue;
  узорЗаписи.push(запись);
  if (new Chess(z.fen).inCheck()) continue;              // уже шах — вопрос теряет смысл
  const грозит = грозитЛи(z.fen);
  if (грозит && угрозаДа.length < 1500) {
    угрозаДа.push({ f: z.fen, t: true, r: z.rating });
  } else if (!грозит && угрозаНетТрудные.length < 1500 && целятсяВПоле(z.fen)) {
    // Геометрия узора на доске есть, а мата нет — ровно то, чему надо учить.
    угрозаНетТрудные.push({ f: z.fen, t: false, r: z.rating });
  }
}

/** Простые «нет» из своего генератора — на случай, если трудных не набралось. */
const угрозаНетПростые = свои.threat.filter((x) => !x.threat).map((x) => ({ f: x.fen, t: false, r: 0 }));
const угрозаНет = [...угрозаНетТрудные, ...угрозаНетПростые];
/** Поровну «да» и «нет»: перекос делает угадывание выгодным. */
const поровну = Math.min(угрозаДа.length, угрозаНет.length);
const угроза = [...угрозаДа.slice(0, поровну), ...угрозаНет.slice(0, поровну)];

const сЖертвой = жертвы.map((z) => записьИзLichess(z, { линия: true })).filter(Boolean);

const итог = {
  _источник: 'Lichess puzzle DB (CC0) + свой генератор на python-chess',
  _лицензия: 'Lichess CC0; сгенерированные позиции — наши',
  _отбор: 'узор проверен движком: ферзь матует на f7/f2 при поддержке своего слона',
  _собрано: new Date().toISOString().slice(0, 10),
  mate: мат,
  defend: защита,
  threat: угроза,
  fromGames: узорЗаписи,
  sacrifice: сЖертвой,
};

const куда = join(FRONT, 'src/games/scholars-mate/data');
mkdirSync(куда, { recursive: true });
const файл = join(куда, 'puzzles.json');
writeFileSync(файл, JSON.stringify(итог));
const кб = Math.round(readFileSync(файл).length / 1024);

console.log(`записано: ${файл} (${кб} КБ)`);
console.log(`  мат в 1 (свои):        ${мат.length}`);
console.log(`  защитись:              ${защита.length}`);
console.log(`  грозит ли:             ${угроза.length} (да ${поровну}, нет ${поровну}; из них трудных «нет» ${Math.min(поровну, угрозаНетТрудные.length)})`);
console.log(`  узор из партий:        ${узорЗаписи.length}, рейтинг ${Math.min(...узорЗаписи.map((x) => x.r))}…${Math.max(...узорЗаписи.map((x) => x.r))}`);
console.log(`  с жертвой:             ${сЖертвой.length} (мат в 2 — ${сЖертвой.filter((x) => x.d === 2).length}, в 3 — ${сЖертвой.filter((x) => x.d === 3).length})`);
const безSAN = [...узорЗаписи, ...сЖертвой].filter((x) => !x.n || !x.n.length).length;
console.log(`  без разбора ошибки:    ${безSAN} (было 12 630)`);
