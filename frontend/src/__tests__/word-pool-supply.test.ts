/* psygames-word-pool-supply-gate · VER 1 · 26.08.2026 */
/**
 * ПЯТЬ ИГР ДЕЛЯТ ОДИН СЛОВЕСНЫЙ ЗАПАС — И ХВАТАЕТ ЕГО НЕ ВСЕМ.
 *
 * 🔴 ЗАМЕР 26.08.2026. Из `TRANSLATION_VOCAB` (189 слов, 14 категорий) черпают
 * `cloze`, `semantic-sort`, `word-pairs` и `listening-span`; `reading-span` живёт
 * на своих 62 предложениях. Проверка на повторы («уже виденное») была не у всех:
 *   было  — `word-pairs`, `listening-span`, `reading-span` уже с запасом;
 *   стало — добавлен `semantic-sort` (замер до правки: виденных 24% на первом
 *           уровне и 33% на одиннадцатом за 10 сессий; после — 0/100 и 0/150,
 *           и ноль повторов ВНУТРИ партии, чего раньше тоже никто не запрещал).
 *
 * ⚠️ ПОЧЕМУ ПОВТОР ЗДЕСЬ ЛОМАЕТ САМУ ПРОБУ, А НЕ ТОЛЬКО НАСТРОЕНИЕ. Игра
 * спрашивает, знает ли человек ЗНАЧЕНИЕ слова. Увидев его второй раз, он не
 * разбирает значение заново — он вспоминает, куда клал в прошлый раз. По времени
 * и по очкам это неотличимо от роста словаря.
 *
 * 🔴 CLOZE АЛГОРИТМОМ НЕ ЛЕЧИТСЯ, И ЭТО ГЛАВНОЕ, ЧТО СТЕРЕЖЁТ ЭТОТ ГЕЙТ.
 * Фраз ровно 16 на каждый из семи языков, а уровневая формула просит
 * `min(16, 5 + level)` — то есть с ОДИННАДЦАТОГО уровня игра показывает весь
 * корпус целиком каждую партию, только в другом порядке. Запас «невиданного»
 * тут нечем наполнить: сколько ни отбирай, брать не из чего. Замер: за 10 сессий
 * уже виденных 73% на первом уровне, 85% на шестом, 90% на одиннадцатом.
 * Лечится ТОЛЬКО числом фраз — то есть работой канала переводов, не кодом.
 *
 * Поэтому гейт держит неравенство «раундов не больше, чем фраз». Сегодня оно
 * выполняется впритык (16 = 16), и это записано как долг, а не как норма: любая
 * попытка поднять число раундов покраснеет здесь, а не у человека на экране.
 */
import { CLOZE_PHRASES } from '@/src/constants/clozePhrases';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import { pickFreshFrom } from '@/src/services/freshPool';

// eslint-disable-next-line @typescript-eslint/no-var-requires
declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

const GAMES_DIR = path.resolve(__dirname, '..', '..', 'app', 'games');
const src = (f: string): string => fs.readFileSync(path.join(GAMES_DIR, f), 'utf8');
/** Исходник без комментариев: рассказ о запасе не должен считаться запасом. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/** Потолок раундов cloze — та же формула, что в игре (`levelParams`). */
const CLOZE_MAX_ROUNDS = 16;

function playablePhrases(tgt: string): number {
  return (CLOZE_PHRASES[tgt] ?? []).filter((p: { answerEn: string }) => {
    const e = TRANSLATION_VOCAB.find((w) => w.en === p.answerEn);
    return !!(e && e[tgt]);
  }).length;
}

describe('словесный запас: хватает ли его играм', () => {
  it('есть что проверять — словарь и фразы на месте', () => {
    expect(TRANSLATION_VOCAB.length).toBeGreaterThan(100);
    expect(Object.keys(CLOZE_PHRASES).length).toBeGreaterThanOrEqual(7);
  });

  it('🔴 каждая игра общего словаря помнит виденное', () => {
    // Забыть про запас легко: игра тасует список и раздаёт — код короче, а
    // человек получает одно и то же. Здесь перечислены поимённо все, кто из
    // общего словаря черпает.
    const users = ['cloze.tsx', 'semantic-sort.tsx', 'word-pairs.tsx', 'listening-span.tsx'];
    const bad: string[] = [];
    for (const f of users) {
      const code = stripComments(src(f));
      if (!code.includes('TRANSLATION_VOCAB')) continue;   // перестал черпать — не наше дело
      if (f === 'cloze.tsx') continue;                     // см. отдельную проверку ниже: запаса нет физически
      if (!/pickFresh(From)?\s*\(/.test(code)) bad.push(`${f}: берёт из общего словаря, но виденное не помнит`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 cloze: раундов не больше, чем играбельных фраз — иначе партия показывает корпус целиком', () => {
    const short: string[] = [];
    for (const tgt of Object.keys(CLOZE_PHRASES)) {
      const n = playablePhrases(tgt);
      if (n < CLOZE_MAX_ROUNDS) short.push(`${tgt}: играбельных ${n} при потолке раундов ${CLOZE_MAX_ROUNDS}`);
    }
    expect(short).toEqual([]);
  });

  it('🔴 ни один язык не обделён: корпус фраз одинаков для всех', () => {
    const counts = Object.keys(CLOZE_PHRASES).map((t) => [t, playablePhrases(t)] as const);
    const min = Math.min(...counts.map(([, n]) => n));
    const max = Math.max(...counts.map(([, n]) => n));
    // Разнобой означал бы, что на одном языке игра беднее — и заметить это можно
    // было бы только сыграв на нём.
    expect(`${min}..${max}`).toBe(`${max}..${max}`);
    expect(min).toBeGreaterThan(0);
  });

  it('🔴 отбор без повторов действительно не повторяет — ни между партиями, ни внутри', () => {
    // Проба на сам сервис теми же числами, какими играет semantic-sort.
    const tgt = 'es';
    const pool = TRANSLATION_VOCAB.filter((w) => w[tgt] && w.cat);
    expect(pool.length).toBeGreaterThan(60);
    let seen: string[] = [];
    let repeats = 0;
    let inSession = 0;
    for (let s = 0; s < 10; s++) {
      const before = new Set(seen);
      const res = pickFreshFrom(pool, 15, seen, (w) => String(w.en));
      seen = res.seen;
      const keys = res.picked.map((w) => String(w.en));
      inSession += keys.length - new Set(keys).size;
      if (!res.wrapped) for (const k of keys) if (before.has(k)) repeats++;
    }
    expect(inSession).toBe(0);
    expect(repeats).toBe(0);
  });
});
