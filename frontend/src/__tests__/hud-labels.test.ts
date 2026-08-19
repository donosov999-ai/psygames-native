/**
 * ЧЕЛОВЕК ДОЛЖЕН ВИДЕТЬ ТО, ПО ЧЕМУ ЕГО СУДЯТ.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ (аудит 19.08.2026, 61 игровой экран).
 *
 * 1. ЧИСЛА БЕЗ СЛОВ. В шапках висели «✗o5», «✗c3», «48t», «VE 34», «IT 21»,
 *    «R:3», «μ12», «+CD: 12», «Span 5», «Len 6» — и просто «12» без ничего.
 *    Подписаны словом полностью были 6 экранов из 61. Значок и латинская
 *    аббревиатура — это подпись для того, кто писал код, а не для того, кто
 *    играет: расшифровать «✗c» нельзя ниоткуда, в справке этого нет.
 *    Отдельно: «Span»/«Len»/«Card» — английские слова посреди русского
 *    интерфейса, мимо словаря, то есть и на остальных 10 языках тоже.
 *
 * 2. ПРЯМАЯ ЛОЖЬ. visual-search подписывал раунды ключом «Ур.»:
 *    `{t('label_level_short')} {round}/{trials} · {t('label_level_short')}{lvl}`
 *    На экране выходило «Ур. 3/12 · Ур.5» — два разных числа под одним словом.
 *
 * 3. НЕВИДИМЫЙ ЛИМИТ. В SET с 11-го уровня на расклад даётся
 *    max(8, 30−(L−10)·4) секунд: 26 c на L11, 10 c на L15. Не успел — ✗, а
 *    проход уровня решается ровно по числу ✗. В шапке при этом был только
 *    общий секундомер: он растёт, а сколько осталось на ТЕКУЩИЙ расклад — не
 *    было видно нигде. Человек терял уровень по часам, которых не видел.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ ПРОВЕРЯЕТ СМЫСЛ, А НЕ БУКВУ. В этом проекте уже трижды
 * обжигались на гейтах, требовавших дословный вызов конкретной функции: замена
 * механики на лучшую красила ПРАВИЛЬНУЮ правку в красный, гейт переставали
 * читать. Поэтому здесь не проверяется ни имя ключа, ни имя компонента, ни
 * способ вывода. Проверяется ровно одно наблюдаемое свойство:
 *
 *   у каждого ЧИСЛА в шапке рядом есть СЛОВО, и это слово взято из словаря.
 *
 * Подойдёт любой источник слова: `t('…')` в том же элементе, `label={…}` у
 * бейджа, соседний элемент-подпись (паттерн statBox), устаревший тернар по
 * языку (его вычищает отдельная правка — здесь он засчитывается, потому что
 * слово человек всё-таки видит). Сменишь HudBadge на что угодно другое —
 * гейт останется зелёным, пока слово на экране есть.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '../..');
const GAMES = join(ROOT, 'app/games');
const FILES: string[] = readdirSync(GAMES).filter((f: string) => f.endsWith('.tsx')).sort();

/** Единицы измерения и служебные обрывки — они не «подпись», но и не нарушение. */
const UNIT_KEYS = new Set(['secShort', 'msShort']);

// ─────────────────────────────────────────────────────────────────────────────
// Разбор шапки: вырезаем то, что уходит в проп `stats` каркаса GameShell.
// ─────────────────────────────────────────────────────────────────────────────

/** Убрать комментарии — иначе русский комментарий внутри шапки читается как подпись. */
function stripComments(s: string): string {
  return s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * Содержимое `stats={ … }` по балансу фигурных скобок. Экран может отдавать
 * шапку и через переменную (`stats={stats}`) — тогда берём весь файл: лишнего
 * поймать не боимся, потому что дальше смотрим только элементы шапки.
 */
function statsBlocks(src: string): string[] {
  const out: string[] = [];
  const re = /\bstats=\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    const body = src.slice(m.index + m[0].length, i - 1);
    // `stats={stats}` — шапка собрана выше по файлу отдельной переменной
    if (/^\s*[A-Za-z_$][\w$]*\s*$/.test(body)) {
      const name = body.trim();
      const v = new RegExp('const\\s+' + name + '\\s*=\\s*\\(([\\s\\S]*?)\\n\\s*\\);', 'm').exec(src);
      out.push(v ? v[1] : body);
    } else out.push(body);
  }
  return out;
}

/** Убрать все `{…}` вместе со вложенными — от внутренних наружу, до неподвижной точки. */
function stripBraces(s: string): string {
  let prev = '';
  let cur = s;
  while (cur !== prev) { prev = cur; cur = cur.replace(/\{[^{}]*\}/g, ' '); }
  return cur;
}

/**
 * Элементы шапки: каждый `<Text>…</Text>` и каждый самозакрывающийся тег
 * (`<HudBadge … />`). У элемента запоминаем ПУТЬ вложенности контейнеров — по
 * нему видно, лежит ли значение в одной коробке с подписью-соседом (паттерн
 * statBox: сверху слово, снизу число).
 */
interface Leaf { text: string; path: number[] }
function leaves(block: string): Leaf[] {
  const flat = stripComments(block);
  const out: Leaf[] = [];
  let group = 0;
  const stack: number[] = [];
  const re = /<(\/?)([A-Z][\w.]*)((?:[^<>{]|\{(?:[^{}]|\{[^{}]*\})*\})*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    const [, closing, tag, attrs, selfClose] = m;
    if (closing) { stack.pop(); continue; }
    if (selfClose) { out.push({ text: m[0], path: [...stack] }); continue; }
    if (tag === 'Text') {
      const end = flat.indexOf('</Text>', re.lastIndex);
      const body = end < 0 ? '' : flat.slice(re.lastIndex, end);
      out.push({ text: '<' + tag + attrs + '>' + body, path: [...stack] });
      if (end >= 0) re.lastIndex = end + '</Text>'.length;
      continue;
    }
    stack.push(++group);
  }
  return out;
}

/** Тело элемента без открывающего тега (у самозакрывающихся — только проп `value`). */
function bodyOf(leaf: string): string {
  const head = /^<[A-Z][\w.]*((?:[^<>{]|\{(?:[^{}]|\{[^{}]*\})*\})*?)(\/?)>/.exec(leaf);
  if (!head) return leaf;
  if (head[2] === '/') {
    const v = /\bvalue=(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|`[^`]*`)/.exec(head[1]);
    return v ? v[1] : '';
  }
  return leaf.slice(head[0].length);
}

/** Вызовы словаря убираем — они подпись, а не значение. Ключ бывает и вычисляемым. */
function stripDict(s: string): string {
  return s.replace(/\bt\((?:[^()]|\([^()]*\))*\)/g, ' ');
}

/**
 * Рисует ли элемент ЗНАЧЕНИЕ — то есть подставляет что-то из кода.
 * ⚠️ Скобки, опустевшие после выноса словаря (`{t('round')}` → `{ }`), значением
 * НЕ считаются: иначе элемент-подпись выглядел бы как число и не засчитывался
 * подписью соседу — на этом проверка ложно краснела на шести экранах.
 */
function hasValue(leaf: string): boolean {
  const inner = stripDict(bodyOf(leaf)).replace(/\{[\s:·—-]*\}/g, ' ');
  return /\{/.test(inner) || /\$\{/.test(inner);
}

/** Есть ли у элемента СЛОВО и откуда оно взято. */
function wordSource(leaf: string): 'dict' | 'ternary' | null {
  if (/\bt\((?:[^()]|\([^()]*\))*\)/.test(leaf)) {
    const keys = [...leaf.matchAll(/\bt\('([^']+)'\)/g)].map((m) => m[1]);
    const dynamic = /\bt\(\s*[^'\s)]/.test(leaf);        // t(tech.nameKey) — ключ вычисляется
    if (dynamic || keys.some((k) => !UNIT_KEYS.has(k))) return 'dict';
  }
  // устаревший тернар по языку: слово человек видит, но мимо словаря
  if (/language\s*===\s*'[a-z]{2}'\s*\?\s*'[^']*[A-Za-zА-Яа-яЁё]/.test(leaf)) return 'ternary';
  if (/\bru\s*\?\s*'[^']*[A-Za-zА-Яа-яЁё]/.test(leaf)) return 'ternary';
  return null;
}

/** Слова-литералы мимо словаря: «Span 5», «Card 3/12», «+CD: 12», «VE 34». */
function rawWords(leaf: string): string[] {
  const body = stripBraces(bodyOf(leaf));
  return [...body.matchAll(/[A-Za-z]{2,}/g)].map((m) => m[0]);
}

/**
 * Лежит ли элемент в одной «коробке» с подписью-соседом. Коробка — контейнер
 * ВНУТРИ шапки, а не сама шапка: иначе одно случайное слово в ряду засчиталось
 * бы подписью сразу ко всем числам.
 */
function sameBox(a: number[], b: number[]): boolean {
  return a.length > 1 && b.length > 1 && a[1] === b[1];
}

/**
 * ДОЛГ: элементы шапки, у которых числа всё ещё без слова, — поимённо и с
 * причиной. Список закрыт: новые сюда не дописываются. Пусто — и хорошо.
 */
const DEBT: Record<string, string> = {};

/** Экраны, где шапку сейчас держат другие правки. Их числа проверяем отдельно. */
const BUSY: Record<string, string> = {
  'sudoku.tsx': 'занят соседней правкой (режимы и подсказки судоку)',
  'sudoku-samurai.tsx': 'занят соседней правкой (самурай)',
  'sudoku-fractal.tsx': 'занят соседней правкой (фрактал)',
  'mahjong.tsx': 'занят соседней правкой (маджонг)',
  'picture-pairs.tsx': 'занят соседней правкой (пары картинок)',
  'goods-sort.tsx': 'занят соседней правкой (сортировка товаров)',
};

describe('подписи чисел в шапке игры', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FILES.length).toBeGreaterThan(50);
    expect(existsSync(join(ROOT, 'src/components/GameShell.tsx'))).toBe(true);
    // хотя бы у половины экранов шапка вообще разбирается — защита от поломки парсера
    const parsed = FILES.filter((f) => leaves(statsBlocks(readFileSync(join(GAMES, f), 'utf8')).join('\n')).length > 0);
    expect(parsed.length).toBeGreaterThan(30);
  });

  it('🔴 у каждого числа в шапке есть слово рядом', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      if (BUSY[f]) continue;
      const src = readFileSync(join(GAMES, f), 'utf8') as string;
      const all = leaves(statsBlocks(src).join('\n'));
      for (const leaf of all) {
        if (!hasValue(leaf.text)) continue;
        if (wordSource(leaf.text)) continue;
        // паттерн statBox: подпись отдельным элементом в той же коробке
        const sibling = all.some((o) => o !== leaf && sameBox(o.path, leaf.path)
          && !hasValue(o.text) && wordSource(o.text) === 'dict');
        if (sibling) continue;
        const key = `${f} :: ${leaf.text.replace(/\s+/g, ' ').trim().slice(0, 70)}`;
        if (DEBT[key]) continue;
        bad.push(key);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 подписи в шапке идут из словаря, а не английским словом в вёрстке', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      if (BUSY[f]) continue;
      const src = readFileSync(join(GAMES, f), 'utf8') as string;
      for (const leaf of leaves(statsBlocks(src).join('\n'))) {
        const words = rawWords(leaf.text).filter((w) => !/^(Text|View|style|color|colors|flex|row|center|true|false|px|back)$/i.test(w));
        if (words.length) bad.push(`${f}: «${words.join(' ')}» — слово мимо словаря, на 10 языках останется английским`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('долг не протух: каждая запись существует и всё ещё без подписи', () => {
    const live = new Set<string>();
    for (const f of FILES) {
      const src = readFileSync(join(GAMES, f), 'utf8') as string;
      const all = leaves(statsBlocks(src).join('\n'));
      for (const leaf of all) {
        if (!hasValue(leaf.text) || wordSource(leaf.text)) continue;
        if (all.some((o) => o !== leaf && sameBox(o.path, leaf.path)
          && !hasValue(o.text) && wordSource(o.text) === 'dict')) continue;
        live.add(`${f} :: ${leaf.text.replace(/\s+/g, ' ').trim().slice(0, 70)}`);
      }
    }
    const stale = Object.keys(DEBT).filter((k) => !live.has(k)).map((k) => `${k} — уже подписано, убрать из списка`);
    expect(stale).toEqual([]);
  });

  it('список занятых экранов не протух и объяснён', () => {
    for (const [f, why] of Object.entries(BUSY)) {
      expect(FILES).toContain(f);
      expect(why.length).toBeGreaterThan(15);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Невидимые часы: за что штрафуют — то и должно быть видно.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Экраны, где время на ход ограничено. Найдены сплошным сканом по имени
 * ограничителя (см. проверку «список не отстал»), классифицированы вручную:
 *
 *  'countdown'  — лимит длинный, по нему можно ПРИНЯТЬ РЕШЕНИЕ (успею/меняю
 *                 тактику). Остаток обязан быть на экране.
 *  'reaction'   — окно реакции ≤ 3.5 с и сжимается до ~1 с. Бегущая цифра там
 *                 не помогает, а отбирает то самое внимание, которое и меряют;
 *                 правило объявлено текстом на экране настройки уровня.
 */
const LIMITS: Record<string, { kind: 'countdown' | 'reaction'; why: string }> = {
  'anagrams.tsx': { kind: 'countdown', why: 'секунды на слово' },
  'cloze.tsx': { kind: 'countdown', why: 'секунды на пропуск в тексте' },
  'counter.tsx': { kind: 'countdown', why: 'секунды на набор суммы' },
  'number-bonds.tsx': { kind: 'countdown', why: 'секунды на пару чисел' },
  'proofreading.tsx': { kind: 'countdown', why: 'лимит на всю таблицу, десятки секунд' },
  'set-game.tsx': { kind: 'countdown', why: 'с L11 — 26 с на расклад, к L15 сжимается до 10 с' },
  'trail-making.tsx': { kind: 'countdown', why: 'лимит на всю дорожку' },
  'word-pairs.tsx': { kind: 'countdown', why: 'лимит на фазу запоминания' },
  'ant.tsx': { kind: 'reaction', why: 'окно ответа 3000→1040 мс' },
  'choice-rt.tsx': { kind: 'reaction', why: 'окно ответа 2000→750 мс' },
  'flanker.tsx': { kind: 'reaction', why: 'окно ответа 3000→1000 мс' },
  'go-no-go.tsx': { kind: 'reaction', why: 'окно ответа 1100→550 мс' },
  'lexical-decision.tsx': { kind: 'reaction', why: 'окно ответа 3000→1100 мс' },
  'posner.tsx': { kind: 'reaction', why: 'окно ответа 2200→900 мс' },
  'simon.tsx': { kind: 'reaction', why: 'окно ответа 2600→920 мс' },
  'stroop.tsx': { kind: 'reaction', why: 'окно ответа 3500→1200 мс' },
  'stroop-emotional.tsx': { kind: 'reaction', why: 'окно ответа как у обычного струпа' },
  'switching-task.tsx': { kind: 'reaction', why: 'окно ответа 3400→1400 мс' },
};

/** Имена, которыми в этом проекте зовут ограничитель времени на ход. */
const LIMIT_RE = /\b(timeLimit|windowMs|wordSec|roundSec|limitMs|roundLimit|perRound|deadline)[A-Za-z]*\b/;

/**
 * Остаток времени на экране. Признак — не конкретная переменная и не конкретный
 * компонент (их меняют), а СМЫСЛ: в шапке есть значение, подписанное словом
 * «осталось», либо значение вида «прошло/лимит».
 */
function showsRemaining(src: string): boolean {
  const head = statsBlocks(src).join('\n');
  if (/t\('timeLeftLabel'\)/.test(head)) return true;                 // подпись «Осталось»
  if (/\/\$?\{?\s*timeLimit/.test(head)) return true;                     // «12.3/40 c» — лимит виден рядом
  return false;
}

describe('невидимых часов не бывает', () => {
  it('🔴 где штрафуют за время на ход — там виден остаток', () => {
    const bad: string[] = [];
    for (const [f, v] of Object.entries(LIMITS)) {
      if (v.kind !== 'countdown') continue;
      const src = readFileSync(join(GAMES, f), 'utf8') as string;
      if (!showsRemaining(src)) bad.push(`${f}: лимит есть (${v.why}), остатка в шапке нет`);
    }
    expect(bad).toEqual([]);
  });

  it('список ограничителей не отстал от кода: новых лимитов без разбора нет', () => {
    const missing: string[] = [];
    for (const f of FILES) {
      if (LIMITS[f] || BUSY[f]) continue;
      const src = readFileSync(join(GAMES, f), 'utf8') as string;
      const code = stripComments(src);
      if (LIMIT_RE.test(code)) missing.push(`${f}: появился лимит времени — реши, countdown это или reaction, и впиши в LIMITS`);
    }
    expect(missing).toEqual([]);
  });

  it('каждая запись про лимит жива и объяснена', () => {
    const stale: string[] = [];
    for (const [f, v] of Object.entries(LIMITS)) {
      if (!FILES.includes(f)) { stale.push(`${f}: файла нет`); continue; }
      const code = stripComments(readFileSync(join(GAMES, f), 'utf8') as string);
      if (!LIMIT_RE.test(code)) stale.push(`${f}: лимита времени больше нет — убрать из LIMITS`);
      if (v.why.length < 10) stale.push(`${f}: причина не написана`);
    }
    expect(stale).toEqual([]);
  });

  it('короткие окна реакции — действительно короткие, а не отговорка', () => {
    // Если окно выросло до «подумать» (≥5 с), молчаливое исключение перестаёт
    // быть честным: такой лимит обязан быть виден, как в SET.
    const bad: string[] = [];
    for (const [f, v] of Object.entries(LIMITS)) {
      if (v.kind !== 'reaction') continue;
      const src = readFileSync(join(GAMES, f), 'utf8') as string;
      const nums = [...src.matchAll(/windowMs\s*[:=]\s*Math\.max\((\d+)\s*,\s*(\d+)/g)];
      for (const m of nums) {
        const maxWindowMs = Number(m[2]);
        if (maxWindowMs >= 5000) bad.push(`${f}: окно ${maxWindowMs} мс — это уже «подумать», остаток надо показывать`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Прямая ложь: одно слово над двумя разными числами.
// ─────────────────────────────────────────────────────────────────────────────

describe('подпись не врёт', () => {
  it('🔴 два разных числа в одной строке не подписаны одним и тем же словом', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      if (BUSY[f]) continue;
      const src = readFileSync(join(GAMES, f), 'utf8') as string;
      for (const leaf of leaves(statsBlocks(src).join('\n'))) {
        const keys = [...leaf.text.matchAll(/\bt\('([^']+)'\)/g)].map((m) => m[1]).filter((k) => !UNIT_KEYS.has(k));
        const seen = new Set<string>();
        for (const k of keys) {
          if (seen.has(k)) {
            bad.push(`${f}: «${k}» подписывает два разных числа в одной строке — ${leaf.text.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
            break;
          }
          seen.add(k);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
