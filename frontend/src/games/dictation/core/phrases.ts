/* psygames-dictation-phrases · VER 1 · 04.09.2026 */
/**
 * ПОЛНЫЕ ФРАЗЫ ДЛЯ ДИКТАНТА — СОБИРАЮТСЯ ИЗ УЖЕ ИМЕЮЩИХСЯ ДАННЫХ.
 *
 * 🔴 ЗАЧЕМ НЕ НОВЫЙ БАНК. В проекте уже лежат 40 фраз на язык — `CLOZE_PHRASES`,
 * но с дыркой: «I drink ___ every morning». Ответ на нужном языке лежит рядом, в
 * `TRANSLATION_VOCAB` по ключу `answerEn`. Подставив его, получаем ту же фразу
 * целиком — ровно то, что диктует упражнение.
 *
 * Заводить второй банк значило бы держать два списка фраз, которые разойдутся:
 * правила составления cloze-фраз (словарная форма ответа, согласование артикля и
 * рода) выписаны в шапке `clozePhrases.ts` кровью, и второй список их бы не знал.
 *
 * ⚠️ ФРАЗА БЕЗ ОТВЕТА МОЛЧА ПРОПУСКАЕТСЯ. Так же поступает экран `cloze`: если
 * `answerEn` нет в словаре, подставить нечего. Число собранных фраз возвращается
 * наружу, чтобы «пусто» было видно числом, а не догадкой.
 */
import { CLOZE_PHRASES } from '@/src/constants/clozePhrases';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';

export interface DictationPhrase {
  /** Фраза целиком, как её надо набрать. */
  text: string;
  /** Слово, стоявшее на месте пропуска, — по нему считаем «слабые» места. */
  answer: string;
  /** Знаков в фразе: по нему растёт лестница. */
  length: number;
}

type ЯзыкСловаря = keyof (typeof TRANSLATION_VOCAB)[number];

/** Языки, на которых есть и фразы, и словарь. */
export function dictationLangs(): string[] {
  return Object.keys(CLOZE_PHRASES).filter((l) => buildPhrases(l).length > 0);
}

export function buildPhrases(lang: string): DictationPhrase[] {
  const банк = (CLOZE_PHRASES as Record<string, { text: string; answerEn: string }[]>)[lang];
  if (!банк) return [];
  const из: DictationPhrase[] = [];
  for (const ф of банк) {
    const запись = TRANSLATION_VOCAB.find((з) => з.en === ф.answerEn);
    const ответ = запись ? (запись as Record<string, unknown>)[lang as ЯзыкСловаря] : undefined;
    if (typeof ответ !== 'string' || !ответ) continue;      // нечего подставить — пропускаем
    const текст = ф.text.replace('___', ответ);
    if (текст.includes('___')) continue;                     // пропуск не заменился — фраза битая
    из.push({ text: текст, answer: ответ, length: [...текст].length });
  }
  return из;
}

/**
 * Лестница: длина фразы растёт, число фраз в заходе тоже. Первые уровни — самые
 * короткие фразы банка, дальше открывается весь список.
 *
 * ⚠️ Порог берётся по ДЛИНЕ, а не по номеру фразы: банки разных языков различаются
 * (китайская фраза вдвое короче немецкой в знаках), и «первые пять» означало бы
 * разную трудность на разных языках.
 */
export function levelPhrases(all: DictationPhrase[], level: number): DictationPhrase[] {
  const порог = level <= 3 ? 26 : level <= 6 ? 34 : level <= 9 ? 44 : Infinity;
  const годные = all.filter((ф) => ф.length <= порог);
  return годные.length >= 3 ? годные : all;
}

/** Сколько фраз в заходе на этом уровне. */
export function levelCount(level: number): number {
  return level <= 3 ? 4 : level <= 6 ? 5 : 6;
}
