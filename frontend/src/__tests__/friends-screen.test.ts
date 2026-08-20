/* psygames-friends-screen · VER 1 · 21.08.2026 */
/**
 * ЭКРАН «ДРУЗЬЯ»: РАЗНЫЕ БЕДЫ — РАЗНЫЕ СЛОВА, И ВИТРИНА НЕ РАСТЁТ.
 *
 * 🔴 ЗАЧЕМ ГЕЙТ ОТДЕЛЬНО ОТ `friends.test.ts`. Тот проверяет СЕРВИС: что
 * `friendsView` различает пять состояний, а `addFriendByCode` — три исхода. Но
 * разведённые в сервисе случаи ничего не стоят, если экран сведёт их обратно в
 * одно «Пока пусто»: сервис зелен, тесты зелены, а человек с пятью друзьями и
 * без сети читает то же, что новичок. Сведение обратно — правка на одну строку
 * в JSX, и увидеть её можно только глазами. Значит нужен машинный запрет.
 *
 * 🔴 И ВТОРОЕ, РАДИ ЧЕГО ЭТОТ ФАЙЛ СУЩЕСТВУЕТ: ВИТРИНА НЕ ДОЛЖНА РАСТИ. Круг
 * друзей построен как ВИД на уже опубликованные очки — ни одного нового личного
 * поля. Самая естественная следующая правка («покажем, что друг тренировался
 * сегодня») означает вынести на сервер ежедневную активность каждого и
 * переписать Data Safety в Play. Это решение владельца, а не побочный эффект
 * дружбы, — поэтому импорт истории тренировок в этот экран запрещён машиной.
 *
 * ⚠️ ВЕСЬ РАЗБОР ИДЁТ ПО ИСХОДНИКУ СО СРЕЗАННЫМИ КОММЕНТАРИЯМИ. В шапке экрана
 * дословно перечислены и `nobody-played`, и «стрики», и `friendsView` — гейт,
 * ищущий по всему тексту, зеленел бы от рассказа о починке вместо самой
 * починки, а запрет на стрики краснел бы от объяснения, почему их нет.
 */
declare const __dirname: string;
declare function require(m: string): any;

const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

import { LEADERBOARD_GAMES, LeaderboardGameId } from '@/src/services/leaderboard';

const ROOT = join(__dirname, '../..');
const SCREEN = 'app/friends.tsx';
const DICT = 'src/contexts/LanguageContext.tsx';
const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];
const GAME_IDS = Object.keys(LEADERBOARD_GAMES) as LeaderboardGameId[];

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8') as string;

/** Исходник без комментариев — иначе гейт ловит собственные объяснения. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')            // блочные, включая JSX-обёртки {/* … */}
    .split('\n')
    .map((l: string) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

const SRC = code(SCREEN);

/** Первый `t('ключ')` в окне после якоря — то есть подпись этой ветки. */
function keyAfter(anchor: string, window = 260): string | null {
  const i = SRC.indexOf(anchor);
  if (i < 0) return null;
  const m = /\bt\(\s*'([a-zA-Z_][a-zA-Z0-9_]*)'\s*\)/.exec(SRC.slice(i, i + window));
  return m ? m[1] : null;
}

/**
 * Тело стрелки `(s) => …`, считая скобки: конец — запятая, закрывающая скобка
 * или перенос строки на нулевой глубине. Регуляркой это не берётся: в теле
 * живут шаблонные строки с `${…}`, и «до первой `}`» режет по живому.
 */
function arrowBody(src: string, from: number): string | null {
  const i = src.indexOf('(s) =>', from);
  if (i < 0) return null;
  let depth = 0;
  let out = '';
  for (let j = i + 6; j < src.length; j++) {
    const c = src[j];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') { if (depth === 0) break; depth--; }
    else if ((c === ',' || c === '\n') && depth === 0) break;
    out += c;
  }
  return out.trim() || null;
}

/** ru/en одной записи базового словаря. */
function entry(name: string): { ru: string; en: string } | null {
  const lines = read(DICT).split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!new RegExp(`^ {2}${name}:\\s*\\{`).test(lines[i])) continue;
    let chunk = lines[i];
    let depth = (chunk.match(/\{/g) || []).length - (chunk.match(/\}/g) || []).length;
    let j = i;
    while (depth > 0 && j + 1 < lines.length) {
      j++;
      chunk += '\n' + lines[j];
      depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
    }
    const grab = (lang: string) => {
      const re = new RegExp('(?:^|[,{\\s])' + lang + ":\\s*(['\"`])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1");
      const m = re.exec(chunk);
      return m ? m[2] : null;
    };
    const ru = grab('ru'); const en = grab('en');
    return ru !== null && en !== null ? { ru, en } : null;
  }
  return null;
}

describe('экран «Друзья»: есть что проверять', () => {
  it('экран на месте и разобран, а не пуст', () => {
    expect(existsSync(join(ROOT, SCREEN))).toBe(true);
    expect(SRC.length).toBeGreaterThan(3000);
    // Срезка комментариев обязана что-то срезать: если шапка уцелела, весь
    // разбор ниже идёт по тексту объяснений, а не по коду.
    expect(read(SCREEN).length - SRC.length).toBeGreaterThan(2000);
    expect(GAME_IDS.length).toBe(6);
  });
});

describe('пять состояний круга — пять разных сообщений', () => {
  /**
   * ⚠️ ПОЧЕМУ ПРОВЕРЯЮТСЯ ИМЕННО КЛЮЧИ, А НЕ НАЛИЧИЕ ВЕТОК. Ветка `no-friends`,
   * показывающая тот же текст, что `offline`, формально есть — и врёт. Ключи
   * разные ⇒ тексты разные: `dictionary-duplicates.test.ts` не даёт двум ключам
   * нести один и тот же ru+en.
   */
  const KINDS = ['loading', 'offline', 'no-friends', 'nobody-played', 'rows'] as const;

  it('🔴 экран разбирает все пять состояний', () => {
    const missing = KINDS.filter((k) => !SRC.includes(`view.kind === '${k}'`));
    expect(`не разобрано: ${missing.join(', ')}`).toBe('не разобрано: ');
  });

  it('🔴 у трёх пустот три РАЗНЫХ подписи', () => {
    const keys = (['offline', 'no-friends', 'nobody-played'] as const)
      .map((k) => keyAfter(`view.kind === '${k}'`));
    expect(keys.every((k) => k !== null)).toBe(true);
    expect(new Set(keys).size).toBe(3);
  });

  it('🔴 подписи трёх пустот существуют и говорят разное', () => {
    const keys = (['offline', 'no-friends', 'nobody-played'] as const)
      .map((k) => keyAfter(`view.kind === '${k}'`) as string);
    const texts = keys.map((k) => entry(k));
    expect(texts.every((e) => e !== null)).toBe(true);
    expect(new Set(texts.map((e) => e!.ru)).size).toBe(3);
    expect(new Set(texts.map((e) => e!.en)).size).toBe(3);
  });

  it('🔴 правило «что рисовать» берётся у сервиса, а не пишется заново в разметке', () => {
    expect(SRC).toMatch(/\bfriendsView\(/);
    // `friends.length === 0` в экране — это уже своя копия правила: она разойдётся
    // с сервисом молча, и разойдётся именно в редком случае (нет сети), который
    // глазами не ловится.
    const own = [
      /\bfriends\s*\.\s*length\s*===\s*0/,
      /\brows\s*\.\s*length\s*===\s*0/,
      /!\s*r\.isMe/,
    ].filter((re) => re.test(SRC)).map(String);
    expect(`своё правило в разметке: ${own.join(' | ')}`).toBe('своё правило в разметке: ');
  });
});

describe('три исхода добавления — три разных сообщения', () => {
  const KINDS = ['added', 'not-found', 'offline'] as const;

  it('🔴 все три исхода разобраны', () => {
    const missing = KINDS.filter((k) => !SRC.includes(`kind === '${k}'`));
    expect(`не разобрано: ${missing.join(', ')}`).toBe('не разобрано: ');
  });

  it('🔴 «нет связи» и «кода нет» — не один и тот же текст', () => {
    const notFound = keyAfter("added?.kind === 'not-found'");
    const offline = keyAfter("added?.kind === 'offline'");
    const added = keyAfter("added?.kind === 'added'");
    expect([added, notFound, offline].every((k) => k !== null)).toBe(true);
    expect(new Set([added, notFound, offline]).size).toBe(3);
    const e = [added, notFound, offline].map((k) => entry(k as string));
    expect(e.every((x) => x !== null)).toBe(true);
    expect(new Set(e.map((x) => x!.ru)).size).toBe(3);
  });

  it('🔴 кнопка не оживает раньше полного кода', () => {
    // Проверка сидит в сервисе (`isCodeComplete`), и экран обязан её звать, а не
    // сравнивать длину сам: нормализация кода живёт там же.
    expect(SRC).toMatch(/disabled=\{[^}]*isCodeComplete\(/);
    expect(SRC).not.toMatch(/draft\s*\.\s*length\s*===\s*6/);
  });
});

describe('разрыв связи предупреждает о взаимности', () => {
  const MUTUAL = 'friendsRemoveMutual';

  it('🔴 крестик в строке НЕ рвёт связь сразу — он открывает подтверждение', () => {
    const i = SRC.indexOf("t('friendsRemove')");
    expect(i).toBeGreaterThan(0);
    // Окно охватывает кнопку целиком: пропы a11y, onPress и стиль.
    const btn = SRC.slice(i, i + 220);
    const rips = [/removeFriend\(/, /onDrop\(/].filter((re) => re.test(btn)).map(String);
    expect(`крестик рвёт сразу: ${rips.join(' | ')}`).toBe('крестик рвёт сразу: ');
  });

  it('🔴 подтверждение показывает предупреждение и только потом рвёт', () => {
    const i = SRC.indexOf(`t('${MUTUAL}')`);
    expect(i).toBeGreaterThan(0);
    // От предупреждения до кнопки согласия — один блок разметки.
    expect(SRC.slice(i, i + 600)).toMatch(/onDrop\(/);
  });

  it('🔴 предупреждение называет человека и говорит, что связь двусторонняя', () => {
    const e = entry(MUTUAL);
    expect(e).not.toBeNull();
    // ⚠️ Слово не проверяем — проверяем, что сказано ПРО ОБОИХ, любым из
    // естественных способов. Гейт на одно слово краснел бы от переписанной, но
    // верной формулировки, а такой гейт перестают читать.
    const ruSaysBoth = /взаимн|двусторон|обои|обо|тоже|также/i.test(e!.ru);
    const enSaysBoth = /mutual|both|too|as well|each other/i.test(e!.en);
    expect({ name: e!.ru.includes('{name}'), ruSaysBoth, enSaysBoth })
      .toEqual({ name: true, ruSaysBoth: true, enSaysBoth: true });
  });
});

describe('шесть зачётных игр показаны и считаны в тех же единицах', () => {
  const GAMES_DIR = join(ROOT, 'app/games');

  /** Экран игры → её `formatScore`, отданный `LeaderboardModal`. */
  const byGame = (() => {
    const out = new Map<string, { file: string; body: string }>();
    for (const f of readdirSync(GAMES_DIR).filter((n: string) => n.endsWith('.tsx'))) {
      const src = readFileSync(join(GAMES_DIR, f), 'utf8') as string;
      const start = src.indexOf('<LeaderboardModal');
      if (start < 0) continue;
      const el = src.slice(start, src.indexOf('/>', start));
      const id = /gameId="([a-zA-Z0-9_]+)"/.exec(el)?.[1];
      const fmt = el.indexOf('formatScore=');
      if (!id || fmt < 0) continue;
      const body = arrowBody(el, fmt);
      if (body) out.set(id, { file: f, body });
    }
    return out;
  })();

  it('форматы игр вычитаны — иначе сверка ниже зелена вслепую', () => {
    expect([...byGame.keys()].sort()).toEqual([...GAME_IDS].sort());
  });

  it('🔴 у каждой зачётной игры на экране есть чип с настоящей подписью', () => {
    // Список чипов берётся из самой таблицы игр, а не переписан руками.
    expect(SRC).toMatch(/Object\.keys\(LEADERBOARD_GAMES\)/);
    const bad: string[] = [];
    for (const id of GAME_IDS) {
      const m = new RegExp(`${id}:\\s*'([a-zA-Z_][a-zA-Z0-9_]*)'`).exec(SRC);
      if (!m) { bad.push(`${id}: подписи нет`); continue; }
      // t(NAME_KEY[id]) регуляркой словарного гейта не ловится — проверяем здесь.
      if (entry(m[1]) === null) bad.push(`${id}: ключа «${m[1]}» нет в словаре`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 единицы очков совпадают с теми, что игра показывает в своём лидерборде', () => {
    // Миллисекунды `choice_rt`, показанные как «1500.0s», человек прочтёт не как
    // ошибку, а как чужой мир. Копия форматов расходится МОЛЧА — сверяем.
    const diff: string[] = [];
    for (const id of GAME_IDS) {
      const at = SRC.indexOf(`${id}: (s) =>`);
      const mine = at < 0 ? null : arrowBody(SRC, at);
      const theirs = byGame.get(id)!;
      if (mine !== theirs.body) diff.push(`${id}: экран «${mine}» ≠ ${theirs.file} «${theirs.body}»`);
    }
    expect(diff).toEqual([]);
  });
});

describe('витрина не растёт: экран знает только опубликованные очки', () => {
  /**
   * 🔴 Приложение отправляет на сервер ровно две вещи — отчёты о проблемах и очки
   * зачётной партии. Стрики друзей, «заходил вчера» и любая ежедневная активность
   * потребовали бы вынести на сервер историю КАЖДОГО и переписать Data Safety в
   * Play. Импорт этих источников сюда и есть первый шаг такой правки.
   */
  const FORBIDDEN = [
    'services/api', 'getSessions', 'getSessionHistory', 'trainingHistory',
    'training-history', 'streak', 'Streak', 'WarmupContext', 'dailyGoal', 'dailyCheckIn',
  ];

  it('🔴 экран не тянет историю тренировок ни одним источником', () => {
    const hits = FORBIDDEN.filter((n) => SRC.includes(n));
    expect(`заведена ежедневная активность: ${hits.join(', ')}`).toBe('заведена ежедневная активность: ');
  });

  it('🔴 экран ходит на сервер только через сервис друзей и лидерборда', () => {
    // Прямой вызов supabase.rpc из экрана — это обход разведённых `null`/`[]`:
    // сырой ответ отдаёт `error` и `data`, и на экране они снова схлопнутся в
    // одну пустоту. Ловим и сам ВВОЗ клиента: импорт без вызова — это мёртвая
    // строка, а с вызовом — уже обход, и разница в один символ.
    const hits = ['services/supabase', 'getSupabase', '.rpc('].filter((n) => SRC.includes(n));
    expect(`мимо сервиса: ${hits.join(', ')}`).toBe('мимо сервиса: ');
  });
});

describe('двенадцать языков: английский не протекает', () => {
  const NEW_KEYS = (read(DICT).match(/^ {2}(friends[A-Za-z0-9_]*):\s*\{/gm) ?? [])
    .map((m: string) => m.trim().replace(/:\s*\{$/, ''));

  it('ключи экрана найдены — иначе проверка ниже пуста', () => {
    expect(NEW_KEYS.length).toBeGreaterThanOrEqual(20);
  });

  it('🔴 каждый ключ переведён во всех десяти локалях и не оставлен по-английски', () => {
    const bad: string[] = [];
    for (const loc of LOCALES) {
      const src = read(`src/contexts/translations/${loc}.ts`);
      for (const k of NEW_KEYS) {
        const m = new RegExp(`^ {2}"${k}":\\s*("(?:[^"\\\\]|\\\\.)*")`, 'm').exec(src);
        if (!m) { bad.push(`${loc}/${k}: нет`); continue; }
        const value = JSON.parse(m[1]) as string;
        const en = entry(k)?.en ?? '';
        if (value === en) bad.push(`${loc}/${k}: осталось английским`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 подстановки {name}, {n} и {game} доезжают до каждой локали', () => {
    // Потерянная подстановка — это строка, где имя друга или счёт просто не
    // появятся: текст выглядит переведённым, а числа в нём нет.
    const bad: string[] = [];
    for (const loc of LOCALES) {
      const src = read(`src/contexts/translations/${loc}.ts`);
      for (const k of NEW_KEYS) {
        const en = entry(k)?.en ?? '';
        const want = (en.match(/\{[a-z]+\}/g) ?? []).sort().join(',');
        if (!want) continue;
        const m = new RegExp(`^ {2}"${k}":\\s*("(?:[^"\\\\]|\\\\.)*")`, 'm').exec(src);
        if (!m) continue;                                  // отсутствие ловит проверка выше
        const got = ((JSON.parse(m[1]) as string).match(/\{[a-z]+\}/g) ?? []).sort().join(',');
        if (got !== want) bad.push(`${loc}/${k}: «${got}» вместо «${want}»`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('вход на экран заведён', () => {
  it('🔴 с главной на «Друзей» можно попасть', () => {
    const home = code('app/index.tsx');
    expect(home).toMatch(/router\.push\('\/friends'/);
    // Кнопка без подписи для скринридера — «кнопка» и молчание.
    expect(home).toMatch(/accessibilityLabel=\{t\('friendsTitle'\)\}/);
  });
});
