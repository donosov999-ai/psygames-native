/**
 * SRS-движок словаря (Полиглот TIER 1 п.1, v1.28.0).
 * Упрощённый SM-2 (Anki-стиль), оценка автоматическая из квиза:
 * wrong → again · correct → good · correct быстрее 2.5с → easy (без self-grading).
 *
 * Хранение: AsyncStorage `psygames_vocab_srs_<base>_<target>` =
 *   { states: Record<cardId, CardState>, custom: CustomWord[] }
 * Прогресс отдельный на каждую языковую пару (en→es ≠ es→en — направление учится заново).
 *
 * id встроенных слов — `v:<en>` (en-поле TRANSLATION_VOCAB уникально и стабильно),
 * custom — `c:<timestamp>`. Индексы НЕ используются: словарь может переупорядочиваться.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';

export type Grade = 'again' | 'good' | 'easy';

export interface CardState {
  reps: number;          // успешных повторов подряд (0 = новая/сброшена)
  intervalDays: number;
  ease: number;          // 1.3 … ~3
  dueAt: number;         // ms epoch
  lapses: number;
}

export interface CustomWord {
  id: string;
  base: string;
  target: string;
}

export interface CardRef {
  id: string;
  base: string;    // слово на языке интерфейса
  target: string;  // слово на изучаемом языке
  isNew: boolean;
}

interface DeckFile {
  states: Record<string, CardState>;
  custom: CustomWord[];
}

const keyFor = (baseLang: string, targetLang: string) =>
  `psygames_vocab_srs_${baseLang}_${targetLang}`;

async function loadDeck(baseLang: string, targetLang: string): Promise<DeckFile> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(baseLang, targetLang));
    if (raw) return JSON.parse(raw) as DeckFile;
  } catch (e) {
    console.error('vocab-srs load error', e);
  }
  return { states: {}, custom: [] };
}

async function saveDeck(baseLang: string, targetLang: string, deck: DeckFile): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(baseLang, targetLang), JSON.stringify(deck));
  } catch (e) {
    console.error('vocab-srs save error', e);
  }
}

/** Все карточки пары: встроенный словарь (имеющий оба языка) + пользовательские. */
function allCards(baseLang: string, targetLang: string, custom: CustomWord[]): Omit<CardRef, 'isNew'>[] {
  const builtin = TRANSLATION_VOCAB
    .filter((w) => w[baseLang] && w[targetLang] && w[baseLang] !== w[targetLang])
    .map((w) => ({ id: `v:${w.en}`, base: w[baseLang], target: w[targetLang] }));
  const own = custom.map((c) => ({ id: c.id, base: c.base, target: c.target }));
  return [...own, ...builtin]; // свои слова первыми — раньше попадают в «новые»
}

export interface SrsQueue {
  due: CardRef[];
  fresh: CardRef[];
  /** Пул всех target-слов пары — для генерации дистракторов в квизе. */
  pool: { base: string; target: string }[];
}

export async function buildQueue(
  baseLang: string,
  targetLang: string,
  newLimit: number,
  reviewLimit = 60,
): Promise<SrsQueue> {
  const deck = await loadDeck(baseLang, targetLang);
  const cards = allCards(baseLang, targetLang, deck.custom);
  const now = Date.now();

  const due: CardRef[] = [];
  const fresh: CardRef[] = [];
  for (const c of cards) {
    const st = deck.states[c.id];
    if (st && st.reps > 0) {
      if (st.dueAt <= now && due.length < reviewLimit) due.push({ ...c, isNew: false });
    } else if (fresh.length < newLimit) {
      fresh.push({ ...c, isNew: true });
    }
  }
  // due — самые просроченные первыми
  due.sort((a, b) => (deck.states[a.id]?.dueAt ?? 0) - (deck.states[b.id]?.dueAt ?? 0));
  return { due, fresh, pool: cards.map(({ base, target }) => ({ base, target })) };
}

/** Применить оценку. Возвращает новый интервал в днях (0 = карточка вернётся в сессию). */
export async function gradeCard(
  baseLang: string,
  targetLang: string,
  id: string,
  grade: Grade,
): Promise<number> {
  const deck = await loadDeck(baseLang, targetLang);
  const st: CardState = deck.states[id] ?? { reps: 0, intervalDays: 0, ease: 2.5, dueAt: 0, lapses: 0 };

  if (grade === 'again') {
    st.lapses += st.reps > 0 ? 1 : 0;
    st.reps = 0;
    st.intervalDays = 0;           // вернётся в текущую сессию; до good не уходит в график
    st.ease = Math.max(1.3, st.ease - 0.2);
  } else if (st.reps === 0) {
    // первый успешный ответ
    st.reps = 1;
    st.intervalDays = grade === 'easy' ? 3 : 1;
    if (grade === 'easy') st.ease += 0.05;
  } else {
    st.reps += 1;
    st.intervalDays = Math.max(1, Math.round(st.intervalDays * st.ease * (grade === 'easy' ? 1.3 : 1)));
    if (grade === 'easy') st.ease += 0.05;
  }
  st.dueAt = Date.now() + st.intervalDays * 86400_000;

  deck.states[id] = st;
  await saveDeck(baseLang, targetLang, deck);
  return grade === 'again' ? 0 : st.intervalDays;
}

export interface SrsStats {
  totalWords: number;
  learned: number;   // reps > 0
  dueNow: number;
  customCount: number;
  nextDueAt: number | null; // ближайший будущий повтор (ms) либо null
}

export async function getStats(baseLang: string, targetLang: string): Promise<SrsStats> {
  const deck = await loadDeck(baseLang, targetLang);
  const cards = allCards(baseLang, targetLang, deck.custom);
  const now = Date.now();
  let learned = 0, dueNow = 0;
  let nextDueAt: number | null = null;
  for (const c of cards) {
    const st = deck.states[c.id];
    if (st && st.reps > 0) {
      learned += 1;
      if (st.dueAt <= now) dueNow += 1;
      else if (nextDueAt === null || st.dueAt < nextDueAt) nextDueAt = st.dueAt;
    }
  }
  return { totalWords: cards.length, learned, dueNow, customCount: deck.custom.length, nextDueAt };
}

/** Добавить свои слова. Строки «слово = перевод» (также «-», «—», TAB). Возвращает сколько добавлено. */
export async function addCustomWords(
  baseLang: string,
  targetLang: string,
  rawText: string,
): Promise<number> {
  const deck = await loadDeck(baseLang, targetLang);
  const existing = new Set(deck.custom.map((c) => `${c.base.toLowerCase()}|${c.target.toLowerCase()}`));
  let added = 0;
  for (const line of rawText.split('\n')) {
    const m = line.split(/\s*(?:=|—|–|\t| - )\s*/);
    if (m.length < 2) continue;
    const base = m[0].trim();
    const target = m.slice(1).join(' ').trim();
    if (!base || !target) continue;
    const sig = `${base.toLowerCase()}|${target.toLowerCase()}`;
    if (existing.has(sig)) continue;
    existing.add(sig);
    deck.custom.push({ id: `c:${Date.now()}_${added}`, base, target });
    added += 1;
  }
  if (added > 0) await saveDeck(baseLang, targetLang, deck);
  return added;
}
