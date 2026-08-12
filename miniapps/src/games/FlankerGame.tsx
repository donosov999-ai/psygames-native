import { useEffect, useRef, useState } from 'react';
import { ChoiceButtons, GameStage } from '../components/GameStage';
import { makeFlankerTrial, mean, type FlankerTrial } from '../lib/engine';
import type { GameProps } from '../types';

const arrow = (direction: 'left' | 'right') => direction === 'left' ? '←' : '→';

interface FlankerStats {
  hits: number;
  errors: number;
  times: number[];
}

export default function FlankerGame({ fastMode, onFinish, onExit }: GameProps) {
  const duration = fastMode ? 3_000 : 60_000;
  const durationSeconds = Math.round(duration / 1000);
  const initialTrial = useRef<FlankerTrial>(makeFlankerTrial());
  const [trial, setTrial] = useState<FlankerTrial>(initialTrial.current);
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [locked, setLocked] = useState(false);
  const startedAt = useRef(performance.now());
  const shownAt = useRef(performance.now());
  const finished = useRef(false);
  const trialTimeout = useRef<number | null>(null);
  const trialRef = useRef(initialTrial.current);
  const lockedRef = useRef(false);
  const statsRef = useRef<FlankerStats>({ hits: 0, errors: 0, times: [] });

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    lockedRef.current = true;
    setLocked(true);
    if (trialTimeout.current !== null) window.clearTimeout(trialTimeout.current);
    const { hits: finalHits, errors: finalErrors, times } = statsRef.current;
    const average = Math.round(mean(times));
    const total = finalHits + finalErrors;
    const accuracy = total ? finalHits / total : 0;
    onFinish({
      score: Math.max(0, Math.round(finalHits * 80 - finalErrors * 60 - average * 0.05)),
      primary: `${finalHits}`,
      primaryLabel: `correct answers in ${durationSeconds} seconds`,
      secondary: `${Math.round(accuracy * 100)}%`,
      secondaryLabel: `accuracy · ${average || 0} ms`,
      errors: finalErrors,
      challengeValue: finalHits * 10 - finalErrors,
      shareText: `Focus Defender: ${finalHits} correct answers in ${durationSeconds} seconds, ${finalErrors} errors. Can you stay focused longer?`,
      details: { hits: finalHits, errors: finalErrors, averageMs: average },
    });
  };

  const nextTrial = () => {
    if (finished.current) return;
    const next = makeFlankerTrial();
    trialRef.current = next;
    setTrial(next);
    shownAt.current = performance.now();
    lockedRef.current = false;
    setLocked(false);
    trialTimeout.current = window.setTimeout(() => {
      if (finished.current) return;
      const current = statsRef.current;
      const nextStats = { ...current, errors: current.errors + 1 };
      statsRef.current = nextStats;
      setErrors(nextStats.errors);
      nextTrial();
    }, fastMode ? 420 : 1600);
  };

  useEffect(() => {
    startedAt.current = performance.now();
    nextTrial();
    const ticker = window.setInterval(() => {
      const remaining = Math.max(0, duration - (performance.now() - startedAt.current));
      setTimeLeft(remaining);
      if (remaining <= 0) finish();
    }, 50);
    return () => {
      window.clearInterval(ticker);
      if (trialTimeout.current !== null) window.clearTimeout(trialTimeout.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (choice: string) => {
    if (lockedRef.current || finished.current) return;
    lockedRef.current = true;
    setLocked(true);
    if (trialTimeout.current !== null) window.clearTimeout(trialTimeout.current);
    const correct = choice === trialRef.current.center;
    const rt = performance.now() - shownAt.current;
    const current = statsRef.current;
    const nextStats: FlankerStats = {
      hits: current.hits + (correct ? 1 : 0),
      errors: current.errors + (correct ? 0 : 1),
      times: correct ? [...current.times, rt] : current.times,
    };
    statsRef.current = nextStats;
    setHits(nextStats.hits);
    setErrors(nextStats.errors);
    trialTimeout.current = window.setTimeout(nextTrial, fastMode ? 35 : 150);
  };

  const symbols = trial.kind === 'neutral'
    ? ['·', '·', arrow(trial.center), '·', '·']
    : [arrow(trial.flankers![0]), arrow(trial.flankers![1]), arrow(trial.center), arrow(trial.flankers![2]), arrow(trial.flankers![3])];

  return (
    <GameStage
      title="Focus Defender"
      kicker="Watch only the center arrow"
      stats={[{ label: 'Time left', value: `${(timeLeft / 1000).toFixed(1)} s` }, { label: 'Correct', value: hits }, { label: 'Errors', value: errors }]}
      progress={1 - timeLeft / duration}
      footer={<button className="text-button" type="button" onClick={onExit}>Exit</button>}
    >
      <div className="flanker-stimulus" aria-label={`The center arrow points ${trial.center}`}>
        {symbols.map((symbol, index) => <span className={index === 2 ? 'center' : ''} key={`${symbol}-${index}`}>{symbol}</span>)}
      </div>
      <ChoiceButtons disabled={locked} choices={[{ id: 'left', label: '←', ariaLabel: 'Left' }, { id: 'right', label: '→', ariaLabel: 'Right' }]} onChoose={answer} />
    </GameStage>
  );
}
