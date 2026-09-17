/**
 * Регрессии, найденные при полном ручном прогоне вечерней зарядки 10.08.2026.
 * Проверки намеренно держат web-разметку и повтор слота явными: оба дефекта
 * проявлялись только в живом переходе между играми и легко возвращаются.
 */
import { повторСерии } from '@/src/services/warmup';

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

  /**
   * ⚠️ ЗДЕСЬ СТОЯЛА ПРОВЕРКА ИСХОДНИКА — строки `if (meta.slot === 'evening') warmup.startEvening();`.
   * 17.09.2026 она исчезла вместе с дефектом: `startEvening()` без длины собирал пятиминутку после
   * вечера на пятнадцать минут. Повтор теперь — копия сыгранного набора (`повторСерии`), и
   * проверяется поведением: здесь — функция, на смонтированном итоге —
   * `warmup-complete-repeat-and-pinned-actions`.
   */
  it('AGAIN повторяет вечерний слот той же длины, а не запускает утренний', () => {
    const шаги = ['corsi', 'word_pairs', 'hanoi', 'mahjong', 'goods_sort', 'set_game', 'tower_london', 'sudoku', 'puzzles', 'pause', 'eye_gym', 'breathing']
      .map((id) => ({ game_id: id, game_route: `/games/${id}`, est_duration_sec: 60 }));
    const вечер = {
      duration_min: 14, weekday: 4 as const, weekday_name: 'ЧТ', track: 'training' as const, track_label: 'перед сном',
      steps: шаги, est_total_sec: 850, slot: 'evening' as const, вид: 'слот' as const,
    };
    const повтор = повторСерии(вечер);
    expect(`${повтор?.slot} · шагов ${повтор?.steps.length}`).toBe('evening · шагов 12');
  });

  it('итог не выводит сохранённые русские meta-подписи напрямую', () => {
    const source = read('app/warmup-complete.tsx');

    expect(source).toContain('new Intl.DateTimeFormat(language');
    expect(source).toContain("meta?.slot === 'evening' ? t('slotEvening')");
    expect(source).not.toContain('{meta.weekday_name} · {meta.track_label}');
  });
});
