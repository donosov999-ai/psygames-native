import { useEffect, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { hanoiOptimalMoves, moveDisc } from '../lib/engine';
import type { GameProps } from '../types';

export default function TowerGame({ fastMode, onFinish, onExit }: GameProps) {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const discs = fastMode ? 3 : 3 + (dayIndex % 3);
  const optimal = hanoiOptimalMoves(discs);
  const [pegs, setPegs] = useState<number[][]>(() => [Array.from({ length: discs }, (_, index) => discs - index), [], []]);
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [errors, setErrors] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt] = useState(() => performance.now());

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((performance.now() - startedAt) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const choosePeg = (pegIndex: number) => {
    if (selected === null) {
      if (pegs[pegIndex].length) setSelected(pegIndex);
      return;
    }
    if (selected === pegIndex) {
      setSelected(null);
      return;
    }
    const next = moveDisc(pegs, selected, pegIndex);
    if (!next) {
      setErrors((value) => value + 1);
      setSelected(null);
      return;
    }
    const nextMoves = moves + 1;
    setPegs(next);
    setMoves(nextMoves);
    setSelected(null);
    if (next[2].length === discs) {
      const finalTime = (performance.now() - startedAt) / 1000;
      const efficiency = Math.round((optimal / nextMoves) * 100);
      onFinish({
        score: Math.max(0, Math.round(efficiency * 10 - finalTime - errors * 20)),
        primary: `${efficiency}%`,
        primaryLabel: 'of the optimal solution',
        secondary: `${nextMoves} / ${optimal}`,
        secondaryLabel: 'moves · optimal',
        errors,
        challengeValue: efficiency,
        shareText: `Tower Puzzle: ${discs} discs in ${nextMoves} moves — ${efficiency}% optimal. Can you solve it in fewer moves?`,
        details: { discs, moves: nextMoves, optimal, seconds: Number(finalTime.toFixed(1)) },
      });
    }
  };

  return (
    <GameStage
      title="Tower Puzzle"
      kicker={`Daily puzzle · ${discs} discs`}
      stats={[{ label: 'Moves', value: `${moves}/${optimal}` }, { label: 'Time', value: `${elapsed.toFixed(1)} s` }, { label: 'Errors', value: errors }]}
      progress={Math.min(1, pegs[2].length / discs)}
      footer={<button className="text-button" type="button" onClick={onExit}>Exit</button>}
    >
      <div className="tower-board" aria-label="Tower of Hanoi">
        {pegs.map((peg, pegIndex) => (
          <button className={`tower-peg ${selected === pegIndex ? 'selected' : ''}`} key={pegIndex} type="button" onClick={() => choosePeg(pegIndex)} aria-label={`Peg ${pegIndex + 1}, ${peg.length} discs`}>
            <span className="peg-rod" />
            <span className="peg-discs">
              {peg.map((disc) => <span className="tower-disc" key={disc} style={{ width: `${34 + disc * (56 / discs)}%`, '--disc-index': disc } as React.CSSProperties} />)}
            </span>
          </button>
        ))}
      </div>
      <p className="field-hint">Select a peg with a disc, then choose its destination.</p>
    </GameStage>
  );
}
