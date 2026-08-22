/* psygames-n-back-dprime-gate · VER 1 · 23.08.2026 */
/**
 * d′ ОБЯЗАН ГОВОРИТЬ ТО, ЧЕГО НЕ ГОВОРИТ ПРОЦЕНТ — ИНАЧЕ ОН ЛИШНЕЕ ЧИСЛО.
 *
 * 🔴 ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО. Проба «на экране есть строка d′»
 * зелена и тогда, когда под подписью стоит доля верных ответов, помноженная на
 * два. Такая проверка охраняет вёрстку, а не смысл, — и человек по-прежнему
 * читает про своё различение по числу, которое различения не измеряет.
 * Поэтому здесь доказывается САМА ВЕЛИЧИНА: два игрока с ОДИНАКОВОЙ точностью,
 * но разной манерой отвечать, обязаны получить РАЗНЫЙ d′. Не получают —
 * показатель ничего не добавляет к проценту, и выводить его незачем.
 *
 * ⚠️ ПОЧЕМУ В ФАЙЛЕ ЛЕЖИТ КОПИЯ СТАРОЙ ФОРМУЛЫ. Расчёт переехал из обработчика
 * `finishGame` в `src/games/n-back/core/dprime.ts`, и обещание переезда было
 * ровно одно: числа не меняются. Обещание, которое нечем предъявить, — это не
 * обещание: сохранённые `d_prime` прошлых партий сравниваются с новыми, и
 * тихой правкой коэффициента можно порвать всю историю. `LEGACY_D_PRIME` —
 * дословный слепок кода ДО переезда; сверка идёт по сетке из сотен раскладов.
 *
 * ⚠️ ЧТО ЗДЕСЬ НЕ ПРОВЕРЯЕТСЯ. Ни одна проба не утверждает, что высокий d′
 * что-то говорит о человеке за пределами этой партии. d′ — мера того,
 * насколько ответы отличались от угадывания, и только.
 */
import {
  NBACK_DPRIME_CHANCE,
  N_BACK_LOCALES,
  accuracyPercent,
  getNBackStrings,
  signalDetection,
  zScore,
  type NBackCounts,
  type NBackLocale,
} from '@/src/games/n-back/core';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '../..');
const SCREEN = join(ROOT, 'app/games/n-back.tsx');
const MODULE_DIR = join(ROOT, 'src/games/n-back');
const RESULT = join(ROOT, 'src/components/GameResult.tsx');
const read = (p: string): string => readFileSync(p, 'utf8') as string;

const counts = (hits: number, misses: number, falseAlarms: number, correctRejections: number): NBackCounts =>
  ({ hits, misses, falseAlarms, correctRejections });

/** Доля верных ответов в процентах — то же, что видит человек рядом с d′. */
const accuracyOf = (c: NBackCounts): number => accuracyPercent(c, 0);

/**
 * Слепок расчёта ДО переезда в модуль: те же коэффициенты, тот же порядок
 * действий, та же поправка и то же округление. Трогать эту функцию нельзя —
 * она здесь именно для того, чтобы поймать правку в рабочем коде.
 */
function LEGACY_D_PRIME(c: NBackCounts): number {
  const hitTrials = c.hits + c.misses;
  const faTrials = c.falseAlarms + c.correctRejections;
  const hitRate = hitTrials > 0 ? (c.hits + 0.5) / (hitTrials + 1) : 0.5;
  const faRate = faTrials > 0 ? (c.falseAlarms + 0.5) / (faTrials + 1) : 0.5;
  const z = (p: number): number => {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const cc = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pLow = 0.02425, pHigh = 1 - pLow;
    let q, r;
    if (p < pLow) { q = Math.sqrt(-2 * Math.log(p)); return (((((cc[0]*q+cc[1])*q+cc[2])*q+cc[3])*q+cc[4])*q+cc[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p <= pHigh) { q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((cc[0]*q+cc[1])*q+cc[2])*q+cc[3])*q+cc[4])*q+cc[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  };
  return Number((z(hitRate) - z(faRate)).toFixed(2));
}

describe('d′ говорит то, чего не говорит процент', () => {
  /**
   * 🔴 ГЛАВНАЯ ПРОБА. Двадцать проб, шесть повторов. Осторожный жмёт редко и ни
   * разу мимо; щедрый ловит все повторы, но трижды жмёт на новом. Доля верных
   * ответов у обоих одна и та же — 85%. Если d′ у них тоже совпадёт, показывать
   * его человеку бессмысленно: он повторит процент другими цифрами.
   */
  it('🔴 осторожный и щедрый с одной точностью получают РАЗНЫЙ d′', () => {
    const cautious = counts(3, 3, 0, 14);   // мало попаданий, ни одной ложной тревоги
    const liberal = counts(6, 0, 3, 11);    // все попадания, но и три ложных тревоги

    expect(accuracyOf(cautious)).toBe(85);
    expect(accuracyOf(liberal)).toBe(85);   // процент их не различает вовсе

    const dCautious = signalDetection(cautious).dPrime;
    const dLiberal = signalDetection(liberal).dPrime;
    expect(`${dCautious} vs ${dLiberal}`).toBe('1.83 vs 2.19');
    expect(dCautious).not.toBe(dLiberal);
  });

  /**
   * 🔴 ТО ЖЕ НА СЛУЧАЕ, РАДИ КОТОРОГО ВСЁ И ЗАТЕВАЛОСЬ. Молчун не заметил ни
   * одного повтора — и получил 70% на одних правильных отказах. Второй игрок с
   * теми же 70% ловит все повторы, платя за это ложными тревогами. Процент у
   * них общий, различение — разное вчетверо.
   */
  it('🔴 70% молчуна и 70% работающего игрока — это разные d′', () => {
    const silent = counts(0, 6, 0, 14);     // не нажал ни разу
    const working = counts(6, 0, 6, 8);     // поймал все повторы, шесть раз ошибся

    expect(accuracyOf(silent)).toBe(70);
    expect(accuracyOf(working)).toBe(70);

    const dSilent = signalDetection(silent).dPrime;
    const dWorking = signalDetection(working).dPrime;
    expect(`${dSilent} vs ${dWorking}`).toBe('0.37 vs 1.63');
    expect(dWorking).toBeGreaterThan(dSilent);
  });

  /**
   * 🔴 ЛОЖНЫЕ ТРЕВОГИ ОБЯЗАНЫ СТОИТЬ. Попадания у всех троих одинаковые —
   * меняется только число нажатий на новом. Расчёт, забывший про ложные
   * тревоги, выдаст здесь три одинаковых числа.
   */
  it('🔴 при тех же попаданиях лишние нажатия строго снижают d′', () => {
    const noFa = signalDetection(counts(6, 0, 0, 14)).dPrime;
    const threeFa = signalDetection(counts(6, 0, 3, 11)).dPrime;
    const sixFa = signalDetection(counts(6, 0, 6, 8)).dPrime;
    expect([noFa, threeFa, sixFa]).toEqual([3.3, 2.19, 1.63]);
    expect(noFa).toBeGreaterThan(threeFa);
    expect(threeFa).toBeGreaterThan(sixFa);
  });

  /** Пропущенные повторы обязаны стоить ровно так же — с другой стороны. */
  it('🔴 при тех же ложных тревогах пойманные повторы строго повышают d′', () => {
    const two = signalDetection(counts(2, 4, 0, 14)).dPrime;
    const three = signalDetection(counts(3, 3, 0, 14)).dPrime;
    const four = signalDetection(counts(4, 2, 0, 14)).dPrime;
    expect([two, three, four]).toEqual([1.47, 1.83, 2.2]);
    expect(three).toBeGreaterThan(two);
    expect(four).toBeGreaterThan(three);
  });

  it('ответы наугад дают ровно ноль — это и есть точка отсчёта подписи', () => {
    expect(signalDetection(counts(3, 3, 7, 7)).dPrime).toBe(NBACK_DPRIME_CHANCE);
    expect(NBACK_DPRIME_CHANCE).toBe(0);
  });
});

describe('края не ломают число', () => {
  /**
   * 🔴 БЕЗ ПОПРАВКИ ЗДЕСЬ БЫЛА БЫ БЕСКОНЕЧНОСТЬ. Чистая партия: все повторы
   * пойманы, ни одного лишнего нажатия. Доли выходят на 1 и 0, z(1) = +∞,
   * z(0) = −∞ — на экране человека это «Infinity», в базе сломанная история.
   */
  it('🔴 чистая партия даёт конечное число, а не Infinity', () => {
    const perfect = signalDetection(counts(6, 0, 0, 14));
    expect(Number.isFinite(perfect.dPrime)).toBe(true);
    expect(perfect.dPrime).toBe(3.3);
    expect(accuracyOf(counts(6, 0, 0, 14))).toBe(100);
  });

  it('🔴 зеркальный край (ни одного попадания, одни ложные тревоги) тоже конечен', () => {
    const worst = signalDetection(counts(0, 6, 14, 0));
    expect(Number.isFinite(worst.dPrime)).toBe(true);
    expect(worst.dPrime).toBe(-3.3);
  });

  /** 🔴 Пустая партия: делить не на что, и выдумывать нечего — ровно ноль. */
  it('🔴 пустая партия не делит на ноль и даёт d′ = 0', () => {
    const empty = signalDetection(counts(0, 0, 0, 0));
    expect(empty.answered).toBe(0);
    expect(empty.hitRate).toBe(0.5);
    expect(empty.falseAlarmRate).toBe(0.5);
    expect(empty.dPrime).toBe(0);
    expect(Number.isNaN(empty.dPrime)).toBe(false);
  });

  /**
   * 🔴 ПОПРАВКА ПРИМЕНЕНА К ОБОИМ КАНАЛАМ, А НЕ ТОЛЬКО К ВИЗУАЛЬНОМУ. Слуховой
   * поток идёт через ту же функцию, поэтому проверяем на его крайних раскладах:
   * канал, в котором не было ни одной пробы, не должен рвать итог.
   */
  it('🔴 канал без единой пробы не рвёт расчёт второго', () => {
    const visual = signalDetection(counts(5, 1, 1, 13));
    const audioNeverPlayed = signalDetection(counts(0, 0, 0, 0));
    expect(Number.isFinite(visual.dPrime)).toBe(true);
    expect(Number.isFinite(audioNeverPlayed.dPrime)).toBe(true);
    expect(audioNeverPlayed.dPrime).toBe(0);
  });

  /**
   * Запасное значение точности выбирает вызывающий, и это не украшение:
   * итог двойного режима берётся МИНИМУМОМ каналов. Верни пустой слуховой
   * канал ноль — и человек проваливал бы уровень, ничего не сделав неверно.
   */
  it('🔴 пустая точность отдаёт то, что просил вызывающий: 0 для визуала, 100 для звука', () => {
    expect(accuracyPercent(counts(0, 0, 0, 0), 0)).toBe(0);
    expect(accuracyPercent(counts(0, 0, 0, 0), 100)).toBe(100);
    expect(Math.min(accuracyPercent(counts(9, 1, 0, 10), 0), accuracyPercent(counts(0, 0, 0, 0), 100))).toBe(95);
  });

  it('z-оценка симметрична и монотонна — иначе разность z не измеряет ничего', () => {
    expect(zScore(0.5)).toBeCloseTo(0, 6);
    expect(zScore(0.975)).toBeCloseTo(1.959964, 4);
    expect(zScore(0.025)).toBeCloseTo(-1.959964, 4);
    expect(zScore(0.01)).toBeCloseTo(-2.326348, 4);   // ветка «хвост», ниже pLow
    expect(zScore(0.99)).toBeCloseTo(2.326348, 4);    // и зеркальная ей
    for (let p = 0.02; p < 0.98; p += 0.02) expect(zScore(p + 0.01)).toBeGreaterThan(zScore(p));
  });
});

describe('переезд в модуль не изменил ни одного числа', () => {
  /**
   * 🔴 СВЕРКА С ДОПЕРЕЕЗДНЫМ КОДОМ ПО ВСЕЙ СЕТКЕ РАСКЛАДОВ. Двадцать проб,
   * любое распределение исходов: каждое число обязано совпасть со слепком.
   */
  it('🔴 на любом раскладе двадцати проб d′ совпадает с дореформенным', () => {
    const diffs: string[] = [];
    let checked = 0;
    for (let hits = 0; hits <= 8; hits++) {
      for (let misses = 0; misses <= 8; misses++) {
        for (let fa = 0; fa <= 8; fa++) {
          for (let cr = 0; cr <= 8; cr++) {
            const c = counts(hits, misses, fa, cr);
            checked++;
            const now = signalDetection(c).dPrime;
            const before = LEGACY_D_PRIME(c);
            if (now !== before) diffs.push(`${hits}/${misses}/${fa}/${cr}: было ${before}, стало ${now}`);
          }
        }
      }
    }
    expect(checked).toBe(9 * 9 * 9 * 9);
    expect(diffs.slice(0, 10)).toEqual([]);
  });

  /**
   * ⚠️ САМОПРОВЕРКА СВЕРКИ. Проба выше стоит ровно столько, сколько стоит её
   * способность увидеть расхождение: сравнение, которое всегда согласно,
   * зелено и на сломанном коде.
   */
  it('сверка и правда различает числа, а не согласна со всем подряд', () => {
    expect(LEGACY_D_PRIME(counts(6, 0, 0, 14))).not.toBe(LEGACY_D_PRIME(counts(0, 6, 0, 14)));
  });
});

describe('число доезжает до человека, а не только до базы', () => {
  const screen = read(SCREEN);
  const result = read(RESULT);

  it('🔴 экран считает d′ ядром, а не своей копией формулы', () => {
    expect(screen).toContain("from '@/src/games/n-back/core'");
    expect(screen).toContain('signalDetection(visualCounts)');
    expect(screen).toContain('signalDetection(audioCounts)');
    // Локальная аппроксимация обратной нормали внутри экрана больше не живёт.
    expect(screen).not.toContain('Beasley-Springer-Moro');
    expect(screen).not.toContain('const zScore = (p: number)');
  });

  it('🔴 d′ показан и рядом с точностью, и по каждому каналу отдельно', () => {
    expect(screen).toContain('nbStrings.accuracy');
    expect(screen).toContain('nbStrings.dPrime');
    expect(screen).toContain('nbStrings.channelVisual');
    expect(screen).toContain('nbStrings.channelAudio');
    // Числа берутся из сохранённого разбора партии, а не пересчитываются при отрисовке.
    expect(screen).toContain('readout.visual.dPrime.toFixed(2)');
    expect(screen).toContain('readout.audio.dPrime.toFixed(2)');
  });

  /**
   * 🔴 ОБЕ РАЗВИЛКИ ИТОГА. Полноэкранный `GameResult` достаётся только пресетам
   * («Вызов дня», зарядка); обычная игра идёт по лестнице уровней и видит
   * `LevelCleared`. Показ только в одной из веток означал бы, что в обычной
   * игре d′ по-прежнему не видит никто.
   */
  it('🔴 разбор показан и в пресете, и в обычной лестнице уровней', () => {
    expect(screen).toContain('metrics={readoutMetrics}');
    expect(screen).toContain('metricsNote={readoutNote}');
    expect(screen).toContain("phase === 'cleared' && readoutMetrics && readoutNote");
    expect(screen).toContain('styles.readoutStrip');
  });

  it('🔴 разбор обнуляется в начале партии — числа прошлой не висят поверх новой', () => {
    expect(screen).toContain('setReadout(null)');
  });

  /**
   * 🔴 ОБЩИЙ ЭКРАН ИТОГА ОСТАЛСЯ ЦЕЛ ДЛЯ ОСТАЛЬНЫХ ИГР. Свойства
   * необязательные: не передали — ряда нет. Обязательное свойство сломало бы
   * все семьдесят вызовов разом.
   */
  it('🔴 у GameResult новые свойства необязательные', () => {
    expect(result).toContain('metrics?: { label: string; value: string; icon?: string }[];');
    expect(result).toContain('metricsNote?: string[];');
    expect(result).toContain('{metrics && metrics.length > 0 && (');
    expect(result).toContain('{metricsNote && metricsNote.length > 0 && (');
  });
});

/**
 * СЛОВАРЬ МОДУЛЯ — ДВЕНАДЦАТЬ ЯЗЫКОВ И НИ ОДНОЙ МЁРТВОЙ СТРОКИ.
 * Требования и их причины — в шапке `src/__tests__/games-module-i18n.test.ts`
 * и в самом словаре `src/games/n-back/core/i18n.ts`.
 */
describe('подписи разбора знают все двенадцать языков', () => {
  /** Языки приложения читаем из LanguageContext, а не переписываем сюда. */
  const APP_LOCALES: string[] = (() => {
    const dict = read(join(ROOT, 'src/contexts/LanguageContext.tsx'));
    const decl = /type Language =([^;]+);/.exec(dict) as RegExpExecArray;
    return [...decl[1].matchAll(/'([a-z]{2})'/g)].map((m: RegExpMatchArray) => m[1]).sort();
  })();

  /** Комментарии убираем, строковые литералы сохраняем: в них живут обращения. */
  function stripComments(s: string): string {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      const n = s[i + 1];
      if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); out += ' '; i = e < 0 ? s.length : e + 2; continue; }
      if (c === '/' && n === '/') { const e = s.indexOf('\n', i); out += ' '; i = e < 0 ? s.length : e; continue; }
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1;
        while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === c) break; j++; }
        out += s.slice(i, j + 1); i = j + 1; continue;
      }
      out += c; i++;
    }
    return out;
  }

  /** Обращения к словарю: `nbStrings.dPrime`, `getNBackStrings(l).accuracy`. */
  function usedKeys(code: string): Set<string> {
    const used = new Set<string>();
    for (const m of code.matchAll(/\b\w*[Ss]trings\.(\w+)\b/g)) used.add(m[1]);
    for (const m of code.matchAll(/Strings\([^)]*\)\.(\w+)/g)) used.add(m[1]);
    return used;
  }

  /** Весь код игры: модуль (кроме самого словаря) плюс экран-владелец. */
  function gameCode(): string {
    let code = '';
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true }) as any[]) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(entry.name) && !p.endsWith(join('core', 'i18n.ts'))) code += stripComments(read(p));
      }
    };
    walk(MODULE_DIR);
    return code + stripComments(read(SCREEN));
  }

  const strings = (l: string): Record<string, string> =>
    getNBackStrings(l as NBackLocale) as unknown as Record<string, string>;

  /**
   * Совпадение с английским разрешено поимённо и с причиной. Пусто — и хорошо:
   * значит, ни одна строка не осталась английской заглушкой.
   */
  const SAME_AS_EN: Record<string, string> = {};

  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(APP_LOCALES.length).toBe(12);
    expect(Object.keys(strings('ru')).length).toBeGreaterThanOrEqual(6);
  });

  it('🔴 языки словаря и языки приложения — один список', () => {
    expect([...N_BACK_LOCALES].sort()).toEqual(APP_LOCALES);
  });

  it('🔴 в каждом языке те же ключи, и ни одна строка не пустая', () => {
    const ruKeys = Object.keys(strings('ru')).sort();
    const holes: string[] = [];
    for (const locale of APP_LOCALES) {
      const s = strings(locale);
      const keys = Object.keys(s).sort();
      for (const k of ruKeys) if (!keys.includes(k)) holes.push(`${locale}: нет ключа ${k}`);
      for (const k of keys) if (!ruKeys.includes(k)) holes.push(`${locale}: лишний ключ ${k}`);
      for (const [k, v] of Object.entries(s)) {
        if (typeof v !== 'string' || v.trim().length === 0) holes.push(`${locale}.${k}: пусто`);
      }
    }
    expect(holes).toEqual([]);
  });

  it('🔴 ни одна строка не осталась английской копией', () => {
    const en = strings('en');
    const stub: string[] = [];
    for (const locale of APP_LOCALES) {
      if (locale === 'en') continue;
      for (const [k, v] of Object.entries(strings(locale))) {
        if (v === en[k] && !SAME_AS_EN[`${locale}.${k}`]) stub.push(`${locale}.${k}: «${v}» — как по-английски`);
      }
    }
    expect(stub).toEqual([]);
  });

  it('🔴 у локалей со своей письменностью текст написан своими знаками', () => {
    const SCRIPTS: Record<string, RegExp> = {
      ru: /[Ѐ-ӿ]/, zh: /[一-鿿]/, ja: /[぀-ヿ一-鿿]/,
      ko: /[가-힯]/, ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/,
    };
    const bad: string[] = [];
    for (const [locale, re] of Object.entries(SCRIPTS)) {
      for (const [k, v] of Object.entries(strings(locale))) {
        const bare = String(v).replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '');
        if (bare.length > 2 && !re.test(String(v))) bad.push(`${locale}.${k}: «${v}»`);
      }
    }
    expect(bad).toEqual([]);
  });

  /** 🔴 Переведённая на двенадцать языков и не выведенная строка — ложное «переведено». */
  it('🔴 каждый ключ словаря выводится на экран', () => {
    const used = usedKeys(gameCode());
    const dead = Object.keys(strings('ru')).filter((k) => !used.has(k));
    expect(dead).toEqual([]);
  });

  it('⚠️ гейт отличает вызов от упоминания в комментарии', () => {
    expect([...usedKeys('const a = nbStrings.dPrime;')]).toContain('dPrime');
    expect([...usedKeys('getNBackStrings(language).accuracy')]).toContain('accuracy');
    expect([...usedKeys(stripComments('/* nbStrings.dPrime живёт тут */\n// nbStrings.accuracy\n'))]).toEqual([]);
    expect(usedKeys(gameCode()).size).toBeGreaterThanOrEqual(6);
  });

  it('🔴 экран отдаёт словарю ПОЛНЫЙ язык, а не пару ru/en', () => {
    const code = stripComments(read(SCREEN));
    expect(code).toContain('getNBackStrings(language)');
    expect(/getNBackStrings\(\s*language\s*===\s*'ru'/.test(code)).toBe(false);
  });

  it('незнакомый язык отдаёт английский, а не пустоту', () => {
    expect(getNBackStrings('xx' as NBackLocale)).toBe(getNBackStrings('en'));
  });

  /** Подпись обязана объяснять шкалу и НЕ обещать роста ума. */
  it('🔴 пояснение называет точку отсчёта и ничего не обещает про IQ', () => {
    const banned = /\bIQ\b|интеллект|ум(нее|ней)|smarter|memory boost|brain training/i;
    const noZero: string[] = [];
    for (const locale of APP_LOCALES) {
      const s = strings(locale);
      if (!s.dPrimeHint.includes('0') || !s.dPrimeHint.includes('1')) noZero.push(`${locale}: в пояснении нет шкалы «0 — наугад, выше 1 — различение»`);
      for (const [k, v] of Object.entries(s)) {
        if (banned.test(v)) noZero.push(`${locale}.${k}: обещает то, чего d′ не измеряет — «${v}»`);
      }
    }
    expect(noZero).toEqual([]);
  });
});
