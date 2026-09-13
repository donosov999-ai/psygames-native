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
import { PROFILES } from '@/src/constants/profiles';
import { GAMES } from '@/src/constants/games';
import { HUB_CONTENTS } from '@/src/constants/hubContents';
import { БЛОКИ_ГЛАВНОЙ } from '@/src/constants/homeBlocks';

/**
 * `require`, а не `import`: node-типов в tsconfig проекта нет, и `import * as fs`
 * роняет `tsc`. Соседние пробы, которым нужен диск (pet-anchors, alert-visible,
 * abilities-economy), читают файлы ровно так же — приём не выдуман здесь.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { writeFileSync, existsSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const КУДА: string = process.env.PLAYLIST_EDITOR_OUT || join(tmpdir(), 'playlist-editor-data.json');

describe('снимок состава для редактора плейлистов', () => {
  const снимок = {
    app: 'PsyGames-Playlists-Data',
    format: 1,
    снято: new Date().toISOString(),
    игры: GAMES.map((g) => ({
      id: g.id,
      route: g.route,
      раздел: (g as unknown as { category?: string }).category ?? '—',
      имяКлюч: (g as unknown as { nameKey?: string }).nameKey ?? g.id,
    })),
    профили: PROFILES.map((p) => ({
      id: p.id,
      имя: p.display_name,
      витрина: p.id === 'whatsnew',
      игры: p.allowed_games,
      зарядка_включена: p.warmup_enabled,
      утро: p.morning_playlist ?? null,
      вечер: p.evening_playlist ?? null,
      по_дням: p.custom_playlists ?? null,
    })),
    блокиГлавной: БЛОКИ_ГЛАВНОЙ.map((б) => ({ id: б.id, подпись: б.подпись })),
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

  it('развилки не пусты — иначе фасовать нечего', () => {
    const пустые = Object.entries(снимок.хабы).filter(([, к]) => к.length === 0).map(([м]) => м);
    expect(пустые).toEqual([]);
  });

  it('снимок записан — редактор собирается из этого файла', () => {
    writeFileSync(КУДА, JSON.stringify(снимок, null, 2), 'utf8');
    expect(existsSync(КУДА)).toBe(true);
  });
});
