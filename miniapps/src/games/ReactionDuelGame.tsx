import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { median } from '../lib/engine';
import type { GameProps } from '../types';

type Phase = 'waiting' | 'ready' | 'feedback';

export default function ReactionDuelGame({ fastMode, challenge, onFinish, onExit }: GameProps) {
  const total = fastMode ? 2 : 5;
  const [phase, setPhase] = useState<Phase>('waiting');
  const [trial, setTrial] = useState(1);
  const [times, setTimes] = useState<number[]>([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const [message, setMessage] = useState('Wait for the flash');
  const readyAt = useRef(0);
  const timerRef = useRef<number | null>(null);

  const arm = () => {
    setPhase('waiting');
    setMessage('Wait for the flash');
    const delay = fastMode ? 180 : 900 + Math.random() * 1800;
    timerRef.current = window.setTimeout(() => {
      readyAt.current = performance.now();
      setPhase('ready');
      setMessage('TAP!');
    }, delay);
  };

  useEffect(() => {
    arm();
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (finalTimes: number[], falseCount: number) => {
    const base = median(finalTimes);
    const adjusted = Math.round(base + falseCount * 120);
    const beat = challenge === undefined ? '' : adjusted < challenge ? ' I already beat your score.' : ` I am close to ${challenge} ms.`;
    onFinish({
      score: Math.max(0, 1000 - adjusted),
      primary: `${adjusted} ms`,
      primaryLabel: falseCount ? 'median with penalty' : 'median reaction time',
      secondary: `${Math.round(Math.min(...finalTimes))} ms`,
      secondaryLabel: 'best tap',
      errors: falseCount,
      challengeValue: adjusted,
      shareText: `My reaction time is ${adjusted} ms.${beat} Can you beat it?`,
      details: { medianMs: Math.round(base), falseStarts: falseCount, trials: finalTimes.length },
    });
  };

  const press = () => {
    if (phase === 'feedback') return;
    if (phase === 'waiting') {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const nextFalse = falseStarts + 1;
      setFalseStarts(nextFalse);
      setPhase('feedback');
      setMessage('Too early · +120 ms');
      timerRef.current = window.setTimeout(arm, fastMode ? 120 : 700);
      return;
    }
    const reaction = Math.max(1, Math.round(performance.now() - readyAt.current));
    const finalTimes = [...times, reaction];
    setTimes(finalTimes);
    setPhase('feedback');
    setMessage(`${reaction} ms`);
    if (trial >= total) {
      timerRef.current = window.setTimeout(() => finish(finalTimes, falseStarts), fastMode ? 80 : 650);
    } else {
      setTrial((value) => value + 1);
      timerRef.current = window.setTimeout(arm, fastMode ? 100 : 650);
    }
  };

  return (
    <GameStage
      title="Reaction Duel"
      kicker={challenge ? `Friend’s target · ${challenge} ms` : 'Async challenge'}
      stats={[{ label: 'Attempt', value: `${trial}/${total}` }, { label: 'Early taps', value: falseStarts }]}
      progress={(trial - 1 + (phase === 'feedback' ? 1 : 0)) / total}
      footer={<button className="text-button" type="button" onClick={onExit}>Exit</button>}
      live={message}
    >
      <button className={`reaction-field ${phase}`} type="button" onClick={press}>
        <span className="reaction-pulse" />
        <strong>{message}</strong>
        <small>{phase === 'waiting' ? 'do not tap yet' : phase === 'ready' ? 'tap the screen' : 'preparing the next attempt'}</small>
      </button>
    </GameStage>
  );
}
