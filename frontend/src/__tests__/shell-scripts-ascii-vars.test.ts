/**
 * 🔴 ИМЕНА ПЕРЕМЕННЫХ В SHELL-СКРИПТАХ — ТОЛЬКО ЛАТИНИЦЕЙ.
 *
 * На маке скрипты запускаются в zsh, и кириллическое имя переменной работает.
 * В CI — bash, и он такое имя переменной НЕ признаёт: строка `РАБОЧАЯ="$X"`
 * выполняется как команда, падает с «No such file or directory», а сборка встаёт
 * на ровном месте.
 *
 * Поймано 02.09.2026 на первой же пятиплатформенной сборке: `ios-signing-setup.sh`
 * прошёл локально и упал в CI. Урок был записан в памяти раньше — и всё равно
 * повторён, ровно потому что локальная проверка ничего не заметила.
 *
 * ⚠️ Комментарии и текст сообщений кириллицу содержать МОГУТ и должны: правило
 * про имена, а не про язык объяснений.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const СКРИПТЫ = path.join(__dirname, '../../../scripts');

/** Строки кода без комментариев: только там имена переменных имеют значение. */
function кодовыеСтроки(src: string): { n: number; text: string }[] {
  return src.split('\n')
    .map((text: string, i: number) => ({ n: i + 1, text }))
    .filter(({ text }) => !/^\s*#/.test(text) && text.trim().length > 0);
}

/**
 * 🔴 БОЛЬШЕ ВСЕГО BASH ЛЕЖИТ НЕ В `.sh`, А В `run:` КОНВЕЙЕРА — И ГЕЙТ ТУДА НЕ СМОТРЕЛ.
 *
 * Проверка родилась после падения `ios-signing-setup.sh` и охватывала только файлы
 * с расширением `.sh`. 02.09.2026 я, дописывая повтор сборки Android, написал
 * `for заход in 1 2 3` прямо в `build.yml` — то есть повторил тот же дефект в
 * ЕДИНСТВЕННОМ месте, куда гейт не заглядывает. Он честно позеленел.
 *
 * Правило про bash, а не про расширение файла. Блоки `run:` из workflow читаем так
 * же, как скрипты.
 */
function строкиRun(yml: string): { n: number; text: string }[] {
  const out: { n: number; text: string }[] = [];
  const lines = yml.split('\n');
  let вRun = false;
  let отступ = 0;
  lines.forEach((text, i) => {
    const m = /^(\s*)(- )?run:\s*\|?\s*$/.exec(text);
    if (m) { вRun = true; отступ = m[1].length; return; }
    if (/^\s*(- )?run:\s*\S/.test(text)) { out.push({ n: i + 1, text }); вRun = false; return; }
    if (!вRun) return;
    if (text.trim() && (text.length - text.trimStart().length) <= отступ) { вRun = false; return; }
    if (text.trim() && !/^\s*#/.test(text)) out.push({ n: i + 1, text });
  });
  return out;
}

describe('shell-скрипты переживают bash', () => {
  const файлы: string[] = fs.existsSync(СКРИПТЫ)
    ? fs.readdirSync(СКРИПТЫ).filter((f: string) => f.endsWith('.sh'))
    : [];
  const WORKFLOWS = path.join(__dirname, '../../../.github/workflows');
  const конвейеры: string[] = fs.existsSync(WORKFLOWS)
    ? fs.readdirSync(WORKFLOWS).filter((f: string) => f.endsWith('.yml') || f.endsWith('.yaml'))
    : [];

  it('есть что проверять: shell-скрипты в проекте есть', () => {
    expect(файлы.length).toBeGreaterThan(0);
  });

  it('есть что проверять: блоки run: в конвейере читаются', () => {
    const всего = конвейеры.reduce(
      (n, f) => n + строкиRun(fs.readFileSync(path.join(WORKFLOWS, f), 'utf8') as string).length, 0);
    expect(`строк run: ${всего > 100}`).toBe('строк run: true');
  });

  it('🔴 ни одного имени переменной кириллицей в блоках run: конвейера', () => {
    const плохо: string[] = [];
    for (const f of конвейеры) {
      const yml = fs.readFileSync(path.join(WORKFLOWS, f), 'utf8') as string;
      for (const { n, text } of строкиRun(yml)) {
        if (/(^|\s|\$\{?)[A-Za-z_]*[А-Яа-яЁё][A-Za-z_А-Яа-яЁё0-9]*\s*=/.test(text)
            || /\$\{?[А-Яа-яЁё]/.test(text)
            || /\bfor\s+[А-Яа-яЁё]/.test(text)) {
          плохо.push(`${f}:${n} — ${text.trim().slice(0, 60)}`);
        }
      }
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 ни одного имени переменной кириллицей', () => {
    const плохо: string[] = [];
    for (const f of файлы) {
      const src = fs.readFileSync(path.join(СКРИПТЫ, f), 'utf8') as string;
      for (const { n, text } of кодовыеСтроки(src)) {
        // присваивание: ИМЯ=… либо ${ИМЯ} / $ИМЯ с кириллицей в имени
        if (/(^|\s|\$\{?)[A-Za-z_]*[А-Яа-яЁё][A-Za-z_А-Яа-яЁё0-9]*\s*=/.test(text)
            || /\$\{?[А-Яа-яЁё]/.test(text)
            // `for имя in …` — тоже имя переменной, и bash ломается так же
            || /\bfor\s+[А-Яа-яЁё]/.test(text)) {
          плохо.push(`${f}:${n} — ${text.trim().slice(0, 60)}`);
        }
      }
    }
    expect(плохо).toEqual([]);
  });

  it('каждый скрипт разбирается самим bash', () => {
    const { execFileSync } = require('child_process');
    const плохо: string[] = [];
    for (const f of файлы) {
      try {
        execFileSync('bash', ['-n', path.join(СКРИПТЫ, f)], { stdio: 'pipe' });
      } catch (e: any) {
        плохо.push(`${f}: ${String(e.stderr || e.message).slice(0, 120)}`);
      }
    }
    expect(плохо).toEqual([]);
  });
});
