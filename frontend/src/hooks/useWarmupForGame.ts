/**
 * Hook для интеграции игры в Утреннюю Зарядку.
 *
 * Использование в каждой игре:
 *
 *   const warmup = useWarmupForGame('n_back', {
 *     onConfigured: ({ difficulty, trials, mode }) => {
 *       setDifficulty(difficulty);
 *       if (trials) setTrials(trials);
 *       setPhase('playing');
 *     }
 *   });
 *
 *   // в saveSession:
 *   await saveSession({...});
 *   if (warmup.isWarmup) {
 *     await warmup.recordAndAdvance({game_type, score, time_seconds, errors, details});
 *   }
 */

import { useEffect, useRef } from 'react';
import { useWarmup, StepResult } from '@/src/contexts/WarmupContext';

export function useWarmupForGame(
  gameId: string,
  opts: {
    onConfigured: (cfg: { difficulty: 'easy' | 'medium' | 'hard'; trials?: number; mode?: string }) => void;
  }
) {
  const warmup = useWarmup();
  const isWarmup = warmup.active && warmup.currentStep?.game_id === gameId;
  const appliedRef = useRef(false);

  useEffect(() => {
    if (isWarmup && !appliedRef.current && warmup.currentStep) {
      appliedRef.current = true;
      // small delay to let the game initialize its useState first
      setTimeout(() => {
        opts.onConfigured({
          difficulty: warmup.currentStep!.difficulty,
          trials: warmup.currentStep!.trials,
          mode: warmup.currentStep!.mode,
        });
      }, 50);
    }
  }, [isWarmup]);

  return {
    isWarmup,
    step: warmup.currentStep,
    async recordAndAdvance(result: StepResult) {
      await warmup.recordResult(result);
      warmup.advanceToNext();
    },
  };
}
