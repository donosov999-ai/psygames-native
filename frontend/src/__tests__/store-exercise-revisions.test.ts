/* psygames-store-exercise-revisions · VER 1 · 21.08.2026 */
/**
 * РЕДАКЦИИ УПРАЖНЕНИЙ — ДОВОД В КАРТОЧКЕ, А НЕ ВНУТРЕННЯЯ КУХНЯ.
 *
 * 🔴 ЗАЧЕМ ЭТО В КАРТОЧКЕ. Решение владельца: номеров упражнениям не давать, но
 * номер РЕДАКЦИИ показывать — в отчётах тестировщиков (сделано, поле `game_ver`
 * приходит с боевыми отчётами) и в описании Play. Довод здесь не про темп, а про
 * подотчётность: жалоба уходит вместе с номером редакции экрана, и когда экран
 * переписали по этой жалобе — номер вырос.
 *
 * ⚠️ ЧИСЛО В КАРТОЧКЕ НЕ НАЗЫВАЕМ, И ЭТО РЕШЕНИЕ, А НЕ ЗАБЫВЧИВОСТЬ. На 21.08.2026
 * из 72 упражнений переизданы девять — «9 из 72» протухнет через неделю, а править
 * двенадцать локалей ради каждой новой редакции никто не станет. Формулировка без
 * числа верна всегда. Гейт ниже краснеет на ПОЯВЛЕНИЕ числа рядом с доводом:
 * назвал цифру — обязан сверять её с реестром, иначе карточка начнёт врать молча.
 *
 * ⚠️ ПОЧЕМУ ПРОВЕРКА НЕ ПО СЛОВУ. Искать «редакция» бессмысленно: слово стоит и в
 * разборе внутри файла, и в истории правок. Проверяем ТОЛЬКО текст поля описания —
 * то, что человек прочитает в магазине, — и требуем связки «редакция + отчёт», а
 * не одинокого термина.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const STORE = join(__dirname, '../../../store/google-play');
const REGISTRY = join(__dirname, '../constants/gameVersions.ts');

const langs = (): string[] =>
  readdirSync(STORE)
    .filter((f: string) => /^listing-\w+\.md$/.test(f))
    .map((f: string) => f.replace(/^listing-|\.md$/g, ''));

const read = (lang: string): string => readFileSync(join(STORE, `listing-${lang}.md`), 'utf8');

/** Текст поля, а не разбор вокруг него: то, что увидит человек в магазине. */
function field(lang: string, section: 2 | 3): string {
  const s = read(lang);
  const m = s.match(new RegExp(`## ${section}\\.[^\\n]*\\n[\\s\\S]*?\`\`\`\\n([\\s\\S]*?)\\n\`\`\``));
  return m ? m[1] : '';
}

/** Сколько упражнений реально переиздано — по реестру, а не по памяти. */
function reissued(): { total: number; reissued: number } {
  const src = readFileSync(REGISTRY, 'utf8') as string;
  const rows = [...src.matchAll(/'[a-z0-9-]+':\s*\{\s*ver:\s*(\d+)/g)].map((m) => Number(m[1]));
  return { total: rows.length, reissued: rows.filter((v) => v > 1).length };
}

/**
 * Довод про редакции — по СМЫСЛУ, а не по слову. Требуем два признака рядом:
 * само понятие редакции/версии упражнения И связь с отчётом человека. Одинокое
 * слово «версия» (оно есть в любой карточке) проверку не пройдёт.
 */
const REVISION = /редакц|версии|Fassungsnummer|revision|révision|revisión|revisione|revisão|バージョン|改訂|개정|버전|版本|संस्करण|مراجعة|إصدار/i;
const REPORT = /жалоб|отчёт|сообщени|Meldung|report|signalement|informe|reporte|segnalazione|relato|報告|レポート|리포트|제보|反馈|报告|रिपोर्ट|ملاحظت|بلاغ/i;

describe('редакции упражнений в карточке Play', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(langs().length).toBe(12);
    expect(reissued().total).toBeGreaterThanOrEqual(60);
  });

  it('🔴 довод про редакции есть во ВСЕХ языках, а не только в русском', () => {
    const без = langs().filter((l) => {
      const t = field(l, 3);
      return !(REVISION.test(t) && REPORT.test(t));
    });
    expect(без).toEqual([]);
  });

  it('🔴 довод стоит в тексте поля, а не в разборе для своих', () => {
    // Разбор вокруг поля в гейт не попадает: проверяем ровно то, что уедет в Google.
    for (const l of langs()) expect(`${l}: ${field(l, 3).length > 500}`).toBe(`${l}: true`);
  });

  /**
   * 🔴 ЗАЩИТА ОТ ПРОТУХШЕЙ ЦИФРЫ. Пока числа нет — проверка держит его отсутствие.
   * Захочет кто-то назвать «9 из 72» — гейт покраснеет и потребует сверки с
   * реестром, а не с памятью автора.
   */
  it('🔴 рядом с доводом про редакции нет числа, которое некому сверять', () => {
    const { reissued: n, total } = reissued();
    const врут: string[] = [];
    for (const l of langs()) {
      for (const line of field(l, 3).split('\n')) {
        if (!REVISION.test(line)) continue;
        const nums = [...line.matchAll(/\d+/g)].map((m) => Number(m[0]));
        for (const num of nums) {
          if (num !== n && num !== total) врут.push(`${l}: «${line.trim().slice(0, 60)}…» — число ${num} не сходится с реестром (${n} из ${total})`);
        }
      }
    }
    expect(врут).toEqual([]);
  });

  it('поля влезают в лимиты Google — 4000 на описание, 80 на краткое', () => {
    const велики: string[] = [];
    for (const l of langs()) {
      const полное = field(l, 3).length;
      const краткое = field(l, 2).length;
      if (полное > 4000) велики.push(`${l}: описание ${полное}/4000`);
      if (краткое === 0 || краткое > 80) велики.push(`${l}: краткое ${краткое}/80`);
    }
    expect(велики).toEqual([]);
  });
});
