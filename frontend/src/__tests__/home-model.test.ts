/* psygames-home-model · VER 1 · 07.10.2026 */
/**
 * 🔴 МОДЕЛЬ ГЛАВНОЙ ДЛЯ НАТИВНОЙ ОБОЛОЧКИ — ПЕРЕКЛАДКА, А НЕ ВТОРОЙ РАСЧЁТ (задача 7c88c0b8).
 *
 * `buildHomeModel` получает то, что веб-Главная уже посчитала, и раскладывает в вид без React.
 * Пробы проверяют, что раскладка ЧЕСТНАЯ:
 *   · порядок блоков — как в разметке `app/index.tsx`; набор профиля (`показыватьБлок`) убирает блок;
 *   · тексты — тем же словарём и с теми же подстановками, что видит человек на вебе;
 *   · цвета карточек — тем же `onGradientText`/`innerScrim`, что у `GradientSurface` веба;
 *   · «Сегодня»: пустой день — приглашение, больше трёх строк — «ещё N», серия — только с множителем;
 *   · окно цели: подпись-основание только под предложенным и только с числом.
 * Плюс: образец модели (`flutter/test/fixtures/home_model_ru.json`) — им кормится проба Flutter, чтобы
 * натив рисовал ровно ту форму, что шлёт веб. Без WRITE сравнивает и краснеет; перевыпуск из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/home-model.test.ts
 */
import { buildHomeModel, hrefOf, onLook, type HomeModelInput } from '@/src/services/homeModel';
import { translateFor } from '@/src/contexts/LanguageContext';
import { GAMES } from '@/src/constants/games';
import { onGradientText, innerScrim } from '@/src/services/onGradientText';

declare const require: { (id: string): any };
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean; mkdirSync(p: string, o: object): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const FIXTURE = path.resolve(__dirname, '../../../flutter/test/fixtures/home_model_ru.json');

const t = (k: string) => translateFor('ru', k);
const game = (id: string) => GAMES.find((g) => g.id === id)!;
const spec = { kind: 'frames', uris: ['/assets/assets/images/pet/cat/idle0.h.webp'], frames: 1, tickMs: 420, accessory: null } as const;

function input(over: Partial<HomeModelInput> = {}): HomeModelInput {
  return {
    t,
    profile: { id: 'nzt48', color: '#7c3aed', emoji: '🧠', warmup_enabled: true },
    colors: { background: '#F5F5F7', primary: '#a855f7', surface: '#FFFFFF', text: '#1C1C1E', textSecondary: '#6E6E73' },
    showBlock: () => true,
    profileBg: { uri: '/assets/assets/images/backgrounds/nzt48.h.webp' },
    logo: { uri: '/assets/assets/images/logos/nzt48.h.webp' },
    logoPlate: '#12151AC7',
    tokens: 235,
    level: { level: 3, span: 100, progress: 0.42, titleKey: 'levelTitle3' },
    streak: 4,
    pet: spec as any,
    chipImage: { uri: '/assets/assets/images/badges/nzt48.h.webp' },
    frameColor: null,
    titleLabel: null,
    achievementsCount: 5,
    update: null,
    streakToast: null,
    wagerToast: null,
    levelUp: null,
    ladder: { n: 2, titleKey: 'feature_hints' },
    chest: { face: '🌰', left: 35, have: 1, all: 12, ratio: 0.3 },
    resume: game('sudoku'),
    goalCard: { state: 'ask', goal: null },
    goalMaxLen: 90,
    goalExampleKeys: ['dayGoalExample1', 'dayGoalExample2', 'dayGoalExample3'],
    today: {
      rows: [
        { game: 'schulte_table', rounds: 3, doubled: true, total: 24 },
        { game: 'sudoku', rounds: 1, doubled: false, total: 15 },
        { game: 'n_back', rounds: 2, doubled: false, total: 10 },
        { game: 'corsi', rounds: 1, doubled: false, total: 5 },
      ],
      total: 54, rounds: 7, dayStreak: 4,
    },
    todayRowsMax: 3,
    dayStreakForMult: 3,
    gameName: (id) => { const g = GAMES.find((x) => x.id === id); return g ? t(g.nameKey) : null; },
    reco: [
      { pick: { gameId: 'schulte_table', reasonKey: 'recoReasonStarter' }, game: game('schulte_table') },
      { pick: { gameId: 'hanoi', reasonKey: 'recoReasonStarter', doneToday: true }, game: game('hanoi') },
    ],
    recoParams: { calm: '1' },
    warmup: { gradient: ['#f7b733', '#fc4a1a'], image: { uri: '/assets/assets/images/feature_icons/warmup.h.webp' }, slotKey: 'slotMorning' },
    pause: { gradient: ['#43cea2', '#185a9d'] },
    challenge: { game: game('set_game'), difficultyKey: 'easy', done: false, streak: 2 },
    favourites: [{ category: 'attention', total: 6, routes: ['/games/schulte', '/games/stroop'], hidden: 4 }],
    goalSheet: null,
    ...over,
  };
}

describe('модель Главной — раскладка того, что посчитал веб', () => {
  it('🔴 порядок блоков — как в разметке; набор профиля убирает блок', () => {
    expect(buildHomeModel(input()).blocks.map((b) => b.kind))
      .toEqual(['search', 'ladder', 'chest', 'resume', 'goal', 'today', 'reco', 'practices', 'favourites', 'allForks']);
    const без = buildHomeModel(input({ showBlock: (k) => k !== 'рекомендации' && k !== 'сегодня' }));
    expect(без.blocks.map((b) => b.kind)).toEqual(['search', 'ladder', 'chest', 'resume', 'goal', 'practices', 'favourites', 'allForks']);
    // Блоки со своими условиями: нет замка, нет партии, закрытая цель, нет любимых — блока нет.
    const пусто = buildHomeModel(input({ ladder: null, resume: null, goalCard: { state: 'hidden', goal: null }, favourites: [], reco: [] }));
    expect(пусто.blocks.map((b) => b.kind)).toEqual(['search', 'chest', 'today', 'practices', 'allForks']);
  });

  it('🔴 тексты — тем же словарём и с теми же подстановками', () => {
    const m = buildHomeModel(input());
    const ladder = m.blocks.find((b) => b.kind === 'ladder') as any;
    expect(ladder.text).toBe(t('ladderNext').replace('{n}', '2').replace('{what}', t('feature_hints')));
    const chest = m.blocks.find((b) => b.kind === 'chest') as any;
    expect(chest.text).toBe(t('chestToNext').replace('{n}', '35').replace('{have}', '1').replace('{all}', '12'));
    expect(m.header.subtitle).toBe(`${t('trainYourBrain')} · ${t('homeSwitchHint')}`);
    expect(m.header.chip.name).toBe(t('profileName_nzt48'));
    expect(m.header.level).toBe('Lv 3');
    expect(m.header.league).toBe(0.42);
    const resume = m.blocks.find((b) => b.kind === 'resume') as any;
    expect(resume.title).toBe(t('resumeGameTitle').replace('{game}', t(game('sudoku').nameKey)));
    expect(resume.href).toBe(game('sudoku').route);
  });

  it('🔴 «Сегодня»: три строки, «ещё N», серия с множителем; пустой день — приглашение', () => {
    const today = buildHomeModel(input()).blocks.find((b) => b.kind === 'today') as any;
    expect(today.rows.length).toBe(3);
    expect(today.rows[0]).toEqual({ name: t(game('schulte_table').nameKey), rounds: t('todayRoundsLabel').replace('{n}', '3'), doubled: true, gain: 24 });
    expect(today.more).toBe(t('todayMore').replace('{n}', '1'));
    expect(today.streakNote).toBe(t('todayStreakNote').replace('{n}', '4'));
    expect(today.empty).toBeNull();
    const пусто = buildHomeModel(input({ today: { rows: [], total: 0, rounds: 0, dayStreak: 4 } })).blocks.find((b) => b.kind === 'today') as any;
    expect([пусто.empty, пусто.more, пусто.streakNote]).toEqual([t('todayEmptyHint'), null, null]);
  });

  it('🔴 цвета карточек — тем же расчётом, что у веба; переход — с параметрами вечера', () => {
    const reco = buildHomeModel(input()).blocks.find((b) => b.kind === 'reco') as any;
    const g = game('schulte_table');
    const on = onGradientText(g.gradient[0], g.gradient[g.gradient.length - 1]);
    expect(reco.cards[0].look.fg).toBe(on.color);
    expect(reco.cards[0].look.scrim35).toBe(innerScrim(on, 0.35));
    expect(reco.cards[0].href).toBe(`${g.route}?calm=1`);
    expect(reco.cards[1].chip).toBe('✓');
    expect(reco.cards[1].sub).toBe(t('recoDoneToday'));
    expect(reco.cards[1].cta.text).toBe(t('ctaRepeat'));
    const practices = buildHomeModel(input()).blocks.find((b) => b.kind === 'practices') as any;
    // 07.10.2026 (b271f702): вместо «Паузы» — развилка «Релаксация», куда пауза, дыхание и глаза переехали.
    expect(practices.cards.map((c: any) => c.id)).toEqual(['warmup', 'relaxation', 'challenge']);
    expect(practices.cards[1].href).toBe('/games/relaxation-hub');
    // Внизу Главной — вход во все развилки.
    const blocks = buildHomeModel(input()).blocks;
    expect(blocks[blocks.length - 1]).toEqual({ kind: 'allForks', label: `${t('allForks')} ›`, href: '/games?filter=hubs' });
    expect(practices.cards[2].action).toBe('challenge');
    expect(practices.cards[0].sub).toBe(`${t('slotMorning')} · ${t('slotMorningDesc')}`);
    // Профиль без зарядки — карточки зарядки нет.
    const без = buildHomeModel(input({ warmup: null })).blocks.find((b) => b.kind === 'practices') as any;
    expect(без.cards.map((c: any) => c.id)).toEqual(['relaxation', 'challenge']);
  });

  it('окно цели: основание — только под предложенным и только с числом', () => {
    const sheet = (whyKey: string | null, basis: number | null) => buildHomeModel(input({
      goalSheet: { line: 'Мяу', petState: null, options: [7, 14, 30], chosen: 14, whyKey, basis, games: 2, tokens: 30, streak: 4 },
    })).goalSheet!;
    expect(sheet('goalSuggest_best', 9).options.map((o) => o.why)).toEqual([null, t('goalSuggest_best').replace('{n}', '9'), null]);
    expect(sheet(null, null).options.every((o) => o.why === null)).toBe(true);
    expect(sheet(null, null).today).toBe(t('goalSheetToday').replace('{g}', '2').replace('{p}', '30').replace('{s}', '4'));
  });

  it('адрес с параметрами — как router.push({ pathname, params })', () => {
    expect(hrefOf('/games/schulte', { calm: '1', x: undefined })).toBe('/games/schulte?calm=1');
    expect(hrefOf('/games/schulte')).toBe('/games/schulte');
    expect(onLook('#ffffff', '#ffffff').fg).toBe(onGradientText('#ffffff', '#ffffff').color);
  });

  it('образец модели для пробы Flutter совпадает с живым TS', () => {
    const now = `${JSON.stringify(buildHomeModel(input({
      goalSheet: { line: 'Давай договоримся, сколько дней подряд?', petState: spec as any, options: [7, 14, 30], chosen: 7, whyKey: null, basis: null, games: 0, tokens: 0, streak: 0 },
    })), null, 1)}\n`;
    if (process.env.WRITE === '1') {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, now, 'utf8');
    }
    const was = fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/home-model.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });
});
