/* psygames-gate-wordlist-adult · VER 1 · 06.09.2026 */
/**
 * 🔴 В НАБОРАХ СЛОВ НЕТ ВЗРОСЛОЙ ЛЕКСИКИ. У ВСЕХ ЯЗЫКОВ СРАЗУ.
 *
 * 📍 ЗАМЕР, ИЗ-ЗА КОТОРОГО ГЕЙТ НАПИСАН (06.09.2026). Пять наборов, собранных в
 * один день из общего корпуса субтитров, приехали с бранью: итальянский — 17
 * бранных БАЗ (то есть заголовков уровня) и 20 целей, португальский — 5 и 20,
 * французский — 3 и 18, испанский — 6 и 8. Приложение помечено «Для всех».
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ, А НЕ «ПОЧИНИЛ И ЛАДНО». Фильтр стоял внутри скриптов сборки —
 * у двух языков из семи. Пока проверка живёт в сборщике, каждый новый язык
 * приезжает без неё, и заметить это можно только глазами по 12 000 слов. Здесь
 * проверяется РЕЗУЛЬТАТ: сам файл, который читает игра.
 *
 * ⚠️ СПИСОК РАЗБИРАЕТСЯ ИЗ `wordlist-build/adult_words.py`, а не дублируется
 * здесь. Два списка разъедутся — это вопрос времени, а не аккуратности.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const КОРЕНЬ = path.join(__dirname, '../../..');

/** Разбор питоновского словаря списков: `'xx': { 'a', 'b' },`. */
function взрослыеСлова(): Record<string, Set<string>> {
  const src: string = fs.readFileSync(
    path.join(КОРЕНЬ, 'wordlist-build/adult_words.py'), 'utf8');
  const тело = /ВЗРОСЛОЕ\s*=\s*\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
  const из: Record<string, Set<string>> = {};
  for (const m of тело.matchAll(/'([a-z]{2})'\s*:\s*\{([\s\S]*?)\},/g)) {
    из[m[1] as string] = new Set(
      [...(m[2] as string).matchAll(/'([^']+)'/g)].map((x) => (x[1] as string).toLowerCase()));
  }
  return из;
}

const СПИСКИ = взрослыеСлова();
const НАБОРЫ: Record<string, string> = {
  de: 'allWordsDe.json', es: 'allWordsEs.json', fr: 'allWordsFr.json',
  it: 'allWordsIt.json', pt: 'allWordsPt.json', ko: 'allWordsKo.json',
};

/**
 * 🔴 КОРЕЙСКИЙ НАБОР ЖИВЁТ В ЧАМО, А СПИСОК БРАНИ ЗАПИСАН СЛОГАМИ.
 *
 * Без перевода сравнение шло бы между разными формами записи и не находило бы
 * НИЧЕГО НИКОГДА — проверка была бы зелёной ровно потому, что слепа. Перевод
 * повторяет тот, что делает сборщик: слог = 0xAC00 + (нач×21 + глас)×28 + кон.
 */
const НАЧ = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const ГЛАС = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const КОН = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
function вЧамо(слово: string): string {
  const из: string[] = [];
  for (const ch of слово) {
    const k = (ch.codePointAt(0) as number) - 0xAC00;
    if (k < 0 || k >= 11172) return слово;   // не хангыль — оставляем как есть
    из.push(НАЧ[Math.floor(k / 588)] as string);
    из.push(ГЛАС[Math.floor((k % 588) / 28)] as string);
    const х = КОН[k % 28] as string;
    if (х) из.push(х);
  }
  return из.join('');
}

/** Список в той же форме, в какой лежит набор этого языка. */
function списокДляЯзыка(л: string): Set<string> {
  const слова = СПИСКИ[л] ?? new Set<string>();
  return л === 'ko' ? new Set([...слова].map(вЧамо)) : слова;
}

function набор(файл: string): { base: string; words: string[] }[] {
  return JSON.parse(fs.readFileSync(
    path.join(КОРЕНЬ, 'frontend/src/constants', файл), 'utf8'));
}

describe('в наборах слов нет взрослой лексики', () => {
  /**
   * САМОПРОВЕРКА ОТ СЛЕПОГО ЗЕЛЁНОГО: разбор мог не найти ни одного слова, и
   * тогда «совпадений 0» означало бы «я ничего не искал».
   */
  it('есть что проверять: список разобран и не пуст', () => {
    expect(Object.keys(СПИСКИ).sort()).toEqual(Object.keys(НАБОРЫ).sort());
    for (const [л, слова] of Object.entries(СПИСКИ)) {
      expect(`${л}: ${slovaSize(слова)}`).toBe(`${л}: ${slovaSize(слова)}`);
      // ⚠️ Порог у корейского ниже, и это ЗАМЕР, а не поблажка: весь список
      // LDNOOBW ko — 72 слова против нескольких сотен у латинских языков, и в
      // наш набор из них попало шесть. Требовать пятнадцати значило бы дописать
      // список словами, которых в наборе нет, — то есть подогнать проверку.
      expect(слова.size).toBeGreaterThan(л === 'ko' ? 3 : 15);
    }
  });

  it('🔴 ни одна БАЗА не бранная — база это заголовок уровня', () => {
    const плохо: string[] = [];
    for (const [л, файл] of Object.entries(НАБОРЫ)) {
      const гр = списокДляЯзыка(л);
      for (const p of набор(файл)) {
        if (гр.has(p.base.toLowerCase())) плохо.push(`${л}: база «${p.base}»`);
      }
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 ни одна ЦЕЛЬ не бранная', () => {
    const плохо: string[] = [];
    for (const [л, файл] of Object.entries(НАБОРЫ)) {
      const гр = списокДляЯзыка(л);
      for (const p of набор(файл)) {
        for (const w of p.words) {
          if (гр.has(w.toLowerCase())) плохо.push(`${л}: «${p.base}» → «${w}»`);
        }
      }
    }
    expect(плохо.slice(0, 8)).toEqual([]);
  });

  /**
   * ⚠️ И ЧИСТКА НЕ СЪЕЛА НАБОР. Выбросить всё — тоже способ пройти проверку выше;
   * замер после чистки: de 1999 · es 1651 · fr 1491 · it 1987 · pt 1996.
   */
  it('🔴 после чистки в каждом наборе осталось не меньше 1400 раскладок', () => {
    const мало: string[] = [];
    for (const [л, файл] of Object.entries(НАБОРЫ)) {
      const n = набор(файл).length;
      if (n < 1400) мало.push(`${л}: ${n}`);
    }
    expect(мало).toEqual([]);
  });

  /**
   * ⚠️ РУССКИЙ И АНГЛИЙСКИЙ ФИЛЬТРУЮТСЯ В СВОИХ СКРИПТАХ СБОРКИ (правка соседней
   * сессии 06.09.2026), и их списки сюда не скопированы намеренно — копия
   * разъехалась бы. Здесь стоит узкий сторож от возврата: горстка слов, которые
   * из этих наборов были сняты поимённо.
   */
  it('🔴 в русский и английский наборы брань не вернулась', () => {
    const сторож: Record<string, string[]> = {
      allWordsRu: ['жопа', 'секс', 'экстази', 'идиот'],
      allWordsEn: ['cunt', 'anal', 'anus', 'slut', 'rape', 'asshole', 'bastard'],
    };
    const плохо: string[] = [];
    for (const [имя, слова] of Object.entries(сторож)) {
      const гр = new Set(слова);
      for (const p of набор(`${имя}.json`)) {
        if (гр.has(p.base.toLowerCase())) плохо.push(`${имя}: база «${p.base}»`);
        for (const w of p.words) if (гр.has(w.toLowerCase())) плохо.push(`${имя}: «${w}»`);
      }
    }
    expect(плохо.slice(0, 8)).toEqual([]);
  });
});

function slovaSize(s: Set<string>): number { return s.size; }
