/**
 * Регрессии, найденные при полном ручном прогоне вечерней зарядки 10.08.2026.
 * Проверки намеренно держат web-разметку и повтор слота явными: оба дефекта
 * проявлялись только в живом переходе между играми и легко возвращаются.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

describe('вечерняя зарядка — web UI', () => {
  it('Goods Sort не вкладывает кнопки товаров в кнопку полки', () => {
    const source = read('app/games/goods-sort.tsx');
    const cell = source.slice(source.indexOf('const renderCell'), source.indexOf('const renderConfig'));

    /**
     * ⚠️ СТЕРЕЖЁМ СМЫСЛ, А НЕ ИМЯ ТЕГА. Первая версия требовала дословно
     * `<View key={i}` и покраснела 19.08, когда обёртка ячейки стала
     * LinearGradient ради глубины ниши — при том, что вложенных кнопок как не
     * было, так и нет. Проверка должна ловить кнопку внутри кнопки, а не
     * запрещать менять оформление.
     */
    expect(cell).toContain('style={styles.cellDropTarget}');
    expect(cell).not.toContain('<TouchableOpacity key={i}');
    expect(cell).not.toMatch(/<TouchableOpacity[^>]*\bkey=\{i\}/);
  });

  it('AGAIN повторяет вечерний слот, а не запускает утренний', () => {
    const source = read('app/warmup-complete.tsx');

    expect(source).toContain("if (meta.slot === 'evening') warmup.startEvening();");
    expect(source).toContain("else if (meta.slot === 'day') warmup.startDay();");
    expect(source).toContain("else if (meta.slot === 'night') warmup.startNight();");
  });

  it('итог не выводит сохранённые русские meta-подписи напрямую', () => {
    const source = read('app/warmup-complete.tsx');

    expect(source).toContain('new Intl.DateTimeFormat(language');
    expect(source).toContain("meta?.slot === 'evening' ? t('slotEvening')");
    expect(source).not.toContain('{meta.weekday_name} · {meta.track_label}');
  });
});
