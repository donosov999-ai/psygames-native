import { hubScreenFiles } from './_helpers/hubScreens';
/* psygames-games-registry-gate · VER 1 · 26.08.2026 */

/** Развилки — не игры: у них нет ни партии, ни отмены, ни строки задачи. */
const РАЗВИЛКИ = hubScreenFiles();
/**
 * РЕЕСТР ИГР НЕ РАСХОДИТСЯ С СОСТАВОМ ПРИЛОЖЕНИЯ.
 *
 * 🔴 ЗАЧЕМ. Замер 26.08.2026: файлов игр в `app/games/` — 73, описано в
 * `GAMES_REFERENCE.md` — 51. Не описано 22, почти треть набора. При этом в
 * заголовке реестра два с половиной месяца стояло «ОПИСАНИЯ ВСЕХ 48 ИГР» — то
 * есть документ выглядел исчерпывающим и точным, будучи ни тем, ни другим.
 *
 * Цена не в бюрократии. На `/benefits/`, в карточках и в магазинах заявлены
 * «валидированные нейропсихологические парадигмы». Для трети игр в проекте не
 * записано НИ ГДЕ, что именно они реализуют — специалист спросит «по какой
 * методике?», и ответа нет. Ровно эта дыра уже выстрелила с RMET: игра
 * называлась чужим именем, потому что соответствие оригиналу нигде не хранилось.
 *
 * ⚠️ ГЕЙТ СРАВНИВАЕТ ФАЙЛЫ С ДОКУМЕНТОМ, А НЕ ДОКУМЕНТ С САМИМ СОБОЙ. Считать
 * строки в реестре бессмысленно: он и был внутренне согласован — расходился он
 * с кодом.
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const GAMES_DIR = path.join(ROOT, 'frontend', 'app', 'games');
const REF = path.join(ROOT, 'GAMES_REFERENCE.md');

/** Файл экрана → id, как он пишется в коде и в реестре. */
const idOf = (file: string): string => file.replace(/\.tsx$/, '').replace(/-/g, '_');

function describedIds(text: string): Set<string> {
  // id в реестре стоят в обратных кавычках: «Название (`some_id`)» либо в таблице.
  return new Set([...text.matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]));
}

describe('реестр игр покрывает состав приложения', () => {
  const files: string[] = fs.readdirSync(GAMES_DIR).filter((f: string) => f.endsWith('.tsx') && !РАЗВИЛКИ.has(f));
  const ref: string = fs.readFileSync(REF, 'utf8');
  const described = describedIds(ref);

  it('есть что проверять — игры и реестр на месте', () => {
    expect(files.length).toBeGreaterThan(60);
    expect(described.size).toBeGreaterThan(40);
  });

  it('🔴 каждая игра из app/games описана в GAMES_REFERENCE.md', () => {
    /**
     * 🔴 ПСЕВДОНИМЫ — ЯВНЫМ СПИСКОМ, А НЕ СОВПАДЕНИЕМ ПО НАЧАЛУ СТРОКИ.
     * Первая редакция принимала за описанную любую игру, чей id является началом
     * какого-нибудь id из реестра. Мутация это вскрыла: убрал `mahjong` из
     * документа — гейт остался ЗЕЛЁНЫМ, потому что в тексте появился
     * `mahjong_removed`, и он начинается с `mahjong`.
     * Та же поблажка скрывала и настоящую дыру: три судоку-экрана считались
     * описанными, потому что в реестре есть `sudoku`.
     */
    const ALIAS: Record<string, string> = { schulte: 'schulte_table' };
    const missing = files
      .map(idOf)
      .filter((id) => !described.has(id) && !described.has(ALIAS[id] ?? ''));
    expect(missing).toEqual([]);
  });

  it('🔴 заголовок реестра не называет число игр — оно устаревает молча', () => {
    /**
     * Прежний заголовок «ОПИСАНИЯ ВСЕХ 48 ИГР» был верен один день и врал два с
     * половиной месяца. Число в заголовке не сопровождается ничем, что заставило
     * бы его обновить, поэтому его там быть не должно вовсе: состав считается
     * этим гейтом, а не переписывается руками.
     */
    const head = ref.split('\n')[0];
    expect(head).not.toMatch(/\d{2,}/);
  });
});
