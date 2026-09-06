/**
 * ШКАФ: У КАЖДОГО ПРОФИЛЯ ЕСТЬ СТИЛЬ, И ФАЙЛ ЕГО СУЩЕСТВУЕТ.
 *
 * ЗАЧЕМ. Денис 19.08.2026 про прежний CSS-шкаф: «3д не ощущается, что там
 * глубина — просто закрашенная таблица». У вёрстки здесь потолок: градиентом
 * изображается углубление, но не текстура дерева, не боковые стенки и не свет.
 * Шкаф стал картинкой — девять стилей, привязанных к профилям.
 *
 * ⚠️ ПЛИТКА, А НЕ ЦЕЛЫЙ ШКАФ. Доска переменного размера (3×4 … 3×6) и с
 * дырками (формы уровня) — под неё целую картинку не подрежешь. Плитка
 * вырезана из середины шкафа и несёт полурейки по краям: состыкованные, они
 * дают целые доски. Отсюда жёсткое требование ниже — ЗАЗОРОВ БЫТЬ НЕ ДОЛЖНО.
 * Появится gap — между досками возникнет щель с фоном экрана, и шкаф снова
 * станет таблицей.
 */
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { SHELF_BY_PROFILE, SHELF_STYLES, shelfForProfile } from '@/src/games/goods-sort/core/level';
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const ROOT = join(__dirname, '../..');
const game = readFileSync(join(ROOT, 'app/games/goods-sort.tsx'), 'utf8') as string;
const profiles = readFileSync(join(ROOT, 'src/constants/profiles.ts'), 'utf8') as string;

const styles = [...game.matchAll(/^  (\w+):\s+require\('\.\.\/\.\.\/assets\/images\/shelves\/niche-([a-z]+)\.webp'\)/gm)]
  .map((m) => ({ key: m[1], file: m[2] }));
/*
 * 🔴 ПРИВЯЗКА «ПРОФИЛЬ → СТИЛЬ» БЕРЁТСЯ ИЗ ИГРЫ, А НЕ ВЫРЕЗАЕТСЯ ИЗ ЕЁ ТЕКСТА.
 *
 * Здесь стоял срез исходника «от `SHELF_BY_PROFILE` до `const CAP`» с разбором
 * пар `слово: 'слово'`. 06.09.2026 `CAP` уехал в лист `core/level`, конец среза
 * не нашёлся, `indexOf` вернул −1 — и срез растянулся ДО КОНЦА ФАЙЛА. Гейт стал
 * считать назначениями стиля `kind: 'locked'`, `icon: 'flag'`, `tone: 'warn'` и
 * `game_type: 'goods_sort'`: восемнадцать выдуманных строк вместо тринадцати
 * настоящих. Показательно, ЧЕМ это кончилось — не молчанием, а уверенным
 * обвинением игры в том, чего в ней нет.
 */
const mapping: Record<string, string> = SHELF_BY_PROFILE;
const profileIds = [...profiles.matchAll(/^  id: '([a-z0-9_]+)'/gm)].map((m) => m[1]);

describe('шкаф картинкой', () => {
  it('стили объявлены и файлы на месте', () => {
    expect(styles.length).toBeGreaterThanOrEqual(9);
    const missing = styles.filter((s) => !existsSync(join(ROOT, `assets/images/shelves/niche-${s.file}.webp`)));
    expect(missing.map((s) => s.file)).toEqual([]);
  });

  it('у каждого профиля есть свой стиль шкафа', () => {
    expect(profileIds.length).toBeGreaterThanOrEqual(10);
    const without = profileIds.filter((id) => !mapping[id]);
    expect(without).toEqual([]);
  });

  it('назначенные стили существуют среди объявленных', () => {
    const known = new Set(styles.map((s) => s.key));
    // Есть что проверять: назначений столько же, сколько записей в таблице игры.
    expect(Object.keys(mapping).length).toBeGreaterThanOrEqual(10);
    const bad = Object.entries(mapping).filter(([, v]) => !known.has(v)).map(([k, v]) => `${k} → ${v}`);
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 СПИСОК СТИЛЕЙ И НАБОР КАРТИНОК — ОДНО И ТО ЖЕ, И ЭТО ПРОВЕРЯЕТСЯ ОБЕИМИ
   * СТОРОНАМИ. Список живёт в листе (данные), плитки — в экране (`require`
   * ассетов). Разъедутся — у стиля не окажется картинки либо картинка повиснет
   * мёртвым весом, и ни то ни другое не видно на глаз.
   */
  it('список стилей и набор плиток совпадают в обе стороны', () => {
    const плитки = new Set(styles.map((s) => s.key));
    const список = new Set<string>(SHELF_STYLES);
    expect([...список].filter((k) => !плитки.has(k))).toEqual([]);
    expect([...плитки].filter((k) => !список.has(k))).toEqual([]);
  });

  /**
   * Дверь одна: и экран, и гейт спрашивают `shelfForProfile`. Проверяется
   * ответом — в том числе на профиль, которого в таблице нет.
   */
  it('незнакомый профиль получает берёзу, а не пустоту', () => {
    expect(shelfForProfile('такого-профиля-нет')).toBe('birch');
    expect(shelfForProfile(undefined)).toBe('birch');
    expect(shelfForProfile('kids')).toBe('mint');
    // И ответ всегда из списка — на КАЖДОМ живом профиле.
    const чужие = profileIds.filter((id) => !SHELF_STYLES.includes(shelfForProfile(id)));
    expect(чужие).toEqual([]);
  });

  /**
   * ⚠️ ТРЕБОВАНИЕ ПЕРЕВЁРНУТО 19.08.2026. Сначала зазор был запрещён: плитка
   * резалась «от центра доски до центра доски», и половинки должны были
   * состыковаться. На деле рядом оказывались половины РАЗНЫХ досок, с разным
   * светом и белыми табличками — Денис увидел «две доски и расстояние».
   * Теперь наоборот: картинка даёт только нутро ниши, а доска — это зазор,
   * залитый деревом рамы. Одна доска на стык по построению.
   */
  it('зазор между нишами есть и залит деревом — это и есть доска', () => {
    /**
     * ⚠️ Срез берём ДО следующего стиля, а не «до cell»: shelfRow объявлен между
     * cabinet и cell, и первая версия проверки находила его нулевой зазор,
     * пока в cabinet стоял ненулевой. Мутация «вернули gap: 8» её не уронила —
     * ровно тот случай, когда гейт зелен и бесполезен.
     */
    const block = (name: string): string => {
      const at = game.indexOf(`  ${name}: {`);
      expect(at).toBeGreaterThan(0);
      return game.slice(at, game.indexOf('\n  },', at));
    };
    const cab = block('cabinet');
    const gap = Number((cab.match(/gap:\s*(\d+)/) || [])[1]);
    expect(gap).toBeGreaterThanOrEqual(6);        // тоньше — доска не читается
    expect(cab).toMatch(/backgroundColor: '#[0-9a-f]{6}'/i);   // дерево, а не фон экрана
    const row = game.slice(game.indexOf('  shelfRow: {'), game.indexOf('  shelfRow: {') + 140);
    expect(Number((row.match(/gap:\s*(\d+)/) || [])[1])).toBe(gap);   // по обеим осям одинаково
  });

  /** Первый кадр не должен быть дырами цветом экрана на месте ниш. */
  it('у ниши есть запасной цвет на время загрузки картинки', () => {
    const cell = game.slice(game.indexOf('  cell: {'), game.indexOf('  cell: {') + 500);
    expect(cell).toMatch(/backgroundColor: '#[0-9a-f]{6}'/i);
  });

  /** stretch, а не cover: иначе полурейки съедутся и стык развалится. */
  it('плитка растягивается, а не обрезается', () => {
    expect(game).toMatch(/resizeMode="stretch"/);
  });

  /**
   * 🔴 ВЫРЕЗАННАЯ НИША — ДОСКА, А НЕ ДЫРКА. С третьего уровня форма вырезает
   * ниши (крест, рамка, лесенка, катушка). Раньше на их месте стояла прозрачная
   * распорка, и сквозь неё светил фон короба — пустые бежевые пятна. Отзыв
   * Дениса дословно: «шкаф старый с дырами», «хули с ним случилось».
   *
   * Проверяем СМЫСЛ: у места выреза обязана быть заливка. Пустая распорка
   * вернётся — покраснеет.
   */
  it('🔴 на месте вырезанной ниши сплошная доска, а не пустота', () => {
    const src = game.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // ⚠️ Цепляемся за РИСОВАНИЕ выреза, а не за `if (!mask[pos])`: такая
    // проверка встречается в файле трижды (пропуск в цикле, ранний возврат,
    // отрисовка), и `indexOf` находил первую — проверка краснела на исправном
    // коде. Окно, а не «до закрывающей скобки»: первая `}` приходит из
    // `${pos}` внутри шаблонной строки.
    const at = src.indexOf('`gap-${pos}`');
    const gap = at === -1 ? '' : src.slice(Math.max(0, at - 200), at + 200);
    expect(`ветка выреза найдена: ${gap.length > 0}`).toBe('ветка выреза найдена: true');
    expect(`заливка у выреза: ${/styles\.plank/.test(gap)}`).toBe('заливка у выреза: true');
    /**
     * ⚠️ ЗАЛИВКА — ЭТО ЛЮБОЙ НЕПРОЗРАЧНЫЙ ФОН, А НЕ СЛОВО `backgroundColor`.
     *
     * Здесь требовался именно `backgroundColor: '#…'` в стиле `plank`. 02.09.2026
     * доску переделали на градиент (`LinearGradient` с двумя остановками) — она
     * стала выглядеть ЛУЧШЕ, ровно ради чего гейт и стоит, — а гейт покраснел,
     * потому что искал слово. Тот самый случай, когда проверка держится за букву
     * записи вместо смысла.
     *
     * Смысл: на месте выреза что-то ЗАЛИТО. Годится и плоский цвет в стиле, и
     * градиент прямо в ветке отрисовки. Пустая распорка не даст ни того, ни другого.
     */
    const plank = /plank:\s*\{[\s\S]*?\}/.exec(src)?.[0] ?? '';
    const плоский = /backgroundColor:\s*'#/.test(plank);
    const градиент = /<LinearGradient[\s\S]{0,200}colors=\{\[/.test(gap);
    expect(`доска залита: ${плоский || градиент}`).toBe('доска залита: true');
  });
});
