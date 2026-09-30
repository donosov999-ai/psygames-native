/**
 * 🔴 ИГРА ТОЛЬКО С НАТИВНЫМ ЭКРАНОМ — НЕ ДЫРА В СОСТАВЕ.
 *
 * 30.09.2026 в «Сортировки» пришли первые игры, написанные сразу на Flutter:
 * «Очередь зверей» и «Цвета и формы». В веб-реестре `GAMES` их нет, и разбор
 * состава отбрасывал их карточки как «нет экрана». Список `NATIVE_ONLY_ROUTES`
 * разрешает их разбору — а эта проба не даёт списку соврать: адрес обязан быть
 * перехвачен нативной картой, иначе карточка снова ведёт в пустоту.
 */
import { GAMES } from '@/src/constants/games';
import { NATIVE_ONLY_ROUTES } from '@/src/constants/nativeOnlyGames';
import { разобрать as parsePlaylists } from '@/src/services/playlistOverride';

/* `require`, а не `import`: node-типов в tsconfig проекта нет (приём соседней
   пробы playlist-editor-data). */
/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require('fs');
const { join } = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */
declare const __dirname: string;

const NATIVE_MAP_FILE = join(__dirname, '../../../flutter/lib/shell/hybrid_app.dart');
const PLAYLISTS_FILE = join(__dirname, '../constants/defaultPlaylists.json');

describe('игры только с нативным экраном', () => {
  it('🔴 каждый адрес перехвачен нативной картой', () => {
    const mapSource = readFileSync(NATIVE_MAP_FILE, 'utf8');
    expect(NATIVE_ONLY_ROUTES.length).toBeGreaterThan(0);
    expect(NATIVE_ONLY_ROUTES.filter((r) => !mapSource.includes(`'${r}':`))).toEqual([]);
  });

  it('в веб-реестре их нет — иначе это дубль, а не нативная игра', () => {
    const webRoutes = new Set(GAMES.map((g) => g.route));
    expect(NATIVE_ONLY_ROUTES.filter((r) => webRoutes.has(r))).toEqual([]);
  });

  it('🔴 заводской состав держит их карточки, и разбор их не отбрасывает', () => {
    const fileText = readFileSync(PLAYLISTS_FILE, 'utf8');
    expect(NATIVE_ONLY_ROUTES.filter((r) => !fileText.includes(`"маршрут":"${r}"`))).toEqual([]);
    const parsed = parsePlaylists(fileText);
    expect(parsed.отброшено.filter((line) => NATIVE_ONLY_ROUTES.some((r) => line.includes(r)))).toEqual([]);
  });
});
