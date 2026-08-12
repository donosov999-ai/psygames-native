import { useEffect, useMemo, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { pickUnique } from '../lib/engine';
import type { GameProps } from '../types';

type Phase = 'showing' | 'input' | 'feedback';

const roundConfig = (round: number) => ({
  size: round < 2 ? 3 : round < 4 ? 4 : 5,
  cells: round < 2 ? 3 + round : round < 4 ? 5 + (round - 2) : 7,
});

export default function MemoryMatrixGame({ fastMode, onFinish, onExit }: GameProps) {
  const rounds = fastMode ? 2 : 5;
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('showing');
  const [targets, setTargets] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [correctRounds, setCorrectRounds] = useState(0);
  const [errors, setErrors] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [streak, setStreak] = useState(0);
  const timerRef = useRef<number | null>(null);
  const config = useMemo(() => roundConfig(round), [round]);

  const schedule = (callback: () => void, delay: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(callback, delay);
  };

  const prepare = (nextRound: number) => {
    const nextConfig = roundConfig(nextRound);
    setTargets(pickUnique(nextConfig.size ** 2, nextConfig.cells));
    setSelected([]);
    setPhase('showing');
    schedule(() => setPhase('input'), fastMode ? 1_000 : Math.max(650, 1450 - nextRound * 130));
  };

  useEffect(() => {
    prepare(0);
    return () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (finalCorrect: number, finalErrors: number, finalBest: number) => {
    const maxSize = roundConfig(rounds - 1).size;
    const accuracy = finalCorrect / rounds;
    onFinish({
      score: Math.round(accuracy * 1000 + finalBest * 80),
      primary: `${maxSize}×${maxSize}`,
      primaryLabel: 'largest grid reached',
      secondary: `${finalBest} in a row`,
      secondaryLabel: 'best streak',
      errors: finalErrors,
      challengeValue: finalCorrect * 10 + finalBest,
      shareText: `I reached a ${maxSize}×${maxSize} grid in Memory Matrix with a best streak of ${finalBest}. Can you match it?`,
      details: { correctRounds: finalCorrect, rounds, accuracy: Math.round(accuracy * 100) },
    });
  };

  const choose = (cell: number) => {
    if (phase !== 'input' || selected.includes(cell)) return;
    const nextSelected = [...selected, cell];
    setSelected(nextSelected);
    if (nextSelected.length < targets.length) return;

    const hit = nextSelected.every((value) => targets.includes(value));
    const nextCorrect = correctRounds + (hit ? 1 : 0);
    const nextErrors = errors + (hit ? 0 : 1);
    const nextStreak = hit ? streak + 1 : 0;
    const nextBest = Math.max(bestStreak, nextStreak);
    setCorrectRounds(nextCorrect);
    setErrors(nextErrors);
    setStreak(nextStreak);
    setBestStreak(nextBest);
    setPhase('feedback');
    if (round + 1 >= rounds) {
      schedule(() => finish(nextCorrect, nextErrors, nextBest), fastMode ? 80 : 750);
    } else {
      const nextRound = round + 1;
      schedule(() => { setRound(nextRound); prepare(nextRound); }, fastMode ? 100 : 850);
    }
  };

  return (
    <GameStage
      title="Memory Matrix"
      kicker={phase === 'showing' ? 'Memorize' : phase === 'input' ? 'Recreate the pattern' : 'Checking'}
      stats={[{ label: 'Round', value: `${round + 1}/${rounds}` }, { label: 'Streak', value: streak }, { label: 'Errors', value: errors }]}
      progress={round / rounds}
      footer={<button className="text-button" type="button" onClick={onExit}>Exit</button>}
    >
      <div className={`matrix-grid phase-${phase}`} style={{ gridTemplateColumns: `repeat(${config.size}, 1fr)` }}>
        {Array.from({ length: config.size ** 2 }, (_, cell) => {
          const active = phase === 'showing' ? targets.includes(cell) : selected.includes(cell);
          const wrong = phase === 'feedback' && selected.includes(cell) && !targets.includes(cell);
          const missed = phase === 'feedback' && targets.includes(cell) && !selected.includes(cell);
          return <button aria-label={`Cell ${cell + 1}`} className={`matrix-cell ${active ? 'active' : ''} ${wrong ? 'wrong' : ''} ${missed ? 'missed' : ''}`} disabled={phase !== 'input'} key={cell} type="button" onClick={() => choose(cell)} />;
        })}
      </div>
    </GameStage>
  );
}
