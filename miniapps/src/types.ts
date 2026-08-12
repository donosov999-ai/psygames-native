export type GameSlug =
  | '3-minute-brain-check'
  | 'schulte-speed'
  | 'reaction-duel'
  | 'memory-matrix'
  | 'stroop-challenge'
  | 'n-back-daily'
  | 'impulse-control'
  | 'tower-puzzle'
  | 'focus-defender';

export type PlatformId = 'web' | 'telegram' | 'vk' | 'ok' | 'facebook';

export interface GameDefinition {
  slug: GameSlug;
  order: number;
  name: string;
  eyebrow: string;
  hook: string;
  rule: string;
  distribution: string;
  platforms: PlatformId[];
  accent: string;
  accent2: string;
  glyph: string;
  lowerIsBetter?: boolean;
}

export interface DimensionScore {
  label: string;
  value: number;
}

export interface GameResultData {
  score: number;
  primary: string;
  primaryLabel: string;
  secondary?: string;
  secondaryLabel?: string;
  errors?: number;
  shareText: string;
  challengeValue?: number;
  dimensions?: DimensionScore[];
  details?: Record<string, string | number | boolean>;
}

export interface GameProps {
  fastMode: boolean;
  challenge?: number;
  onFinish: (result: GameResultData) => void;
  onExit: () => void;
}
