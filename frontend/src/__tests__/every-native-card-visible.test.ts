/* psygames-every-native-card-visible · VER 1 · 02.10.2026 */
/**
 * 🔴 РАБОТА СДЕЛАНА — ЗНАЧИТ ЕЁ ВИДНО (решение Дениса 02.10.2026: «все новые что добавляем —
 * во все профили, потом приборку делаем, чтобы не было такого, что работа сделана, а её не видно
 * нигде»; задача 4a5bb886).
 *
 * 📍 Замер 02.10.2026, main 6f3c82e5c, 13 профилей с файлом состава: из 117 карточек нативных
 * развилок (`flutter/assets/hubs.json`) 40 не видны НИ В ОДНОМ профиле — «Кошки», «Кто спрятался?»,
 * три шахматные задачи, 36 режимов Тэтхэма. Файл состава выгружен 13.09 и о них не знает; игры
 * только с нативным экраном (`nativeOnlyGames.ts`) правило профиля не пропускало ни у кого.
 * Выпуск 2.56.7 объявлял «Кошек» в «Что нового» — а открыть их было нельзя.
 *
 * Сторож держит два правила:
 *  1. каждая карточка нативной развилки видна хотя бы в одном профиле;
 *  2. игра только с нативным экраном видна ВО ВСЕХ профилях — новое идёт всем, убрать — явно.
 * Подбор по профилям (карточка видна части профилей) не трогается — это приборка, отдельно.
 */
import { PROFILES } from '@/src/constants/profiles';
import { hubVisibility } from '@/src/services/hubVisibility';
import { установитьХабыИзФайла, visibleHubCards, HUB_CONTENTS } from '@/src/constants/hubContents';
import { заводскойСостав, наложить } from '@/src/services/playlistOverride';
import { NATIVE_ONLY_ROUTES } from '@/src/constants/nativeOnlyGames';

declare function require(id: string): any;
const hubs = require('../../../flutter/assets/hubs.json') as { hubs: Record<string, { route: string }[]> };

/** Кто из профилей видит маршрут хоть в одной развилке — настоящим правилом приложения. */
function whoSees(): Map<string, Set<string>> {
  const состав = заводскойСостав();
  const seen = new Map<string, Set<string>>();
  try {
    for (const p0 of PROFILES) {
      const p = наложить(p0, состав?.профили ?? null);
      // Так ставит ProfileContext: свой раздел профиля → общий раздел файла.
      установитьХабыИзФайла(состав?.профили?.[p.id]?.хабы ?? состав?.хабы ?? null);
      for (const routes of Object.values(hubVisibility(p).hubs)) {
        for (const r of routes) (seen.get(r) ?? seen.set(r, new Set()).get(r)!).add(p.id);
      }
    }
  } finally {
    установитьХабыИзФайла(null);
  }
  return seen;
}

const nativeCards = [...new Set(Object.values(hubs.hubs).flatMap((cards) => cards.map((c) => c.route)))];

describe('работа видна: карточки нативных развилок', () => {
  const seen = whoSees();

  it('каждая карточка нативной развилки видна хотя бы одному профилю', () => {
    const nowhere = nativeCards.filter((r) => !seen.get(r)?.size);
    expect(nowhere).toEqual([]);
  });

  it('игра только с нативным экраном видна ВО ВСЕХ профилях', () => {
    const inHubs = NATIVE_ONLY_ROUTES.filter((r) => nativeCards.includes(r));
    expect(inHubs.length).toBeGreaterThan(0);
    const short = inHubs
      .map((r) => ({ r, n: seen.get(r)?.size ?? 0 }))
      .filter(({ n }) => n < PROFILES.length)
      .map(({ r, n }) => `${r}: ${n} из ${PROFILES.length}`);
    expect(short).toEqual([]);
  });

  it('«Кошки» и «Кто спрятался?» — во всех профилях (выпуск 2.56.7 их объявляет)', () => {
    for (const r of ['/games/cats', '/games/hidden-character']) {
      expect({ r, n: seen.get(r)?.size ?? 0 }).toEqual({ r, n: PROFILES.length });
    }
  });
});

describe('правило «новое — во все профили» в самой функции видимости', () => {
  // Развилка, которую курирует заводской файл, и карточка, которой он ещё не знает (появилась после выгрузки).
  const ХАБ = '/games/sudoku-hub';
  const НОВАЯ = { route: '/games/sudoku', icon: 'grid', nameKey: 'новаяПроба', descKey: 'новаяПроба' } as (typeof HUB_CONTENTS)[string][number];
  const новая = { ...НОВАЯ, route: '/games/новая-игра-после-файла' };
  const known = HUB_CONTENTS[ХАБ].map((c) => c.route);
  const t = (k: string) => k;
  beforeEach(() => { HUB_CONTENTS[ХАБ].push(новая); });
  afterEach(() => { HUB_CONTENTS[ХАБ].pop(); установитьХабыИзФайла(null); });

  it('карточку, которой не знает ни один файл, видят и профили со своим списком', () => {
    установитьХабыИзФайла({ [ХАБ]: [known[0]] });
    const routes = visibleHubCards(ХАБ, new Set([...known, новая.route].map((r) => r.split('?')[0])), t).map((c) => c.route);
    expect(routes).toContain(новая.route);
  });

  it('известную карточку файл по-прежнему убирает пропуском — договор редактора состава', () => {
    установитьХабыИзФайла({ [ХАБ]: [known[0]] });
    const routes = visibleHubCards(ХАБ, new Set([...known, новая.route].map((r) => r.split('?')[0])), t).map((c) => c.route);
    expect(routes).not.toContain(known[1]);
  });
});
