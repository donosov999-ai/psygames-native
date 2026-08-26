/**
 * ЗАПАС НЕВИДАННОГО: не повторять материал, пока он не кончился.
 *
 * Зачем гейт. `reading-span` раздавал предложения обычным `shuffle(ВСЕ).slice(0, n)`
 * без памяти между сессиями. Замер симуляцией (400 прогонов, 62 предложения):
 *   уровень 3 (5 за сессию): к 5-й сессии уже виденных 14%, к 10-й 30%
 *   уровень 8 (10):          27% / 49%
 *   уровень 12 (14):         36% / 59%
 * Для этой игры повтор портит саму задачу: вердикт «осмысленно / нет» вспоминается,
 * а не выводится, и по времени с очками это неотличимо от роста.
 *
 * ⚠️ Проверки ведут СВОЙ счёт повторов, а не спрашивают сервис. Хранилище не трогаем —
 * проверяется чистый `pickFreshFrom`, поэтому зёрна фиксированы и `Math.random` нет.
 */
import { pickFreshFrom, poolKey } from '@/src/services/freshPool';

/** Свой генератор с зерном — раздача обязана быть воспроизводимой. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }));
const keyOf = (it: { id: string }) => it.id;

describe('запас невиданного', () => {
  it('🔴 до исчерпания запаса повторов НЕТ ни одного', () => {
    const all = items(62);
    for (const size of [5, 7, 10, 14]) {
      const rng = seeded(size * 7919);
      let seen: string[] = [];
      const shownAll: string[] = [];
      const rounds = Math.floor(62 / size);          // ровно столько сессий помещается в запас
      for (let r = 0; r < rounds; r++) {
        const res = pickFreshFrom(all, size, seen, keyOf, rng);
        expect(res.wrapped).toBe(false);
        shownAll.push(...res.picked.map(keyOf));
        seen = res.seen;
      }
      // свой счёт: сколько ключей встретилось больше одного раза
      const count = new Map<string, number>();
      for (const k of shownAll) count.set(k, (count.get(k) ?? 0) + 1);
      const repeated = [...count.values()].filter((v) => v > 1).length;
      expect(repeated).toBe(0);
      expect(shownAll.length).toBe(rounds * size);
    }
  });

  it('🔴 сравнение со старым способом: он повторяет, новый — нет', () => {
    const all = items(62);
    const rngOld = seeded(4242), rngNew = seeded(4242);
    const shuffleAll = (rng: () => number) => {
      const a = [...all];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    let oldRepeats = 0; const oldSeen = new Set<string>();
    let newRepeats = 0; const newSeen = new Set<string>(); let seen: string[] = [];
    for (let s = 0; s < 6; s++) {                   // 6 сессий × 10 = 60 ≤ 62, запас ещё не кончился
      for (const it of shuffleAll(rngOld).slice(0, 10)) { if (oldSeen.has(it.id)) oldRepeats++; oldSeen.add(it.id); }
      const res = pickFreshFrom(all, 10, seen, keyOf, rngNew);
      for (const it of res.picked) { if (newSeen.has(it.id)) newRepeats++; newSeen.add(it.id); }
      seen = res.seen;
    }
    expect(newRepeats).toBe(0);
    expect(oldRepeats).toBeGreaterThan(0);          // старый способ обязан провалиться — иначе замер был бы ни о чём
  });

  it('🔴 запас кончился — круг сбрасывается, и отсчёт идёт заново', () => {
    const all = items(10);
    const rng = seeded(99);
    let seen: string[] = [];
    let r1 = pickFreshFrom(all, 4, seen, keyOf, rng); seen = r1.seen;
    let r2 = pickFreshFrom(all, 4, seen, keyOf, rng); seen = r2.seen;
    expect(r1.wrapped).toBe(false);
    expect(r2.wrapped).toBe(false);
    const r3 = pickFreshFrom(all, 4, seen, keyOf, rng);   // осталось 2 невиданных из 10
    expect(r3.wrapped).toBe(true);
    expect(r3.picked.length).toBe(4);
    expect(new Set(r3.picked.map(keyOf)).size).toBe(4);   // внутри раздачи дублей нет НИКОГДА
    expect(r3.seen.length).toBe(4);                       // круг сброшен: помним только эту раздачу
  });

  it('🔴 просят больше, чем есть — отдаём всё и без дублей', () => {
    const all = items(5);
    const res = pickFreshFrom(all, 12, [], keyOf, seeded(3));
    expect(res.picked.length).toBe(5);
    expect(new Set(res.picked.map(keyOf)).size).toBe(5);
  });

  it('🔴 помним КЛЮЧИ, а не номера: правка списка не выдаёт невиданное за виденное', () => {
    const all = items(6);
    const first = pickFreshFrom(all, 3, [], keyOf, seeded(11));
    const shownKeys = first.picked.map(keyOf);
    // контент отредактировали: элементы переставили и добавили новый в начало
    const edited = [{ id: 'НОВОЕ' }, ...[...all].reverse()];
    const second = pickFreshFrom(edited, 3, first.seen, keyOf, seeded(12));
    for (const it of second.picked) expect(shownKeys).not.toContain(keyOf(it));
    expect(second.wrapped).toBe(false);
  });

  it('🔴 ноль запрошенных — пустая раздача, запас не тронут', () => {
    const res = pickFreshFrom(items(5), 0, ['s1'], keyOf, seeded(1));
    expect(res.picked).toEqual([]);
    expect(res.seen).toEqual(['s1']);
  });
});

describe('запасы не пересекаются', () => {
  /**
   * 🔴 Общий словарь переводов — 189 записей на ЧЕТЫРЕ игры. Замер повтора при
   * обычном перемешивании (симуляция 300 прогонов):
   *   парные слова (8 пар = 16 слов): за 10 сессий 31%, за 30 сессий 63%
   *   пропуски (16):                  31% / 64%
   *   сортировка слов (15):           29% / 61%
   *   аудиторный размах (6):          13% / 35%
   * Поэтому запас заведён каждой игре свой: общий означал бы, что партия в одну игру
   * выедает материал соседней, и «невиданное» кончалось бы вчетверо быстрее.
   * ⚠️ У «парных слов» ДВА режима на разных списках («перевод» и «слова») — у них
   * тоже запасы раздельные, иначе один режим выедал бы другой.
   */
  it('🔴 разные игры и режимы — разные ключи хранилища', () => {
    const keys = [
      poolKey('reading_span', 'odv'),
      poolKey('listening_span', 'odv'),
      poolKey('word_pairs_translation', 'odv'),
      poolKey('word_pairs_words_ru', 'odv'),
      poolKey('word_pairs_words_en', 'odv'),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('🔴 запас у каждого ПРОФИЛЯ свой — чужой прогресс не съедает мой', () => {
    expect(poolKey('reading_span', 'odv')).not.toBe(poolKey('reading_span', 'valya'));
    expect(poolKey('reading_span', undefined)).toBe(poolKey('reading_span', 'guest'));
  });

  it('🔴 запас одной игры не влияет на выдачу другой', () => {
    const all = items(20);
    const rng = seeded(555);
    // «видели» первые 10 в одной игре — на другую игру это влиять не должно
    const seenA = all.slice(0, 10).map(keyOf);
    const inB = pickFreshFrom(all, 10, [], keyOf, rng);        // у B свой, пустой запас
    const fromSeenA = inB.picked.filter((it) => seenA.includes(keyOf(it))).length;
    expect(inB.wrapped).toBe(false);
    expect(fromSeenA).toBeGreaterThan(0);   // B спокойно берёт то, что видели в A
  });
});
