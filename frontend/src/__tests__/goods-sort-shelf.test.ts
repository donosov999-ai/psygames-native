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
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const ROOT = join(__dirname, '../..');
const game = readFileSync(join(ROOT, 'app/games/goods-sort.tsx'), 'utf8') as string;
const profiles = readFileSync(join(ROOT, 'src/constants/profiles.ts'), 'utf8') as string;

const styles = [...game.matchAll(/^  (\w+):\s+require\('\.\.\/\.\.\/assets\/images\/shelves\/niche-([a-z]+)\.webp'\)/gm)]
  .map((m) => ({ key: m[1], file: m[2] }));
const mapping = Object.fromEntries(
  [...(game.slice(game.indexOf('SHELF_BY_PROFILE'), game.indexOf('const CAP')).matchAll(/(\w+): '(\w+)'/g))]
    .map((m) => [m[1], m[2]]),
);
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
    const bad = Object.entries(mapping).filter(([, v]) => !known.has(v)).map(([k, v]) => `${k} → ${v}`);
    expect(bad).toEqual([]);
  });

  /** Щель с фоном экрана между досками = шкаф снова таблица. */
  it('зазоров между нишами нет — доски приходят из картинки', () => {
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
    expect(block('cabinet')).toMatch(/gap:\s*0\b/);
    const row = game.slice(game.indexOf('  shelfRow: {'), game.indexOf('  shelfRow: {') + 120);
    expect(row).toMatch(/gap:\s*0\b/);
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
});
