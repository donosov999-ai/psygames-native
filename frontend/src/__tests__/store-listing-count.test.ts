/**
 * Число упражнений в карточках магазинов обязано совпадать с каталогом.
 *
 * ЗАЧЕМ. Карточки Google Play обновляются автоматически при пуше в store/, и в них
 * на двенадцати языках написано «N упражнений». Каталог растёт: за один день
 * 12.08.2026 в него добавились судоку-самурай и фрактальная судоку, и «61» в живых
 * описаниях мгновенно стало неправдой — на витрине магазина, а не в коде.
 *
 * Такое расхождение не видно никому: код собирается, тесты зелёные, приложение
 * работает. Врёт только текст, который читают перед установкой. Поэтому — тестом.
 *
 * ⚠️ СЧИТАЕМ ВСЕ ЗАПИСИ, включая hideFromMenu. Скрытые не показываются карточками
 * в каталоге, но человек их получает: они запускаются зарядками и групповыми
 * экранами. Обещать только видимые значило бы занижать то, что куплено.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '../../..');
const GAMES_TS = join(__dirname, '../constants/games.ts');

/** Число записей в реестре игр. */
function catalogueSize(): number {
  const src: string = readFileSync(GAMES_TS, 'utf8');
  const body = src.slice(src.indexOf('export const GAMES'));
  return (body.match(/^\s{2}\{\s*$/gm) || []).length;
}

function listingFiles(): string[] {
  const out: string[] = [];
  for (const dir of ['store/google-play', 'store/windows']) {
    const p = join(ROOT, dir);
    if (!existsSync(p)) continue;
    for (const f of readdirSync(p)) {
      if (f.startsWith('listing-') && f.endsWith('.md')) out.push(join(p, f));
    }
  }
  return out;
}

describe('карточки магазинов', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(listingFiles().length).toBeGreaterThanOrEqual(12);
    expect(catalogueSize()).toBeGreaterThan(50);
  });

  it('обещанное число упражнений совпадает с каталогом', () => {
    const n = catalogueSize();

    /**
     * Слова-маркеры «упражнение» на всех двенадцати языках. Проверяем ТОЛЬКО числа,
     * стоящие прямо перед ними: иначе тест ловит лимиты символов («80 символов»),
     * возраст аудитории («50+») и прочие числа, к счёту игр отношения не имеющие —
     * первый вариант так и сделал и покраснел на ровном месте.
     */
    const MARKERS = [
      'упражнени', 'exercise', 'Übung', 'ejercicio', 'exercice', 'esercizi',
      'exercício', '種類の脳トレ', '種。', '项练习', '가지 훈련', 'अभ्यास', 'تمرين',
    ];
    // ⚠️ Общие счётные слова сюда не годятся. Первая версия взяла японское 「種」
    // и хинди «तरह» — и поймала «12 種類の言語» и «12 तरह के नियमों» (число языков
    // и число вариантов правил судоку), объявив их неверным счётом упражнений.
    // Маркер должен указывать на УПРАЖНЕНИЯ, а не на «штуки» вообще.
    const re = new RegExp(`(?<!\\d)(\\d{2})(?!\\d)[\\s]{0,2}(${MARKERS.join('|')})`, 'g');

    const wrong: string[] = [];
    let found = 0;
    for (const f of listingFiles()) {
      const text: string = readFileSync(f, 'utf8');
      for (const m of text.matchAll(re)) {
        found++;
        if (Number(m[1]) !== n) wrong.push(`${f.split('/store/')[1]}: ${m[1]} вместо ${n}`);
      }
    }

    // Если маркеры перестали совпадать (текст переписали) — тест обязан упасть,
    // а не тихо позеленеть, ничего не проверив.
    expect(`совпадений маркера: ${found > 20}`).toBe('совпадений маркера: true');
    expect(wrong).toEqual([]);
  });
});
