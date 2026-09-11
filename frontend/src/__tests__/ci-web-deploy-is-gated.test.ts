/* psygames-ci-web-deploy-gate · VER 1 · 23.08.2026 */
/**
 * ВЕБ НЕ УЕЗЖАЕТ ЛЮДЯМ, ПОКА ЕГО НЕ ОТКРЫЛИ ХОТЬ ОДНОЙ ПРОВЕРКОЙ, ВИДЯЩЕЙ ИГРЫ.
 *
 * 🔴 ЧТО БЫЛО (аудит 22.08.2026, задача TeamOps 0940eb0a). `smoke` — единственная
 * проверка, которая открывает все игры, — шла ТОЛЬКО ПО ТЕГУ. А веб-сборка
 * выкладывается с main и держалась на `needs: [typecheck]`, то есть на `tsc` и
 * `jest`. Между правкой в main и живым сайтом не стояло ничего, что запускает
 * игру.
 *
 * 🔴 И САМА `smoke` ИГРУ НЕ ЗАПУСКАЛА. Её звали без `START=1`: открыть роут,
 * подождать 1,6 с, собрать консоль. Кнопку «Начать» она не нажимала ни разу.
 * Цена этого класса известна поимённо: у `goods-sort` 19.08 встал гейт
 * решаемости, а 22.08 нашлись 57 непроходимых уровней из 200 — гейт был
 * зелёным, потому что не исполнял код игры.
 *
 * ⚠️ ПОЧЕМУ ПРОВЕРКА РАЗБИРАЕТ ГРАФ, А НЕ ИЩЕТ СТРОКУ. «В файле есть слово
 * smoke» зелено и когда джоба выключена. Здесь строится карта «джоба → на чём
 * стоит и когда идёт», и утверждения делаются о НЕЙ.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const YML = path.join(__dirname, '../../..', '.github/workflows/build.yml');

interface Job { if?: string; needs?: string[] }

function jobs(): Record<string, Job> {
  const src = fs.readFileSync(YML, 'utf8') as string;
  const out: Record<string, Job> = {};
  let cur: string | null = null;
  for (const line of src.split('\n')) {
    const head = line.match(/^ {2}([a-z0-9_-]+):\s*$/);
    if (head) { cur = head[1]; out[cur] = {}; continue; }
    if (!cur) continue;
    const cond = line.match(/^ {4}if: (.+)$/);
    if (cond) out[cur].if = cond[1].trim();
    const needs = line.match(/^ {4}needs: \[(.+?)\]/);
    if (needs) out[cur].needs = needs[1].split(',').map((s: string) => s.trim());
  }
  return out;
}

const src = () => fs.readFileSync(YML, 'utf8') as string;

/**
 * Тело каждой джобы БЕЗ КОММЕНТАРИЕВ. Комментарии срезаются до поиска: у
 * `ios-release` в шапке тридцать строк рассказа про TestFlight и altool, и
 * детектор по сырому тексту считал бы рассказ доставкой. Та же грабля за один
 * день сработала дважды в других гейтах — `screen-width-guard` и
 * `mahjong-stuck-exit` оба обвинили комментарий.
 */
function bodies(): Record<string, string> {
  const out: Record<string, string> = {};
  let cur: string | null = null;
  for (const line of src().split('\n')) {
    const head = line.match(/^ {2}([a-z0-9_-]+):\s*$/);
    if (head) { cur = head[1]; out[cur] = ''; continue; }
    if (!cur) continue;
    if (/^ {2}\S/.test(line)) { cur = null; continue; }
    if (/^\s*#/.test(line)) continue;
    out[cur] += line + '\n';
  }
  return out;
}

/** Всё, на чём джоба стоит, включая зависимости зависимостей. */
function closure(name: string, all = jobs(), seen = new Set<string>()): Set<string> {
  for (const n of all[name]?.needs ?? []) {
    if (!seen.has(n)) { seen.add(n); closure(n, all, seen); }
  }
  return seen;
}

/**
 * Джобы, которые отгружают НАРУЖУ. Признак берётся из шагов, а не списком имён:
 * новая джоба доставки попадёт под проверку без правки этого файла.
 * ⚠️ `actions/upload-artifact` исключён нарочно — это артефакт ВНУТРИ прогона,
 * его видят только следующие джобы, а не люди.
 */
function delivering(): string[] {
  // Транспорты, которыми проект РЕАЛЬНО отгружает (проверено по build.yml
  // 07.09.2026, а не выдумано): Apple — altool/notarytool, GitHub —
  // action-gh-release, Google Play — deploy_play.js через googleapis, сервер —
  // lftp по sftp. Список живой: появится новый транспорт — добавить сюда, а
  // соседняя проба «детектор не ослеп» не даст ему проехать молча.
  const знаки = new RegExp([
    'altool', 'notarytool',                                  // Apple
    'action-gh-release', 'gh release create',                // GitHub
    'deploy_play', 'googleapis', 'androidpublisher',
    'upload-google-play', 'fastlane', 'supply\\b',            // Google Play
    'lftp', 'sftp:', 'rsync', 'scp ',                        // свой сервер
  ].join('|'), 'i');
  return Object.entries(bodies())
    .filter(([, b]) => знаки.test(b.replace(/actions\/upload-artifact/g, '')))
    .map(([n]) => n);
}

describe('выкладка веба', () => {
  it('разбор графа вообще работает — иначе весь файл самообман', () => {
    const j = jobs();
    expect(`джоб найдено: ${Object.keys(j).length > 6} · web-deploy есть: ${!!j['web-deploy']}`)
      .toBe('джоб найдено: true · web-deploy есть: true');
  });

  it('веб-деплой стоит на smoke и на веб-гейтах, а не на одном tsc', () => {
    const needs = jobs()['web-deploy'].needs ?? [];
    const missing = ['typecheck', 'smoke', 'web-gates'].filter((n) => !needs.includes(n));
    expect(`не хватает в needs у web-deploy: ${missing.length ? missing.join(', ') : 'ничего'}`)
      .toBe('не хватает в needs у web-deploy: ничего');
  });

  it('smoke идёт и на main, а не только по тегу', () => {
    const cond = jobs()['smoke'].if;
    expect(`условие запуска smoke: ${cond ?? 'нет — идёт всегда'}`)
      .toBe('условие запуска smoke: нет — идёт всегда');
  });

  it('веб-гейты идут и на main, а не только по тегу', () => {
    const cond = jobs()['web-gates'].if;
    expect(`условие запуска веб-гейтов: ${cond ?? 'нет — идёт всегда'}`)
      .toBe('условие запуска веб-гейтов: нет — идёт всегда');
  });

  it('smoke заходит В ИГРУ: вызывается со START=1', () => {
    const call = (src().match(/^.*scripts\/smoke-games\.mjs.*$/m) || [''])[0];
    expect(`START=1 в вызове: ${/\bSTART=1\b/.test(call)}`).toBe('START=1 в вызове: true');
  });

  /**
   * 🔴 РЕШЕНИЕ ДЕНИСА 09.09.2026: полной веб-версии приложения на сайте быть не может — только
   * семплы (демо-шорты в /mini). Обе джобы выкладки веба (web-deploy → GH Pages, play-deploy →
   * psy-games.pro/play) выключены `if: false`, /play с сайта снят. Проба сторожит, чтобы их не
   * включили обратно молча: включение — только прямым решением Дениса, и тогда эта проверка
   * переписывается вместе с ним.
   */
  it('🔴 выкладка веба выключена решением Дениса 09.09.2026 — if: false у web-deploy и play-deploy', () => {
    for (const job of ['web-deploy', 'play-deploy']) {
      expect(`${job}: if ${jobs()[job]?.if ?? 'нет'}`).toBe(`${job}: if false`);
    }
  });

  /**
   * 🔴 ЛИНТА В СБОРКЕ НЕ БЫЛО ВООБЩЕ. Скрипт `lint` лежал в package.json с
   * самого начала, и ни один workflow его не звал (задача 0940eb0a, п.3).
   * Поставлен храповиком: долг может только уменьшаться — разбор в шапке
   * `scripts/lint-ratchet.mjs`. Держит РЕЛИЗ, а не выкладку веба: долг стиля не
   * повод уронить работающий сайт, но повод не выпускать сборку.
   */
  it('линт в сборке есть и держит релиз', () => {
    const j = jobs();
    const has = 'lint' in j;
    const inRelease = (j['release'].needs ?? []).includes('lint');
    expect(`джоба линта есть — ${has} · релиз стоит на ней — ${inRelease}`)
      .toBe('джоба линта есть — true · релиз стоит на ней — true');
  });

  it('линт зовут храповиком, а не голым eslint', () => {
    expect(src()).toContain('scripts/lint-ratchet.mjs');
  });

  /**
   * 🔴 У ТОГО, КТО ПУБЛИКУЕТ, НАБОР ПРОВЕРОК НЕ УЖЕ, ЧЕМ У ТОГО, КТО СОБИРАЕТ.
   *
   * Замер 07.09.2026, дважды за день одна и та же дыра:
   *  · утром — `google-play` уходил в прод на 100% пользователей по набору
   *    СЛАБЕЕ, чем GitHub-релиз, а `play-deploy` не зависел ни от чего вовсе;
   *  · вечером — `ios-release` подавал подписанный .ipa в TestFlight с ПУСТЫМ
   *    `needs`: запушил метку — сборка уехала, пока прогон ещё шёл.
   * Это и есть механика 2.47.0: прогон красный, наружу ушло, номер сгорел
   * навсегда («The bundle version must be higher than the previously uploaded
   * version: 2.47.0»).
   *
   * Оба раза я нашёл это глазами. Третьего раза не будет.
   */
  it('🔴 каждый, кто отгружает наружу, стоит на пробах — включая экранные', () => {
    // `unit-tests` добавлен 09.09.2026: юнит-пробы вынесены из typecheck в свою джобу
    // (4 осколка jest), и отгрузка обязана стоять на ней так же, как на tsc.
    /**
     * 🔴 `tag-from-main` ДОБАВЛЕН 09.09.2026. Метки v2.52.6…v2.52.10 резались не от
     * main, и всё, что лежало в main, в них не попадало ПО ПОСТРОЕНИЮ: 25, 24, 23, 22
     * и 21 коммит чужой работы восьми разделов не доехали до людей. Заслон предложил
     * psygames-span-claude-mac (задача TeamOps d31608c9); здесь он ЗАКРЕПЛЁН — убрать
     * джобу из `needs` молча больше нельзя.
     */
    const обязаны = ['typecheck', 'unit-tests', 'smoke', 'web-gates', 'tag-from-main'];
    const плохо: string[] = [];
    for (const j of delivering()) {
      const стоит = closure(j);
      const нет = обязаны.filter((n) => !стоит.has(n));
      if (нет.length) плохо.push(`${j} не стоит на: ${нет.join(', ')}`);
    }
    expect(плохо).toEqual([]);
  });

  it('детектор доставки не ослеп — иначе проба выше зелена вслепую', () => {
    const d = delivering();
    // Четыре пути наружу известны поимённо; их обязано найти ЛЮБОЕ исправное
    // определение. Больше — можно (появился новый), меньше — детектор сломан.
    // 09.09.2026: iOS разделён — `ios-release` теперь только собирает и подписывает
    // (параллельно гейтам, наружу ничего не шлёт), выгружает `ios-testflight`.
    const ждём = ['release', 'google-play', 'play-deploy', 'ios-testflight'];
    const нет = ждём.filter((n) => !d.includes(n));
    expect(`детектор нашёл ${d.length} путей наружу, не увидел: ${нет.join(', ') || 'ничего'}`)
      .toBe(`детектор нашёл ${d.length} путей наружу, не увидел: ничего`);
  });
});
