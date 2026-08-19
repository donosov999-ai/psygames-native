/**
 * ТЕКСТ ПОВЕРХ ГРАДИЕНТА ОБЯЗАН ЧИТАТЬСЯ. ПРОВЕРЯЕТСЯ СЧЁТОМ, А НЕ ДОВЕРИЕМ.
 *
 * 🔴 ЗАЧЕМ. У каждой игры свой градиент — опознавательный знак в каталоге, трогать
 * нельзя. Текст поверх был зашит белым у всех подряд. Замер 19.08.2026 по ОБОИМ
 * концам каждого градиента: из 65 градиентов 53 ниже AA 4.5, 40 — ниже 3.0.
 * Худшее: ospan `#cb356b→#bdfff3` — 1.12, то есть белым по белому.
 *
 * ⚠️ ЭТА ПРОВЕРКА НЕ ИЩЕТ ИМЯ ФУНКЦИИ В ИСХОДНИКЕ. Она:
 *   1. вынимает из файла игры концы градиента и то, каким выражением задан цвет
 *      текста на этой плашке;
 *   2. ВЫЧИСЛЯЕТ это выражение по-настоящему — прогоняя объявления файла с
 *      настоящими модулями в области видимости;
 *   3. считает контраст полученного цвета к ОБОИМ концам.
 * Поэтому механизм можно заменить на лучший: пока цвет вычисляется и контраст
 * держится, проверка зелёная. Красной она станет от плохого контраста, а не от
 * переименования.
 *
 * ⚠️ ПОЧЕМУ «ОБА КОНЦА», А НЕ СРЕДНЕЕ. Надпись лежит поперёк плашки и попадает на
 * весь размах градиента. Ровно на этом обожглась старая прикидка в GameResult:
 * она считала СРЕДНЮЮ яркость двух концов, и `#cb356b→#bdfff3` выходил «светлым» —
 * тёмная буква пропадала на малиновом конце.
 *
 * ⚠️ ТЕНЬ ПОД ТЕКСТОМ КОНТРАСТ НЕ ПОДНИМАЕТ и здесь ни на что не влияет: она
 * размывает край буквы, а WCAG считает светлоту.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');
import { contrastRatio, relativeLuminance, blend, AA_NORMAL, AA_LARGE } from '@/src/services/onGradientText';

const ROOT = join(__dirname, '../..');
const GAMES = join(ROOT, 'app/games');

/**
 * Экраны, где текст на градиенте ещё НЕ починен — поимённо и с причиной.
 * Молчаливых исключений быть не должно: каждая строка означает, что человек
 * посмотрел и решил, а не забыл. Список закрыт, растить его нельзя (см. тесты ниже).
 */
const KNOWN_BAD: Record<string, string> = {
  'sudoku-fractal.tsx': 'файл занят соседним агентом (генератор фрактальной судоку) — чинится следом',
  'sudoku-samurai.tsx': 'файл занят соседним агентом (самурай) — чинится следом',
  'set-game.tsx': 'файл занят соседним агентом — чинится следом',
  'mahjong.tsx': 'файл занят соседним агентом — чинится следом',
};

// ─────────────────────────── разбор исходника ───────────────────────────

/** `const NAME = <одна строка>;` верхнего уровня — в порядке появления. */
function topLevelConsts(src: string): { name: string; expr: string }[] {
  const out: { name: string; expr: string }[] = [];
  for (const m of src.matchAll(/^const (\w+) = (.+);\s*$/gm)) out.push({ name: m[1], expr: m[2] });
  // объявления внутри компонента (например, ночной/дневной градиент дыхания)
  for (const m of src.matchAll(/^  const (\w+) = (.+);\s*$/gm)) out.push({ name: m[1], expr: m[2] });
  return out;
}

/** Импорты из `@/src/services/*` — только они нужны, чтобы вычислить цвет. */
function serviceImports(src: string): { names: string[]; from: string }[] {
  const out: { names: string[]; from: string }[] = [];
  for (const m of src.matchAll(/import \{([^}]+)\} from '(@\/src\/services\/[\w-]+)'/g)) {
    out.push({ names: m[1].split(',').map((s) => s.trim().split(' as ').pop() as string), from: m[2] });
  }
  return out;
}

/**
 * Вычисляем объявления файла по-настоящему: с настоящими модулями в области
 * видимости. Механизм-агностично — что автор написал, то и посчитается.
 */
function evaluate(src: string): Record<string, any> {
  const scope: Record<string, any> = {};
  const decls = topLevelConsts(src);
  const wanted = decls.map((d) => d.expr).join(' ');
  for (const imp of serviceImports(src)) {
    if (!imp.names.some((n) => new RegExp('\\b' + n + '\\b').test(wanted))) continue;   // не тянем лишние модули
    try { Object.assign(scope, require(imp.from)); } catch { /* модуль не поднялся — цвет просто не вычислится */ }
  }
  for (const d of decls) {
    try {
      const keys = Object.keys(scope);
      // eslint-disable-next-line no-new-func
      scope[d.name] = new Function(...keys, `return (${d.expr});`)(...keys.map((k) => scope[k]));
    } catch { /* выражение опирается на рантайм — пропускаем, ниже это станет провалом */ }
  }
  return scope;
}

/** Тело стиля `KEY: { ... }` из StyleSheet.create. */
function styleBody(src: string, key: string): string | null {
  const m = new RegExp('\\n  ' + key + ':\\s*\\{').exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index); let d = 0; let j = i;
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;
/** Выражение цвета → hex. Литерал берём как есть, идентификатор — вычисляем. */
function resolveColor(expr: string, scope: Record<string, any>): string | null {
  const e = expr.trim().replace(/^['"]|['"]$/g, '');
  if (HEX.test(e)) return e;
  const rgba = e.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgba) return '#' + [1, 2, 3].map((i) => (+rgba[i]).toString(16).padStart(2, '0')).join('');
  const path = e.replace(/[{}]/g, '').trim();
  if (!/^[\w.]+$/.test(path)) return null;
  let v: any = scope;
  for (const part of path.split('.')) { if (v == null) return null; v = v[part]; }
  return typeof v === 'string' && HEX.test(v) ? v : null;
}

interface Surface { tag: string; ends: [string, string]; body: string; declared: any | null; }

/** Плашки-градиенты файла с известными концами. */
function surfaces(src: string, scope: Record<string, any>): Surface[] {
  const out: Surface[] = [];
  for (const m of src.matchAll(/<(LinearGradient|GradientSurface)\b([\s\S]*?)<\/\1>/g)) {
    const blk = m[0]; const head = blk.slice(0, blk.indexOf('>') + 1);
    let ends: [string, string] | null = null;
    const named = head.match(/colors=\{\s*(\w+)(?:\s+as\s+\[string,\s*string\])?\s*\}/);
    if (named && Array.isArray(scope[named[1]])) {
      const a = scope[named[1]];
      ends = [a[0], a[a.length - 1]];
    }
    if (!ends) {
      const lit = head.match(/colors=\{\[\s*'(#[0-9a-fA-F]{3,6})'\s*,\s*'(#[0-9a-fA-F]{3,6})'\s*\]\}/);
      if (lit) ends = [lit[1], lit[2]];
    }
    if (!ends || !HEX.test(ends[0]) || !HEX.test(ends[1])) continue;   // динамика (диски ханоя и т.п.)
    // Плашка может объявлять СВОЙ фон (вуаль). Ищем объявление, посчитанное из этих же концов.
    const declared = Object.values(scope).find(
      (v: any) => v && typeof v === 'object' && Array.isArray(v.ends) && v.ends.length === 2
        && typeof v.color === 'string'
        && (v.veil === null ? v.ends[0] === ends![0] : true)
        && sameSource(v, ends!),
    ) ?? null;
    out.push({ tag: m[1], ends, body: blk, declared });
  }
  return out;
}
/** Объявление посчитано ИМЕННО из этого градиента? Сверяем без вуали и с ней. */
function sameSource(v: any, ends: [string, string]): boolean {
  if (v.veil === null) return v.ends[0] === ends[0] && v.ends[1] === ends[1];
  // с вуалью концы смещены — но исходный градиент угадывается по направлению сдвига
  return Math.abs(relativeLuminance(v.ends[0]) - relativeLuminance(ends[0])) < 0.5
      && Math.abs(relativeLuminance(v.ends[1]) - relativeLuminance(ends[1])) < 0.5
      && v.veilAlpha > 0;
}

/** `color: <выражение>` — литерал, rgba(...) целиком или путь вида ON_GRAD.color. */
const COLOR_EXPR = /color:\s*(rgba?\([^)]*\)|'[^']*'|"[^"]*"|[\w.]+)/;

interface Sample { kind: 'text' | 'icon'; expr: string; where: string; opacity: number; }
/** Все цвета текста и иконок внутри плашки. */
function samples(surface: Surface, src: string): Sample[] {
  const out: Sample[] = [];
  for (const m of surface.body.matchAll(/<Text\b[^>]*style=\{([^}]*\{[^}]*\}[^}]*|[^}]*)\}/g)) {
    const style = m[1];
    const inline = style.match(COLOR_EXPR);
    const inlineOp = style.match(/opacity:\s*([\d.]+)/);
    if (inline) { out.push({ kind: 'text', expr: inline[1], where: 'на месте', opacity: inlineOp ? +inlineOp[1] : 1 }); continue; }
    const key = style.match(/styles\.(\w+)/);
    if (!key) continue;
    const body = styleBody(src, key[1]);
    const c = body && body.match(COLOR_EXPR);
    // ⚠️ opacity — тихий убийца контраста: полупрозрачная буква смешивается с фоном.
    // Считаем цвет ПОСЛЕ смешивания, иначе проверка хвалит нечитаемое.
    const op = body && body.match(/opacity:\s*([\d.]+)/);
    const alpha = inlineOp ? +inlineOp[1] : (op ? +op[1] : 1);
    if (c) out.push({ kind: 'text', expr: c[1], where: `styles.${key[1]}`, opacity: alpha });
    else out.push({ kind: 'text', expr: '', where: `styles.${key[1]} (цвет не задан — тема)`, opacity: alpha });
  }
  for (const m of surface.body.matchAll(/<Ionicons\b[^/]*?color=(\{[^}]+\}|"[^"]+")/g)) {
    out.push({ kind: 'icon', expr: m[1], where: 'иконка', opacity: 1 });
  }
  return out;
}

// ─────────────────────────── сам замер ───────────────────────────

interface Finding { file: string; where: string; kind: string; color: string; ends: [string, string]; ratio: number; }
function audit() {
  const bad: Finding[] = []; const unresolved: string[] = []; let checked = 0; const files: string[] = [];
  for (const f of readdirSync(GAMES).filter((x: string) => x.endsWith('.tsx')).sort()) {
    files.push(f);
    const src = readFileSync(join(GAMES, f), 'utf8') as string;
    const scope = evaluate(src);
    for (const s of surfaces(src, scope)) {
      // фон под текстом: если плашка объявила свой (вуаль) — считаем по нему
      const bg: [string, string] = s.declared && s.declared.veil ? s.declared.ends : s.ends;
      for (const smp of samples(s, src)) {
        if (!smp.expr) continue;                       // цвет из темы — не наш случай
        const color = resolveColor(smp.expr, scope);
        if (!color) { unresolved.push(`${f} · ${smp.where}: не смог вычислить цвет из «${smp.expr.trim()}»`); continue; }
        const need = smp.kind === 'icon' ? AA_LARGE : AA_NORMAL;     // иконка — не текст, ей хватает 3:1
        const ratio = Math.min(
          contrastRatio(blend(color, bg[0], smp.opacity), bg[0]),
          contrastRatio(blend(color, bg[1], smp.opacity), bg[1]),
        );
        checked++;
        if (ratio < need) bad.push({ file: f, where: smp.where, kind: smp.kind, color, ends: bg, ratio });
      }
    }
  }
  return { bad, unresolved, checked, files };
}

/** Возможен ли вообще AA сплошным цветом на этих концах — чистая арифметика WCAG. */
function bestSolid(c1: string, c2: string): number {
  return Math.max(
    Math.min(contrastRatio('#000000', c1), contrastRatio('#000000', c2)),
    Math.min(contrastRatio('#ffffff', c1), contrastRatio('#ffffff', c2)),
  );
}

const RESULT = audit();

describe('контраст текста поверх градиентов', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(RESULT.files.length).toBeGreaterThanOrEqual(60);
    expect(RESULT.checked).toBeGreaterThan(150);
  });

  it('🔴 каждый цвет текста на градиенте берёт AA к ОБОИМ концам', () => {
    const notExcused = RESULT.bad.filter((b) => !KNOWN_BAD[b.file]);
    const lines = notExcused.map(
      (b) => `${b.file} · ${b.where} · ${b.kind}: ${b.color} на ${b.ends[0]}→${b.ends[1]} = ${b.ratio.toFixed(2)} (нужно ${b.kind === 'icon' ? AA_LARGE : AA_NORMAL})`,
    );
    expect(lines).toEqual([]);
  });

  it('🔴 цвет каждой надписи вычисляется — непрочитанное считается провалом, а не «наверное, там нормально»', () => {
    const notExcused = RESULT.unresolved.filter((u) => !Object.keys(KNOWN_BAD).some((k) => u.startsWith(k)));
    expect(notExcused).toEqual([]);
  });

  it('исключения не протухли: каждый файл существует и всё ещё не чинен', () => {
    const stale: string[] = [];
    for (const [f, why] of Object.entries(KNOWN_BAD)) {
      if (!existsSync(join(GAMES, f))) { stale.push(`${f}: файла нет — убрать из списка`); continue; }
      if (why.length < 25) stale.push(`${f}: причина написана для галочки`);
      const stillBroken = RESULT.bad.some((b) => b.file === f) || RESULT.unresolved.some((u) => u.startsWith(f));
      if (!stillBroken) stale.push(`${f}: уже чинен — убрать из списка исключений`);
    }
    expect(stale).toEqual([]);
  });

  it('список исключений не растёт', () => {
    expect(Object.keys(KNOWN_BAD).length).toBeLessThanOrEqual(4);
  });

  /**
   * Где сплошной цвет ВОЗМОЖЕН — вуаль не нужна и класть её нельзя: это лишнее
   * вмешательство в градиент. Ловим соблазн «накрыть всё и не думать».
   */
  it('вуаль кладётся только там, где сплошным цветом AA недостижим', () => {
    const excess: string[] = [];
    for (const f of RESULT.files) {
      const src = readFileSync(join(GAMES, f), 'utf8') as string;
      const scope = evaluate(src);
      for (const s of surfaces(src, scope)) {
        if (!(s.declared && s.declared.veil)) continue;
        const solid = bestSolid(s.ends[0], s.ends[1]);
        if (solid >= AA_NORMAL) excess.push(`${f}: ${s.ends[0]}→${s.ends[1]} — сплошной цвет даёт ${solid.toFixed(2)}, вуаль лишняя`);
      }
    }
    expect([...new Set(excess)]).toEqual([]);
  });

  it('плашка с вуалью нарисована через плашку-с-вуалью, а не голым градиентом', () => {
    const naked: string[] = [];
    for (const f of RESULT.files) {
      if (KNOWN_BAD[f]) continue;
      const src = readFileSync(join(GAMES, f), 'utf8') as string;
      const scope = evaluate(src);
      for (const s of surfaces(src, scope)) {
        const needsVeil = bestSolid(s.ends[0], s.ends[1]) < AA_NORMAL;
        if (needsVeil && s.tag === 'LinearGradient') naked.push(`${f}: ${s.ends[0]}→${s.ends[1]} — сплошным AA не берётся, а вуали нет`);
      }
    }
    expect([...new Set(naked)]).toEqual([]);
  });
});
