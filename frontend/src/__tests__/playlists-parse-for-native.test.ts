/**
 * Мост разбора файла состава для нативных настроек (задача eae0879c): натив зовёт
 * `window.__psyPlaylistsParse(текст)` и сохраняет `saved` ключом `psygames_playlists_override`.
 * Ответ обязан совпадать с тем, что сохранил бы веб-экран (`сохранить` после `разобрать`).
 */
import { разобрать, разобратьДляНатива, заводскойСостав } from '@/src/services/playlistOverride';

declare function require(id: string): any;

describe('разбор состава для натива', () => {
  it('висит на globalThis — натив зовёт его из страницы', () => {
    expect((globalThis as any).__psyPlaylistsParse).toBe(разобратьДляНатива);
  });

  it('готовый к сохранению состав — тот же, что сохранил бы веб', () => {
    expect(заводскойСостав()).not.toBeNull();
    // Заводской файл из сборки — настоящий файл состава, тот же вид, что грузит владелец.
    const текст = JSON.stringify(require('@/src/constants/defaultPlaylists.json'));
    const веб = разобрать(текст);
    const натив = разобратьДляНатива(текст);
    expect(натив.ok).toBe(!!веб.состав);
    if (веб.состав) {
      expect(JSON.parse(натив.saved!)).toEqual({
        профили: веб.состав, наборы: веб.наборы, порядок: веб.порядок, хабы: веб.хабы, замки: веб.замки, коллекция: веб.коллекция,
      });
      expect(натив.n).toBe(веб.профилейПринято);
    }
  });

  it('не файл состава — ok: false с причиной', () => {
    const r = разобратьДляНатива('{"app":"Другое"}');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
