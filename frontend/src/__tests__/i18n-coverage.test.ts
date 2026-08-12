/**
 * Полнота словарей: ни одна локаль не может просесть, а японский долг — только вниз.
 *
 * ЗАЧЕМ. Репорт тестировщика v1.121 «не все тексты переведены» висел открытым с июля.
 * Сличение словарей 12.08.2026 показало: девяти локалям не хватало по 15 ключей, а
 * ЯПОНСКОЙ — 714 из 1490, то есть почти половина интерфейса шла по-английски. Пятнадцать
 * общих закрыты сразу: там были названия зарядок (утренняя/дневная/вечерняя/ночная) и
 * заголовок экрана выбора — самое ходовое, что вообще есть.
 *
 * ЗАЧЕМ ХРАПОВИК, А НЕ СТЕНА. Требовать ноль везде — значит уронить сборку на японском
 * долге, который одним заходом не закрыть. Поэтому: у девяти локалей ноль и это жёстко,
 * а японскому разрешён известный долг, который может только УМЕНЬШАТЬСЯ. Как только
 * долг гасится, число здесь опускается — и назад дороги нет.
 *
 * Словари читаются текстом: LanguageContext тянет React-контекст, а нам нужны только имена.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

/** Известный долг японской локали на 12.08.2026. Менять ТОЛЬКО в меньшую сторону. */
const JA_DEBT = 699;

const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];

function baseKeys(): Set<string> {
  const src = read('src/contexts/LanguageContext.tsx');
  return new Set(src.match(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/gm)?.map(
    (m) => m.trim().replace(/:\s*\{$/, ''),
  ) ?? []);
}

function missingIn(loc: string, keys: Set<string>): string[] {
  const src = read(`src/contexts/translations/${loc}.ts`);
  const have = new Set(src.match(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g)?.map(
    (m) => m.slice(1, -2),
  ) ?? []);
  return [...keys].filter((k) => !have.has(k));
}

describe('полнота словарей', () => {
  const keys = baseKeys();

  it('базовый словарь прочитан целиком', () => {
    expect(keys.size).toBeGreaterThan(1000);
  });

  it.each(LOCALES.filter((l) => l !== 'ja'))('в локали %s переведено всё', (loc) => {
    const miss = missingIn(loc, keys);
    // Показываем первые пропущенные прямо в тексте ошибки — иначе непонятно, что чинить.
    expect(`${loc}: не хватает ${miss.length} → ${miss.slice(0, 6).join(', ')}`)
      .toBe(`${loc}: не хватает 0 → `);
  });

  it(`японский долг не растёт (сейчас ${JA_DEBT})`, () => {
    const miss = missingIn('ja', keys);
    expect(miss.length).toBeLessThanOrEqual(JA_DEBT);
  });

  it('японский долг записан честно — если он погашен, опусти число в тесте', () => {
    const miss = missingIn('ja', keys);
    // Долг уменьшился больше чем на 20 — значит константа устарела и её пора двигать.
    expect(`долг ${miss.length}, в тесте ${JA_DEBT}, разрыв ${JA_DEBT - miss.length}`)
      .toBe(`долг ${miss.length}, в тесте ${JA_DEBT}, разрыв ${Math.min(JA_DEBT - miss.length, 20)}`);
  });
});
