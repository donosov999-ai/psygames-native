/* psygames-home-model · VER 1 · 07.10.2026 */
/**
 * 🔴 МОДЕЛЬ ГЛАВНОЙ ДЛЯ НАТИВНОЙ ОБОЛОЧКИ (задача 7c88c0b8, правило Дениса 4e679f41).
 *
 * Главную рисует Flutter (`flutter/lib/shell/home_screen.dart`), а считает по-прежнему веб:
 * `app/index.tsx` остаётся смонтированным под оболочкой и отдаёт эту модель (`hostScreens.ts`).
 * Здесь НЕТ ни одного расчёта — только перекладка того, что экран уже посчитал, в вид, который
 * можно нарисовать без React: тексты на языке человека, цвета готовыми строками CSS (их считают те
 * же `onGradientText`/`innerScrim`, что у веба), картинки адресами сборки, переходы адресами.
 * Порядок блоков и правило «какие блоки у профиля» (`показыватьБлок`) — те же, что в разметке.
 *
 * ⚠️ Функция чистая: всё приходит параметром. Так модель проверяется пробой без экрана
 * (`src/__tests__/home-model.test.ts`), а экран не обзаводится второй копией решений.
 */
import { onGradientText, onGradientTextMuted, innerScrim, textOn, withAlpha } from '@/src/services/onGradientText';
import { assetUri } from '@/src/services/hostScreens';
import type { GameConfig } from '@/src/constants/games';
import type { PetRenderSpec } from '@/src/components/pet/PetSprite';

type T = (key: string) => string;

/** Цвета плашки на градиенте — тем же расчётом, что у веба. */
export interface OnLook {
  fg: string;
  soft: string;
  /** innerScrim 0.2 / 0.35 — подложки значков и кнопки. */
  scrim20: string;
  scrim35: string;
  /** Вуаль `GradientSurface`, где сплошным цветом AA не берётся; null — без вуали. */
  veil: string | null;
}

export function onLook(c1: string, c2: string): OnLook {
  const g = onGradientText(c1, c2);
  return {
    fg: g.color,
    soft: onGradientTextMuted(g),
    scrim20: innerScrim(g, 0.2),
    scrim35: innerScrim(g, 0.35),
    veil: g.veil ? withAlpha(g.veil, g.veilAlpha) : null,
  };
}

export interface HeroCard {
  id: string;
  /** Куда ведёт: адрес с параметрами; `action` — особый переход (вызов дня). */
  href: string | null;
  action?: 'challenge';
  gradient: [string, string];
  look: OnLook;
  /** Значок: имя Ionicons или картинка сборки. */
  icon: { ion?: string; image?: string | null; size: number };
  chip: string | null;
  chipBg: string;
  title: string;
  sub: string;
  cta: { ion: string; text: string; bg: string; fg: string };
  label: string;
}

export type HomeBlock =
  | { kind: 'search'; placeholder: string; button: string }
  | { kind: 'ladder'; text: string }
  | { kind: 'chest'; face: string; text: string; ratio: number; label: string }
  | { kind: 'resume'; title: string; sub: string; gradient: [string, string]; href: string; label: string }
  | {
      kind: 'goal'; state: 'ask' | 'active' | 'review' | 'closed'; goalText: string | null;
      outcome: string | null; reward: number | null; roundsToday: number; maxLen: number;
      texts: Record<string, string>; examples: string[];
    }
  | {
      kind: 'today'; title: string; total: number; totalLabel: string;
      rows: { name: string; rounds: string; doubled: boolean; gain: number }[];
      empty: string | null; more: string | null; streakNote: string | null;
    }
  | { kind: 'reco'; title: string; hint: string; cards: HeroCard[] }
  | { kind: 'practices'; title: string; cards: HeroCard[] }
  | {
      kind: 'favourites'; title: string; allLabel: string;
      /** Разделы как у `CategorySections rows={1}`: адреса плиток в порядке показа, всего в разделе, «ещё N ›». */
      sections: { category: string; total: number; routes: string[]; more: string | null }[];
    };

export interface HomeModel {
  v: 1;
  profileId: string;
  background: { image: string | null; tint: string; veil: string | null };
  toasts: {
    streak: { text: string; bg: string; fg: string } | null;
    wager: { text: string; emoji: string; bg: string } | null;
    levelUp: { title: string; sub: string } | null;
  };
  header: {
    logo: string | null;
    logoPlate: string;
    tokens: number;
    level: string;
    streak: number;
    streakLabel: string;
    friendsLabel: string;
    league: number | null;
    leaguesLabel: string;
    pet: PetRenderSpec | null;
    petLabel: string;
    chip: { name: string; image: string | null; emoji: string; bg: string; border: string; borderWidth: number };
    title: string | null;
    onPhoto: boolean;
    achievements: number;
    labels: { achievements: string; shop: string; statistics: string; settings: string };
    subtitle: string;
    update: { text: string } | null;
  };
  blocks: HomeBlock[];
  goalSheet: {
    pet: PetRenderSpec | null;
    line: string;
    options: { days: number; text: string; why: string | null; chosen: boolean }[];
    today: string;
    skip: string;
  } | null;
}

/** Адрес с параметрами — как `router.push({ pathname, params })`. */
export function hrefOf(pathname: string, params?: Record<string, string | number | undefined>): string {
  const q = Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `${pathname}?${q}` : pathname;
}

export interface HomeModelInput {
  t: T;
  profile: { id: string; color: string; emoji: string; warmup_enabled?: boolean };
  colors: { background: string; primary: string; surface: string; text: string; textSecondary: string };
  showBlock: (key: string) => boolean;
  profileBg: unknown;
  logo: unknown;
  logoPlate: string;
  tokens: number;
  level: { level: number; span: number | null; progress: number; titleKey: string };
  streak: number;
  pet: PetRenderSpec | null;
  chipImage: unknown;
  frameColor: string | null;
  titleLabel: string | null;
  achievementsCount: number;
  update: string | null;
  streakToast: number | null;
  wagerToast: { kind: 'won' | 'lost'; amount: number } | null;
  levelUp: number | null;
  ladder: { n: number; titleKey: string } | null;
  chest: { face: string | null; left: number; have: number; all: number; ratio: number };
  resume: GameConfig | null;
  goalCard: { state: string; goal: { text: string; outcome?: string | null; reward?: number | null } | null };
  goalMaxLen: number;
  goalExampleKeys: readonly string[];
  today: { rows: { game: string; rounds: number; doubled: boolean; total: number }[]; total: number; rounds: number; dayStreak: number };
  todayRowsMax: number;
  dayStreakForMult: number;
  gameName: (id: string) => string | null;
  reco: { pick: { gameId: string; reasonKey: string; doneToday?: boolean }; game: GameConfig }[];
  recoParams: Record<string, string>;
  warmup: { gradient: [string, string]; image: unknown; slotKey: string } | null;
  pause: { gradient: [string, string] };
  challenge: { game: GameConfig; difficultyKey: string; done: boolean; streak: number };
  /** Любимые разделы, уже нарезанные (`groupBySection` + `sectionCols`). */
  favourites: { category: string; total: number; routes: string[]; hidden: number }[];
  goalSheet: {
    line: string; petState: PetRenderSpec | null; options: readonly number[]; chosen: number;
    whyKey: string | null; basis: number | null; games: number; tokens: number; streak: number;
  } | null;
}

const withN = (s: string, n: number | string) => s.replace('{n}', String(n));

export function buildHomeModel(i: HomeModelInput): HomeModel {
  const { t } = i;
  const onPhoto = i.profileBg !== undefined && i.profileBg !== null;
  const blocks: HomeBlock[] = [];

  blocks.push({ kind: 'search', placeholder: t('catalogSearch'), button: `${t('tabGames')} · ${t('catalogFilter')}` });

  if (i.ladder) {
    blocks.push({ kind: 'ladder', text: t('ladderNext').replace('{n}', String(i.ladder.n)).replace('{what}', t(i.ladder.titleKey)) });
  }

  const chestText = i.chest.face
    ? t('chestToNext').replace('{n}', String(i.chest.left)).replace('{have}', String(i.chest.have)).replace('{all}', String(i.chest.all))
    : t('chestFull');
  blocks.push({ kind: 'chest', face: i.chest.face ?? '🏆', text: chestText, ratio: i.chest.ratio, label: `${chestText} — ${t('collectionOpen')}` });

  if (i.resume) {
    const title = t('resumeGameTitle').replace('{game}', t(i.resume.nameKey));
    blocks.push({
      kind: 'resume', title, sub: t(i.resume.skillKey),
      gradient: [i.resume.gradient[0], i.resume.gradient[i.resume.gradient.length - 1]], href: i.resume.route, label: title,
    });
  }

  if (i.showBlock('цель_дня') && i.goalCard.state !== 'hidden') {
    const g = i.goalCard.goal;
    const keys = ['dayGoalTitle', 'dayGoalCloseA11y', 'dayGoalAsk', 'dayGoalSave', 'dayGoalAskHint', 'dayGoalPlaceholder',
      'notNow', 'dayGoalExamplesTitle', 'dayGoalTodayLine', 'dayGoalRoundsNone', 'dayGoalReview', 'dayGoalYes', 'dayGoalNo',
      'dayGoalDoneNote', 'dayGoalMissedNote', 'dayGoalRewardNeedsRound'];
    const texts: Record<string, string> = Object.fromEntries(keys.map((k) => [k, t(k)]));
    texts.rounds = withN(t('dayGoalRounds'), i.today.rounds);
    texts.rewardNote = withN(t('dayGoalRewardNote'), g?.reward ?? 0);
    texts.yesFg = textOn('#22c55e');
    blocks.push({
      kind: 'goal', state: i.goalCard.state as 'ask' | 'active' | 'review' | 'closed',
      goalText: g?.text ?? null, outcome: g?.outcome ?? null, reward: g?.reward ?? null,
      roundsToday: i.today.rounds, maxLen: i.goalMaxLen, texts, examples: i.goalExampleKeys.map((k) => `— ${t(k)}`),
    });
  }

  if (i.showBlock('сегодня')) {
    blocks.push({
      kind: 'today', title: t('today'), total: i.today.total, totalLabel: `${t('todayEarnedTitle')}: ${i.today.total}`,
      rows: i.today.rows.slice(0, i.todayRowsMax).map((r) => ({
        name: i.gameName(r.game) ?? r.game, rounds: withN(t('todayRoundsLabel'), r.rounds), doubled: !!r.doubled, gain: r.total,
      })),
      empty: i.today.rows.length === 0 ? t('todayEmptyHint') : null,
      more: i.today.rows.length > i.todayRowsMax ? withN(t('todayMore'), i.today.rows.length - i.todayRowsMax) : null,
      streakNote: i.today.rows.length > 0 && i.today.dayStreak >= i.dayStreakForMult ? withN(t('todayStreakNote'), i.today.dayStreak) : null,
    });
  }

  if (i.reco.length > 0 && i.showBlock('рекомендации')) {
    blocks.push({
      kind: 'reco', title: t('recoTitle'), hint: t('recoHint'),
      cards: i.reco.map(({ pick, game }) => {
        const why = pick.doneToday ? 'recoDoneToday' : pick.reasonKey;
        const g: [string, string] = [game.gradient[0], game.gradient[game.gradient.length - 1]];
        const look = onLook(g[0], g[1]);
        return {
          id: pick.gameId, href: hrefOf(game.route, i.recoParams), gradient: g, look,
          icon: { ion: game.icon, size: 26 },
          chip: pick.doneToday ? '✓' : null, chipBg: look.scrim35,
          title: t(game.nameKey), sub: t(why),
          cta: { ion: 'play', text: t(pick.doneToday ? 'ctaRepeat' : 'ctaStart'), bg: look.scrim35, fg: look.fg },
          label: `${t(game.nameKey)} — ${t(why)}`,
        };
      }),
    });
  }

  if (i.showBlock('практики')) {
    const cards: HeroCard[] = [];
    if (i.warmup) {
      const look = onLook(i.warmup.gradient[0], i.warmup.gradient[1]);
      const slot = i.warmup.slotKey;
      cards.push({
        id: 'warmup', href: '/warmup-picker', gradient: i.warmup.gradient, look,
        icon: { image: assetUri(i.warmup.image), size: 30 },
        chip: i.streak > 0 ? `🔥${i.streak}` : null, chipBg: look.scrim20,
        title: t('warmupPickerTitle'), sub: `${t(slot)} · ${t(slot + 'Desc')}`,
        cta: { ion: 'chevron-forward', text: t('ctaChoose'), bg: look.scrim35, fg: look.fg },
        label: t('warmupPickerTitle'),
      });
    }
    const pl = onLook(i.pause.gradient[0], i.pause.gradient[1]);
    cards.push({
      id: 'pause', href: '/games/pause', gradient: i.pause.gradient, look: pl,
      icon: { ion: 'leaf-outline', size: 26 }, chip: null, chipBg: pl.scrim20,
      title: t('pause'), sub: t('pauseDesc'),
      cta: { ion: 'play', text: t('ctaStart'), bg: '#FFF', fg: '#185a9d' },
      label: t('pause'),
    });
    const cg: [string, string] = [i.challenge.game.gradient[0], i.challenge.game.gradient[i.challenge.game.gradient.length - 1]];
    const cl = onLook(cg[0], cg[1]);
    cards.push({
      id: 'challenge', href: null, action: 'challenge', gradient: cg, look: cl,
      icon: { ion: 'flash', size: 26 }, chip: i.challenge.done ? '✓' : `🔥${i.challenge.streak}`, chipBg: cl.scrim35,
      title: t('dailyChallenge'), sub: `${t(i.challenge.game.nameKey)} · ${t(i.challenge.difficultyKey)}`,
      cta: { ion: 'play', text: t(i.challenge.done ? 'ctaRepeat' : 'ctaStart'), bg: cl.scrim35, fg: cl.fg },
      label: t('dailyChallenge'),
    });
    blocks.push({ kind: 'practices', title: t('practicesTitle'), cards });
  }

  if (i.favourites.length > 0 && i.showBlock('любимые_разделы')) {
    blocks.push({
      kind: 'favourites', title: t('favouriteSections'), allLabel: `${t('allGames')} ›`,
      sections: i.favourites.map((f) => ({
        category: f.category, total: f.total, routes: f.routes, more: f.hidden > 0 ? withN(t('andMore'), f.hidden) : null,
      })),
    });
  }

  const sheet = i.goalSheet;
  return {
    v: 1,
    profileId: i.profile.id,
    background: {
      image: onPhoto ? assetUri(i.profileBg) : null,
      tint: i.colors.primary + (onPhoto ? '2E' : '4D'),
      veil: onPhoto ? i.colors.background : null,
    },
    toasts: {
      streak: i.streakToast !== null ? { text: `+${i.streakToast} ⭐`, bg: '#ef4444', fg: textOn('#ef4444') } : null,
      wager: i.wagerToast
        ? {
            text: t(i.wagerToast.kind === 'won' ? 'wagerWonToast' : 'wagerLostToast').replace('{n}', String(i.wagerToast.amount)),
            emoji: i.wagerToast.kind === 'won' ? '🏆' : '💸',
            bg: i.wagerToast.kind === 'won' ? '#22c55e' : '#475569',
          }
        : null,
      levelUp: i.levelUp !== null ? { title: `${t('level')} ${i.levelUp}!`, sub: t(i.level.titleKey) } : null,
    },
    header: {
      logo: assetUri(i.logo),
      logoPlate: i.logoPlate,
      tokens: i.tokens,
      level: `Lv ${i.level.level}`,
      streak: i.streak,
      streakLabel: `${t('streakLabel')}: ${i.streak}`,
      friendsLabel: t('friendsTitle'),
      league: i.level.span !== null ? i.level.progress : null,
      leaguesLabel: t('leaguesTitle'),
      pet: i.pet,
      petLabel: t('petSynapse'),
      chip: {
        name: t('profileName_' + i.profile.id),
        image: assetUri(i.chipImage),
        emoji: i.profile.emoji,
        bg: onPhoto ? i.colors.surface + 'F2' : i.profile.color + '22',
        border: i.frameColor ?? i.profile.color + '88',
        borderWidth: i.frameColor ? 2.5 : 1.5,
      },
      title: i.titleLabel,
      onPhoto,
      achievements: i.achievementsCount,
      labels: { achievements: t('achievementsTitle'), shop: t('shop'), statistics: t('statistics'), settings: t('settings') },
      subtitle: `${t('trainYourBrain')} · ${t('homeSwitchHint')}`,
      update: i.update ? { text: `${t('updAvailable')} v${i.update} · ${t('updDownload')}` } : null,
    },
    blocks,
    goalSheet: sheet
      ? {
          pet: sheet.petState,
          line: sheet.line,
          options: sheet.options.map((d) => ({
            days: d,
            text: withN(t('goalSheetDays'), d),
            why: d === sheet.chosen && sheet.whyKey !== null && sheet.basis !== null ? withN(t(sheet.whyKey), sheet.basis) : null,
            chosen: d === sheet.chosen,
          })),
          today: t('goalSheetToday').replace('{g}', String(sheet.games)).replace('{p}', String(sheet.tokens)).replace('{s}', String(sheet.streak)),
          skip: t('notNow'),
        }
      : null,
  };
}
