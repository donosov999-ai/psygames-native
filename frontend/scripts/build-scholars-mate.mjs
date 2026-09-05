#!/usr/bin/env node
/**
 * Собрать набор позиций «Детский мат» из двух источников в один компактный файл.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ СБОРЩИК. Исходники лежат вне репозитория и весят мегабайты:
 * `lichess_f7_opening_mates.json` — 4,2 МБ на 14 217 задач, столько в сборку не
 * кладут. Здесь из них берётся лестница, поля ужимаются до односимвольных, и
 * получается файл, который не жалко везти в приложение.
 *
 * ⚠️ ФОРМАТ LICHESS: в `moves` ПЕРВЫЙ ХОД — ХОД СОПЕРНИКА. Его надо сыграть из
 * `fen`, и только потом спрашивать решение. Позиция, показанная человеку, — это
 * НЕ `fen` из файла. Здесь первый ход не отбрасывается, а сохраняется отдельным
 * полем `p` (пре-ход): разыграть его должен движок, у которого есть chess.js.
 *
 * ИСТОЧНИКИ (готовит соседний чат, скрипт `gen_scholars_mate.py`):
 *   ~/Downloads/Code claude/psygames/chess-scholars-mate/scholars_mate_generated.json
 *   ~/Downloads/Code claude/psygames/chess-scholars-mate/lichess_f7_opening_mates.json
 *   /tmp/sacrifice_mates.json  (выборка «мат с жертвой», см. README раздела)
 *
 * ЗАПУСК: node scripts/build-scholars-mate.mjs
 * ПИШЕТ:  src/games/scholars-mate/data/puzzles.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = join(HERE, '..');
const ИСХ = join(homedir(), 'Downloads', 'Code claude', 'psygames', 'chess-scholars-mate');

/**
 * Сколько задач Lichess берём в сборку.
 *
 * ⚠️ НЕ «побольше». 14 217 задач — это 4 МБ; человек за всю жизнь решит из них
 * сотню. Берём ЛЕСТНИЦУ: ровный срез по рейтингу, чтобы сложность росла, а не
 * прыгала. 480 = 6 ступеней по 80.
 */
const СТУПЕНИ = [
  [0, 700], [700, 850], [850, 1000], [1000, 1200], [1200, 1500], [1500, 9999],
];
const НА_СТУПЕНЬ = 80;

function читать(имя) {
  const p = join(ИСХ, имя);
  if (!existsSync(p)) {
    console.log(`🔴 нет исходника ${p}`);
    console.log('   Их готовит gen_scholars_mate.py — см. README в той же папке.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

const свои = читать('scholars_mate_generated.json');
const личесс = читать('lichess_f7_opening_mates.json');
/**
 * 🔴 ИСХОДНИК ЖЕРТВ ЛЕЖИТ В РЕПОЗИТОРИИ, А НЕ В /tmp.
 *
 * До 05.09.2026 он читался из `/tmp/sacrifice_mates.json`, и это была тихая
 * мина: `/tmp` вычищается сам, `existsSync` возвращал false, сборка молча
 * писала ПУСТОЙ раздел `sacrifice` — и «мат с жертвой», ради которого весь
 * верх лестницы, исчезал из приложения без единого сообщения об ошибке.
 * Теперь файл рядом с остальными исходниками, а его отсутствие — отказ.
 */
const жертвы = читать('sacrifice_mates.json');

/** Ровный срез по ступени рейтинга: берём каждую k-ю, а не первые N подряд. */
function срез(список, сколько) {
  if (список.length <= сколько) return список;
  const шаг = список.length / сколько;
  return Array.from({ length: сколько }, (_, i) => список[Math.floor(i * шаг)]);
}

const лестница = [];
for (const [низ, верх] of СТУПЕНИ) {
  const в = личесс.puzzles
    .filter((x) => x.rating > низ && x.rating <= верх && / mateIn1( |$)|^mateIn1 /.test(` ${x.themes} `))
    .sort((a, b) => a.rating - b.rating);
  лестница.push(...срез(в, НА_СТУПЕНЬ));
}

/**
 * Компактная запись. Однобуквенные поля — не «экономия на спичках»: на трёх
 * тысячах позиций разница между `solutions` и `s` это сотни килобайт в сборке
 * приложения, которое ставят на телефон.
 *
 *   f — FEN позиции ДО пре-хода
 *   p — пре-ход соперника (uci), которого нет у своих позиций
 *   s — решения (uci); у `threat` пусто
 *   n — решения в записи SAN, для показа «лучшего»
 *   r — рейтинг Lichess, ось трудности
 *   d — мат в N ходов
 *   t — ответ да/нет для `threat`
 *   u — ссылка на партию (источник, называем по правилу CC0)
 */
const мат = свои.mate.map((x) => ({ f: x.fen, s: x.solutions, n: x.solutions_san, d: 1, r: 0 }));
const защита = свои.defend.map((x) => ({ f: x.fen, s: x.solutions, n: x.solutions_san, r: 0 }));
const угроза = свои.threat.map((x) => ({ f: x.fen, t: !!x.threat, r: 0 }));

const изПартий = лестница.map((x) => {
  const ходы = x.moves.split(' ');
  return { f: x.fen, p: ходы[0], s: [ходы[1]], d: 1, r: x.rating, u: x.url };
});

/**
 * 🔴 ОТБОР ПО ПОЛЮ МАТА, А НЕ ПО СЛОВУ «ЖЕРТВА».
 *
 * 📍 ЗАМЕР 05.09.2026 по всем 434 позициям выборки: матуют на f7/f2 — 227
 * (52%), остальные 207 ставят мат на f8, f1, e6, g6 и далее, и 306 из 434
 * помечены как MIDDLEGAME, а не дебют. Это хорошие задачи, но это НЕ детский
 * мат: просьба Дениса была «детский мат с жертвой», то есть тот же узор —
 * жертвой вскрыть f7 и матовать ферзём, — а не «любой мат в 2–3 хода».
 *
 * Оставляем те, что кончаются на f7/f2: 227 позиций, мат в 2 — 199, мат в 3 —
 * 28, рейтинг 971…2384. Для верхних десяти ступеней по 8 позиций на подход
 * этого с запасом.
 */
const наПолеМата = (x) => x.moves[x.moves.length - 1].slice(2, 4);
const сЖертвой = жертвы
  .filter((x) => наПолеМата(x) === 'f7' || наПолеМата(x) === 'f2')
  .map((x) => ({
    f: x.fen,
    p: x.moves[0],
    s: [x.moves[1]],
    /** Полная последовательность: у мата в 2–3 хода за ответом идёт ответ соперника. */
    a: x.moves.slice(1),
    d: x.mateIn,
    r: x.rating,
    o: x.opening ? 1 : 0,
    u: x.url,
  }));

const итог = {
  _источник: 'Lichess puzzle DB (CC0) + свой генератор на python-chess',
  _лицензия: 'Lichess CC0; сгенерированные позиции — наши',
  _собрано: new Date().toISOString().slice(0, 10),
  mate: мат,
  defend: защита,
  threat: угроза,
  fromGames: изПартий,
  sacrifice: сЖертвой,
};

const куда = join(FRONT, 'src/games/scholars-mate/data');
mkdirSync(куда, { recursive: true });
const файл = join(куда, 'puzzles.json');
writeFileSync(файл, JSON.stringify(итог));
const кб = Math.round(readFileSync(файл).length / 1024);

console.log(`записано: ${файл} (${кб} КБ)`);
console.log(`  мат в 1 (свои):      ${мат.length}`);
console.log(`  защитись:            ${защита.length}`);
console.log(`  грозит ли:           ${угроза.length}`);
console.log(`  из партий (лестница): ${изПартий.length}, рейтинг ${изПартий[0]?.r}…${изПартий[изПартий.length - 1]?.r}`);
console.log(`  с жертвой:           ${сЖертвой.length}, из них дебютных ${сЖертвой.filter((x) => x.o).length}`);
if (!сЖертвой.length) console.log('  ⚠️ жертв нет: не найден /tmp/sacrifice_mates.json');
