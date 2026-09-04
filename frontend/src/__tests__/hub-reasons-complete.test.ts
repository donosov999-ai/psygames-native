/**
 * У КАЖДОЙ РАЗВИЛКИ ЕСТЬ ОБОСНОВАНИЕ — И ЭТО ЛОВИТСЯ ЛОКАЛЬНО.
 *
 * 🔴 ЗАЧЕМ ДУБЛИРОВАТЬ ПРОВЕРКУ. Аудит попадания пальцем (`tap-target-audit.mjs`)
 * берёт список развилок ИЗ КАТАЛОГА автоматически, а обоснование к каждой пишется
 * руками — и падает с «Исключение без обоснования», если забыли. Проверка живёт в
 * браузерной джобе CI: ответ приходит через двадцать минут после тега, когда
 * версия уже сожжена.
 *
 * ⚠️ 04.09.2026 Я НАСТУПИЛ НА ЭТО ДВАЖДЫ ЗА ДЕНЬ. Сперва `towers-hub` и
 * `routes-hub` (четыре релиза подряд красные, Google Play не публиковался),
 * потом `inhibition-hub`. Оба раза гейт был прав, и оба раза цена — потерянный
 * прогон. Поэтому та же проверка стоит здесь: секунда в `npm test` вместо
 * двадцати минут в CI.
 */
import { GAMES } from '@/src/constants/games';

declare function require(m: string): any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('обоснования развилок', () => {
  const аудит: string = fs.readFileSync(
    path.join(__dirname, '../../scripts/tap-target-audit.mjs'), 'utf8');
  const блок = /const HUB_REASONS = \{[\s\S]*?\n\};/.exec(аудит)?.[0] ?? '';

  it('есть что проверять: блок обоснований найден и не пуст', () => {
    expect(блок.length).toBeGreaterThan(200);
  });

  it('🔴 у каждой развилки каталога есть обоснование в аудите', () => {
    const обоснованы = new Set(
      [...блок.matchAll(/'(\/games\/[a-z0-9-]+)':/g)].map((m) => m[1]!),
    );
    const без = GAMES.filter((g) => g.hub && g.route && !обоснованы.has(g.route))
      .map((g) => `${g.id} (${g.route})`);
    expect(без).toEqual([]);
  });

  it('🔴 обоснование длиннее 25 символов — иначе аудит сам его отвергнет', () => {
    const короткие = [...блок.matchAll(/'(\/games\/[a-z0-9-]+)': '([^']*)'/g)]
      .filter((m) => m[2]!.length < 25)
      .map((m) => `${m[1]}: ${m[2]!.length} символов`);
    expect(короткие).toEqual([]);
  });

  it('🔴 нет обоснований для развилок, которых уже нет в каталоге', () => {
    const живые = new Set(GAMES.filter((g) => g.hub && g.route).map((g) => g.route!));
    const мёртвые = [...блок.matchAll(/'(\/games\/[a-z0-9-]+)':/g)]
      .map((m) => m[1]!)
      .filter((r) => !живые.has(r));
    // протухшее исключение хуже отсутствующего: оно молча гасит проверку
    expect(мёртвые).toEqual([]);
  });
});
