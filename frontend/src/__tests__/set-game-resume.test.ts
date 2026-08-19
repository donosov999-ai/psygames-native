/**
 * SET: НЕДОИГРАННАЯ ПАРТИЯ ПЕРЕЖИВАЕТ ВЫХОД, И ЛИМИТ НА РАСКЛАД ПРИ ЭТОМ НЕ ВРЁТ.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ (замер 19.08.2026). Партия здесь — `trials` раскладов подряд
 * (6 на первом уровне, 15 на десятом), с L11 на каждый расклад ещё и лимит
 * времени. Это минуты. Выход с экрана уводил МОЛЧА и стирал всё: раскладку,
 * счёт верных и ошибок, номер расклада, накопленное время.
 *
 * ⚠️ ПОЧЕМУ ПОВЕДЕНИЕМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА. Гейт `exit-guard.test.ts`
 * статический: он видит, что игра ДОТЯГИВАЕТСЯ до слоя партии и что вопрос при
 * выходе задан. Он физически не может увидеть главное — АРИФМЕТИКУ ВРЕМЕНИ.
 * Остаток лимита при подъёме обязан быть тем же, что был на момент ухода:
 * начнётся заново — человек получит бесплатное время и замер перестанет быть
 * замером; посчитается от настенных часов — вернувшийся назавтра получит штраф
 * ✗ в первую же секунду, ни за что. Обе поломки выглядят в исходнике одинаково
 * правильно, поэтому проверяются исполнением.
 *
 * Момент времени приходит в функции аргументом — значит «человек вернулся через
 * сутки» здесь проверяется числом, а не ожиданием суток.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveResume, loadResume, clearResume } from '@/src/services/resume';
import {
  SET_BOARD_SIZE,
  SET_GAME_ID,
  SET_RESUME_V,
  restoreSetParty,
  setHasSomethingToLose,
  snapshotSetParty,
  type Card,
  type SetLiveParty,
  type SetResume,
} from '@/app/games/set-game';

/** Стол на 12 карт. Признаки настоящие — поднятая партия сверяется именно по ним. */
const SHAPES = ['circle', 'square', 'triangle'] as const;
const FILLS = ['solid', 'striped', 'open'] as const;
const COLORS = ['red', 'green', 'purple'] as const;
const BOARD: Card[] = Array.from({ length: SET_BOARD_SIZE }, (_, i) => ({
  shape: SHAPES[i % 3],
  fill: FILLS[(i >> 1) % 3],
  color: COLORS[(i >> 2) % 3],
  count: ((i % 3) + 1) as 1 | 2 | 3,
  id: `card-${i}`,
}));

/** Отметка игровых часов «сейчас» и «человек вернулся через сутки». */
const NOW = 1_000_000;
const NEXT_DAY = NOW + 24 * 60 * 60 * 1000;
/** Уровень 12: лимит 22 с на расклад. Партия идёт полторы минуты, на расклад осталось 7.4 с. */
const LIMIT_SEC = 22;
const LEFT_MS = 7_400;
const PLAYED_MS = 90_000;

const live = (over: Partial<SetLiveParty> = {}): SetLiveParty => ({
  phase: 'playing',
  level: 12,
  trials: 6,
  round: 3,
  hits: 2,
  errors: 1,
  board: BOARD,
  picked: [],
  startedAt: NOW - PLAYED_MS,
  dealLimitSec: LIMIT_SEC,
  dealEndAt: NOW + LEFT_MS,
  verdict: 'none',
  ...over,
});

/** Снять партию и тут же поднять её обратно — как при выходе и возвращении. */
const roundTrip = (over: Partial<SetLiveParty> = {}, back = NEXT_DAY) => {
  const snap = snapshotSetParty(live(over), NOW);
  expect(snap).not.toBeNull();
  return { snap: snap as SetResume, restored: restoreSetParty(snap, back) };
};

describe('SET — есть ли что терять при выходе', () => {
  it('🔴 свежий расклад без единого действия → терять нечего, вопрос был бы шумом', () => {
    expect(setHasSomethingToLose({ phase: 'playing', hits: 0, errors: 0, round: 1 })).toBe(false);
  });

  it('🔴 ошибка на ПЕРВОМ раскладе — уже есть что терять: по ✗ решается проход уровня', () => {
    expect(setHasSomethingToLose({ phase: 'playing', hits: 0, errors: 1, round: 1 })).toBe(true);
  });

  it('собранный сет и второй расклад — тоже есть что терять', () => {
    expect(setHasSomethingToLose({ phase: 'playing', hits: 1, errors: 0, round: 1 })).toBe(true);
    expect(setHasSomethingToLose({ phase: 'playing', hits: 0, errors: 0, round: 2 })).toBe(true);
  });

  it('партия не идёт → молча, без «вы уверены?» (настройка, итог, босс)', () => {
    for (const phase of ['config', 'cleared', 'result', 'boss', 'intro'] as const) {
      expect(setHasSomethingToLose({ phase, hits: 5, errors: 5, round: 6 })).toBe(false);
    }
  });
});

describe('SET — остаток лимита на расклад', () => {
  it('🔴 вернулся через сутки → на расклад ровно тот же остаток, что был при уходе', () => {
    const { snap, restored } = roundTrip();
    expect(snap.dealLeftMs).toBe(LEFT_MS);
    expect(restored!.dealEndAt - NEXT_DAY).toBe(LEFT_MS);
  });

  it('🔴 остаток НЕ начинается заново — иначе выход и вход дают бесплатное время', () => {
    const { restored } = roundTrip();
    expect(restored!.dealEndAt - NEXT_DAY).not.toBe(LIMIT_SEC * 1000);
    expect(restored!.dealLimitSec).toBe(LIMIT_SEC);   // сам лимит уровня при этом сохранён
  });

  it('🔴 остаток НЕ протухает за время отсутствия — иначе штраф ✗ в первую же секунду', () => {
    const { restored } = roundTrip();
    expect(restored!.dealEndAt).toBeGreaterThan(NEXT_DAY);
  });

  it('на уровне без лимита он не появляется из ниоткуда', () => {
    const { snap, restored } = roundTrip({ dealLimitSec: 0, dealEndAt: 0 });
    expect(snap.dealLeftMs).toBeNull();
    expect(restored!.dealEndAt).toBe(0);
    expect(restored!.dealLimitSec).toBe(0);
  });

  it('🔴 ушёл на разборе ошибки → расклад получает ПОЛНЫЙ лимит, как по кнопке «Понятно»', () => {
    // Разбор снимает отсчёт (dealEndAt = 0), и это не «времени не осталось»:
    // сохранить здесь ноль значило бы сжечь расклад за то, что человек читал разбор.
    const { snap, restored } = roundTrip({ verdict: 'wrong', dealEndAt: 0, picked: [1, 4, 7] });
    expect(snap.dealLeftMs).toBeNull();
    expect(restored!.dealEndAt - NEXT_DAY).toBe(LIMIT_SEC * 1000);
    expect(restored!.freshDeal).toBe(false);          // стол тот же — разбор его не забирал
    expect(restored!.board).toHaveLength(SET_BOARD_SIZE);
    expect(restored!.picked).toEqual([]);             // выбранная тройка — состояние руки, не партии
  });
});

describe('SET — состояние партии переживает выход', () => {
  it('🔴 счёт, расклад и номер круга поднимаются те же', () => {
    const { restored } = roundTrip({ picked: [2, 5] });
    expect(restored).toMatchObject({
      level: 12, trials: 6, round: 3, hits: 2, errors: 1, picked: [2, 5],
    });
    expect(restored!.board).toEqual(BOARD);
  });

  it('🔴 секундомер продолжает, а не считает время, пока телефон лежал в кармане', () => {
    const { snap, restored } = roundTrip();
    expect(snap.elapsedMs).toBe(PLAYED_MS);
    expect(NEXT_DAY - restored!.startedAt).toBe(PLAYED_MS);
  });

  it('партия ложится в снимок ЖИВОЙ: время меряется моментом ухода, а не прошлым ходом', () => {
    const later = NOW + 5_000;   // человек ещё пять секунд смотрел на стол
    const snap = snapshotSetParty(live(), later)!;
    expect(snap.elapsedMs).toBe(PLAYED_MS + 5_000);
    expect(snap.dealLeftMs).toBe(LEFT_MS - 5_000);
  });
});

describe('SET — что сохранять НЕЛЬЗЯ', () => {
  it('🔴 терять нечего → снимка нет: иначе «Продолжить» на главной зовёт в пустоту', () => {
    expect(snapshotSetParty(live({ round: 1, hits: 0, errors: 0 }), NOW)).toBeNull();
  });

  it('🔴 доигранная партия не поднимается: верный ответ на ПОСЛЕДНЕМ раскладе', () => {
    // Через 700 мс экран уйдёт в итог и запишет партию на сервер. Снимок здесь
    // вернул бы человека в уже закрытую партию.
    expect(snapshotSetParty(live({ round: 6, trials: 6, verdict: 'right' }), NOW)).toBeNull();
  });

  it('партия кончилась (итог, настройка) → не сохраняется', () => {
    expect(snapshotSetParty(live({ phase: 'cleared' }), NOW)).toBeNull();
    expect(snapshotSetParty(live({ phase: 'result' }), NOW)).toBeNull();
  });

  it('🔴 отыгранный расклад в снимок не кладётся — иначе вернёшься к уже показанному сету', () => {
    // Таймаут: сет подсвечен на столе. Тот же стол при возвращении = готовый ответ.
    const revealed = roundTrip({ verdict: 'revealed', dealEndAt: 0 });
    expect(revealed.snap.board).toEqual([]);
    expect(revealed.restored!.freshDeal).toBe(true);
    expect(revealed.restored!.dealEndAt - NEXT_DAY).toBe(LIMIT_SEC * 1000);

    // Верный ответ в середине партии: расклад собран, круг идёт следующий.
    const solved = roundTrip({ verdict: 'right' });
    expect(solved.snap.round).toBe(4);
    expect(solved.restored!.freshDeal).toBe(true);
    expect(solved.restored!.round).toBe(4);
  });
});

describe('SET — мусор из хранилища не поднимается', () => {
  it('записи нет → продолжать нечего', () => {
    expect(restoreSetParty(null, NOW)).toBeNull();
    expect(restoreSetParty(undefined, NOW)).toBeNull();
  });

  it('🔴 неполный стол не поднимается — доска на 11 карт сломала бы игру молча', () => {
    const snap = snapshotSetParty(live(), NOW)!;
    expect(restoreSetParty({ ...snap, board: BOARD.slice(0, 11) }, NOW)).toBeNull();
    expect(restoreSetParty({ ...snap, board: [] }, NOW)).toBeNull();
  });

  it('🔴 карта с чужим признаком не поднимается', () => {
    const snap = snapshotSetParty(live(), NOW)!;
    const bad = [...BOARD];
    bad[3] = { ...bad[3], color: 'orange' as any };
    expect(restoreSetParty({ ...snap, board: bad }, NOW)).toBeNull();
  });

  it('🔴 три выбранные карты без вердикта не поднимаются — это тупик, четвёртую игра не примет', () => {
    const snap = snapshotSetParty(live(), NOW)!;
    const back = restoreSetParty({ ...snap, picked: [0, 1, 2] }, NOW);
    expect(back!.picked).toHaveLength(2);
  });

  it('выбранные карты вне стола отсеиваются', () => {
    const snap = snapshotSetParty(live(), NOW)!;
    const back = restoreSetParty({ ...snap, picked: [99, -1, 4, 4] as number[] }, NOW);
    expect(back!.picked).toEqual([4]);
  });

  it('номер круга больше числа кругов не переживает подъём', () => {
    const snap = snapshotSetParty(live(), NOW)!;
    expect(restoreSetParty({ ...snap, round: 99 }, NOW)!.round).toBe(6);
    expect(restoreSetParty({ ...snap, round: 0 }, NOW)!.round).toBe(1);
  });
});

describe('SET — партия и хранилище', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('🔴 записали → прочитали → подняли: стол и остаток лимита те же', async () => {
    const snap = snapshotSetParty(live(), NOW)!;
    await saveResume(SET_GAME_ID, 'default', SET_RESUME_V, snap);
    const back = restoreSetParty(await loadResume<SetResume>(SET_GAME_ID, 'default', SET_RESUME_V), NEXT_DAY);
    expect(back!.board).toEqual(BOARD);
    expect(back!.hits).toBe(2);
    expect(back!.dealEndAt - NEXT_DAY).toBe(LEFT_MS);
  });

  it('🔴 «отсчёт не шёл» переживает укладку в JSON: null не должен стать нулём', async () => {
    // Разница принципиальная: null = «дать полный лимит», 0 = «время вышло».
    const snap = snapshotSetParty(live({ verdict: 'wrong', dealEndAt: 0 }), NOW)!;
    await saveResume(SET_GAME_ID, 'default', SET_RESUME_V, snap);
    const raw = await loadResume<SetResume>(SET_GAME_ID, 'default', SET_RESUME_V);
    expect(raw!.dealLeftMs).toBeNull();
    expect(restoreSetParty(raw, NEXT_DAY)!.dealEndAt - NEXT_DAY).toBe(LIMIT_SEC * 1000);
  });

  it('🔴 доиграл → партия выброшена, вход начинается с настройки', async () => {
    await saveResume(SET_GAME_ID, 'default', SET_RESUME_V, snapshotSetParty(live(), NOW)!);
    await clearResume(SET_GAME_ID, 'default');   // ровно это делает экран на последнем раскладе
    expect(await loadResume<SetResume>(SET_GAME_ID, 'default', SET_RESUME_V)).toBeNull();
  });

  it('🔴 чужой профиль не поднимает чужую партию', async () => {
    // Профили в приложении — разные люди (Денис и сын). Поднять партию отца
    // ребёнку значит и подсунуть чужой уровень, и стереть её ему же.
    await saveResume(SET_GAME_ID, 'default', SET_RESUME_V, snapshotSetParty(live(), NOW)!);
    expect(await loadResume<SetResume>(SET_GAME_ID, 'kids', SET_RESUME_V)).toBeNull();
    expect(await loadResume<SetResume>(SET_GAME_ID, 'default', SET_RESUME_V)).not.toBeNull();
  });

  it('🔴 запись другого формата не поднимается — экран упал бы на чужих полях', async () => {
    await saveResume(SET_GAME_ID, 'default', SET_RESUME_V, snapshotSetParty(live(), NOW)!);
    expect(await loadResume<SetResume>(SET_GAME_ID, 'default', SET_RESUME_V + 1)).toBeNull();
  });

  it('ключ партии совпадает с id игры в реестре — иначе карточка «Продолжить» зовёт в никуда', () => {
    expect(SET_GAME_ID).toBe('set_game');
  });
});
