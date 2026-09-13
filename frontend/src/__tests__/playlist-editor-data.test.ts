/* psygames-playlist-editor-data · VER 1 · 13.09.2026 */
/**
 * СНИМОК СОСТАВА ДЛЯ РЕДАКТОРА ПЛЕЙЛИСТОВ — И ОДНОВРЕМЕННО СТОРОЖ РЕЕСТРОВ.
 *
 * Редактору (`tools/playlist-editor.html`) нужен текущий состав: игры, разделы,
 * профили, зарядки, хабы. Взять его из `constants/*.ts` обычным скриптом нельзя —
 * это TypeScript с алиасами и импортами React Native, а ни esbuild, ни tsx в
 * зависимостях нет. Ставить новый инструмент ради одного снимка дороже, чем снять
 * его здесь: jest уже умеет и алиасы, и TS.
 *
 * 🔴 ПОЧЕМУ ЭТО ПРОБА, А НЕ РАЗОВЫЙ СКРИПТ. Снимок обязан быть СВЕЖИМ: состав
 * меняется, и редактор, показывающий вчерашний список, разложит галочки по играм,
 * которых уже нет. Проба гоняется в каждом прогоне, а значит и сторожит: если
 * реестр вдруг опустеет (сломанный импорт, съехавший экспорт), она покраснеет
 * ЗДЕСЬ, а не в редакторе, где пустой список выглядит как «инструмент не работает».
 *
 * Куда пишет: `PLAYLIST_EDITOR_OUT`, иначе временная папка. В CI это безвредно —
 * файл ложится во временную папку раннера и никуда не едет.
 */
import { PROFILES, isGameAllowed } from '@/src/constants/profiles';
import { GAMES } from '@/src/constants/games';
import { HUB_CONTENTS } from '@/src/constants/hubContents';
import { БЛОКИ_ГЛАВНОЙ } from '@/src/constants/homeBlocks';
import { SERIES_KEYS, seriesKind } from '@/src/services/warmupEntries';
import { ASSESSMENT_PLAYLIST } from '@/src/services/assessment';
import { PROOF_SERIES_PLAN } from '@/src/games/proofreading/core/blocks';
import { CHESS_SERIES_PLAN } from '@/src/games/chess-blind/core/blocks';
import { SCHULTE_SERIES_PLAN } from '@/src/games/schulte/core/blocks';
import { FEATURE_LADDER } from '@/src/services/featureLadder';
import { FIGURES } from '@/src/services/collection';
import { translateFor } from '@/src/contexts/LanguageContext';
import { КЛЮЧ_ИМЕНИ, КЛЮЧ_ОПИСАНИЯ, ПО_УМОЛЧАНИЮ } from '@/src/games/tatham-bridge/names';
import {
  buildMorningWarmupPlaylist, buildEveningWarmupPlaylist, buildDayPlaylist, buildNightPlaylist,
  buildFixedPlaylist, buildFinancialBatteryPlaylist,
} from '@/src/services/warmup';


/**
 * `require`, а не `import`: node-типов в tsconfig проекта нет, и `import * as fs`
 * роняет `tsc`. Соседние пробы, которым нужен диск (pet-anchors, alert-visible,
 * abilities-economy), читают файлы ровно так же — приём не выдуман здесь.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { writeFileSync, existsSync, readFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Обложка отдаётся встраиваемой строкой: страница редактора открывается с диска,
 * и относительная ссылка на файл ассетов из другой папки там не прочитается.
 * Нет обложки — пусто, редактор покажет карточку без картинки, а не битую ссылку.
 */
function обложкаФайлом(id: string): string {
  try {
    /* `process.cwd()` — корень фронтенда, откуда jest и запускается; `__dirname`
       в этой сборке типов не объявлен, а тащить node-типы ради одной строки дороже. */
    const путь = join(process.cwd(), 'assets', 'images', 'gamethumbs', `${id}.webp`);
    if (!existsSync(путь)) return '';
    return `data:image/webp;base64,${readFileSync(путь).toString('base64')}`;
  } catch { return ''; }
}

/** Что человек получит сегодня — с учётом профиля, дня недели и отбора игр. */
function фактическийСостав(p: (typeof PROFILES)[number]) {
  const wd = new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const можно = (g: string) => isGameAllowed(p, g);
  const шаги = (m: { steps: { game_id: string; est_duration_sec: number }[] }) =>
    m.steps.map((ш) => ({ game_id: ш.game_id, est_duration_sec: ш.est_duration_sec }));
  /**
   * 🔴 УТРО СЧИТАЕТСЯ НА ВСЕ ТРИ ДЛИТЕЛЬНОСТИ, А НЕ НА ОДНУ.
   *
   * Первая редакция брала 15 минут — и показывала десять упражнений там, где Денис
   * видит в приложении три: «утром на 3 минуты всего было, это другой список».
   * Он прав: длительность выбирается на экране зарядки (5 / 10 / 15), и ПО УМОЛЧАНИЮ
   * там 5 (`useState<5|10|15>(5)` в `app/warmup-picker.tsx`). Один набор из трёх,
   * показанный как «фактический», — это не факт, а произвольно выбранный случай.
   */
  try {
    const утроНа = (d: 5 | 10 | 15) => шаги(p.morning_playlist?.length
      ? buildFixedPlaylist(p.morning_playlist, 'morning', wd, можно)
      : buildMorningWarmupPlaylist({ duration: d, weekday: wd, profilePlaylists: p.custom_playlists, allow: можно }));
    const вечер = buildEveningWarmupPlaylist({ weekday: wd, profileEvening: p.evening_playlist, allow: можно });
    /**
     * 🔴 СЕТКА: СЕМЬ ДНЕЙ × ЧЕТЫРЕ СЛОТА × ТРИ ДЛИНЫ = 84 КЛЕТКИ НА ПРОФИЛЬ.
     *
     * Денис 13.09.2026: «90 наборов — по 7 на профиль… а должно быть в 3 умножить
     * на 4 = в 12 раз больше, ибо 5 минут, 10 минут и 15 минут». Раньше снимок
     * знал только сегодняшний день и только утро в трёх длинах — в редакторе это
     * значило, что одиннадцать клеток из двенадцати нечем было показать, и они
     * выглядели пустыми, хотя приложение в них что-то выдаёт.
     */
    const сетка: Record<number, Record<string, Record<number, { game_id: string; est_duration_sec: number }[]>>> = {};
    for (let д = 0; д < 7; д++) {
      const день = д as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const поСлотам: Record<string, Record<number, { game_id: string; est_duration_sec: number }[]>> = {};
      for (const длина of [5, 10, 15] as const) {
        const у = шаги(p.morning_playlist?.length
          ? buildFixedPlaylist(p.morning_playlist, 'morning', день, можно)
          : buildMorningWarmupPlaylist({ duration: длина, weekday: день, profilePlaylists: p.custom_playlists, allow: можно }));
        ((поСлотам.утро ||= {}))[длина] = у;
        ((поСлотам.день ||= {}))[длина] = шаги(buildDayPlaylist(день, можно, длина));
        ((поСлотам.вечер ||= {}))[длина] = шаги(buildEveningWarmupPlaylist({
          weekday: день, profileEvening: p.evening_playlist, allow: можно, duration: длина,
          excludeGameIds: у.map((ш) => ш.game_id),
        }));
        ((поСлотам.ночь ||= {}))[длина] = шаги(buildNightPlaylist(день, длина));
      }
      сетка[д] = поСлотам;
    }
    return {
      утро5: утроНа(5), утро10: утроНа(10), утро15: утроНа(15),
      утро: утроНа(5),                      // что человек получит по умолчанию
      день: шаги(buildDayPlaylist(wd, можно)),
      вечер: шаги(вечер), ночь: шаги(buildNightPlaylist(wd)),
      сетка,
    };
  } catch {
    return null;
  }
}

const КУДА: string = process.env.PLAYLIST_EDITOR_OUT || join(tmpdir(), 'playlist-editor-data.json');

describe('снимок состава для редактора плейлистов', () => {
  const снимок = {
    app: 'PsyGames-Playlists-Data',
    format: 1,
    снято: new Date().toISOString(),
    /**
     * 🔴 КАРТОЧКА ИГРЫ ДЛЯ ПРЕДПРОСМОТРА В РЕДАКТОРЕ.
     *
     * Просьба Дениса 13.09.2026: «надо превьюху, когда кликаешь на строчку, чтобы
     * нативнее было понимать, какую игру включаешь». Поэтому кроме id и маршрута
     * снимаем ИМЯ и ОПИСАНИЕ человеческими словами (из словаря, русскими) и
     * обложку — её редактор встроит картинкой.
     *
     * ⚠️ Настоящих снимков экрана на 95 игр в проекте нет: в `store/` лежат 11
     * витринных для магазина. Врать «скрин игры», подсовывая пиктограмму, нельзя —
     * поэтому поле честно называется `обложка`, а снимки экранов, если понадобятся,
     * снимаются отдельным прогоном по стенду.
     */
    игры: GAMES.map((g) => {
      const nameKey = (g as unknown as { nameKey?: string }).nameKey ?? g.id;
      const descKey = (g as unknown as { descKey?: string }).descKey ?? '';
      const имя = translateFor('ru', nameKey);
      const описание = descKey ? translateFor('ru', descKey) : '';
      return {
        id: g.id,
        route: g.route,
        раздел: (g as unknown as { category?: string }).category ?? '—',
        имяКлюч: nameKey,
        имя: имя === nameKey ? g.id : имя,
        описание: описание === descKey ? '' : описание,
        навык: translateFor('ru', (g as unknown as { skillKey?: string }).skillKey ?? ''),
        обложка: обложкаФайлом(g.id),
        /**
         * 🔴 ОТКРЫТА ВСЕМ НЕЗАВИСИМО ОТ СПИСКА ПРОФИЛЯ (`ALWAYS_ALLOWED`).
         *
         * Замечено Денисом 13.09.2026: в редакторе «recovery — 0 из 2», дыхание и
         * «Пауза» стоят без галочек — хотя в приложении открыты у всех тринадцати.
         * Редактор рисовал галочку по `allowed_games` профиля и про этот список
         * не знал. Хуже того, снять её было НЕЛЬЗЯ: `isGameAllowed` отвечает «да»
         * до всякой проверки профиля. То есть переключатель показывал ложь и ничего
         * не переключал.
         */
        всегда: isGameAllowed({ id: '__нет__', allowed_games: [] } as unknown as (typeof PROFILES)[number], g.id),
      };
    }),
    /**
     * 🔴 ГОЛОВОЛОМКИ ТЭТХЭМА — ОТДЕЛЬНЫМИ СТРОКАМИ, А НЕ ОДНИМ `puzzles`.
     *
     * Денис 13.09.2026: «в зарядке или в серии ты просто включал Пазлы, а что из
     * пазла идёт в серию — вообще непонятно; надо, чтобы они были видны
     * самостоятельно, как другие игры».
     *
     * Он прав, и замер объясняет, почему так вышло: движков сорок два, у каждого
     * свой генератор, правила и лестница уровней (`puzzles_<режим>`), — но в
     * каталоге игр это ОДНА карточка `puzzles`, а режим едет параметром. Шаг с
     * `game_id: 'puzzles'` в редакторе выглядел одинаково для «Труб» и «Сапёра».
     *
     * Поэтому здесь заводится ВИРТУАЛЬНЫЙ id вида `puzzles:Net`. Он живёт только
     * в редакторе: при записи в файл распадается на `game_id: 'puzzles'` и
     * `mode: 'Net'` — то, что приложение и так понимает. Ничего нового в
     * приложение не добавляется, добавляется только различимость в списке.
     */
    тэтхэма: Object.keys(КЛЮЧ_ИМЕНИ).map((режим) => {
      const имя = translateFor('ru', КЛЮЧ_ИМЕНИ[режим]);
      const опис = translateFor('ru', КЛЮЧ_ОПИСАНИЯ[режим]);
      return {
        id: `puzzles:${режим}`,
        реальный: 'puzzles',
        режим,
        route: режим === ПО_УМОЛЧАНИЮ ? '/games/puzzles' : `/games/puzzles?mode=${encodeURIComponent(режим)}`,
        раздел: 'logic',
        имя: имя === КЛЮЧ_ИМЕНИ[режим] ? режим : имя,
        /* Словарные ключи — чтобы редактор мог описать карточку файлом, а подпись
           осталась на двенадцати языках, а не на одном. */
        имяКлюч: КЛЮЧ_ИМЕНИ[режим],
        описаниеКлюч: КЛЮЧ_ОПИСАНИЯ[режим],
        описание: опис === КЛЮЧ_ОПИСАНИЯ[режим] ? '' : опис,
        навык: 'Тэтхэма',
        обложка: обложкаФайлом('puzzles'),
        всегда: true,
      };
    }),
    профили: PROFILES.map((p) => ({
      id: p.id,
      имя: p.display_name,
      витрина: p.id === 'whatsnew',
      игры: p.allowed_games,
      зарядка_включена: p.warmup_enabled,
      /**
       * 🔴 «НЕ ВИЖУ, ЧТО ВХОДИТ СЕЙЧАС» — вопрос Дениса 13.09.2026, глядя на профиль
       * ODV999 с нулями во всех слотах. Нули были правдой: своих наборов у него нет,
       * зарядка собирается автоматически по дню недели и истории. Но «своего набора
       * нет» и «ничего не входит» — разные вещи, а редактор показывал только первое.
       *
       * Поэтому рядом со своим набором кладём ФАКТИЧЕСКИЙ — тот, что человек получит
       * сегодня. Его видно серым, и его можно взять как основу и править.
       *
       * ⚠️ Считается на СЕГОДНЯШНИЙ день недели: недельная ротация — часть механики,
       * и «фактический набор» без дня недели был бы неправдой. День назван в снимке.
       */
      утро: p.morning_playlist ?? null,
      вечер: p.evening_playlist ?? null,
      по_дням: p.custom_playlists ?? null,
      сейчас: фактическийСостав(p),
    })),
    деньНедели: new Date().getDay(),
    блокиГлавной: БЛОКИ_ГЛАВНОЙ.map((б) => ({ id: б.id, подпись: б.подпись })),
    /**
     * 🔴 СЕРИИ. Решение Дениса 13.09.2026 — тащить их в редактор, риск назван и принят.
     * Две породы: серия-ПЛЕЙЛИСТ (цепочка разных игр) и серия БЛОКОВ (одна игра, три
     * правила на одном поле). У первой правится список упражнений, у второй — только
     * порядок и присутствие блоков: придумать новый блок нельзя, он живёт в коде игры.
     */
    серии: SERIES_KEYS.map((k) => ({
      id: k,
      вид: seriesKind(k),
      подпись: ({
        assessment: 'Оценка профиля',
        financial: 'FIN BRAIN — финансовая батарея',
        'schulte-blocks': 'Шульте блоками — внимание',
        'proofreading-blocks': 'Корректурка блоками — фокус',
        'chess-blocks': 'Доска в уме блоками',
      } as Record<string, string>)[k] ?? k,
      шаги: k === 'assessment'
        ? ASSESSMENT_PLAYLIST.map((ш) => ({ game_id: ш.game_id, est_duration_sec: ш.est_duration_sec }))
        : k === 'financial'
        ? buildFinancialBatteryPlaylist().steps.map((ш) => ({ game_id: ш.game_id, est_duration_sec: ш.est_duration_sec }))
        : [],
      /**
       * Что меряет каждый блок — словами из шапок `core/blocks.ts` тех же игр.
       * Без этого в редакторе стоят голые ключи `square/knight/recall`, и решение
       * «убрать блок» принимается вслепую. Разности здесь не украшение: серия
       * меряет ЦЕНУ правила, и выкинутый блок убирает не задание, а измерение.
       */
      чтоМеряют: ({
        'schulte-blocks': {
          order: 'найти 1…N² по порядку → T₁ скорость поиска',
          alternate: 'то же поле, чередуя два ряда → T₂ − T₁ цена переключения',
          sum: 'то же поле, пара с суммой S → T₃ − T₁ цена удержания в уме',
        },
        'proofreading-blocks': {
          sign: 'отметить клетки с заданными знаками → T₁ зрительный поиск',
          word: 'ТО ЖЕ поле, собрать все слова → T₂ − T₁ цена сегментации',
          sense: 'ТО ЖЕ поле, только слова одной категории → T₃ − T₂ цена смысла',
        },
        'chess-blocks': {
          square: 'одного ли цвета два поля → T₁ координатная работа',
          knight: 'дойдёт ли конь с A на B за N ходов → T₂ − T₁ цена правила хода',
          recall: 'позицию убрали: что стоит на поле X → T₃ − T₁ цена удержания',
        },
      } as Record<string, Record<string, string>>)[k] ?? {},
      порядокЧастьЗамера: k === 'chess-blocks' || k === 'proofreading-blocks' || k === 'schulte-blocks',
      блоки: k === 'proofreading-blocks' ? [...PROOF_SERIES_PLAN]
           : k === 'chess-blocks' ? [...CHESS_SERIES_PLAN]
           : k === 'schulte-blocks' ? [...SCHULTE_SERIES_PLAN]
           : [],
    })),
    замки: FEATURE_LADDER.map((з) => ({ key: з.key, level: з.level })),
    фигурки: FIGURES.map((ф) => ({ key: ф.key, at: ф.at, face: ф.face })),
    хабы: Object.fromEntries(
      Object.entries(HUB_CONTENTS).map(([маршрут, карточки]) => [
        маршрут,
        карточки.map((c) => ({ route: c.route, имяКлюч: c.nameKey })),
      ]),
    ),
  };

  it('🔴 реестр игр не пуст — иначе редактор покажет пустую таблицу', () => {
    expect(снимок.игры.length).toBeGreaterThanOrEqual(90);
  });

  it('🔴 профилей не меньше двенадцати — столько их на 13.09.2026 (плюс витрина)', () => {
    expect(снимок.профили.length).toBeGreaterThanOrEqual(12);
  });

  it('у каждой игры есть id и маршрут — по ним редактор ставит галочки', () => {
    const битые = снимок.игры.filter((g) => !g.id || !g.route);
    expect(битые).toEqual([]);
  });

  it('блоки главной названы — редактор ставит галочки по именам', () => {
    expect(снимок.блокиГлавной.length).toBeGreaterThanOrEqual(5);
    expect(снимок.блокиГлавной.every((б) => б.id && б.подпись)).toBe(true);
  });

  it('🔴 у игр есть человеческие имя и описание — иначе предпросмотр бесполезен', () => {
    const безИмени = снимок.игры.filter((г) => !г.имя).map((г) => г.id);
    expect(безИмени).toEqual([]);
    // описание есть не у всех — считаем и сторожим, чтобы доля не падала молча
    const сОписанием = снимок.игры.filter((г) => г.описание).length;
    expect(сОписанием).toBeGreaterThanOrEqual(Math.floor(снимок.игры.length * 0.8));
  });

  it('обложки нашлись у большинства игр', () => {
    const сОбложкой = снимок.игры.filter((г) => г.обложка).length;
    expect(сОбложкой).toBeGreaterThanOrEqual(60);
  });

  it('🔴 видно, что входит СЕЙЧАС — даже когда своего набора у профиля нет', () => {
    const без = снимок.профили.filter((п) => !п.утро && !п.вечер);
    expect(без.length).toBeGreaterThan(0);            // такие профили есть — например владелец
    const пустые = без.filter((п) => !п.сейчас || п.сейчас.утро.length === 0);
    expect(пустые.map((п) => п.id)).toEqual([]);      // и у каждого фактический набор не пуст
  });

  it('🔴 серии попали в снимок: две плейлистом, три блоками', () => {
    expect(снимок.серии.length).toBe(5);
    const плейлисты = снимок.серии.filter((с) => с.вид === 'playlist');
    const блоки = снимок.серии.filter((с) => с.вид === 'blocks');
    expect(плейлисты.length).toBe(2);
    expect(блоки.length).toBe(3);
    expect(плейлисты.every((с) => с.шаги.length > 0)).toBe(true);
    expect(блоки.every((с) => с.блоки.length > 0)).toBe(true);
  });

  it('баланс попал в снимок — замки и фигурки редактируются в редакторе', () => {
    expect(снимок.замки.length).toBeGreaterThanOrEqual(4);
    expect(снимок.фигурки.length).toBeGreaterThanOrEqual(12);
  });

  it('развилки не пусты — иначе фасовать нечего', () => {
    const пустые = Object.entries(снимок.хабы).filter(([, к]) => к.length === 0).map(([м]) => м);
    expect(пустые).toEqual([]);
  });

  it('снимок записан — редактор собирается из этого файла', () => {
    writeFileSync(КУДА, JSON.stringify(снимок, null, 2), 'utf8');
    expect(existsSync(КУДА)).toBe(true);
  });
});
