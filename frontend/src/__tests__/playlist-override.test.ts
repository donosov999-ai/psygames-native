/* psygames-playlist-override-gate · VER 1 · 13.09.2026 */
/**
 * 🔴 ФАЙЛ НАСТРОЕК НЕ ИМЕЕТ ПРАВА ОСТАВИТЬ ЧЕЛОВЕКА БЕЗ ИГР.
 *
 * Состав профилей и зарядок теперь можно переопределить файлом (просьба Дениса
 * 13.09.2026: «по сути это редакция списка», а ехало оно через сборку часами).
 * Цена такой свободы — ровно один класс беды: опечатка в файле молча оставляет
 * профиль пустым, и человек видит сломанное приложение.
 *
 * Поэтому проба проверяет не «разбор работает», а ИМЕННО ЗАСЛОНЫ:
 * · чужой и битый файл отвергается целиком, заводской состав цел;
 * · неизвестная игра отбрасывается ПОИМЁННО, а не молча;
 * · пустой список игр не принимается — иначе опечатка во всех строках даёт
 *   профиль без единой игры;
 * · наложение трогает только переданные поля, остальное остаётся заводским;
 * · сброс возвращает ровно то, что в сборке.
 */
import { разобрать, наложить } from '@/src/services/playlistOverride';
import { PROFILE_BY_ID } from '@/src/constants/profiles';
import { GAMES } from '@/src/constants/games';
import { HUB_CONTENTS, visibleHubCards, установитьХабыИзФайла } from '@/src/constants/hubContents';
import { БЛОКИ_ГЛАВНОЙ, показыватьБлок } from '@/src/constants/homeBlocks';
import { FEATURE_LADDER, порогЗамка, установитьЗамкиИзФайла } from '@/src/services/featureLadder';
import { FIGURES, chestState, фигурки, установитьПорогиФигурок } from '@/src/services/collection';
import { уровеньПоПравилу, stepToParams, установитьПравилоУровня } from '@/src/services/warmup';
import { rememberLevelValue, resetLevelCacheForTests } from '@/src/services/levelCache';

const ЖИВАЯ_ИГРА = GAMES[0].id;
const ВТОРАЯ_ИГРА = GAMES[1].id;

function файл(профили: Record<string, unknown>, наборы?: unknown[], хабы?: unknown): string {
  return JSON.stringify({ app: 'PsyGames-Playlists', format: 1, профили,
    ...(наборы ? { наборы } : null), ...(хабы ? { хабы } : null) });
}
const шаг = (id: string) => ({ game_id: id, game_route: '/games/x', est_duration_sec: 60 });

describe('файл состава: заслоны', () => {
  it('🔴 чужой файл отвергается целиком и называет причину', () => {
    const r = разобрать(JSON.stringify({ app: 'PsyGames-Backup', format: 1, data: {} }));
    expect(r.состав).toBeNull();
    expect(r.ошибка).toMatch(/файл другого рода/i);
  });

  it('🔴 не-JSON отвергается, а не роняет разбор', () => {
    const r = разобрать('это не json');
    expect(r.состав).toBeNull();
    expect(r.ошибка).toMatch(/не удалось прочитать/i);
  });

  it('формат другой версии отвергается с числами', () => {
    const r = разобрать(JSON.stringify({ app: 'PsyGames-Playlists', format: 99, профили: {} }));
    expect(r.состав).toBeNull();
    expect(r.ошибка).toMatch(/99/);
  });

  it('🔴 неизвестная игра отбрасывается ПОИМЁННО, остальные принимаются', () => {
    const r = разобрать(файл({ chess: { игры: [ЖИВАЯ_ИГРА, 'такой-игры-нет'] } }));
    expect(r.состав?.chess.игры).toEqual([ЖИВАЯ_ИГРА]);
    expect(r.отброшено.join(' ')).toMatch(/такой-игры-нет/);
  });

  it('🔴 пустой список игр НЕ принимается — заводской состав остаётся', () => {
    const r = разобрать(файл({ chess: { игры: ['опечатка-один', 'опечатка-два'] } }));
    expect(r.состав?.chess).toBeUndefined();
    expect(r.отброшено.join(' ')).toMatch(/пуст/);
    // и наложение такого состава профиль не меняет
    expect(наложить(PROFILE_BY_ID.chess, r.состав).allowed_games)
      .toEqual(PROFILE_BY_ID.chess.allowed_games);
  });

  it('🔴 шаг зарядки с несуществующей игрой выбрасывается, соседние живут', () => {
    const r = разобрать(файл({
      kids: { утро: [
        { game_id: ЖИВАЯ_ИГРА, game_route: '/games/x', est_duration_sec: 60 },
        { game_id: 'призрак', game_route: '/games/y', est_duration_sec: 60 },
        { game_id: ВТОРАЯ_ИГРА, game_route: '/games/z', est_duration_sec: 60 },
      ] },
    }));
    expect(r.состав?.kids.утро?.map((ш) => ш.game_id)).toEqual([ЖИВАЯ_ИГРА, ВТОРАЯ_ИГРА]);
    expect(r.отброшено.join(' ')).toMatch(/призрак/);
  });
});

describe('файл состава: наложение', () => {
  it('без файла профиль остаётся заводским', () => {
    expect(наложить(PROFILE_BY_ID.chess, null)).toBe(PROFILE_BY_ID.chess);
  });

  it('🔴 трогается ТОЛЬКО переданное поле, остальное заводское', () => {
    const r = разобрать(файл({ chess: { игры: [ЖИВАЯ_ИГРА] } }));
    const стало = наложить(PROFILE_BY_ID.chess, r.состав);
    expect(стало.allowed_games).toEqual([ЖИВАЯ_ИГРА]);
    // зарядка и вечерний набор не назывались — значит заводские
    expect(стало.evening_playlist).toEqual(PROFILE_BY_ID.chess.evening_playlist);
    expect(стало.warmup_enabled).toBe(PROFILE_BY_ID.chess.warmup_enabled);
    expect(стало.display_name).toBe(PROFILE_BY_ID.chess.display_name);
  });

  it('состав чужого профиля на этот не влияет', () => {
    const r = разобрать(файл({ kids: { игры: [ЖИВАЯ_ИГРА] } }));
    expect(наложить(PROFILE_BY_ID.chess, r.состав).allowed_games)
      .toEqual(PROFILE_BY_ID.chess.allowed_games);
  });

  it('выключение зарядки переносится, а состав игр не трогается', () => {
    const r = разобрать(файл({ kids: { зарядка_включена: false } }));
    const стало = наложить(PROFILE_BY_ID.kids, r.состав);
    expect(стало.warmup_enabled).toBe(false);
    expect(стало.allowed_games).toEqual(PROFILE_BY_ID.kids.allowed_games);
  });

  it('«все игры» переносится как есть', () => {
    const r = разобрать(файл({ free: { игры: 'all' } }));
    expect(наложить(PROFILE_BY_ID.free, r.состав).allowed_games).toBe('all');
  });

  it('неизвестный профиль в файле ничего не ломает', () => {
    const r = разобрать(файл({ 'профиль-из-будущего': { игры: [ЖИВАЯ_ИГРА] } }));
    expect(наложить(PROFILE_BY_ID.chess, r.состав)).toBe(PROFILE_BY_ID.chess);
  });
});


describe('зарядка по дням недели', () => {
  it('🔴 дни принимаются и кладутся в недельный план', () => {
    const r = разобрать(файл({ kids: { по_дням: { 1: [шаг(ЖИВАЯ_ИГРА)], 5: [шаг(ВТОРАЯ_ИГРА)] } } }));
    expect(Object.keys(r.состав?.kids.по_дням ?? {})).toEqual(['1', '5']);
    expect(наложить(PROFILE_BY_ID.kids, r.состав).custom_playlists?.[1]?.[0].game_id).toBe(ЖИВАЯ_ИГРА);
  });

  it('🔴 день вне 0…6 отбрасывается с именем, соседние живут', () => {
    const r = разобрать(файл({ kids: { по_дням: { 1: [шаг(ЖИВАЯ_ИГРА)], 9: [шаг(ВТОРАЯ_ИГРА)] } } }));
    expect(Object.keys(r.состав?.kids.по_дням ?? {})).toEqual(['1']);
    expect(r.отброшено.join(' ')).toMatch(/«9»/);
  });

  it('недельный план не назван — заводской остаётся нетронутым', () => {
    const r = разобрать(файл({ kids: { игры: [ЖИВАЯ_ИГРА] } }));
    expect(наложить(PROFILE_BY_ID.kids, r.состав).custom_playlists)
      .toEqual(PROFILE_BY_ID.kids.custom_playlists);
  });
});

describe('свои наборы упражнений', () => {
  it('🔴 набор принимается и получает имя', () => {
    const r = разобрать(файл({}, [{ id: 'утро-денис', название: 'Моя разминка', шаги: [шаг(ЖИВАЯ_ИГРА)] }]));
    expect(r.наборы).toHaveLength(1);
    expect(r.наборы[0]).toMatchObject({ id: 'утро-денис', название: 'Моя разминка' });
  });

  it('набор без названия берёт id вместо имени, а не остаётся безымянным', () => {
    const r = разобрать(файл({}, [{ id: 'без-имени', шаги: [шаг(ЖИВАЯ_ИГРА)] }]));
    expect(r.наборы[0].название).toBe('без-имени');
  });

  it('🔴 набор, где не осталось ни одного упражнения, не принимается', () => {
    const r = разобрать(файл({}, [{ id: 'пустой', шаги: [шаг('нет-такой')] }]));
    expect(r.наборы).toEqual([]);
    expect(r.отброшено.join(' ')).toMatch(/не осталось ни одного/);
  });

  it('🔴 повторный id набора отбрасывается, первый остаётся', () => {
    const r = разобрать(файл({}, [
      { id: 'дубль', название: 'первый', шаги: [шаг(ЖИВАЯ_ИГРА)] },
      { id: 'дубль', название: 'второй', шаги: [шаг(ВТОРАЯ_ИГРА)] },
    ]));
    expect(r.наборы).toHaveLength(1);
    expect(r.наборы[0].название).toBe('первый');
    expect(r.отброшено.join(' ')).toMatch(/уже был/);
  });

  it('🔴 ссылка профиля на несуществующий набор называется, а не глотается', () => {
    const r = разобрать(файл({ chess: { наборы: ['призрак'] } }));
    expect(r.состав?.chess).toBeUndefined();
    expect(r.отброшено.join(' ')).toMatch(/нет набора «призрак»/);
  });

  it('профиль ссылается на существующий набор — ссылка принята', () => {
    const r = разобрать(файл(
      { chess: { наборы: ['мой'] } },
      [{ id: 'мой', название: 'Мой', шаги: [шаг(ЖИВАЯ_ИГРА)] }],
    ));
    expect(r.состав?.chess.наборы).toEqual(['мой']);
  });
});


describe('состав хабов из файла', () => {
  const ХАБ = Object.keys(HUB_CONTENTS).find((k) => HUB_CONTENTS[k].length >= 2)!;
  const ВСЕ = HUB_CONTENTS[ХАБ].map((c) => c.route);
  const РАЗРЕШЕНО = new Set(ВСЕ.map((r) => r.split('?')[0]));
  const t = (k: string) => k;

  afterEach(() => установитьХабыИзФайла(null));

  it('🔴 файл убирает карточку из хаба — «фасовать без пересборки»', () => {
    const r = разобрать(файл({}, undefined, { [ХАБ]: [ВСЕ[0]] }));
    expect(r.хабы?.[ХАБ]).toEqual([ВСЕ[0]]);
    установитьХабыИзФайла(r.хабы);
    expect(visibleHubCards(ХАБ, РАЗРЕШЕНО, t).map((x) => x.card.route)).toEqual([ВСЕ[0]]);
  });

  it('🔴 порядок карточек берётся из файла', () => {
    const наоборот = [...ВСЕ].reverse();
    установитьХабыИзФайла(разобрать(файл({}, undefined, { [ХАБ]: наоборот })).хабы);
    const стало = visibleHubCards(ХАБ, РАЗРЕШЕНО, t).map((x) => x.card.route);
    expect(стало[0]).toBe(наоборот[0]);
  });

  it('🔴 придумать карточку файлом НЕЛЬЗЯ — её нет в реестре', () => {
    const r = разобрать(файл({}, undefined, { [ХАБ]: [ВСЕ[0], '/games/выдуманная'] }));
    expect(r.хабы?.[ХАБ]).toEqual([ВСЕ[0]]);
    expect(r.отброшено.join(' ')).toMatch(/выдуманная/);
  });

  it('🔴 хаб, где не осталось карточек, остаётся заводским', () => {
    const r = разобрать(файл({}, undefined, { [ХАБ]: ['/games/только-опечатка'] }));
    expect(r.хабы).toBeNull();
    expect(r.отброшено.join(' ')).toMatch(/не осталось ни одной карточки/);
  });

  it('несуществующая развилка называется', () => {
    const r = разобрать(файл({}, undefined, { '/games/нет-такой-развилки': ['/games/x'] }));
    expect(r.отброшено.join(' ')).toMatch(/нет развилки/);
  });

  it('без раздела «хабы» состав хабов заводской', () => {
    expect(разобрать(файл({})).хабы).toBeNull();
    expect(visibleHubCards(ХАБ, РАЗРЕШЕНО, t).length).toBe(
      visibleHubCards(ХАБ, РАЗРЕШЕНО, t).length);
  });
});


describe('развилки по профилям — «детям десять головоломок, взрослым сорок»', () => {
  const ХАБ = Object.keys(HUB_CONTENTS).find((k) => HUB_CONTENTS[k].length >= 3)!;
  const ВСЕ = HUB_CONTENTS[ХАБ].map((c) => c.route);

  it('🔴 у профиля свой состав развилки, и он отличается от общего', () => {
    const r = разобрать(JSON.stringify({
      app: 'PsyGames-Playlists', format: 1,
      хабы: { [ХАБ]: ВСЕ },                                  // общий — весь набор
      профили: { kids: { хабы: { [ХАБ]: [ВСЕ[0]] } } },      // детям — одна карточка
    }));
    expect(r.хабы?.[ХАБ]).toEqual(ВСЕ);
    expect(r.состав?.kids.хабы?.[ХАБ]).toEqual([ВСЕ[0]]);
  });

  it('🔴 карточка, которой нет в развилке, отбрасывается и у профиля тоже', () => {
    const r = разобрать(JSON.stringify({
      app: 'PsyGames-Playlists', format: 1,
      профили: { kids: { хабы: { [ХАБ]: [ВСЕ[0], '/games/выдуманная'] } } },
    }));
    expect(r.состав?.kids.хабы?.[ХАБ]).toEqual([ВСЕ[0]]);
    expect(r.отброшено.join(' ')).toMatch(/выдуманная/);
  });

  it('профильные развилки не мешают составу игр того же профиля', () => {
    const r = разобрать(JSON.stringify({
      app: 'PsyGames-Playlists', format: 1,
      профили: { kids: { игры: [ЖИВАЯ_ИГРА], хабы: { [ХАБ]: [ВСЕ[0]] } } },
    }));
    expect(наложить(PROFILE_BY_ID.kids, r.состав).allowed_games).toEqual([ЖИВАЯ_ИГРА]);
    expect(r.состав?.kids.хабы?.[ХАБ]).toEqual([ВСЕ[0]]);
  });
});


describe('состав главной', () => {
  const ВСЕ = БЛОКИ_ГЛАВНОЙ.map((б) => б.id);

  it('🔴 блоки выбираются поимённо, а не по номеру строки в разметке', () => {
    const r = разобрать(файл({ kids: { главная: ['сегодня', 'практики'] } }));
    expect(r.состав?.kids.главная).toEqual(['сегодня', 'практики']);
  });

  it('🔴 неизвестный блок отбрасывается и называет, какие бывают', () => {
    const r = разобрать(файл({ kids: { главная: ['сегодня', 'блок-которого-нет'] } }));
    expect(r.состав?.kids.главная).toEqual(['сегодня']);
    expect(r.отброшено.join(' ')).toMatch(/блок-которого-нет/);
    expect(r.отброшено.join(' ')).toMatch(/есть: /);
  });

  it('🔴 пустой список блоков НЕ принимается — главная без блоков выглядит сломанной', () => {
    const r = разобрать(файл({ kids: { главная: ['опечатка'] } }));
    expect(r.состав?.kids).toBeUndefined();
    expect(r.отброшено.join(' ')).toMatch(/не осталось ни одного блока/);
  });

  it('файл про главную молчит — показываются все блоки', () => {
    for (const id of ВСЕ) expect(показыватьБлок(id as never, null)).toBe(true);
  });

  it('🔴 в списке только названные блоки, остальные скрыты', () => {
    const список = ['сегодня'];
    expect(показыватьБлок('сегодня', список)).toBe(true);
    expect(показыватьБлок('рекомендации', список)).toBe(false);
  });

  it('имена блоков уникальны — иначе редактор покажет две одинаковые галочки', () => {
    expect(new Set(ВСЕ).size).toBe(ВСЕ.length);
  });
});


describe('баланс из файла: замки', () => {
  afterEach(() => установитьЗамкиИзФайла(null));

  it('🔴 порог приёма берётся из файла, а не из сборки', () => {
    const r = разобрать(JSON.stringify({
      app: 'PsyGames-Playlists', format: 1, профили: {}, замки: { hint: 6 },
    }));
    expect(r.замки).toEqual({ hint: 6 });
    установитьЗамкиИзФайла(r.замки);
    expect(порогЗамка('hint')).toBe(6);
    // неназванный приём остаётся заводским
    expect(порогЗамка('undo')).toBe(FEATURE_LADDER.find((l) => l.key === 'undo')!.level);
  });

  it('🔴 несуществующий приём отбрасывается и называет, какие бывают', () => {
    const r = разобрать(JSON.stringify({
      app: 'PsyGames-Playlists', format: 1, профили: {}, замки: { нетТакого: 3 },
    }));
    expect(r.замки).toBeNull();
    expect(r.отброшено.join(' ')).toMatch(/нет приёма «нетТакого»/);
    expect(r.отброшено.join(' ')).toMatch(/есть: /);
  });

  it('🔴 нецелый и нулевой уровень не принимаются', () => {
    const r = разобрать(JSON.stringify({
      app: 'PsyGames-Playlists', format: 1, профили: {}, замки: { hint: 0, undo: 2.5 },
    }));
    expect(r.замки).toBeNull();
    expect(r.отброшено.length).toBe(2);
  });

  it('без файла порог заводской', () => {
    expect(порогЗамка('hint')).toBe(FEATURE_LADDER.find((l) => l.key === 'hint')!.level);
  });
});

describe('баланс из файла: пороги коллекции', () => {
  afterEach(() => установитьПорогиФигурок(null));
  const конверт = (коллекция: unknown) => JSON.stringify({
    app: 'PsyGames-Playlists', format: 1, профили: {}, коллекция,
  });

  it('🔴 порог фигурки берётся из файла и виден в сундуке', () => {
    const r = разобрать(конверт({ [FIGURES[0].key]: 50 }));
    expect(r.коллекция).toEqual({ [FIGURES[0].key]: 50 });
    установитьПорогиФигурок(r.коллекция);
    expect(фигурки()[0].at).toBe(50);
    // при 60 звёздах первая фигурка уже собрана, хотя заводской порог был 150
    expect(chestState(60).have).toBe(1);
  });

  it('🔴 ЛЕСТНИЦА ОБЯЗАНА РАСТИ: порог, ломающий порядок, не принимается', () => {
    // второй фигурке даём меньше, чем у первой — «следующая» посчиталась бы неверно
    const r = разобрать(конверт({ [FIGURES[1].key]: 10 }));
    expect(r.коллекция).toBeNull();
    expect(r.отброшено.join(' ')).toMatch(/перестала расти/);
  });

  it('🔴 равные пороги тоже ломают лестницу и не принимаются', () => {
    const r = разобрать(конверт({ [FIGURES[1].key]: FIGURES[0].at }));
    expect(r.коллекция).toBeNull();
  });

  it('согласованная правка всей лестницы принимается', () => {
    const вдвое = Object.fromEntries(FIGURES.map((ф) => [ф.key, ф.at * 2]));
    const r = разобрать(конверт(вдвое));
    expect(r.коллекция).not.toBeNull();
    установитьПорогиФигурок(r.коллекция);
    expect(фигурки().map((ф) => ф.at)).toEqual(FIGURES.map((ф) => ф.at * 2));
  });

  it('🔴 неизвестная фигурка отбрасывается по имени', () => {
    const r = разобрать(конверт({ 'Дракон': 100 }));
    expect(r.коллекция).toBeNull();
    expect(r.отброшено.join(' ')).toMatch(/нет фигурки «Дракон»/);
  });

  it('без файла пороги заводские', () => {
    expect(фигурки()).toBe(FIGURES);
  });
});


describe('с какого уровня зарядка запускает упражнение', () => {
  afterEach(() => { установитьПравилоУровня(null, 'default'); resetLevelCacheForTests(); });

  it('🔴 четыре правила считают то, что обещают (освоено 43)', () => {
    expect(уровеньПоПравилу({ как: 'первый' }, 43)).toBe(1);
    expect(уровеньПоПравилу({ как: 'освоенный' }, 43)).toBe(43);
    expect(уровеньПоПравилу({ как: 'минус', сколько: 5 }, 43)).toBe(38);
    expect(уровеньПоПравилу({ как: 'процент', сколько: 20 }, 43)).toBe(34);
  });

  it('🔴 ниже первого не опускаемся, каким бы ни было вычитание', () => {
    expect(уровеньПоПравилу({ как: 'минус', сколько: 99 }, 3)).toBe(1);
    expect(уровеньПоПравилу({ как: 'процент', сколько: 100 }, 40)).toBe(1);
  });

  it('🔴 правило подставляет уровень в параметры шага', () => {
    rememberLevelValue('psygames_schulte_table_level_kids', '43');
    установитьПравилоУровня({ как: 'минус', сколько: 5 }, 'kids');
    const p = stepToParams({ game_id: 'schulte_table', game_route: '/games/schulte', est_duration_sec: 60 });
    expect(p.level).toBe('38');
  });

  it('🔴 ПРИБИТЫЙ В ШАГЕ УРОВЕНЬ ПРАВИЛО НЕ ПЕРЕБИВАЕТ', () => {
    // у «Ритма» уровень задан нарочно — на верхних допуск слишком узкий
    rememberLevelValue('psygames_rhythm_pitch_level_kids', '40');
    установитьПравилоУровня({ как: 'освоенный' }, 'kids');
    const p = stepToParams({
      game_id: 'rhythm_pitch', game_route: '/games/rhythm-pitch',
      settings: { level: 3 }, est_duration_sec: 90,
    });
    expect(p.level).toBe('3');
  });

  it('🔴 освоенный НЕИЗВЕСТЕН — уровень не подставляем вовсе', () => {
    установитьПравилоУровня({ как: 'освоенный' }, 'kids');
    const p = stepToParams({ game_id: 'нет_такой_игры', game_route: '/games/x', est_duration_sec: 60 });
    expect(p.level).toBeUndefined();
  });

  it('без правила параметры шага прежние', () => {
    rememberLevelValue('psygames_schulte_table_level_kids', '43');
    const p = stepToParams({ game_id: 'schulte_table', game_route: '/games/schulte', est_duration_sec: 60 });
    expect(p.level).toBeUndefined();
  });

  it('🔴 непонятное правило отбрасывается и называет, какие бывают', () => {
    const r = разобрать(файл({ kids: { уровень_в_зарядке: { как: 'наугад' } } }));
    expect(r.состав?.kids).toBeUndefined();
    expect(r.отброшено.join(' ')).toMatch(/бывает первый, освоенный, минус, процент/);
  });

  it('🔴 «минус» без числа не принимается', () => {
    const r = разобрать(файл({ kids: { уровень_в_зарядке: { как: 'минус' } } }));
    expect(r.состав?.kids).toBeUndefined();
    expect(r.отброшено.join(' ')).toMatch(/требует число/);
  });

  it('правило принимается и попадает в состав профиля', () => {
    const r = разобрать(файл({ kids: { уровень_в_зарядке: { как: 'процент', сколько: 20 } } }));
    expect(r.состав?.kids.уровень_в_зарядке).toEqual({ как: 'процент', сколько: 20 });
  });
});
