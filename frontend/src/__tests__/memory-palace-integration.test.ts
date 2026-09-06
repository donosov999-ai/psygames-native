/**
 * ДВОРЕЦ ПАМЯТИ — ПРИЁМКА МОДУЛЯ G8 В ПРИЛОЖЕНИЕ.
 *
 * ЗАЧЕМ ГЕЙТ ИМЕННО ЗДЕСЬ. Игра пришла отдельным модулем со своим ядром и своим
 * словарём; приёмка — это не «скомпилировалось», а несколько решений, у каждого
 * из которых есть цена ошибки, и все они молчаливые: партия стирается при
 * выходе, вторая попытка выдаёт те же предметы, звёзды выдаются за узнавание
 * вместо памяти, строка переведена и не показана. Ни одно из этого не падает и
 * не краснеет само — поэтому проверяется здесь.
 *
 * ⚠️ ПРОВЕРЯЕМ СМЫСЛ, А НЕ БУКВУ. Логика стыковки нарочно вынесена из .tsx в
 * `src/games/memory-palace/integration.ts` обычными функциями: рендерера
 * компонентов в проекте нет (`testMatch` — только `*.test.ts`), и всё, что
 * осталось бы внутри разметки, проверялось бы чтением исходника — то есть
 * ровно тем способом, которым в SET бейдж отсчёта был «написан, переведён на 12
 * языков и не показан ни разу». Поэтому здесь партия действительно
 * проигрывается, снимок действительно сохраняется и поднимается, а из чтения
 * исходников осталось только то, что иначе не достать.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

import {
  confirmMemoryPalacePlacements,
  continueToPlacement,
  continueToReverseRecall,
  createMemoryPalaceSession,
  currentRecallLocus,
  generateMemoryPalaceRound,
  pauseMemoryPalaceSession,
  placeSelectedItemAtLocus,
  selectPlacementItem,
  selectRecallItem,
  startMemoryPalaceRecall,
  startMemoryPalaceRound,
  type MemoryPalaceMetrics,
  type MemoryPalaceSession,
} from '@/src/games/memory-palace/core';
import {
  MEMORY_PALACE_GAME_ID,
  createPartySaver,
  hasSomethingToLose,
  makeNonce,
  makeSeed,
  memoryPalaceDifficulty,
  memoryPalaceLociForLevel,
  memoryPalacePassed,
  memoryPalaceReview,
  memoryPalaceStars,
  restoreFromResume,
  snapshotForResume,
} from '@/src/games/memory-palace/integration';

const ROOT = join(__dirname, '../..');
const SCREEN = join(ROOT, 'app/games/memory-palace.tsx');
const MODULE = join(ROOT, 'src/games/memory-palace/MemoryPalaceGame.tsx');
const I18N = join(ROOT, 'src/games/memory-palace/core/i18n.ts');
const read = (p: string): string => readFileSync(p, 'utf8') as string;
/**
 * Исходник БЕЗ комментариев. Нужен буквально всем проверкам ниже, и вот почему:
 * первый прогон мутаций показал, что проверка «строка не мертва» оставалась
 * зелёной после того, как строку выкинули, — её находило МОЁ ЖЕ объяснение
 * «`strings.used` не встречался в разметке» в шапке компонента. Гейт, который
 * ловит собственные комментарии, проверяет не код, а сам себя.
 */
const code = (p: string): string => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ─────────────────────────────────────────────────────────────────────────────
// Заготовка: партия проигрывается по-настоящему, ход за ходом.
// ─────────────────────────────────────────────────────────────────────────────

/** Разложить предметы по местам по порядку и дойти до проверки. */
function playToRecall(seed: string, level: number, now = 1_000): MemoryPalaceSession {
  let s = createMemoryPalaceSession({ seed, level });
  s = startMemoryPalaceRound(s, now);
  s = continueToPlacement(s);
  s.round.targetItems.forEach((item, index) => {
    s = selectPlacementItem(s, item.id);
    s = placeSelectedItemAtLocus(s, index);
  });
  s = confirmMemoryPalacePlacements(s);
  return startMemoryPalaceRecall(s);
}

/**
 * Доиграть партию до конца. `wrongFrom` — с какого места отвечать неправильно
 * (лишним предметом): так строится партия, где предметы «узнаны», а места нет.
 */
function finishRecall(start: MemoryPalaceSession, correct: boolean, now = 5_000): MemoryPalaceSession {
  let s = start;
  const placed = s.finalizedPlacements as string[];
  const total = s.round.lociCount;
  // прямой проход
  for (let i = 0; i < total; i += 1) {
    const right = placed[i] as string;
    const answer = correct ? right : (placed[(i + 1) % total] as string);
    s = selectRecallItem(s, answer, now);
  }
  s = continueToReverseRecall(s);
  for (let i = 0; i < total; i += 1) {
    const right = placed[total - 1 - i] as string;
    const answer = correct ? right : (placed[(total - 1 - i + 1) % total] as string);
    s = selectRecallItem(s, answer, now);
  }
  return s;
}

describe('Дворец памяти · содержание партии', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(existsSync(SCREEN)).toBe(true);
    expect(existsSync(MODULE)).toBe(true);
    expect(MEMORY_PALACE_GAME_ID).toBe('memory_palace');
  });

  /**
   * 🔴 ВТОРАЯ ПОПЫТКА НЕ ДОЛЖНА ВЫДАВАТЬ ТЕ ЖЕ ПРЕДМЕТЫ.
   *
   * Это главное расхождение с G1 «Прикидкой», где зерно нарочно прибито к
   * уровню. Там повтор тех же выражений — вторая попытка; здесь предмет,
   * который человек уже раскладывал по этому маршруту, он во второй раз не
   * запоминает, а УЗНАЁТ, и уровень выдаётся за остаточный след первой партии.
   * Отсюда и следствие, которое проверяется тут же: расклад по номеру уровня не
   * воспроизводится, значит недоигранную партию обязано хранить хранилище, а не
   * пересчёт.
   */
  it('🔴 расклад не воспроизводится по номеру уровня: два захода — разные наборы предметов', () => {
    const level = 8;
    const a = generateMemoryPalaceRound(makeSeed(level, makeNonce(1_000, 0.1)), level);
    const b = generateMemoryPalaceRound(makeSeed(level, makeNonce(2_000, 0.7)), level);
    const ids = (r: typeof a) => r.targetItems.map((i) => i.id).join(',');
    expect(ids(a)).not.toBe(ids(b));
    /**
     * 🔴 МАРШРУТ НА ВОСЬМОМ УРОВНЕ УЖЕ СВОЙ У КАЖДОЙ ПАРТИИ — правило изменено
     * 06.09.2026 (решение Дениса, вариант C), и эта строка обновлена вместе с
     * ним. Раньше здесь стояло «маршрут постоянный: места и их порядок часть
     * правил», и это было верно, пока фаза «Маршрут» ничего не тренировала:
     * порядок был один на все пятнадцать уровней, а правила обещали его
     * запоминать. Теперь до пятого уровня включительно опора неизменна (человек
     * осваивает приём на знакомой дороге), а с шестого порядок перемешивается —
     * и номера мест вне фазы маршрута скрыты, иначе порядок читался бы с экрана.
     */
    expect(a.loci.map((l) => l.id)).not.toEqual(b.loci.map((l) => l.id));
    // Состав по-прежнему из библиотеки дворца и без повторов — это валидатор.
    expect(new Set(a.loci.map((l) => l.id)).size).toBe(a.loci.length);
    // А до шестого уровня опора обязана оставаться той же самой.
    const низкий = 3;
    const c = generateMemoryPalaceRound(makeSeed(низкий, makeNonce(1_000, 0.1)), низкий);
    const d = generateMemoryPalaceRound(makeSeed(низкий, makeNonce(2_000, 0.7)), низкий);
    expect(c.loci.map((l) => l.id)).toEqual(d.loci.map((l) => l.id));
    // Одно и то же зерно по-прежнему даёт одну и ту же партию — иначе поднятая
    // из хранилища партия рассыпалась бы при пересборке раунда.
    const again = generateMemoryPalaceRound(makeSeed(level, makeNonce(1_000, 0.1)), level);
    expect(ids(again)).toBe(ids(a));
  });

  it('метка захода различает даже два старта в одну миллисекунду', () => {
    expect(makeNonce(1_000, 0.1)).not.toBe(makeNonce(1_000, 0.9));
    expect(makeSeed(3, 'abc')).toBe('memory-palace-l3-abc');
  });

  /**
   * Подпись на экране настройки («сколько мест на уровне») обязана считаться тем
   * же генератором, что и партия. Своя формула разъезжается с игрой на первой же
   * правке лесенки — и человек читает одно, а играет другое.
   */
  it('подпись про число мест совпадает с настоящей партией', () => {
    for (const level of [1, 2, 7, 14, 15, 99]) {
      const real = generateMemoryPalaceRound('x', level).lociCount;
      expect(`L${level}: ${memoryPalaceLociForLevel(level)}`).toBe(`L${level}: ${real}`);
    }
    // Лесенка растёт содержанием: 5 мест на первом, 12 на пятнадцатом.
    expect(memoryPalaceLociForLevel(1)).toBe(5);
    expect(memoryPalaceLociForLevel(15)).toBe(12);
  });
});

describe('Дворец памяти · незаконченная партия переживает выход', () => {
  /**
   * 🔴 ГЛАВНОЕ. Расстановку придумывает человек: связку «жёлтый колокол на
   * балконе» не вывести ни из зерна, ни из номера уровня. Выход из партии,
   * который её стирает, стоит человеку всей проделанной работы.
   */
  it('🔴 снимок и подъём возвращают ТУ ЖЕ партию', () => {
    let s = playToRecall('palace-resume', 9);
    s = selectRecallItem(s, (s.finalizedPlacements as string[])[0] as string, 2_000);

    const snap = snapshotForResume(s, 9, 3_000);
    expect(snap).not.toBeNull();

    // Через хранилище идёт JSON, а не объект: то, что не пережило сериализацию,
    // не переживёт и выход из приложения.
    const revived = restoreFromResume(JSON.parse(JSON.stringify(snap)), 10_000);
    expect(revived).not.toBeNull();
    const back = revived!.session;

    expect(back.phase).toBe(s.phase);
    expect(back.finalizedPlacements).toEqual(s.finalizedPlacements);
    expect(back.forwardResponses).toEqual(s.forwardResponses);
    expect(back.reverseResponses).toEqual(s.reverseResponses);
    expect(back.recallIndex).toBe(s.recallIndex);
    expect(back.round.id).toBe(s.round.id);
    expect(revived!.seed).toBe(s.round.seed);
    expect(revived!.level).toBe(9);
    // И партия продолжается с того же места, а не с начала маршрута.
    expect(currentRecallLocus(back)?.id).toBe(currentRecallLocus(s)?.id);
  });

  /**
   * 🔴 ЧАСЫ ПАРТИИ НЕ СЧИТАЮТ ВРЕМЯ, ПОКА ИГРЫ НЕ БЫЛО НА ЭКРАНЕ.
   *
   * Хранить момент старта нельзя: между выходом и возвратом настенные часы
   * уходят вперёд на часы и сутки, и партия, поднятая назавтра, отчиталась бы о
   * десятичасовом маршруте — в историю сессий, в статистику, в сравнение с
   * другими игроками. Поэтому в снимке лежит НАКОПЛЕННОЕ время, а часы при
   * подъёме заводятся задним числом.
   */
  it('🔴 сутки в кармане не попадают во время партии', () => {
    let s = playToRecall('palace-clock', 5, 1_000);
    const snap = snapshotForResume(s, 5, 61_000)!;   // партия шла минуту
    expect(snap.elapsedMs).toBe(60_000);

    const DAY = 24 * 60 * 60 * 1000;
    const revived = restoreFromResume(snap, 61_000 + DAY)!;
    // Прошли ещё 5 секунд игры — итого минута и пять секунд, а не сутки.
    const elapsedAfter = (61_000 + DAY + 5_000) - (revived.session.startedAt as number);
    expect(elapsedAfter).toBe(65_000);
  });

  /**
   * Пауза в снимок не консервируется. Человек вышел из игры — это и есть его
   * пауза; вернувшись, он должен попасть в свою расстановку, а не в модальное
   * окно «Пауза · Продолжить», которого он не открывал.
   */
  it('партия, сохранённая на паузе, поднимается в свою фазу, а не в окно паузы', () => {
    let s = playToRecall('palace-pause', 6);
    s = pauseMemoryPalaceSession(s, 4_000);
    expect(s.phase).toBe('paused');

    const snap = snapshotForResume(s, 6, 5_000)!;
    expect(snap.session.phase).toBe('recall-forward');
    expect(snap.session.pausedFrom).toBeNull();
    expect(restoreFromResume(snap, 9_000)!.session.phase).toBe('recall-forward');
  });

  /**
   * 🔴 ЗАПИСЫВАЕТСЯ ПОСЛЕДНИЙ ХОД, А НЕ ПЕРВЫЙ.
   *
   * Проверка заведена по живому багу 19.08.2026: отложенная запись висела на
   * эффекте с зависимостью от флага «есть что терять», флаг меняется РОВНО ОДИН
   * РАЗ — на первой положенной вещи, — эффект больше не перезапускался. Снаружи
   * всё выглядело работающим: запись в хранилище есть, «Продолжить»
   * предлагается; а восстанавливались два предмета из пяти, потому что снимок
   * остался из первых секунд партии. Поймала это только партия, сыгранная
   * руками в браузере.
   */
  it('🔴 подряд идущие ходы дают ОДНУ запись — и в ней последнее состояние', () => {
    const written: string[] = [];
    let pending: (() => void) | null = null;
    let board = 'пусто';

    const saver = createPartySaver({
      delayMs: 400,
      save: () => written.push(board),          // читает ЖИВОЕ состояние в момент записи
      setTimer: (fn) => { pending = fn; return 1; },
      clearTimer: () => { pending = null; },
    });

    /**
     * Подставной таймер обязан вести себя как настоящий: сработал — и его больше
     * НЕТ. Первая версия этой заготовки оставляла обработчик висеть, и на нём
     * мутационный прогон проходил насквозь: сторож, который никогда не
     * перезаводится, «срабатывал» второй раз старым же обработчиком.
     */
    const fire = () => {
      const fn = pending;
      pending = null;
      if (!fn) throw new Error('записи не назначено');
      fn();
    };

    board = 'колокол';  saver.changed();
    board = 'яблоко';   saver.changed();
    board = 'корона';   saver.changed();
    expect(written).toEqual([]);                 // по хранилищу каждым касанием не бьём

    fire();
    expect(written).toEqual(['корона']);         // ровно одна запись, и она свежая

    // 🔴 И ЖИЗНЬ НА ЭТОМ НЕ КОНЧАЕТСЯ. Именно здесь ломалось: первая запись
    // проходила, а следующие ходы больше ничего не заводили — в хранилище
    // навсегда оставался снимок из первых секунд партии.
    board = 'ракушка';
    saver.changed();
    expect(pending).not.toBeNull();
    fire();
    expect(written).toEqual(['корона', 'ракушка']);

    // Партия доиграна либо экран снесли — отложенная запись не стреляет вслед.
    board = 'ключ';
    saver.changed();
    saver.cancel();
    expect(pending).toBeNull();
    expect(written).toEqual(['корона', 'ракушка']);
  });

  /**
   * 🔴 МУСОРНЫХ ЗАПИСЕЙ В ХРАНИЛИЩЕ НЕ КОПИТСЯ. Каждая сохранённая партия
   * всплывает карточкой «Продолжить» на главной. Сохранить пустую или уже
   * доигранную — значит пообещать человеку партию, которой нет.
   *
   * И та же граница отвечает за вопрос при выходе: спрашивать про партию,
   * которую мы не сохраняем, — обман, а сохранять молча то, о чём не спросили, —
   * половинчатая починка (см. exit-guard.test.ts).
   */
  it('🔴 сохраняем ровно то, что есть смысл продолжать', () => {
    const fresh = createMemoryPalaceSession({ seed: 'palace-empty', level: 4 });
    expect(hasSomethingToLose(fresh)).toBe(false);
    expect(snapshotForResume(fresh, 4, 100)).toBeNull();

    // Маршрут показан, но человек ещё ничего не решил: маршрут постоянный и
    // одинаковый на всех заходах — при возврате он увидит ровно то же самое.
    const onRoute = startMemoryPalaceRound(fresh, 100);
    expect(hasSomethingToLose(onRoute)).toBe(false);

    // Первая же положенная вещь — придумана человеком и невосстановима.
    let placing = continueToPlacement(onRoute);
    expect(hasSomethingToLose(placing)).toBe(false);
    placing = selectPlacementItem(placing, placing.round.targetItems[0]!.id);
    placing = placeSelectedItemAtLocus(placing, 0);
    expect(hasSomethingToLose(placing)).toBe(true);
    expect(snapshotForResume(placing, 4, 100)).not.toBeNull();

    // Доигранную партию не поднимаем: продолжать в ней нечего.
    const done = finishRecall(playToRecall('palace-done', 3), true);
    expect(done.phase).toBe('result');
    expect(hasSomethingToLose(done)).toBe(false);
    expect(snapshotForResume(done, 3, 9_000)).toBeNull();
    expect(restoreFromResume({ level: 3, seed: 'x', elapsedMs: 0, session: done }, 1)).toBeNull();
  });
});

describe('Дворец памяти · за что даётся уровень', () => {
  /**
   * 🔴 УЗНАВАНИЕ ПРЕДМЕТОВ НЕ ДОЛЖНО СХОДИТЬ ЗА ПАМЯТЬ НА МЕСТО.
   *
   * Лишних предметов в наборе всего 2–4, поэтому «знание предметов» здесь почти
   * даровое: отвечая набором из тех же предметов в любом порядке, человек
   * набирает 100% узнавания, не помня ни одного места. Порог и звёзды обязаны
   * это отбивать — иначе уровень выдаётся за перебор.
   */
  it('🔴 все предметы «узнаны», но места перепутаны — уровень не засчитан', () => {
    const shifted = finishRecall(playToRecall('palace-shift', 7), false);
    const m = shifted.result as MemoryPalaceMetrics;

    expect(m.specific.itemKnowledgeAccuracy).toBe(1);      // предметы все из набора
    expect(m.specific.locationAccuracy).toBe(0);           // и ни одного на своём месте
    expect(memoryPalacePassed(m)).toBe(false);
    expect(memoryPalaceStars(m)).toBe(1);
  });

  it('🔴 чистый проход в обе стороны — засчитан, три звезды', () => {
    const clean = finishRecall(playToRecall('palace-clean', 7), true);
    const m = clean.result as MemoryPalaceMetrics;
    expect(m.specific.locationAccuracy).toBe(1);
    expect(m.specific.forwardLocationAccuracy).toBe(1);
    expect(m.specific.reverseLocationAccuracy).toBe(1);
    expect(memoryPalacePassed(m)).toBe(true);
    expect(memoryPalaceStars(m)).toBe(3);
  });

  /**
   * Односторонний прогон не должен закрывать провал. Зубрёжка проговариванием
   * даёт прямой порядок и рассыпается на обратном — если бы порог смотрел только
   * на среднее, такая партия проходила бы за настоящую работу с местами.
   */
  it('🔴 вперёд идеально, назад развалилось — уровень не засчитан', () => {
    let s = playToRecall('palace-oneway', 6);
    const placed = s.finalizedPlacements as string[];
    const total = s.round.lociCount;
    for (let i = 0; i < total; i += 1) s = selectRecallItem(s, placed[i] as string, 2_000);
    s = continueToReverseRecall(s);
    for (let i = 0; i < total; i += 1) {
      // обратный проход в ПРЯМОМ порядке: те же предметы, ни одного на месте
      s = selectRecallItem(s, placed[i] as string, 3_000);
    }
    const m = s.result as MemoryPalaceMetrics;
    expect(m.specific.forwardLocationAccuracy).toBe(1);
    expect(m.specific.reverseLocationAccuracy).toBeLessThan(0.5);
    expect(memoryPalacePassed(m)).toBe(false);
  });

  /**
   * 🔴 ЗВЁЗДЫ РАСХОДЯТСЯ С ОБЩЕЙ ТОЧНОСТЬЮ — И ЭТО НЕ ПРИДИРКА, А ЦЕЛАЯ ПОЛОСА
   * РЕЗУЛЬТАТОВ.
   *
   * Мутационная проверка показала, что предыдущего теста мало: партия «все
   * предметы узнаны, ни одного места» даёт общую точность 0.55, и звёзды по ней
   * всё равно выходят одна — подмена метрики проходила незамеченной. Здесь
   * партия из середины: человек переставил местами два соседних предмета в
   * каждом направлении. Общая точность 0.84 (то есть «хорошо»), а на местах он
   * всего 2/3 — и звезда за это ОДНА, потому что предмет игры — места.
   */
  it('🔴 общая точность «хорошо», а мест две трети — звезда одна', () => {
    let s = playToRecall('palace-stars', 15);
    const placed = s.finalizedPlacements as string[];
    const total = s.round.lociCount;
    expect(total).toBe(12);

    /** Переставить местами ответы в двух соседних парах: места ломаются, порядок почти цел. */
    const withSwaps = (seq: string[]): string[] => {
      const out = [...seq];
      for (const i of [0, 4]) { const t = out[i] as string; out[i] = out[i + 1] as string; out[i + 1] = t; }
      return out;
    };

    for (const id of withSwaps(placed)) s = selectRecallItem(s, id, 2_000);
    s = continueToReverseRecall(s);
    for (const id of withSwaps([...placed].reverse())) s = selectRecallItem(s, id, 3_000);

    const m = s.result as MemoryPalaceMetrics;
    expect(m.specific.itemKnowledgeAccuracy).toBe(1);
    expect(m.specific.locationAccuracy).toBeCloseTo(16 / 24, 5);
    expect(m.accuracy).toBeGreaterThanOrEqual(0.8);      // общая говорит «хорошо»
    expect(memoryPalacePassed(m)).toBe(true);            // уровень честно засчитан
    expect(memoryPalaceStars(m)).toBe(1);                // но награда — по местам
  });

  it('полоса сложности для истории сессий покрывает все 15 уровней', () => {
    expect(memoryPalaceDifficulty(1)).toBe('easy');
    expect(memoryPalaceDifficulty(5)).toBe('easy');
    expect(memoryPalaceDifficulty(6)).toBe('medium');
    expect(memoryPalaceDifficulty(10)).toBe('medium');
    expect(memoryPalaceDifficulty(11)).toBe('hard');
    expect(memoryPalaceDifficulty(15)).toBe('hard');
  });
});

describe('Дворец памяти · разбор после партии', () => {
  /**
   * Проценты говорят «шесть из восьми», но не говорят ГДЕ, а метод мест именно
   * этим и тренируется: человек видит, что спотыкается на «Балконе», и в
   * следующий раз делает связку там ярче.
   *
   * ⚠️ ОБРАТНЫЙ ПРОХОД ИНДЕКСИРУЕТСЯ С КОНЦА, и перепутать это можно молча:
   * сводные проценты сойдутся, а разбор будет показывать чужие ошибки. Поэтому
   * здесь строится партия, где неверен РОВНО ОДИН ответ обратного прохода, и
   * проверяется, что галочка погасла именно у него.
   */
  it('🔴 разбор показывает ошибку на своём месте, а не на соседнем', () => {
    let s = playToRecall('palace-review', 1);
    const placed = s.finalizedPlacements as string[];
    const total = s.round.lociCount;      // на первом уровне — 5 мест
    expect(total).toBe(5);
    for (let i = 0; i < total; i += 1) s = selectRecallItem(s, placed[i] as string, 2_000);
    s = continueToReverseRecall(s);
    // Обратный проход: первый ответ (это ПОСЛЕДНЕЕ место маршрута) — лишний
    // предмет. Повтор уже названного предмета модуль внутри одного направления
    // не принимает, поэтому «ошибиться» здесь можно только лишним предметом.
    s = selectRecallItem(s, s.round.distractorItems[0]!.id, 3_000);
    for (let i = 1; i < total; i += 1) s = selectRecallItem(s, placed[total - 1 - i] as string, 3_000);
    expect(s.phase).toBe('result');   // партия действительно доиграна

    const rows = memoryPalaceReview(s, 'ru');
    expect(rows).toHaveLength(total);
    expect(rows.map((r) => r.forwardOk)).toEqual([true, true, true, true, true]);
    // Погасла галочка ровно у ПОСЛЕДНЕГО места маршрута — того самого, о котором
    // обратный проход спрашивает ПЕРВЫМ.
    expect(rows.map((r) => r.reverseOk)).toEqual([true, true, true, true, false]);
    // Строка — это место маршрута с положенным туда предметом, по-русски.
    expect(rows[0]!.locus).toBe('Арка входа');
    expect(rows[0]!.item.length).toBeGreaterThan(3);
    expect(rows[0]!.order).toBe(1);
  });

  it('разбирать нечего, пока расстановка не закреплена', () => {
    const early = continueToPlacement(startMemoryPalaceRound(createMemoryPalaceSession({ seed: 'p', level: 3 }), 0));
    expect(memoryPalaceReview(early, 'ru')).toEqual([]);
    expect(memoryPalaceReview(null, 'ru')).toEqual([]);
  });
});

describe('Дворец памяти · сцепка с приложением', () => {
  /**
   * 🔴 СВОЙ ЭКРАН ПОЗДРАВЛЕНИЯ МОДУЛЯ ВЫКЛЮЧЕН. Звёзды по уровням, серия чистых
   * прохождений и глаз-разрядка пишутся ТОЛЬКО в LevelCleared; собственный экран
   * итога у модуля есть, и оставить его включённым значит тихо выпасть из всей
   * бухгалтерии — ровно как когда-то маджонг и парные картинки.
   */
  it('🔴 экран отдаёт итог общему LevelCleared, а не модулю', () => {
    const src = read(SCREEN);
    expect(src).toContain('showOwnResults={false}');
    expect(src).not.toContain('showOwnResults={true}');
    expect(src).toContain('<LevelCleared');
    expect(src).toContain('<LevelProgressMap');
    expect(src).toContain('usePersistentLevel(');
    // Уровень уезжает в сессию — иначе прогресс не переживёт сброс профиля
    // (getMaxLevelFromSessions восстанавливает его именно отсюда).
    expect(/level:\s*doneLevel\b/.test(src)).toBe(true);
  });

  /**
   * 🔴 ЧАСЫ ПАРТИИ — ИГРОВЫЕ. Пока человек пишет отзыв, время партии стоит.
   * Гейт `game-clock-discipline` читает только `app/games/*.tsx` и внутрь модуля
   * не заглядывает, поэтому проверяем обе половины: экран передаёт `gameNow`, а
   * в модуле не осталось молчаливого отката к настенным часам.
   */
  it('🔴 время партии идёт по игровым часам с обеих сторон', () => {
    expect(read(SCREEN)).toContain('now={gameNow}');
    const mod = code(MODULE);
    expect(mod).not.toContain('now = Date.now');
    expect(mod).not.toContain('Date.now()');
  });

  /** Выход из живой партии спрашивает и сохраняет — обе половины сразу. */
  it('🔴 выход спрашивает и дописывает партию', () => {
    const src = read(SCREEN);
    expect(src).toContain('confirmExit=');
    expect(src).toContain('onSaveBeforeExit=');
    /**
     * Проводка того же бага: сторож записи обязан дёргаться ТАМ, ГДЕ МЕНЯЕТСЯ
     * ПАРТИЯ. Сам сторож проверен поведением выше; здесь — единственное, что
     * поведением не достать: что его действительно позвали из onSessionChange, а
     * не подвесили обратно на эффект с одноразовым флагом.
     */
    const bare = code(SCREEN);   // закомментированный вызов — это НЕ вызов
    const wiring = bare.slice(bare.indexOf('const onSessionChange'), bare.indexOf('const onSessionChange') + 320);
    expect(wiring).toContain('.changed()');
    expect(src).toContain('services/resume');
    expect(src).toContain('resumable');
  });

  /**
   * 🔴 ШАПКА ПАРТИИ НЕ ВЫТАЛКИВАЕТ «ПАУЗУ» ЗА КРАЙ ЭКРАНА.
   *
   * Живой замер 19.08.2026 на 390×844: кнопка «Пауза» занимала x 343…431 —
   * 41 px висел за экраном, подпись обрезана. Причина скучная: у `View` в React
   * Native `flexShrink` по умолчанию НОЛЬ, и длинное название фазы распирало
   * строку. Ни один автоматический замер этого не ловил: горизонтальной прокрутки
   * страницы нет (scrollWidth === clientWidth), размер самой кнопки честные
   * 88×48, а аудит попаданий пальцем заходит только на экран правил и до фазы
   * расстановки не доходит.
   *
   * ⚠️ Проверка ЧТЕНИЕМ, и это её потолок: разметку она видит, а пиксели — нет.
   * Настоящий замер — глазами в собранном приложении. Здесь стоит забор ровно от
   * возврата этой правки.
   */
  it('🔴 в шапке партии текстовый блок сжимаемый — иначе «Пауза» уезжает за экран', () => {
    const mod = code(MODULE);
    expect(mod).toContain('gameHeaderText: { flexShrink: 1 }');
    // Оба игровых заголовка (фазы и проверки) пользуются им, а не голым View.
    const headers = mod.split('styles.gameHeader}').length - 1;
    expect(headers).toBe(2);
    expect(mod.split('styles.gameHeaderText}').length - 1).toBe(2);
  });

  /**
   * 🔴 МЁРТВЫХ СТРОК В СЛОВАРЕ ИГРЫ НЕТ.
   *
   * Проверка заведена по факту: строка `used` («Уже выбрано» / «Already
   * selected») пришла из лаборатории объявленной, переведённой на оба языка и не
   * выведенной НИ РАЗУ — `strings.used` не встречался в разметке. Это тот же
   * класс, что бейдж отсчёта в SET: написано, переведено, гейтом покрыто и не
   * показано ни одному человеку. Теперь она подписывает израсходованную плитку
   * (и голосом скринридера тоже), а гейт следит, чтобы следующая такая строка не
   * появилась.
   */
  it('🔴 каждая строка словаря игры где-то выводится', () => {
    const keys = (read(I18N).match(/^ {2}(\w+): string;$/gm) ?? [])
      .map((l: string) => l.trim().replace(/: string;$/, ''));
    expect(keys.length).toBeGreaterThan(40);

    const rendered = code(MODULE) + code(SCREEN);
    /**
     * Ищем ЦЕЛОЕ имя, а не подстроку. Первая версия проверки искала `.used`
     * простым includes — и находила его внутри `styles.usedNote`, то есть
     * считала строку живой по имени СТИЛЯ. Мутационный прогон это и вскрыл:
     * гейт, написанный ради мёртвых строк, сам проспал мёртвую строку.
     */
    const dead = keys.filter((k: string) => !new RegExp(`\\.${k}(?![A-Za-z0-9_])`).test(rendered));
    expect(dead).toEqual([]);
  });

  /**
   * 🔴 СТРОКА «ЧТО ДЕЛАТЬ» ЖИВЁТ В ИГРОВОЙ ФАЗЕ, А НЕ НА ЭКРАНЕ ИТОГА.
   *
   * Реестр `game-task-line.test.ts` записывает эту игру как экран-обёртку и
   * ссылается сюда: строка лежит в модуле, и здесь доказывается, что она
   * рисуется В ПАРТИИ. Проверка нарочно вырезает блок собственного экрана итога
   * модуля — он в приложении выключен, и строка, найденная только там, была бы
   * найдена в мёртвой ветке.
   */
  it('🔴 подсказка каждой фазы рисуется в самой партии, а не в выключенном итоге', () => {
    const mod = code(MODULE);
    const from = mod.indexOf("if (session.phase === 'result'");
    const to = mod.indexOf("if (session.phase === 'transition')");
    // Маркеры обязаны существовать: перестроили компонент — гейт должен
    // покраснеть и попросить переписать вырезание, а не молча резать пустоту.
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);

    const live = mod.slice(0, from) + mod.slice(to);
    for (const token of ['strings.routeBody', 'strings.placeBody', 'strings.studyBody', 'strings.recallPrompt']) {
      expect(`${token}: ${live.includes(token)}`).toBe(`${token}: true`);
    }
  });
});
