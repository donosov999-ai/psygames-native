/**
 * ПРАВИЛО УРОВНЯ ОБЯЗАНО ЧИТАТЬСЯ НА ВСЕХ ДВЕНАДЦАТИ ЯЗЫКАХ, А НЕ НА ДВУХ.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. Тип LevelRule был `{ ru: LevelRuleText; en: LevelRuleText }`, окно
 * выбирало `ru ? .ru : .en`. Языков в приложении двенадцать — значит десять читали
 * объяснение НОВОЙ МЕХАНИКИ по-английски: «теперь вводи с конца», «плитки легли в три
 * слоя», «стороны молча поменялись местами». Это не подпись кнопки, которую можно
 * угадать по иконке: без правила игра меняет условия молча, а человек не понимает,
 * почему перестал попадать.
 *
 * ПОЧЕМУ ЭТОГО НЕ ВИДЕЛИ ГЕЙТЫ. i18n-coverage сличает словарь со словарём: текста
 * правил в словаре не было вовсе, сличать было нечего — покрытие «100%».
 * ci-i18n-hardcode-guard ловит тернарник по языку, а тут выбор шёл по объекту
 * (`.ru` / `.en`) — другой синтаксис, мимо. tsc такой код типизирует без замечаний.
 *
 * ЧТО СТЕРЕЖЁМ ТЕПЕРЬ. Текст правил переехал в словарь (ключи lr_<игра>_<правило>_<поле>),
 * и проверяем мы его ЧЕРЕЗ ТУ ЖЕ ФУНКЦИЮ, которой пользуется окно, — levelRuleText.
 * Это принципиально: у t() есть цепочка фолбэков (локаль → overlay → EN → RU → ключ),
 * поэтому «ключа нет» выглядит как исправный английский текст. Сравнение имён ключей
 * такую дыру пропустило бы, сравнение РЕЗУЛЬТАТА — нет.
 *
 * ⚠️ ЛОЖНОЕ СРАБАТЫВАНИЕ ХУЖЕ ОТСУТСТВИЯ ПРОВЕРКИ. Поэтому «переведено» проверяется
 * не буквой, а смыслом: короткое совпадение с английским бывает честным
 * (fr «Multiplication» = en «Multiplication»), длинное предложение слово в слово —
 * не бывает. Плюс для локалей со своей письменностью требуем сами знаки этой
 * письменности: перевод на японский без единого японского знака — это не перевод.
 */
declare const __dirname: string;
declare function require(m: string): any;

import { levelRuleKey, levelRuleText, activeLevelRule, LevelRule } from '@/src/components/LevelRules';

const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const DIR = join(__dirname, '../../app/games');
const FILES: string[] = readdirSync(DIR).filter((f: string) => f.endsWith('.tsx'));

/** Все языки приложения, кроме английского: он источник, с ним и сличаем. */
const LOCALES = ['ru', 'es', 'pt', 'hi', 'zh', 'de', 'fr', 'it', 'ja', 'ko', 'ar'];

/** У этих локалей своя письменность — её знаки обязаны быть в переводе. */
const SCRIPTS: Record<string, RegExp> = {
  ru: /[Ѐ-ӿ]/,
  zh: /[一-鿿]/,
  ja: /[぀-ヿ一-鿿]/,
  ko: /[가-힯]/,
  hi: /[ऀ-ॿ]/,
  ar: /[؀-ۿ]/,
};

/**
 * ДОЛГ на 19.08.2026: экраны, где текст правил ещё лежит инлайном на двух языках.
 * Инлайн уже НЕ ЧИТАЕТСЯ — тексты этих правил перенесены в словарь, — но и удалить
 * его нельзя: файлы в работе у других. Список может только сокращаться.
 */
const INLINE_DEBT: Record<string, string> = {
  'mahjong.tsx': 'занят другой правкой (уровни/слои) — инлайн снять вместе с ней',
  'goods-sort.tsx': 'занят другой правкой (полки/цели) — инлайн снять вместе с ней',
  'picture-pairs.tsx': 'занят другой правкой (экран настройки) — инлайн снять вместе с ней',
  'set-game.tsx': 'занят другой правкой (разбор примера SET) — инлайн снять вместе с ней',
};

interface FoundRule { file: string; gameId: string; key: string; decl: LevelRule; inline: any }

/** Текст объявления `const X: LevelRule[] = [ … ];` из исходника игры. */
function rulesArrayText(src: string): string | null {
  const m = src.match(/const \w+: LevelRule\[\] = (\[[\s\S]*?\n\];)/);
  return m ? m[1].replace(/;$/, '') : null;
}

/**
 * Массив правил читаем ВЫЧИСЛЕНИЕМ литерала — так разбор переживает любой порядок
 * полей и любую разметку. Регулярка оставлена запасным путём на случай, когда в
 * объявлении появится не-литерал; если не сработала и она, правило попадёт в отчёт
 * как непрочитанное, а не пропадёт молча (молча — это гейт, который перестал быть гейтом).
 */
function collectRules(): FoundRule[] {
  const out: FoundRule[] = [];
  for (const f of FILES) {
    const src = readFileSync(join(DIR, f), 'utf8') as string;
    const gm = src.match(/useLevelRules\(\s*'([a-z_]+)'/);
    const arr = rulesArrayText(src);
    if (!gm || !arr) continue;
    let decls: LevelRule[] | null = null;
    try { decls = eval('(' + arr + ')') as LevelRule[]; } catch { decls = null; }
    if (!decls) {
      decls = [...arr.matchAll(/\bkey:\s*'([\w-]+)'[\s\S]{0,120}?fromLevel:\s*(\d+)(?:\s*,\s*toLevel:\s*(\d+))?/g)]
        .map((m) => ({ key: m[1], fromLevel: Number(m[2]), toLevel: m[3] ? Number(m[3]) : undefined }));
    }
    const declared = (arr.match(/\bkey:\s*'/g) ?? []).length;
    if (decls.length !== declared) {
      out.push({ file: f, gameId: gm[1], key: 'НЕ РАЗОБРАЛСЯ', decl: { key: 'НЕ РАЗОБРАЛСЯ', fromLevel: 1 }, inline: 'НЕ РАЗОБРАЛСЯ' });
      continue;
    }
    for (const d of decls) out.push({ file: f, gameId: gm[1], key: d.key, decl: d, inline: d.ru ?? d.en ?? null });
  }
  return out;
}

const RULES = collectRules();
const bare = (r: FoundRule): LevelRule => ({ key: r.key, fromLevel: 1 });
const FIELDS = ['title', 'rule', 'example'] as const;

describe('правила уровня переведены на все языки', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(RULES.length).toBeGreaterThan(35);
    expect(new Set(RULES.map((r) => r.gameId)).size).toBeGreaterThan(18);
  });

  it('ключ словаря собирается из игры и правила', () => {
    expect(levelRuleKey('corsi', 'reverse', 'title')).toBe('lr_corsi_reverse_title');
  });

  /**
   * Гейт полноты словарей (i18n-coverage) видит ключи регуляркой [a-zA-Z0-9_]+.
   * Правило с дефисом в key дало бы ключ, которого тот гейт НЕ ВИДИТ, — перевод
   * пропал бы молча и без единой красной проверки.
   */
  it('ключ правила состоит из букв, цифр и подчёркиваний — иначе гейт словарей его не увидит', () => {
    const bad = RULES.filter((r) => !/^[a-zA-Z0-9_]+$/.test(r.key) || !/^[a-zA-Z0-9_]+$/.test(r.gameId))
      .map((r) => `${r.file}: '${r.gameId}.${r.key}' — только латиница, цифры и _`);
    expect(bad).toEqual([]);
  });

  it('🔴 у каждого правила есть заголовок и текст на всех 12 языках', () => {
    const bad: string[] = [];
    for (const r of RULES) {
      for (const lang of ['en', ...LOCALES]) {
        const t = levelRuleText(lang, r.gameId, bare(r));
        if (!t.title.trim() || !t.rule.trim()) {
          bad.push(`${r.file} ${r.gameId}.${r.key} [${lang}]: пусто — заведи ${levelRuleKey(r.gameId, r.key, 'title')} и _rule`);
        }
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  /**
   * Главная проверка. Английский приезжает вместо перевода САМ, по цепочке фолбэков,
   * и выглядит как исправный текст — ловим именно это.
   */
  it('🔴 ни одно правило не остаётся на двух языках: перевод не равен английскому', () => {
    const bad: string[] = [];
    const shortMatches: Record<string, number> = {};
    for (const r of RULES) {
      const en = levelRuleText('en', r.gameId, bare(r));
      for (const loc of LOCALES) {
        const got = levelRuleText(loc, r.gameId, bare(r));
        for (const f of FIELDS) {
          const src = en[f];
          const val = got[f];
          if (!src || !val) continue;
          // Строка без латиницы (числа, эмодзи, «7 × 6 = 42») законно совпадает.
          if (!/[A-Za-z]{2}/.test(src)) continue;
          if (val !== src) continue;
          // Длинную фразу слово в слово не совпадают даже родственные языки — это копипаст.
          if (src.length > 25) bad.push(`${r.gameId}.${r.key}.${f} [${loc}]: слово в слово английский — «${src.slice(0, 50)}…»`);
          else shortMatches[loc] = (shortMatches[loc] ?? 0) + 1;
        }
      }
    }
    // Короткое совпадение бывает честным (fr «Multiplication»), пачка коротких — уже копипаст.
    for (const [loc, n] of Object.entries(shortMatches)) {
      if (n > 5) bad.push(`${loc}: ${n} коротких строк совпали с английским — это уже не совпадение`);
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('🔴 у локалей со своей письменностью перевод написан своими знаками', () => {
    const bad: string[] = [];
    for (const r of RULES) {
      const en = levelRuleText('en', r.gameId, bare(r));
      for (const [loc, re] of Object.entries(SCRIPTS)) {
        const got = levelRuleText(loc, r.gameId, bare(r));
        for (const f of FIELDS) {
          if (!en[f] || !/[A-Za-z]{2}/.test(en[f] as string)) continue;
          const val = got[f] as string | undefined;
          if (val && !re.test(val)) bad.push(`${r.gameId}.${r.key}.${f} [${loc}]: нет ни одного знака письменности — «${val.slice(0, 40)}»`);
        }
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  /**
   * ПРАВИЛО, КОТОРОЕ НИКОГДА НЕ ПОКАЗЫВАЕТСЯ, — ЭТО МЕХАНИКА БЕЗ ОБЪЯСНЕНИЯ.
   * Действует ПОСЛЕДНЕЕ подошедшее правило, поэтому диапазон, целиком накрытый
   * соседним (или toLevel < fromLevel по опечатке), молча съедает объяснение: текст
   * переведён на двенадцать языков и не виден ни на одном. Прогоняем настоящий выбор
   * по всей лесенке, а не сверяем числа глазами.
   */
  it('🔴 каждое правило где-то показывается: механика без объяснения не заводится', () => {
    const bad: string[] = [];
    for (const gameId of [...new Set(RULES.map((r) => r.gameId))]) {
      const rules = RULES.filter((r) => r.gameId === gameId).map((r) => r.decl);
      const shown = new Set<string>();
      for (let lvl = 1; lvl <= 60; lvl++) shown.add(activeLevelRule(rules, lvl)?.key ?? '');
      for (const r of rules) {
        if (!shown.has(r.key)) bad.push(`${gameId}.${r.key}: не показывается ни на одном уровне 1–60 — диапазон накрыт соседним правилом или toLevel меньше fromLevel`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 новые правила пишутся ключами словаря, а не инлайном на двух языках', () => {
    const bad: string[] = [];
    for (const r of RULES) {
      if (!r.inline || INLINE_DEBT[r.file]) continue;
      bad.push(`${r.file}: правило '${r.key}' объявлено с инлайн-текстом ru/en — перенеси в LanguageContext ключами ${levelRuleKey(r.gameId, r.key, 'title')} и т.д.`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * Инлайн в файлах-должниках МЁРТВ: на экран идёт словарь. Если кто-то правит текст
   * инлайном, правка молча не доезжает — сверяем и говорим, где чинить на самом деле.
   */
  it('инлайн-остаток не разъезжается со словарём', () => {
    const bad: string[] = [];
    for (const r of RULES) {
      if (!r.inline || !INLINE_DEBT[r.file]) continue;
      if (r.inline === 'НЕ РАЗОБРАЛСЯ') { bad.push(`${r.file}: не смог прочитать инлайн правила '${r.key}' — перенеси текст в словарь`); continue; }
      const dict = levelRuleText('ru', r.gameId, bare(r));
      for (const f of FIELDS) {
        if (r.inline[f] && r.inline[f] !== dict[f]) {
          bad.push(`${r.file} '${r.key}'.${f}: инлайн разошёлся со словарём — на экран идёт СЛОВАРЬ, правь ${levelRuleKey(r.gameId, r.key, f)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('каждое исключение существует и всё ещё нужно', () => {
    const stale: string[] = [];
    for (const [f, why] of Object.entries(INLINE_DEBT)) {
      expect(why.length).toBeGreaterThan(20);
      if (!FILES.includes(f)) { stale.push(`${f}: файла нет — исключение убрать`); continue; }
      const rules = RULES.filter((r) => r.file === f);
      if (!rules.length) { stale.push(`${f}: правил в файле нет — исключение убрать`); continue; }
      if (!rules.some((r) => r.inline)) stale.push(`${f}: инлайна больше нет — исключение убрать`);
    }
    expect(stale).toEqual([]);
  });

  /** Без самопроверки сломанный разбор даёт ноль находок и зелёный тест. */
  it('разбор находит правила и видит инлайн', () => {
    expect(RULES.some((r) => r.file === 'corsi.tsx' && r.key === 'reverse')).toBe(true);
    expect(RULES.filter((r) => r.inline).every((r) => INLINE_DEBT[r.file])).toBe(true);
    expect(Object.keys(INLINE_DEBT).every((f) => RULES.some((r) => r.file === f && r.inline))).toBe(true);
  });
});
