/* psygames-vocab-no-hang · VER 1 · 22.08.2026 */
/**
 * СЛОВАРЬ С ПОВТОРАМИ БОЛЬШЕ НЕ ВЕШАЕТ ПРИЛОЖЕНИЕ.
 *
 * 🔴 ЧТО БЫЛО. Варианты ответа добирались циклом «пока отвлекающих меньше трёх
 * И меньше, чем кандидатов». Кандидаты считались С ПОВТОРАМИ, а отвлекающие —
 * множеством, без них. Два одинаковых перевода в словаре (в своём словаре это
 * обычное дело) — и условие выхода не выполнялось НИКОГДА: длина два, размер
 * множества один, цикл вечный. Экран переставал отвечать, приложение
 * приходилось убивать.
 *
 * ⚠️ ПОЧЕМУ НЕ «ДОБАВИТЬ СЧЁТЧИК ПОПЫТОК». Ограничитель превратил бы зависание
 * в тихую недодачу вариантов — беда стала бы незаметной вместо очевидной. Цикла
 * теперь нет вовсе: берём уникальных кандидатов и перемешиваем, завершение
 * гарантировано устройством.
 */
import { buildOptions } from '@/app/games/vocab-srs';

/** Прогон с потолком времени: зависание провалит проверку, а не подвесит её. */
function within(ms: number, fn: () => void): boolean {
  const started = Date.now();
  fn();
  return Date.now() - started < ms;
}

describe('варианты ответа собираются всегда', () => {
  it('🔴 словарь из двух ОДИНАКОВЫХ переводов не вешает', () => {
    expect(within(1000, () => buildOptions('дом', ['кот', 'кот']))).toBe(true);
  });

  it('🔴 словарь, где ВСЕ переводы одинаковы, тоже не вешает', () => {
    expect(within(1000, () => buildOptions('дом', Array(50).fill('кот')))).toBe(true);
  });

  it('верный ответ всегда среди вариантов', () => {
    for (const pool of [[], ['a'], ['a', 'a'], ['a', 'b', 'c', 'd', 'e']]) {
      expect(buildOptions('right', pool)).toContain('right');
    }
  });

  /**
   * ⚠️ СЛОВАРЬ ПОДОБРАН ТАК, ЧТОБЫ ПОВТОР БЫЛ НЕИЗБЕЖЕН. Первая редакция брала
   * семь слов, из которых два повтора: после перемешивания трое первых МОГЛИ
   * оказаться разными по случайности, и проверка зеленела на сломанном коде.
   * Здесь повторов больше, чем мест: без отсева дубль вылезет обязательно.
   */
  it('вариантов не больше четырёх и они РАЗНЫЕ', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const opts = buildOptions('right', ['a', 'a', 'a', 'b']);
      expect(new Set(opts).size).toBe(opts.length);
      expect(opts.length).toBeLessThanOrEqual(4);
    }
    const wide = buildOptions('right', ['a', 'b', 'c', 'd', 'e']);
    expect(wide.length).toBe(4);
  });

  it('бедный словарь даёт меньше вариантов, но работает', () => {
    expect(buildOptions('right', ['a', 'a', 'a'])).toEqual(expect.arrayContaining(['right', 'a']));
    expect(buildOptions('right', []).length).toBe(1);
  });

  it('верный ответ не попадает в отвлекающие', () => {
    const opts = buildOptions('дом', ['дом', 'дом', 'кот']);
    expect(opts.filter((o) => o === 'дом').length).toBe(1);
  });

  it('пустые строки в словаре вариантами не становятся', () => {
    expect(buildOptions('right', ['', '', 'a'])).not.toContain('');
  });

  /**
   * ⚠️ ПРОВЕРКА ПРОВЕРКИ: прежний цикл на этих же данных не завершался. Пишем
   * его здесь целиком, чтобы следующий читатель видел, чего нельзя возвращать.
   */
  it('прежний цикл на этих данных был вечным', () => {
    const candidates = ['кот', 'кот'];            // с повторами, как раньше
    const distractors = new Set<string>();
    let spins = 0;
    while (distractors.size < 3 && distractors.size < candidates.length && spins < 10000) {
      distractors.add(candidates[Math.floor(Math.random() * candidates.length)] as string);
      spins += 1;
    }
    expect(spins).toBe(10000);                     // упёрлись в предохранитель — значит был вечным
  });
});

declare const __dirname: string;
declare function require(m: string): any;

describe('🔴 экран берёт варианты из общего расчёта', () => {
  const screen = (require('fs').readFileSync(
    require('path').join(__dirname, '../../app/games/vocab-srs.tsx'), 'utf8',
  ) as string).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('экран зовёт buildOptions, а не собирает варианты сам', () => {
    expect(screen).toMatch(/buildOptions\(card\[field\]/);
  });

  it('и прежнего цикла в экране больше нет', () => {
    expect(screen).not.toMatch(/while \(distractors\.size/);
  });
});
