import type { PlaylistStep } from '@/src/services/warmup';

export interface WarmupPolicy {
  тихо: boolean;
  замены: Record<string, string[]>;
  по_профилям?: Record<string, Record<string, string[]>>;
  варианты: Record<string, PlaylistStep>;
  настройки: Record<string, NonNullable<PlaylistStep['settings']>>;
}
const owns = (r: object, key: string) => Object.prototype.hasOwnProperty.call(r, key);

/** Content (including exceptions) comes from the playlist; this is only the resolver. */
export function resolveQuietSteps(
  steps: readonly PlaylistStep[],
  policy: WarmupPolicy,
  profileId?: string,
  allow: (id: string) => boolean = () => true,
): PlaylistStep[] {
  if (!policy.тихо) return steps.filter(s => allow(s.game_id));
  const available = new Set(steps.filter(s => !owns(policy.замены, s.game_id)).map(s => s.game_id));
  const chosen = new Set<string>();
  return steps.flatMap((original) => {
    let step = original;
    if (owns(policy.замены, original.game_id)) {
      const order = [
        ...(profileId ? policy.по_профилям?.[profileId]?.[original.game_id] ?? [] : []),
        ...policy.замены[original.game_id]!,
      ];
      const options = order.map(key => policy.варианты[key]).filter(s => s
        && !owns(policy.замены, s.game_id) && allow(s.game_id));
      const replacement = options.find(s => !available.has(s.game_id) && !chosen.has(s.game_id))
        ?? options.find(s => !chosen.has(s.game_id)) ?? options[0];
      if (!replacement) return [];
      step = replacement;
    }
    if (!allow(step.game_id)) return [];
    chosen.add(step.game_id);
    const settings = owns(policy.настройки, step.game_id) ? policy.настройки[step.game_id] : undefined;
    return [settings ? { ...step, settings: { ...step.settings, ...settings } } : { ...step }];
  });
}
