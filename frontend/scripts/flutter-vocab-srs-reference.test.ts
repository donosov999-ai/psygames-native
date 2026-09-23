/* psygames-flutter-vocab-srs-reference · VER 1 · 23.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «СЛОВАРЯ SRS» ИЗ ЖИВОГО TS — для сверки переноса на Flutter.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНАЯ ВЫГРУЗКА, А НЕ «ПЕРЕПИСАТЬ ФОРМУЛЫ И СРАВНИТЬ».
 * Проверять перенос той же формулой, которой переносил, нельзя — такая проба
 * зелена всегда. Числа здесь снимаются прогоном НАСТОЯЩИХ модулей
 * `src/services/vocab-srs.ts` и `app/games/vocab-srs.tsx`, а Dart потом обязан
 * повторить их до знака.
 *
 * 🔴 В ЭТАЛОН ПОПАДАЕТ И ПОРЯДОК ОБРАЩЕНИЙ К СЛУЧАЙНОСТИ. Вместо Math.random
 * подставлена заданная очередь чисел; Dart получает ту же очередь. Перепутанный
 * порядок перемешиваний покраснеет, даже если каждая формула по отдельности верна.
 *
 * ЭТО НЕ ПРОБА, А ПРИБОР: в обычный прогон не попадает (jest берёт только
 * `src/__tests__/**`). Перевыпуск эталона — этой командой из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-vocab-srs-reference.test.ts'
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import { buildQueue, gradeCard, getStats, addCustomWords, type Grade } from '@/src/services/vocab-srs';
import { buildOptions } from '@/app/games/vocab-srs';

/**
 * ⚠️ ФАЙЛОВЫЕ ГЛОБАЛЫ ОБЪЯВЛЕНЫ ЗДЕСЬ, А НЕ ВЗЯТЫ ИЗ @types/node.
 * В `tsconfig.json` стоит `"types": ["jest"]` — глобалы Node в проект намеренно
 * не включены. Менять общий tsconfig ради одного прибора нельзя: он у девяти
 * чатов, и новые глобалы (тот же `setTimeout` с другим типом возврата) полезли бы
 * по всему коду. Объявления ниже живут ТОЛЬКО в этом файле: он модуль, значит
 * `declare` из него наружу не видно.
 */
declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as {
  mkdirSync(p: string, o: { recursive: boolean }): void;
  writeFileSync(p: string, data: string, enc: string): void;
};
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };

/** Часы партии зафиксированы: SM-2 считает `dueAt` от «сейчас», и без фиксации эталон менялся бы каждый запуск. */
const ЧАСЫ = Date.UTC(2026, 8, 23, 12, 0, 0);
const СУТКИ = 86400_000;
const ВЫХОД = path.resolve(__dirname, '../../flutter/test/fixtures/vocab-srs-reference.json');
const АССЕТ = path.resolve(__dirname, '../../flutter/assets/vocab/translation-vocab.json');

/** Очередь чисел вместо случайности — ровно то, что получит Dart. */
function очередь(значения: number[]): () => number {
  let i = 0;
  return () => значения[i++ % значения.length]!;
}

describe('эталоны словаря SRS для переноса на Flutter', () => {
  it('выгружает', async () => {
    const было = Date.now;
    Date.now = () => ЧАСЫ;

    // ── 1. Варианты ответа: три набора, каждый со своей очередью случайностей ──
    const наборыВариантов = [
      { имя: 'обычный пул', right: 'casa', pool: ['perro', 'gato', 'libro', 'agua', 'mesa'], очередь: [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4] },
      // дубли в пуле — тот самый случай, на котором экран висел намертво (vocab-no-hang)
      { имя: 'пул с повторами', right: 'casa', pool: ['perro', 'perro', 'perro', 'perro'], очередь: [0.5, 0.5, 0.5, 0.5, 0.5] },
      { имя: 'пул короче трёх', right: 'casa', pool: ['perro', 'casa'], очередь: [0.0, 0.99, 0.5] },
      { имя: 'пустой пул', right: 'casa', pool: [], очередь: [0.5, 0.5] },
    ].map((н) => {
      const rnd = очередь(н.очередь);
      const было0 = Math.random;
      Math.random = rnd;
      const итог = buildOptions(н.right, н.pool);
      Math.random = было0;
      return { ...н, ожидание: итог };
    });

    // ── 2. SM-2: последовательности оценок по одной карточке ──
    const сценарии: { имя: string; оценки: Grade[] }[] = [
      { имя: 'good ×4', оценки: ['good', 'good', 'good', 'good'] },
      { имя: 'easy ×4', оценки: ['easy', 'easy', 'easy', 'easy'] },
      { имя: 'смешанный', оценки: ['good', 'easy', 'again', 'good', 'good'] },
      { имя: 'сразу again', оценки: ['again', 'again', 'good'] },
    ];
    const шаги: unknown[] = [];
    for (const с of сценарии) {
      await AsyncStorage.clear();
      const следы: unknown[] = [];
      for (const о of с.оценки) {
        const интервал = await gradeCard('ru', 'es', 'v:house', о);
        const сырое = await AsyncStorage.getItem('psygames_vocab_srs_ru_es');
        const состояние = JSON.parse(сырое!).states['v:house'];
        следы.push({ оценка: о, интервалДней: интервал, состояние });
      }
      шаги.push({ имя: с.имя, следы });
    }

    // ── 3. Очередь сессии: часть карточек созрела, часть нет, часть новая ──
    await AsyncStorage.clear();
    await gradeCard('ru', 'es', 'v:house', 'good');   // созреет через 1 день → НЕ созрела
    await gradeCard('ru', 'es', 'v:water', 'good');
    Date.now = () => ЧАСЫ + 2 * СУТКИ;                 // прошло двое суток
    await gradeCard('ru', 'es', 'v:dog', 'good');      // созреет позже остальных
    Date.now = () => ЧАСЫ + 5 * СУТКИ;                 // ещё трое
    const q = await buildQueue('ru', 'es', 5);
    const stats = await getStats('ru', 'es');

    // ── 3б. ГРАНИЦА СОЗРЕВАНИЯ: карточка, у которой срок настал РОВНО СЕЙЧАС.
    // Без этого случая подмена `dueAt <= now` на `<` проходит мимо любой пробы:
    // в остальных сценариях сроки строго в прошлом. Поймано мутацией 23.09.2026.
    await AsyncStorage.clear();
    Date.now = () => ЧАСЫ;
    await gradeCard('ru', 'es', 'v:house', 'good');     // dueAt = ЧАСЫ + 1 сутки
    Date.now = () => ЧАСЫ + СУТКИ;                       // ровно срок, ни мс больше
    const граница = await buildQueue('ru', 'es', 2);
    const границаСтат = await getStats('ru', 'es');

    // ── 4. Свои слова: разбор строк «слово = перевод» ──
    await AsyncStorage.clear();
    const добавлено = await addCustomWords('ru', 'es', [
      'дом = casa',
      'вода — agua',
      'собака – perro',
      'кот\tgato',
      'плохая строка без разделителя',
      'дом = casa',            // дубль — не должен добавиться
      ' = ',                   // пустые половины
      'длинный ответ = dos palabras aquí',
    ].join('\n'));
    const своиСырое = JSON.parse((await AsyncStorage.getItem('psygames_vocab_srs_ru_es'))!);

    Date.now = было;

    const языки = Object.keys(TRANSLATION_VOCAB[0]!).filter((k) => k !== 'cat');
    const эталон = {
      снято: '2026-09-23',
      источник: ['frontend/src/services/vocab-srs.ts', 'frontend/app/games/vocab-srs.tsx'],
      прибор: 'frontend/scripts/flutter-vocab-srs-reference.test.ts',
      часыМс: ЧАСЫ,
      easyRtMs: 2500,
      /** Ошибка возвращает карточку через столько позиций (vocab-srs.tsx, handlePick). */
      сдвигПослеОшибки: 3,
      словарь: { записей: TRANSLATION_VOCAB.length, языки, ключКолоды: 'psygames_vocab_srs_<base>_<target>' },
      варианты: наборыВариантов,
      оценки: шаги,
      очередьСессии: {
        объяснение: 'после gradeCard(good) в час X, X+2сут, X+5сут и newLimit=5',
        сейчасМс: ЧАСЫ + 5 * СУТКИ,
        due: q.due.map((c) => ({ id: c.id, base: c.base, target: c.target, isNew: c.isNew })),
        fresh: q.fresh.map((c) => ({ id: c.id, base: c.base, target: c.target, isNew: c.isNew })),
        размерПула: q.pool.length,
        статистика: stats,
      },
      границаСозревания: {
        объяснение: 'gradeCard(good) в час X, очередь ровно в X+1сут — срок настал В ЭТУ миллисекунду',
        сейчасМс: ЧАСЫ + СУТКИ,
        due: граница.due.map((c) => ({ id: c.id, isNew: c.isNew })),
        freshПервые: граница.fresh.map((c) => c.id),
        статистика: границаСтат,
      },
      своиСлова: { добавлено, записи: своиСырое.custom.map((c: { base: string; target: string }) => ({ base: c.base, target: c.target })) },
    };

    fs.mkdirSync(path.dirname(ВЫХОД), { recursive: true });
    fs.writeFileSync(ВЫХОД, JSON.stringify(эталон, null, 1), 'utf8');
    fs.mkdirSync(path.dirname(АССЕТ), { recursive: true });
    fs.writeFileSync(АССЕТ, JSON.stringify(TRANSLATION_VOCAB), 'utf8');

    // eslint-disable-next-line no-console — прибор нарочно пишет числа в вывод
    console.log(`эталон: ${ВЫХОД}\nсловарь: ${АССЕТ} (${TRANSLATION_VOCAB.length} записей, ${языки.length} языков)`);
    expect(TRANSLATION_VOCAB.length).toBeGreaterThan(100);
  });
});
