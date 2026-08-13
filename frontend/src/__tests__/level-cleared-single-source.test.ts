/**
 * Ни одна игра не рисует СВОЙ экран «уровень пройден».
 *
 * ЗАЧЕМ. Ровно это и разъехалось: маджонг, сортировка товаров и парные картинки
 * завели по собственной плашке «🎉 Уровень N ✓». Снаружи — мелочь оформления,
 * внутри — три игры молча выпали из всей бухгалтерии уровня:
 *
 *   звёзды по уровням     не сохранялись → на тропинке их узлы были пустыми;
 *   серия чистых 🔥        не считалась;
 *   глаз-разрядка         не тикала — передышки каждые 10 уровней там не было
 *                          вовсе, и их уровни не шли в зачёт серии в других играх;
 *   сравнение с игроками  не показывалось;
 *   правило режима        приходилось прописывать в каждой из трёх руками —
 *                          и именно они вылетали в вечерней зарядке у Вали.
 *
 * Одну плашку написать проще, чем разобраться в общем экране, — поэтому это
 * повторится, если не стеречь. Тест ловит момент, когда игра снова начнёт
 * объявлять свой «баннер уровня» вместо общего LevelCleared.
 *
 * ⚠️ ЧТО ЭТО НЕ ЗАПРЕЩАЕТ. Свои поздравления по ходу партии (попапы «+50»,
 * подписи комбо) — пожалуйста. Речь только про ИТОГ УРОВНЯ.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const GAMES_DIR = join(__dirname, '../../app/games');

const files = (): string[] => readdirSync(GAMES_DIR).filter((f: string) => f.endsWith('.tsx'));
const read = (f: string): string => readFileSync(join(GAMES_DIR, f), 'utf8');

/** Свой стиль плашки итога — след самодельного экрана. */
const OWN_BANNER_STYLE = /levelBanner\s*:\s*\{|levelBannerText\s*:\s*\{|levelDone\w*\s*:\s*\{\s*position:\s*'absolute'/;

/**
 * Свой текст «Уровень N ✓» в разметке. Ищем связку номера уровня с галочкой или
 * стрелкой на следующий — именно так выглядели все три самодельные плашки.
 */
const OWN_BANNER_TEXT = /\{t\('(level|goodsLevel)'\)\}\s*\{[^}]+\}\s*✓|→\s*\{t\('(level|goodsLevel)'\)\}/;

describe('экран «уровень пройден» — один на всех', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(files().length).toBeGreaterThan(50);
    // и общий экран на месте
    expect(readFileSync(join(__dirname, '../components/LevelCleared.tsx'), 'utf8')).toContain('export default function LevelCleared');
  });

  it('ни одна игра не объявляет свой стиль плашки итога', () => {
    const own = files().filter((f) => OWN_BANNER_STYLE.test(read(f)));
    expect(own).toEqual([]);
  });

  it('ни одна игра не рисует свой текст «Уровень N ✓»', () => {
    const own = files().filter((f) => OWN_BANNER_TEXT.test(read(f)));
    expect(own).toEqual([]);
  });

  it('накладной облик доступен и им уже пользуются', () => {
    const src = readFileSync(join(__dirname, '../components/LevelCleared.tsx'), 'utf8');
    expect(src).toContain("variant?: 'overlay' | 'screen'");
    const overlays = files().filter((f) => /variant="overlay"/.test(read(f)));
    expect(overlays.length).toBeGreaterThan(0);
  });

  it('каркас умеет держать накладку — иначе игре некуда её класть', () => {
    const src = readFileSync(join(__dirname, '../components/GameShell.tsx'), 'utf8');
    expect(src).toContain('overlay?: React.ReactNode');
  });
});
