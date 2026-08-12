import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { shuffle } from '../lib/engine';
import type { GameProps } from '../types';

export default function SchulteGame({ onFinish, onExit }: GameProps) {
  const [grid] = useState(() => shuffle(Array.from({ length: 25 }, (_, index) => index + 1)));
  const [target, setTarget] = useState(1);
  const [errors, setErrors] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(performance.now());

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((performance.now() - startedAt.current) / 1000), 100);
    return () => window.clearInterval(timer);
  }, []);

  const tap = (value: number) => {
    if (value !== target) {
      setErrors((count) => count + 1);
      return;
    }
    if (value < 25) {
      setTarget(value + 1);
      return;
    }
    const finalTime = (performance.now() - startedAt.current) / 1000;
    const rounded = Number(finalTime.toFixed(1));
    onFinish({
      score: Math.max(0, Math.round(1000 - finalTime * 12 - errors * 45)),
      primary: `${rounded.toFixed(1)} s`,
      primaryLabel: '5×5 table time',
      secondary: `${25 - errors} / 25`,
      secondaryLabel: 'accuracy',
      errors,
      challengeValue: rounded,
      shareText: `I completed the 5×5 Schulte table in ${rounded.toFixed(1)} s. Can you beat my time?`,
      details: { grid: '5x5', elapsed: rounded },
    });
  };

  return (
    <GameStage
      title="Schulte Speed"
      kicker="Find the next number"
      stats={[{ label: 'Target', value: target }, { label: 'Time', value: `${elapsed.toFixed(1)} s` }, { label: 'Errors', value: errors }]}
      progress={(target - 1) / 25}
      footer={<button className="text-button" type="button" onClick={onExit}>Exit</button>}
      live={`Next number: ${target}`}
    >
      <div className="schulte-grid" role="group" aria-label="5 by 5 Schulte table">
        {grid.map((value) => (
          <button
            className={`schulte-cell ${value < target ? 'done' : ''}`}
            disabled={value < target}
            key={value}
            type="button"
            onClick={() => tap(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </GameStage>
  );
}
