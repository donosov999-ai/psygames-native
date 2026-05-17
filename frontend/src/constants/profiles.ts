/**
 * E1 — Profile gating × 5
 *
 * 5 user profiles each with their own:
 *   - allowed_games (whitelist) — каталог фильтруется на главной
 *   - morning playlists (per weekday) — Утренняя Зарядка под профиль
 *   - color/avatar — для UI
 *   - assessment/streak/history isolated by `person` field in cognitive_sessions
 *
 * Person identifier is used in localStorage namespacing AND Supabase rows
 * (column `person`).
 */

import { GAMES } from '@/src/constants/games';
import type { PlaylistStep, Weekday } from '@/src/services/warmup';

export type ProfileId = 'denis' | 'alex' | 'valya' | 'yulya' | 'guest';

export interface ProfileDef {
  id: ProfileId;
  person: string;             // exactly the value stored in cognitive_sessions.person
  display_name: string;
  emoji: string;
  color: string;
  description: string;
  allowed_games: 'all' | string[];   // 'all' = no filter, otherwise whitelist of game_ids
  custom_playlists?: Partial<Record<Weekday, PlaylistStep[]>>;
  warmup_enabled: boolean;
  financial_brain_day_enabled: boolean;
  assessment_enabled: boolean;
}

// ─── Денис: full access (default) ────────────────────────────────────────

const DENIS: ProfileDef = {
  id: 'denis',
  person: 'Денис',
  display_name: 'Денис',
  emoji: '👨‍💼',
  color: '#fbbf24',
  description: 'Бизнес/инжиниринг · 44 игры · 3 спец-режима',
  allowed_games: 'all',
  warmup_enabled: true,
  financial_brain_day_enabled: true,
  assessment_enabled: true,
  // custom_playlists: undefined → use default morning playlists
};

// ─── Алекс (7 лет): kid-safe ────────────────────────────────────────────

const ALEX_SAFE_GAMES = [
  'picture_pairs', 'find_differences', 'word_pairs',
  'memory_matrix', 'corsi', 'digit_span',
  'schulte_table', 'pattern',
  'hanoi', 'math_sprint', 'choice_rt', 'targets',
];

const ALEX: ProfileDef = {
  id: 'alex',
  person: 'Алекс',
  display_name: 'Алекс',
  emoji: '👦',
  color: '#22c55e',
  description: '7 лет · 12 безопасных игр · 3-4 мин зарядка',
  allowed_games: ALEX_SAFE_GAMES,
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: false,    // assessment battery has CPT/N-back/BART — not for kid
  custom_playlists: {
    1: [   // ПН
      { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'easy', mode: '4x4',          est_duration_sec: 50 },
      { game_id: 'picture_pairs',  game_route: '/games/picture-pairs',   difficulty: 'easy', mode: '6 pairs',      est_duration_sec: 70 },
      { game_id: 'word_pairs',     game_route: '/games/word-pairs',      difficulty: 'easy', mode: '4 pairs',      est_duration_sec: 60 },
      { game_id: 'math_sprint',    game_route: '/games/math-sprint',     difficulty: 'easy', mode: '30s',          est_duration_sec: 35 },
    ],
    2: [   // ВТ
      { game_id: 'find_differences',game_route: '/games/find-differences',difficulty: 'easy', mode: '4 diffs',      est_duration_sec: 90 },
      { game_id: 'digit_span',     game_route: '/games/digit-span',      difficulty: 'easy', mode: 'forward',      est_duration_sec: 60 },
      { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'easy', trials: 5,            est_duration_sec: 70 },
      { game_id: 'choice_rt',      game_route: '/games/choice-rt',       difficulty: 'easy', trials: 10, mode: '2dir', est_duration_sec: 40 },
    ],
    3: [],    // СР rest
    4: [   // ЧТ
      { game_id: 'corsi',          game_route: '/games/corsi',           difficulty: 'easy', mode: 'forward',      est_duration_sec: 60 },
      { game_id: 'memory_matrix',  game_route: '/games/memory-matrix',   difficulty: 'easy', mode: '3x3',          est_duration_sec: 60 },
      { game_id: 'hanoi',          game_route: '/games/hanoi',           difficulty: 'easy', mode: '3 disks',      est_duration_sec: 90 },
      { game_id: 'math_sprint',    game_route: '/games/math-sprint',     difficulty: 'easy', mode: '30s',          est_duration_sec: 35 },
    ],
    5: [   // ПТ
      { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'easy', trials: 5,            est_duration_sec: 70 },
      { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'easy', mode: '4x4',          est_duration_sec: 50 },
      { game_id: 'picture_pairs',  game_route: '/games/picture-pairs',   difficulty: 'easy', mode: '6 pairs',      est_duration_sec: 70 },
      { game_id: 'targets',        game_route: '/games/targets',         difficulty: 'easy', mode: '30s',          est_duration_sec: 35 },
    ],
    6: [   // СБ
      { game_id: 'hanoi',          game_route: '/games/hanoi',           difficulty: 'easy', mode: '3 disks',      est_duration_sec: 90 },
      { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'easy', trials: 5,            est_duration_sec: 70 },
      { game_id: 'corsi',          game_route: '/games/corsi',           difficulty: 'easy', mode: 'forward',      est_duration_sec: 60 },
      { game_id: 'word_pairs',     game_route: '/games/word-pairs',      difficulty: 'easy', mode: '4 pairs',      est_duration_sec: 60 },
    ],
    0: [],    // ВС rest (играет с папой в Go)
  },
};

// ─── Валя: курс/тексты/память ───────────────────────────────────────────

const VALYA_GAMES = [
  // memory + verbal — её приоритет (писала курс)
  'word_pairs', 'mnemonics', 'reading_span', 'story_recall', 'phonemic_fluency', 'anagrams',
  // attention для собранности
  'schulte_table', 'find_differences', 'visual_search',
  // social для отношений и преподавания
  'rmet', 'stroop_emotional',
  // logic общая
  'pattern', 'set_game', 'mental_rotation', 'sudoku',
  // workout
  'memory_matrix', 'picture_pairs', 'corsi', 'digit_span',
  // light control
  'stroop', 'go_no_go', 'flanker',
  // math/speed light
  'math_sprint', 'number_bonds', 'choice_rt', 'targets',
];

const VALYA: ProfileDef = {
  id: 'valya',
  person: 'Валя',
  display_name: 'Валя',
  emoji: '💃',
  color: '#ec4899',
  description: 'Курс/тексты/отношения · акцент memory + verbal + social',
  allowed_games: VALYA_GAMES,
  warmup_enabled: true,
  financial_brain_day_enabled: false,   // не её домен
  assessment_enabled: true,
  custom_playlists: {
    1: [   // ПН — мягкий вход
      { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'easy',   mode: '5x5',          est_duration_sec: 60 },
      { game_id: 'word_pairs',     game_route: '/games/word-pairs',      difficulty: 'easy',   mode: '6 pairs',      est_duration_sec: 90 },
      { game_id: 'math_sprint',    game_route: '/games/math-sprint',     difficulty: 'easy',   mode: '30s',          est_duration_sec: 35 },
    ],
    2: [   // ВТ — память
      { game_id: 'mnemonics',      game_route: '/games/mnemonics',       difficulty: 'medium', mode: 'words',        est_duration_sec: 120 },
      { game_id: 'corsi',          game_route: '/games/corsi',           difficulty: 'medium', mode: 'forward',      est_duration_sec: 80 },
      { game_id: 'phonemic_fluency',game_route: '/games/phonemic-fluency',difficulty: 'medium', mode: '60s',          est_duration_sec: 70 },
    ],
    3: [],   // СР rest
    4: [   // ЧТ — verbal/social
      { game_id: 'reading_span',   game_route: '/games/reading-span',    difficulty: 'medium', mode: '3-set',        est_duration_sec: 120 },
      { game_id: 'rmet',           game_route: '/games/rmet',            difficulty: 'medium', mode: '9t',           est_duration_sec: 90 },
      { game_id: 'find_differences',game_route: '/games/find-differences',difficulty: 'easy',   mode: '4 diffs',      est_duration_sec: 90 },
    ],
    5: [   // ПТ — внимание + control
      { game_id: 'visual_search',  game_route: '/games/visual-search',   difficulty: 'easy',   trials: 5,            est_duration_sec: 80 },
      { game_id: 'stroop_emotional',game_route: '/games/stroop-emotional',difficulty: 'medium', trials: 18,           est_duration_sec: 100 },
      { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'easy',   trials: 5,            est_duration_sec: 70 },
    ],
    6: [   // СБ — logic
      { game_id: 'sudoku',         game_route: '/games/sudoku',          difficulty: 'easy',   mode: '6x6',          est_duration_sec: 240 },
      { game_id: 'set_game',       game_route: '/games/set-game',        difficulty: 'medium', trials: 6,            est_duration_sec: 120 },
      { game_id: 'story_recall',   game_route: '/games/story-recall',    difficulty: 'medium', mode: 'standard',     est_duration_sec: 240 },
    ],
    0: [],   // ВС rest
  },
};

// ─── Юля: гибкий default (без специфической стратегии — общая поддержка) ─

const YULYA_GAMES = [
  'word_pairs', 'mnemonics', 'memory_matrix', 'picture_pairs', 'corsi', 'digit_span',
  'schulte_table', 'proofreading', 'find_differences', 'visual_search',
  'pattern', 'set_game', 'mental_rotation', 'sudoku', 'anagrams',
  'stroop', 'go_no_go', 'flanker', 'switching_task',
  'math_sprint', 'number_bonds', 'counter',
  'choice_rt', 'targets', 'sdmt',
  'phonemic_fluency', 'rmet', 'story_recall',
];

const YULYA: ProfileDef = {
  id: 'yulya',
  person: 'Юля',
  display_name: 'Юля',
  emoji: '🌸',
  color: '#a855f7',
  description: 'Общий тренинг мозга · сбалансированная программа',
  allowed_games: YULYA_GAMES,
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
  // custom_playlists: undefined → uses default Денис's playlists (но с фильтром по allowed_games)
};

// ─── Гость: minimal demo ────────────────────────────────────────────────

const GUEST: ProfileDef = {
  id: 'guest',
  person: 'Гость',
  display_name: 'Гость',
  emoji: '👤',
  color: '#94a3b8',
  description: 'Demo · только базовые игры из каталога',
  allowed_games: [
    'schulte_table', 'word_pairs', 'mnemonics', 'counter', 'proofreading', 'targets',
    'picture_pairs', 'find_differences', 'pattern',
  ],
  warmup_enabled: false,
  financial_brain_day_enabled: false,
  assessment_enabled: false,
};

export const PROFILES: ProfileDef[] = [DENIS, ALEX, VALYA, YULYA, GUEST];
export const PROFILE_BY_ID: Record<ProfileId, ProfileDef> = PROFILES.reduce((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {} as Record<ProfileId, ProfileDef>);

export function isGameAllowed(profile: ProfileDef, gameId: string): boolean {
  if (profile.allowed_games === 'all') return true;
  return profile.allowed_games.includes(gameId);
}

export function filterAllowedGames(profile: ProfileDef) {
  if (profile.allowed_games === 'all') return GAMES;
  return GAMES.filter(g => (profile.allowed_games as string[]).includes(g.id));
}
