/**
 * ТЕКСТ НА СПЛОШНОЙ ЗАЛИВКЕ ЦВЕТОМ ИГРЫ ОБЯЗАН ЧИТАТЬСЯ. СЧИТАЕТСЯ ФОРМУЛОЙ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ `on-gradient-contrast.test.ts`. Тот проверяет ГРАДИЕНТНЫЕ
 * плашки и только в `app/games/*.tsx`. Мимо него прошли два больших класса:
 *
 *  1. СПЛОШНЫЕ ЗАЛИВКИ — `backgroundColor: GRADIENT[0]` у выбранного чипа режима,
 *     выбранного уровня, кнопки, плашки таймера. Это не `<LinearGradient>`, и
 *     старый разбор их не видел. Замер 20.08.2026: 68 пар ниже AA 4.5, худшие —
 *     `#FFF` на `#fdc830` (choice-rt) 1.56, на `#f093fb` (word-pairs) 2.04,
 *     `#FFFFFF` на `#4facfe` (mnemonics) 2.42.
 *  2. ОБЩИЕ КОМПОНЕНТЫ — `LevelCleared`, `GameCard`, `GameModeSwitch` и прочие
 *     из `src/components`. Градиент им приходит ПРОПОМ, поэтому одна зашитая
 *     строка `#FFFFFF` в `LevelCleared` била по всем 71 игре разом: на
 *     `#ee9ca7→#ffdde1` заголовок в 26 pt давал 1.26 — белым по белому.
 *
 * ⚠️ ЭТА ПРОВЕРКА НЕ ИЩЕТ СТРОК В ИСХОДНИКЕ. Она вынимает заливку и цвет текста,
 * ВЫЧИСЛЯЕТ оба выражения (с настоящими модулями в области видимости) и считает
 * контраст по WCAG 2.2. Механизм можно заменить на любой другой: пока контраст
 * держится, проверка зелёная. Красной она станет от цифры, а не от переименования.
 *
 * ⚠️ КОММЕНТАРИИ СРЕЗАЮТСЯ ДО РАЗБОРА. Иначе `// вуаль #a8eceb @0.4` в шапке
 * spatial-span читается как объявление цвета, и проверка зеленеет от рассказа
 * о починке вместо самой починки.
 *
 * ⚠️ КОМПОНЕНТЫ С ГРАДИЕНТОМ-ПРОПОМ ПРОВЕРЯЮТСЯ НА ВСЕХ 71 ПАЛИТРАХ. Проверить
 * `LevelCleared` на одном градиенте — значит не проверить его: беда там ровно в
 * том, что светлые палитры ведут себя не так, как тёмные.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync, statSync } = require('fs');
const { join } = require('path');
import {
  contrastRatio, relativeLuminance, blend, onGradientText,
  AA_NORMAL as SERVICE_AA_NORMAL, AA_LARGE as SERVICE_AA_LARGE,
} from '@/src/services/onGradientText';

/**
 * ПЛАНКА ЗАДАНА ЗДЕСЬ, А НЕ ВЗЯТА У ПРОВЕРЯЕМОГО.
 * ⚠️ Первая редакция импортировала `AA_NORMAL` из того самого сервиса, который
 * проверяет. Поломка это вскрыла: `AA_NORMAL = 4.5 → 3.0` в сервисе — и проверка
 * молча опустилась вместе с ним, все 10 пунктов зелены. Проверка, берущая норму
 * у подсудимого, не проверка. Числа из WCAG 2.2, 1.4.3.
 */
const AA_NORMAL = 4.5;                 // обычный текст
const AA_LARGE = 3;                    // ≥ 24 px, либо ≥ 18.66 px жирного; иконки
import { GAMES, CATEGORY_META } from '@/src/constants/games';

const ROOT = join(__dirname, '../..');

/**
 * Экраны, где текст на заливке цветом игры ещё НЕ починен — поимённо и с
 * причиной. Молчаливых исключений быть не должно: каждая строка означает, что
 * человек посмотрел и решил. Список ЗАКРЫТ — ниже стоит проверка, что он не растёт.
 */
const KNOWN_BAD: Record<string, string> = {
  'sudoku-fractal.tsx': 'вне наряда: правка `app/games/sudoku*.tsx` этому заходу запрещена. Беда та же — зашитый #FFF на #5b4d9e→#7f7fd5 даёт 3.56. Чинится тем же приёмом: GradientSurface + onGradientText',
  'sudoku-samurai.tsx': 'вне наряда: правка `app/games/sudoku*.tsx` этому заходу запрещена. Зашитый #FFF на #7f7fd5→#86a8e7 даёт 2.39 (заголовок конфига и кнопка «Начать»). Чинится тем же приёмом',
};

// ─────────────────────────── исходник ───────────────────────────

/**
 * Срезаем комментарии, сохраняя длину и переносы (чтобы номера строк не поехали).
 * Строковые литералы не трогаем: `'// не комментарий'` — это данные.
 */
function strip(src: string): string {
  let out = ''; let i = 0;
  while (i < src.length) {
    const c = src[i]; const n = src[i + 1];
    if (c === '/' && n === '*') {
      const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2;
      out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue;
    }
    if (c === '/' && n === '/') {
      let e = src.indexOf('\n', i); if (e < 0) e = src.length;
      out += ' '.repeat(e - i); i = e; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (f.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

// ─────────────────────────── палитра игр ───────────────────────────

/** Все цвета-опознавательные знаки: концы градиентов игр + цвета категорий. */
const GAME_COLORS = new Set<string>();
for (const g of GAMES) for (const c of g.gradient) GAME_COLORS.add(c.toLowerCase());
for (const m of Object.values(CATEGORY_META)) GAME_COLORS.add(m.color.toLowerCase());

/**
 * Акценты ПРОФИЛЕЙ (`PROFILE_THEME` в ThemeContext) — тоже сплошные заливки, на
 * которых лежит текст: кнопка справки висит на каждом игровом экране, её подпись
 * стояла белой и на янтаре владельца давала 1.67. Цвет приходит как `colors.primary`
 * и в исходнике неразрешим — поэтому подставляем ВСЕ 13 акцентов по очереди,
 * ровно как градиенты игр в общие компоненты.
 */
const PROFILE_ACCENTS: string[] = (() => {
  const src = readFileSync(join(ROOT, 'src/contexts/ThemeContext.tsx'), 'utf8') as string;
  const blk = src.slice(src.indexOf('const PROFILE_THEME'));
  return [...new Set([...blk.slice(0, blk.indexOf('};')).matchAll(/accent:\s*'(#[0-9a-fA-F]{6})'/g)].map((m) => m[1]))];
})();

// ─────────────────────────── вычисление объявлений ───────────────────────────

/** Объявления `const NAME = <одно выражение>;` любого уровня отступа. */
function decls(src: string): { name: string; expr: string }[] {
  // ⚠️ ПОРЯДОК — ПО МЕСТУ В ФАЙЛЕ, а не по тому, какая регулярка нашла раньше.
  //    Однострочные шли впереди многострочных, и `const onSlot = …SLOT_TINT[slotNow]…`
  //    вычислялся ДО того, как появлялся сам `SLOT_TINT`: цвет молча не считался,
  //    плашка «Зарядка» выпадала из проверки. Поймано живым замером, не тестом.
  const out: { name: string; expr: string; at: number }[] = [];
  for (const m of src.matchAll(/^ *const (\w+) = ([^;\n]+);\s*$/gm)) out.push({ name: m[1], expr: m[2], at: m.index! });
  // ⚠️ Многострочные литералы тоже объявления. `SLOT_TINT` — запись из четырёх
  //    градиентов по времени суток, расписанная на пять строк; однострочная
  //    регулярка её не видела, плашка «Зарядка» оставалась непроверенной,
  //    и зашитый белый на ней (1.78 к светлому концу) жил незамеченным.
  for (const m of src.matchAll(/^const (\w+)(?::[^=\n]+)? = (\{[\s\S]*?\n\}|\[[\s\S]*?\n\]);/gm)) {
    out.push({ name: m[1], expr: m[2], at: m.index! });
  }
  return out.sort((a, b) => a.at - b.at).map(({ name, expr }) => ({ name, expr }));
}

/**
 * Вычисляем объявления файла по-настоящему — с настоящими модулями в области
 * видимости. `bind` подставляет то, что приходит пропом (градиент игры).
 */
function evaluate(src: string, bind: Record<string, any> = {}): Record<string, any> {
  const scope: Record<string, any> = { ...bind };
  const list = decls(src);
  // ⚠️ Смотрим ВЕСЬ файл, а не только объявления: `textOn(GRADIENT[0])` живёт
  //    в разметке, и модуль, подтянутый «по объявлениям», её бы не покрыл —
  //    цвет не вычислился бы, и проверка ругалась бы на собственную починку.
  const wanted = src;
  for (const m of src.matchAll(/import \{([^}]+)\} from '(@\/src\/(?:services|constants)\/[\w-]+)'/g)) {
    const names = m[1].split(',').map((s) => s.trim().split(' as ').pop() as string);
    if (!names.some((n) => new RegExp('\\b' + n + '\\b').test(wanted))) continue;
    try { Object.assign(scope, require(m[2])); } catch { /* не поднялся — цвет не вычислится, это станет провалом ниже */ }
  }
  for (const d of list) {
    try { scope[d.name] = evalIn(scope, d.expr); } catch { /* опирается на рантайм — пропускаем */ }
  }
  return scope;
}

// ─────────────────────────── стили ───────────────────────────

/** Тело стиля `KEY: { ... }` из StyleSheet.create. */
function styleBody(src: string, key: string): string | null {
  const m = new RegExp('\\n  ' + key + ':\\s*\\{').exec(src);
  if (!m) return null;
  const i = src.indexOf('{', m.index); let d = 0; let j = i;
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Вычислить выражение с модулями файла в области видимости.
 *
 * ⚠️ ГРАБЛЯ, из-за которой проверка не могла прочитать собственную починку.
 * Имена в область видимости идут ключами модуля, а у модуля с default-экспортом
 * среди ключей есть `default` — зарезервированное слово. `new Function('default',
 * …)` падает синтаксической ошибкой, ловится общим catch, и цвет объявляется
 * «невычислимым». Ломались ровно те файлы, где рядом импортирован модуль с
 * default-экспортом, — то есть провал зависел от СОСЕДНЕГО импорта. Отсеиваем
 * всё, что не годится в имя параметра.
 */
const RESERVED = new Set('default,delete,new,class,function,return,var,let,const,in,of,do,if,else,for,while,switch,case,break,continue,this,typeof,void,with,try,catch,finally,throw,import,export,extends,super,yield,await,null,true,false,enum'.split(','));

/**
 * 🔴 ЧТО ЗДЕСЬ ОБЕЗВРЕЖИВАЕТСЯ И ПОЧЕМУ ЭТО СТОИЛО ЦЕЛОГО ВЫПУСКА.
 *
 * `evalIn` — последний рубеж разбора цвета: он ВЫПОЛНЯЕТ выражение, чтобы узнать,
 * что реально получится на экране. Пропуском служила проверка «похоже на вызов
 * функции»: `^[\w$]+\s*\(`. Под неё попадает не только `textOn(GRADIENT[0])`, но и
 * любая строка кода, начинающаяся с вызова, — например снятая из экрана
 * `setInterval(() => setNow(gameNow()), 100)`.
 *
 * И она НЕ ПРОСТО вычислялась — она заводила НАСТОЯЩИЙ таймер. Через 100 мс он
 * срабатывал уже вне всякой области видимости, `setNow` там нет, и Node падал
 * необработанным `ReferenceError`, унося ВЕСЬ прогон вместе с процессом.
 *
 * Цена: выпуск v1.240.0 26.08.2026. Джоба упала → `release` и «Android → Google
 * Play» были ПРОПУЩЕНЫ → сборка не доехала до магазина, а `version.json` остался
 * на 1.236.0, и приложение четыре выпуска подряд считало себя свежим.
 * ⚠️ И падение ПЛАВАЮЩЕЕ: сработает таймер или нет — зависит от того, жив ли ещё
 * процесс через 100 мс. Локально те же 3580 проверок проходили зелёными.
 *
 * Поэтому таймеры и сеть подставляются пустышками ПАРАМЕТРАМИ функции: внутри
 * вычисляемого выражения они перекрывают глобальные, и любой такой вызов
 * становится безвредным. Цветом ничего из этого быть не может по определению.
 */
const БЕЗВРЕДНО = () => undefined;
const ПОБОЧНЫЕ = [
  'setInterval', 'setTimeout', 'setImmediate', 'clearInterval', 'clearTimeout',
  'requestAnimationFrame', 'requestIdleCallback', 'queueMicrotask',
  'fetch', 'XMLHttpRequest', 'Worker', 'importScripts',
];

function evalIn(scope: Record<string, any>, expr: string): any {
  const keys = Object.keys(scope).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && !RESERVED.has(k));
  // Имена из модуля важнее: если файл сам экспортирует `fetch`, перекрывать нечего.
  const глушим = ПОБОЧНЫЕ.filter((n) => !keys.includes(n));
  // eslint-disable-next-line no-new-func
  return new Function(...keys, ...глушим, `return (${expr});`)(
    ...keys.map((k) => scope[k]), ...глушим.map(() => БЕЗВРЕДНО),
  );
}

/** Открыто для проверки: гейт обязан уметь доказать, что глушилка работает. */
export const __evalInДляПроверки = evalIn;

/** Выражение цвета → hex. Литерал берём как есть, путь `ON_FILL.color` — вычисляем. */
function resolveColor(expr: string, scope: Record<string, any>): string | null {
  const e = expr.trim().replace(/^['"]|['"]$/g, '');
  if (HEX.test(e)) return e;
  const rgba = e.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgba) return '#' + [1, 2, 3].map((i) => (+rgba[i]).toString(16).padStart(2, '0')).join('');
  const idx = e.match(/^(\w+)\[(\d+)\]$/);
  if (idx && Array.isArray(scope[idx[1]])) {
    const v = scope[idx[1]][+idx[2]];
    return typeof v === 'string' && HEX.test(v) ? v : null;
  }
  const path = e.replace(/[{}]/g, '').trim();
  if (/^[\w.]+$/.test(path)) {
    let v: any = scope;
    for (const part of path.split('.')) { if (v == null) return null; v = v[part]; }
    return typeof v === 'string' && HEX.test(v) ? v : null;
  }
  // ⚠️ Последний рубеж — ВЫЧИСЛИТЬ выражение как есть, с настоящими модулями в
  //    области видимости: `textOn(GRADIENT[0])`, `accentOn(onGrad, '#FFD93B')`.
  //    Именно поэтому проверку нельзя обмануть переименованием: она считает то,
  //    что реально получится на экране, а не узнаёт знакомые буквы.
  if (!/^[\w$]+\s*\(/.test(path)) return null;
  try {
    const v = evalIn(scope, path);
    return typeof v === 'string' && HEX.test(v) ? v : null;
  } catch { return null; }
}

// ─────────────────────────── разбор JSX ───────────────────────────

/** JSX-элемент целиком, начиная с `<` по индексу `start`. */
function element(src: string, start: number): { tag: string; body: string } {
  let i = start + 1; let tag = '';
  while (i < src.length && /[\w.]/.test(src[i])) tag += src[i++];
  let depth = 0; let j = start; let selfClose = false;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) { selfClose = src[j - 1] === '/'; break; }
  }
  if (selfClose) return { tag, body: src.slice(start, j + 1) };
  const esc = tag.replace('.', '\\.');
  const openRe = new RegExp('<' + esc + '[\\s/>]', 'g');
  const closeRe = new RegExp('</' + esc + '>', 'g');
  let level = 1; let k = j + 1;
  while (level > 0 && k < src.length) {
    openRe.lastIndex = k; closeRe.lastIndex = k;
    const o = openRe.exec(src); const c = closeRe.exec(src);
    if (!c) break;
    if (o && o.index < c.index) { level++; k = o.index + 1; }
    else { level--; k = c.index + c[0].length; }
  }
  return { tag, body: src.slice(start, k) };
}

const COLOR_EXPR = /color:\s*(rgba?\([^)]*\)|'[^']*'|"[^"]*"|[\w.[\]]+)/;

/**
 * Ветви выражения цвета. `on ? A : B` — это A и B; само `on` цветом не является.
 * ⚠️ Раньше условие попадало в кандидаты, и проверка честно не могла вычислить
 * «цвет» `reshuffleOnClick` — то есть падала на собственной ошибке разбора.
 */
/**
 * Все выражения `color: …` в куске стиля, ДО конца выражения — со скобками.
 * ⚠️ Наивное `[^,}\]]+` обрывается на запятой ВНУТРИ вызова:
 * `textOn(GRADIENT[0], AA_LARGE)` превращался в `textOn(GRADIENT[0]`, такой
 * «цвет» не вычислялся и молча выпадал из проверки. То есть ослабление порога —
 * ровно тот обход, ради которого порог и заведён, — проходило насквозь.
 */
function colorExprs(text: string): string[] {
  const out: string[] = [];
  const re = /(^|[^\w.])color:\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length; let d = 0; let expr = '';
    for (; i < text.length; i++) {
      const c = text[i];
      if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) { if (d === 0) break; d--; }
      else if (c === ',' && d === 0) break;
      expr += c;
    }
    if (expr.trim()) out.push(expr.trim());
  }
  return out;
}

function branches(expr: string): string[] {
  const q = expr.indexOf('?');
  const tail = q < 0 ? expr : expr.slice(q + 1);
  return tail.split(':').map((s) => s.trim()).filter(Boolean);
}

/** Условие тернарника (или '' если его нет) — по нему связываем фон и текст. */
function condOf(expr: string): string {
  const q = expr.indexOf('?');
  // ⚠️ Нормализуем: `(finCooldown.ready` из `colors={(cond ? A : B)}` и
  //    `finCooldown.ready` из `color: cond ? X : Y` — одно условие, а по сырой
  //    строке не совпадали, и связка ветвей не срабатывала.
  return q < 0 ? '' : expr.slice(0, q).replace(/[\s()]+/g, '');
}

/** Ветви с НОМЕРОМ: 0 — «да», 1 — «нет». */
function branchesIndexed(expr: string): { t: string; i: number }[] {
  return branches(expr).map((t, i) => ({ t, i }));
}

/**
 * Цвет из ТЕМЫ (`colors.text`, `colors.textSecondary`) — не наш случай.
 * Тема и игровая заливка не встречаются: чип, покрашенный цветом игры, несёт
 * вычисленный цвет, а `colors.text` стоит во ВТОРОЙ ветке того же тернарника —
 * там, где фон тоже из темы (`colors.card`). Считать их пару значит проверять
 * сочетание, которого на экране не бывает. Читаемость темы — предмет другой
 * проверки, не этой.
 */
const THEME = /^colors\./;

/**
 * Убираем из плашки ВЛОЖЕННЫЕ плашки со своим НЕПРОЗРАЧНЫМ фоном.
 *
 * ⚠️ Без этого разбор врёт в обе стороны. Внутри плашки итога лежит золотой чип
 * множителя `×2` — свой фон `#FFD93B`, свой тёмный текст `#3f2b00`. Считая его
 * текст к фону ВНЕШНЕЙ плашки, проверка объявляла сломанным давно починенный
 * `GameResult` (10 «провалов» на пустом месте). Вложенная плашка — отдельная
 * плашка: её посчитает свой же проход по `backgroundColor`.
 */
function withoutNestedPlates(body: string, src?: string): string {
  let out = body;
  for (let pass = 0; pass < 8; pass++) {
    const head = out.indexOf('>');
    let cut = -1;
    // ⚠️ Вложенная плашка может объявлять фон НЕ на месте, а в StyleSheet
    //    (`earnMult: { backgroundColor: '#FFD93B' }`). Ищем оба вида, иначе тёмный
    //    текст золотого чипа считается к градиенту снаружи — и врёт вчистую.
    // ⚠️ ВТОРАЯ ГРАБЛЯ ТОГО ЖЕ РОДА. Фон из StyleSheet может быть ПЕРЕКРЫТ на
    //    месте, и перекрыт полупрозрачным: `[styles.heroCta, { backgroundColor:
    //    'rgba(0,0,0,0.3)' }]` — в стиле `#000`, на экране 30% чёрного поверх
    //    градиента. Считая такую плашку непрозрачной, разбор вырезал её вместе с
    //    текстом, и белая подпись «СТАРТ» на карточке дыхания (1.86 к светлому
    //    концу) проходила незамеченной. Действует ПОСЛЕДНЕЕ слагаемое — как в RN.
    const styleFills = src
      ? [...out.matchAll(/styles\.(\w+)/g)].filter((k) => {
        const sb = styleBody(src, k[1]);
        if (!sb || !/backgroundColor:\s*'#[0-9a-fA-F]{3,8}'/.test(sb)) return false;
        // перекрыт ли фон на месте, в том же style-пропе?
        const propStart = out.lastIndexOf('style={', k.index!);
        if (propStart < 0) return true;
        let d = 1; let i = propStart + 'style={'.length;
        for (; i < out.length && d > 0; i++) { if (out[i] === '{') d++; else if (out[i] === '}') d--; }
        const prop = out.slice(propStart, i);
        if (prop.indexOf(k[0]) < 0) return true;
        const inline = [...prop.matchAll(/backgroundColor:\s*(rgba?\([^)]*\)|'[^']*')/g)].pop();
        if (!inline) return true;
        const a = inline[1].match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)/);
        return !(a && +a[1] < 0.99);            // перекрыт полупрозрачным — плашка не своя
      })
      : [];
    for (const m of [...out.matchAll(/backgroundColor:\s*('#[0-9a-fA-F]{3,8}'|[A-Z_][\w.[\]]*)/g), ...styleFills]
      .sort((a, b) => a.index! - b.index!)) {
      if (m.index! < head) continue;                       // фон самой плашки, а не вложенной
      let st = out.lastIndexOf('<', m.index);
      let guard = 0;
      while (st > 0 && !/^<[A-Z]/.test(out.slice(st, st + 2)) && guard++ < 60) st = out.lastIndexOf('<', st - 1);
      if (st <= 0) continue;
      cut = st; break;
    }
    if (cut < 0) break;
    const nested = element(out, cut);
    out = out.slice(0, cut) + out.slice(cut + nested.body.length);
  }
  return out;
}

interface Sample { kind: 'text' | 'icon'; expr: string; where: string; opacity: number; cond?: string; branch?: number }

/**
 * Разбиваем `style={[a, b, c]}` на СЛАГАЕМЫЕ верхнего уровня.
 * Нужно, чтобы понимать порядок: RN накладывает их слева направо.
 */
function styleItems(prop: string): string[] {
  const t = prop.trim();
  if (!t.startsWith('[')) return [t];
  const inner = t.slice(1, t.lastIndexOf(']'));
  const out: string[] = []; let d = 0; let cur = '';
  for (const ch of inner) {
    if ('[{('.includes(ch)) d++;
    else if (']})'.includes(ch)) d--;
    if (ch === ',' && d === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/**
 * Все цвета текста и иконок внутри плашки.
 *
 * ⚠️ ПОРЯДОК СЛАГАЕМЫХ РЕШАЕТ. `style={[styles.btn, { color: X }]}` — на экране
 * будет X, а не цвет из `styles.btn`: RN накладывает слева направо. Проверка,
 * которая считает ОБА, объявляет сломанным то, что уже поверх починено накладкой,
 * и толкает править ОБЩИЙ стиль — а он лежит и на других, не игровых, фонах.
 * Поэтому берём кандидатов начиная с последнего БЕЗУСЛОВНОГО слагаемого с цветом:
 * всё, что раньше, оно перекрыло; всё, что под условием, однажды покажется.
 */
function samples(body: string, src: string): Sample[] {
  const out: Sample[] = [];
  const seen = new Set<string>();
  const push = (s: Sample) => { const k = s.kind + s.expr + s.where + s.cond + s.branch; if (!seen.has(k)) { seen.add(k); out.push(s); } };

  for (const m of body.matchAll(/<Text\b[^>]*style=\{([\s\S]*?)\}\s*>/g)) {
    const items = styleItems(m[1]);
    const inlineOp = m[1].match(/opacity:\s*([\d.]+)/);
    // где последнее слагаемое, которое задаёт цвет БЕЗУСЛОВНО
    let from = 0;
    items.forEach((it, i) => {
      const conditional = /&&|\?/.test(it);
      const setsColor = /(^|[^\w.])color:/.test(it) || (/styles\.(\w+)/.test(it) && !!(() => {
        const k = it.match(/styles\.(\w+)/); const sb = k && styleBody(src, k[1]); return sb && COLOR_EXPR.test(sb);
      })());
      if (setsColor && !conditional) from = i;
    });
    let any = false;
    for (const it of items.slice(from)) {
      for (const c of colorExprs(it)) {
        const cond = condOf(c);
        for (const { t, i } of branchesIndexed(c)) {
          if (/^styles\./.test(t) || THEME.test(t)) continue;
          if (/^(rgba?\([^)]*\)|'[^']*'|"[^"]*")$/.test(t) || /^[A-Za-z_$][\w.]*$/.test(t) || /^\w+\[\d+\]$/.test(t) || /^[\w$]+\(.*\)$/.test(t)) {
            push({ kind: 'text', expr: t, where: 'на месте', opacity: inlineOp ? +inlineOp[1] : 1, cond, branch: i });
            any = true;
          }
        }
      }
      for (const key of it.matchAll(/styles\.(\w+)/g)) {
        const sb = styleBody(src, key[1]);
        if (!sb) continue;
        const c = sb.match(COLOR_EXPR);
        const op = sb.match(/opacity:\s*([\d.]+)/);
        const alpha = inlineOp ? +inlineOp[1] : (op ? +op[1] : 1);
        if (c) { push({ kind: 'text', expr: c[1], where: `styles.${key[1]}`, opacity: alpha }); any = true; }
      }
    }
    if (!any) push({ kind: 'text', expr: '', where: 'цвет из темы', opacity: 1 });
  }
  for (const m of body.matchAll(/<Ionicons\b[^/]*?color=(\{[^}]+\}|"[^"]+")/g)) {
    const icond = condOf(m[1].replace(/[{}"]/g, ''));
    for (const { t, i } of branchesIndexed(m[1].replace(/[{}"]/g, ''))) {
      if (THEME.test(t)) continue;
      if (/^(#[0-9a-fA-F]{3,8}|'#[0-9a-fA-F]{3,8}')$/.test(t) || /^[A-Za-z_$][\w.]*$/.test(t) || /^\w+\[\d+\]$/.test(t) || /^[\w$]+\(.*\)$/.test(t)) {
        push({ kind: 'icon', expr: t, where: 'иконка', opacity: 1, cond: icond, branch: i });
      }
    }
  }
  return out;
}

// ─────────────────────────── сам замер ───────────────────────────

interface Finding { file: string; line: number; where: string; kind: string; color: string; bg: string; ratio: number }

/** Возможен ли AA сплошным цветом на этих концах — чистая арифметика WCAG. */
function bestSolid(c1: string, c2: string): number {
  return Math.max(
    Math.min(contrastRatio('#000000', c1), contrastRatio('#000000', c2)),
    Math.min(contrastRatio('#ffffff', c1), contrastRatio('#ffffff', c2)),
  );
}

/**
 * ВСЕ возможные концы градиента из `colors={…}`.
 * ⚠️ Пар может быть НЕСКОЛЬКО, и проверять надо каждую:
 *   · тернарник — `finCooldown.ready ? ['#22c55e','#0d9488'] : ['#475569','#64748b']`:
 *     обе ветки однажды покажутся, и белый текст мёртв ровно на зелёной (2.28);
 *   · запись по ключу — `SLOT_TINT[slotNow]`: ключ известен только в рантайме,
 *     поэтому берём ВСЕ четыре градиента записи.
 * Раньше функция возвращала одну пару и на обоих видах молча сдавалась (`null`),
 * то есть плашка просто не проверялась. Поймано живым замером на главной.
 */
function gradientEnds(head: string, scope: Record<string, any>): { ends: [string, string]; cond: string; branch: number }[] {
  const m = head.match(/colors=\{\s*([\s\S]*?)\s*\}/);
  if (!m) return [];
  const whole = m[1].split(' as ')[0].trim();
  const cond = condOf(whole);
  const parts = cond
    ? whole.slice(whole.indexOf('?') + 1).split(':').map((x) => x.trim())
    : [whole];
  const pairs: { ends: [string, string]; cond: string; branch: number }[] = [];
  const take = (arr: any, branch: number) => {
    if (!Array.isArray(arr) || arr.length < 2) return;
    const a = arr[0]; const b = arr[arr.length - 1];
    if (typeof a === 'string' && HEX.test(a) && typeof b === 'string' && HEX.test(b)) pairs.push({ ends: [a, b], cond, branch });
  };
  parts.forEach((raw, branch) => {
    const e = raw.split(' as ')[0].trim();
    if (e.startsWith('[')) { take([...e.matchAll(/'(#[0-9a-fA-F]{3,8})'/g)].map((x) => x[1]), branch); return; }
    if (Array.isArray(scope[e])) { take(scope[e], branch); return; }
    // ⚠️ Сначала ПОСЧИТАТЬ выражение: если ключ записи уже подставлен (`slotNow`),
    //    градиент ровно один. Перебирать после этого все четыре — значит сверять
    //    утренний цвет текста с ночным фоном и требовать чинить то, чего нет.
    try { const v = evalIn(scope, e); if (Array.isArray(v)) { take(v, branch); return; } } catch { /* не вышло — ниже перебор */ }
    const idx = e.match(/^(\w+)\[/);
    if (idx && scope[idx[1]] && typeof scope[idx[1]] === 'object') {
      for (const v of Object.values(scope[idx[1]] as Record<string, any>)) take(v, branch);
    }
  });
  return pairs;
}

/** Файлы, где градиент приходит пропом → проверяем на ВСЕХ палитрах игр. */
function bindingsFor(src: string): Record<string, any>[] {
  // акцент профиля приходит из темы — подставляем все возможные
  if (/const accent = colors\.primary/.test(src)) return PROFILE_ACCENTS.map((a) => ({ accent: a }));
  if (/\bgradient:\s*string\[\]/.test(src)) return GAMES.map((g) => ({ gradient: g.gradient }));
  /**
   * ⚠️ Запись, которую индексируют ПЕРЕМЕННОЙ (`SLOT_TINT[slotNow]` — градиент
   * по времени суток), в исходнике не вычислима: ключ известен только в рантайме.
   * Перечисляем ВСЕ ключи записи — иначе объявления, опирающиеся на неё
   * (`const onSlot = onGradientText(SLOT_TINT[slotNow][0], …)`), не считаются, и
   * плашка выпадает из проверки целиком.
   */
  const pre = evaluate(src);
  for (const m of src.matchAll(/\b([A-Z][A-Z0-9_]*)\[(\w+)\]/g)) {
    const rec = pre[m[1]];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    const keys = Object.keys(rec);
    if (keys.length && keys.length <= 12) return keys.map((k) => ({ [m[2]]: k }));
  }
  return [{}];
}

function auditFile(path: string, raw: string) {
  const src = strip(raw);
  const bad: Finding[] = []; const unresolved: string[] = []; let checked = 0;
  const fills = new Set<string>();
  const rel = path.replace(ROOT + '/', '');
  for (const bind of bindingsFor(src)) {
    const scope = evaluate(src, bind);
    for (const m of src.matchAll(/backgroundColor:\s*([\w.[\]]+|'[^']*')(\s*\+\s*'[0-9a-fA-F]{2}')?/g)) {
      // ⚠️ `GRADIENT[0] + '22'` — это ПОДТОН на 13%, а не заливка: под текстом остаётся
      //    фон карточки, и считать контраст к чистому цвету игры было бы враньём.
      if (m[2]) continue;
      const bg = resolveColor(m[1], scope);
      if (!bg || bg.length > 7 || !GAME_COLORS.has(bg.toLowerCase())) continue;
      let s = src.lastIndexOf('<', m.index);
      let guard = 0;
      while (s > 0 && !/^<[A-Z]/.test(src.slice(s, s + 2)) && guard++ < 60) s = src.lastIndexOf('<', s - 1);
      if (s <= 0) continue;
      const el = element(src, s);
      const line = raw.slice(0, m.index).split('\n').length;
      fills.add(`${rel}:${line}`);
      for (const smp of samples(withoutNestedPlates(el.body, src), src)) {
        if (!smp.expr) continue;                       // цвет из темы — не наш случай
        const color = resolveColor(smp.expr, scope);
        if (!color) { unresolved.push(`${rel}:${line} · ${smp.where}: не смог вычислить цвет из «${smp.expr}»`); continue; }
        const need = smp.kind === 'icon' ? AA_LARGE : AA_NORMAL;
        // ⚠️ opacity — тихий убийца контраста: полупрозрачная буква мешается с фоном.
        const ratio = contrastRatio(blend(color, bg, smp.opacity), bg);
        checked++;
        if (ratio < need) bad.push({ file: rel, line, where: smp.where, kind: smp.kind, color, bg, ratio });
      }
    }

    // ── ГРАДИЕНТНЫЕ ПЛАШКИ ──
    // ⚠️ Старая проверка `on-gradient-contrast` смотрит только `app/games/*.tsx`.
    //    Мимо неё прошли ОБЩИЕ компоненты, где градиент приходит пропом, — а там
    //    одна зашитая строка бьёт по всем 71 игре разом. Поймано поломкой:
    //    `{ color: fg }` → `'#FFFFFF'` в заголовке `LevelCleared` не будило ничего.
    for (const gm of src.matchAll(/<(LinearGradient|GradientSurface)\b/g)) {
      const el = element(src, gm.index!);
      const head = el.body.slice(0, el.body.indexOf('>') + 1);
      const allPairs = gradientEnds(head, scope);
      if (!allPairs.length) continue;                  // динамика (диски ханоя и т.п.)
      const line = raw.slice(0, gm.index).split('\n').length;
      for (const pair of allPairs) {
      const raw2 = pair.ends;
      // GradientSurface сам кладёт вуаль — фон под текстом уже другой
      const ends: [string, string] = gm[1] === 'GradientSurface'
        ? onGradientText(raw2[0], raw2[1]).ends
        : raw2;
      if (gm[1] === 'LinearGradient' && bestSolid(raw2[0], raw2[1]) < AA_NORMAL) {
        bad.push({ file: rel, line, where: 'плашка', kind: 'text', color: '—',
          bg: `${raw2[0]}→${raw2[1]}`, ratio: bestSolid(raw2[0], raw2[1]) });
      }
      for (const smp of samples(withoutNestedPlates(el.body, src), src)) {
        if (!smp.expr) continue;
        // ⚠️ ОДНО УСЛОВИЕ — ОДНА ПАРА. Если фон и текст висят на ОДНОМ и том же
        //    условии (`finCooldown.ready ? зелёный : серый` и `… ? светлый : тёмный`),
        //    то на экране встречаются только согласованные ветки. Перебор «каждый
        //    с каждым» выдумывал сочетание, которого не бывает, и требовал чинить
        //    несуществующую беду.
        if (pair.cond && smp.cond === pair.cond && smp.branch !== pair.branch) continue;
        const color = resolveColor(smp.expr, scope);
        if (!color) { unresolved.push(`${rel}:${line} · ${smp.where}: не смог вычислить цвет из «${smp.expr}»`); continue; }
        const need = smp.kind === 'icon' ? AA_LARGE : AA_NORMAL;
        const ratio = Math.min(
          contrastRatio(blend(color, ends[0], smp.opacity), ends[0]),
          contrastRatio(blend(color, ends[1], smp.opacity), ends[1]),
        );
        checked++;
        if (ratio < need) bad.push({ file: rel, line, where: smp.where, kind: smp.kind, color, bg: `${ends[0]}→${ends[1]}`, ratio });
      }
      }
    }
  }
  return { bad, unresolved, checked, fills: [...fills] };
}

const FILES: string[] = [
  ...walk(join(ROOT, 'app')),
  ...walk(join(ROOT, 'src/components')),
  ...walk(join(ROOT, 'src/games')),
];

const RESULT = (() => {
  const bad: Finding[] = []; const unresolved: string[] = []; let checked = 0; const fills = new Set<string>();
  for (const f of FILES) {
    const r = auditFile(f, readFileSync(f, 'utf8') as string);
    bad.push(...r.bad); unresolved.push(...r.unresolved); checked += r.checked;
    for (const x of r.fills) fills.add(x);
  }
  // один и тот же промах на 71 палитре — это одна беда, а не 71
  const uniq = new Map<string, Finding>();
  for (const b of bad) uniq.set(`${b.file}|${b.line}|${b.where}|${b.color}|${b.bg}`, b);
  return { bad: [...uniq.values()], unresolved: [...new Set(unresolved)], checked, fills: fills.size, files: FILES.length };
})();

const rel = (f: string) => f.split('/').pop() as string;

describe('контраст текста на сплошной заливке цветом игры', () => {
  it('есть что проверять — иначе проверка зелена вслепую', () => {
    expect(RESULT.files).toBeGreaterThanOrEqual(80);
    expect(GAME_COLORS.size).toBeGreaterThanOrEqual(60);
    expect(RESULT.checked).toBeGreaterThan(100);
  });

  it('🔴 каждый цвет текста на заливке цветом игры берёт AA', () => {
    const lines = RESULT.bad
      .filter((b) => !KNOWN_BAD[rel(b.file)])
      .map((b) => `${b.file}:${b.line} · ${b.where} · ${b.kind}: ${b.color} на ${b.bg} = ${b.ratio.toFixed(2)} (нужно ${b.kind === 'icon' ? AA_LARGE : AA_NORMAL})`)
      .sort();
    expect(lines).toEqual([]);
  });

  it('🔴 цвет каждой надписи вычисляется — непрочитанное это провал, а не «наверное, там нормально»', () => {
    const lines = RESULT.unresolved.filter((u) => !Object.keys(KNOWN_BAD).some((k) => u.includes(k))).sort();
    expect(lines).toEqual([]);
  });

  /**
   * АЙДЕНТИКА. Читаемость правится ЦВЕТОМ ТЕКСТА, а не подкруткой заливки.
   * Снимок палитры зафиксирован здесь, и любая правка цвета игры уронит проверку.
   * Это и есть смысл: «затемню чип на 15%, и станет читаемо» — не починка
   * читаемости, а смена опознавательного знака игры втихую.
   *
   * ⚠️ ЕСЛИ ПАЛИТРУ МЕНЯЮТ ОСОЗНАННО — снимок обновляется РУКАМИ, вместе с
   * решением. Проверка не запрещает менять цвета, она запрещает менять их молча.
   */
  it('акценты профилей вычитаны — иначе кнопка справки проверялась бы вслепую', () => {
    expect(PROFILE_ACCENTS.length).toBeGreaterThanOrEqual(10);
  });

  /**
   * ПОЧЕМУ ЗДЕСЬ НЕТ СНИМКА ПАЛИТРЫ.
   * Была проверка «набор цветов `games.ts` сходится с отпечатком». Она ловила
   * правку цвета игры — но правка цвета игры НЕ является способом обойти контраст:
   * цвет текста считается ОТ заливки, и после перекраски он пересчитается сам,
   * а контраст останется взятым. Обойти можно иначе — заменив `GRADIENT[0]` в
   * экране на свой хекс потемнее; это ловит порог числа настоящих заливок ниже
   * (проверено поломкой: `#4facfe` → `#1b5a8c` роняет 129 → 128).
   *
   * А цена у снимка была настоящая: `games.ts` — общий файл, игры в него
   * добавляют постоянно, и снимок краснел на честной работе соседей, ничего при
   * этом не предотвращая. Сторож, который будит по ложным поводам, перестают читать.
   */

  it('🔴 заливка не подкручена: цвет игры на экране остаётся цветом игры', () => {
    expect(RESULT.fills).toBeGreaterThanOrEqual(129);
  });

  it('🔴 сервис держит планку WCAG — её нельзя опустить «чтобы прошло»', () => {
    expect({ обычный: SERVICE_AA_NORMAL, крупный: SERVICE_AA_LARGE }).toEqual({ обычный: 4.5, крупный: 3 });
  });

  it('🔴 на сплошной заливке вуаль не нужна и не кладётся — одного цвета текста всегда хватает', () => {
    // Арифметика: хуже всего при яркости 0.1791, и там чёрный и белый дают по 4.58 — выше AA.
    const worst: string[] = [];
    for (const c of GAME_COLORS) {
      const best = Math.max(contrastRatio('#000000', c), contrastRatio('#ffffff', c));
      if (best < AA_NORMAL) worst.push(`${c}: лучший сплошной цвет даёт ${best.toFixed(2)}`);
    }
    expect(worst).toEqual([]);
  });

  it('исключения не протухли: файл существует и всё ещё не чинен', () => {
    const stale: string[] = [];
    for (const [f, why] of Object.entries(KNOWN_BAD)) {
      if (!FILES.some((p: string) => rel(p) === f)) { stale.push(`${f}: файла нет — убрать из списка`); continue; }
      if (why.length < 25) stale.push(`${f}: причина написана для галочки`);
      const stillBroken = RESULT.bad.some((b) => rel(b.file) === f) || RESULT.unresolved.some((u) => u.includes(f));
      if (!stillBroken) stale.push(`${f}: уже чинен — убрать из списка исключений`);
    }
    expect(stale).toEqual([]);
  });

  it('список исключений закрыт и не растёт', () => {
    expect(Object.keys(KNOWN_BAD).length).toBeLessThanOrEqual(2);
  });
});

describe('общие компоненты проверены на ВСЕХ палитрах, а не на одной', () => {
  it('карточка уровня и витрина считают цвет от градиента, который им передали', () => {
    const dynamic = FILES.filter((f: string) => /\bgradient:\s*string\[\]/.test(strip(readFileSync(f, 'utf8') as string)));
    // LevelCleared, GameResult, GameCard, GameIntro — те, кому градиент приходит пропом
    expect(dynamic.length).toBeGreaterThanOrEqual(4);
    for (const f of dynamic) {
      const src = strip(readFileSync(f, 'utf8') as string);
      const usesFormula = /onGradientText|onSolidText|gradientIsLight/.test(src);
      const hasGradientSurface = /<(LinearGradient|GradientSurface)/.test(src);
      if (hasGradientSurface && !usesFormula) throw new Error(`${rel(f)}: рисует чужой градиент, а цвет текста не считает`);
    }
  });

  /** Светлые палитры — отдельный класс: именно на них зашитый белый и умирал. */
  it('🔴 на самых светлых палитрах текст карточки уровня читается', () => {
    const lightest = [...GAMES]
      .sort((a, b) => relativeLuminance(b.gradient[0]) + relativeLuminance(b.gradient[1])
                    - relativeLuminance(a.gradient[0]) - relativeLuminance(a.gradient[1]))
      .slice(0, 12);
    const path = join(ROOT, 'src/components/LevelCleared.tsx');
    const src = strip(readFileSync(path, 'utf8') as string);
    const bad: string[] = [];
    for (const g of lightest) {
      const scope = evaluate(src, { gradient: g.gradient });
      const on = scope.onGrad;
      if (!on || typeof on.color !== 'string') { bad.push(`${g.id}: цвет не вычислился`); continue; }
      const r = Math.min(contrastRatio(on.color, on.ends[0]), contrastRatio(on.color, on.ends[1]));
      if (r < AA_NORMAL) bad.push(`${g.id}: ${on.color} на ${on.ends.join('→')} = ${r.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });
});
