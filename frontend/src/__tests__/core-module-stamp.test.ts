/**
 * ШТАМП РЕДАКЦИИ НА ЯДРАХ УПРАЖНЕНИЙ — `src/games/**`.
 *
 * ЗАЧЕМ. Правило Дениса §10 (PROJECT_REF_RULES.md, 16.08.2026): у модуля первой
 * строкой редакция и дата, иначе сличать нечем — «только дату создания файла
 * видно», а она врёт после rsync и checkout.
 *
 * 🔴 ПОЧЕМУ ОТДЕЛЬНЫЙ ГЕЙТ, ЕСЛИ ЕСТЬ `game-version-stamp`. Тот держит ЭКРАНЫ
 * (`app/games/*.tsx`) — их 73 и все подписаны. Ядра он не видит вовсе, и там
 * было подписано 69 из 147. Разрыв дорогой: жалоба тестировщика привязывается к
 * редакции экрана, а поведение, на которое жалуются, чаще живёт в ядре —
 * генератор судоку и раскладчик маджонга это ядра, экран их только рисует.
 *
 * ⚠️ ИМЯ В ШТАМПЕ СВЕРЯЕТСЯ С ПАПКОЙ, А НЕ С ИМЕНЕМ ФАЙЛА. У экранов гейт требует
 * точного совпадения с именем файла, здесь так нельзя: исторические ярлыки
 * осмысленно подробнее пути (`psygames-proofreading-series-blocks`,
 * `psygames-mahjong-vendor-boards`). Переписать их «ровнее» — стереть сведения.
 * Поэтому требование одно и проверяемое: ярлык начинается с имени СВОЕЙ игры.
 * Файл, перенесённый в чужую папку со старым штампом, краснеет.
 *
 * ⚠️ ДАТА НЕ СВЕРЯЕТСЯ С GIT. У части штампов дата — день выпуска редакции в
 * лаборатории игр, а не день коммита (так же рассуждает гейт экранов). Проверяем
 * форму и календарную осмысленность: несуществующих чисел и будущего быть не может.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const GAMES_ROOT = path.resolve(__dirname, '../games');

/** Ровно первая строка. Всё ниже штампом не считается — иначе засчитается ссылка в описании. */
const STAMP = /^\/\* (psygames-[a-z0-9-]+) · VER (\d+) · (\d{2})\.(\d{2})\.(\d{4}) \*\/$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(GAMES_ROOT).sort();

/** Папка игры: `src/games/<игра>/...`. */
const gameOf = (abs: string) => path.relative(GAMES_ROOT, abs).split(path.sep)[0];

describe('штамп редакции на ядрах упражнений', () => {
  it('ядер найдено достаточно — гейт не проверяет пустоту', () => {
    expect(files.length).toBeGreaterThan(120);
  });

  it('у каждого ядра штамп стоит ПЕРВОЙ строкой и по форме', () => {
    const bad: string[] = [];
    for (const abs of files) {
      const first = fs.readFileSync(abs, 'utf8').split('\n')[0].trim();
      if (!STAMP.test(first)) bad.push(`${path.relative(GAMES_ROOT, abs)} → «${first.slice(0, 60)}»`);
    }
    expect(bad).toEqual([]);
  });

  it('ярлык в штампе начинается с имени своей игры', () => {
    const bad: string[] = [];
    for (const abs of files) {
      const m = STAMP.exec(fs.readFileSync(abs, 'utf8').split('\n')[0].trim());
      if (!m) continue;                       // форму проверяет соседний случай
      const game = gameOf(abs);
      if (!m[1].startsWith(`psygames-${game}-`)) {
        bad.push(`${path.relative(GAMES_ROOT, abs)}: ярлык ${m[1]}, а игра «${game}»`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('дата существует в календаре и не из будущего', () => {
    const bad: string[] = [];
    const сейчас = new Date();
    for (const abs of files) {
      const m = STAMP.exec(fs.readFileSync(abs, 'utf8').split('\n')[0].trim());
      if (!m) continue;
      const [, , , dd, mm, yyyy] = m;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      const реальная = d.getDate() === Number(dd) && d.getMonth() === Number(mm) - 1;
      if (!реальная) bad.push(`${path.relative(GAMES_ROOT, abs)}: ${dd}.${mm}.${yyyy} — такого дня нет`);
      else if (d.getTime() > сейчас.getTime() + 86400e3) {
        bad.push(`${path.relative(GAMES_ROOT, abs)}: ${dd}.${mm}.${yyyy} — из будущего`);
      }
    }
    expect(bad).toEqual([]);
  });
});
