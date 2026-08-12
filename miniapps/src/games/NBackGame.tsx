import { useEffect, useRef, useState } from 'react';
import { ChoiceButtons, GameStage } from '../components/GameStage';
import { makeNBackSequence, mean } from '../lib/engine';
import type { GameProps } from '../types';

export default function NBackGame({ fastMode, onFinish, onExit }: GameProps) {
  const n = 2;
  const total = fastMode ? 6 : 24;
  const [sequence] = useState(() => makeNBackSequence(total, n));
  const [index, setIndex] = useState(0);
  const [hits, setHits] = useState(0);
  const [correctRejects, setCorrectRejects] = useState(0);
  const [misses, setMisses] = useState(0);
  const [falseAlarms, setFalseAlarms] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const shownAt = useRef(performance.now());
  const timeoutRef = useRef<number | null>(null);

  const finish = (h: number, cr: number, m: number, fa: number, times: number[]) => {
    const correct = h + cr;
    const accuracy = correct / total;
    const average = Math.round(mean(times));
    onFinish({
      score: Math.max(0, Math.round(correct * 70 - (m + fa) * 40 - average * 0.03)),
      primary: `${Math.round(accuracy * 100)}%`,
      primaryLabel: `${n}‑back accuracy`,
      secondary: `${average || 0} ms`,
      secondaryLabel: 'average decision speed',
      errors: m + fa,
      challengeValue: Math.round(accuracy * 1000 - average / 20),
      shareText: `N‑Back Daily: level ${n}, ${Math.round(accuracy * 100)}% accuracy, streak active. Can you hold the sequence?`,
      details: { n, hits: h, correctRejects: cr, misses: m, falseAlarms: fa },
    });
  };

  const answer = (isMatch: boolean) => {
    if (locked) return;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setLocked(true);
    const target = sequence.targets[index];
    const rt = performance.now() - shownAt.current;
    const nextHits = hits + (target && isMatch ? 1 : 0);
    const nextCorrectRejects = correctRejects + (!target && !isMatch ? 1 : 0);
    const nextMisses = misses + (target && !isMatch ? 1 : 0);
    const nextFalseAlarms = falseAlarms + (!target && isMatch ? 1 : 0);
    const nextRts = [...rts, rt];
    setHits(nextHits); setCorrectRejects(nextCorrectRejects); setMisses(nextMisses); setFalseAlarms(nextFalseAlarms); setRts(nextRts);
    if (index + 1 >= total) {
      window.setTimeout(() => finish(nextHits, nextCorrectRejects, nextMisses, nextFalseAlarms, nextRts), fastMode ? 50 : 280);
      return;
    }
    window.setTimeout(() => {
      setIndex((value) => value + 1);
      shownAt.current = performance.now();
      setLocked(false);
    }, fastMode ? 45 : 260);
  };

  useEffect(() => {
    if (locked) return;
    timeoutRef.current = window.setTimeout(() => answer(false), fastMode ? 450 : 2400);
    return () => { if (timeoutRef.current) window.clearTimeout(timeoutRef.current); };
  }, [index, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GameStage
      title="N‑Back Daily"
      kicker={`Level ${n} · compare with the position two steps back`}
      stats={[{ label: 'Trial', value: `${index + 1}/${total}` }, { label: 'Matches', value: hits }, { label: 'Errors', value: misses + falseAlarms }]}
      progress={index / total}
      footer={<button className="text-button" type="button" onClick={onExit}>Exit</button>}
    >
      <div className="nback-grid" aria-label="3 by 3 N-Back grid">
        {Array.from({ length: 9 }, (_, cell) => <span className={cell === sequence.positions[index] ? 'active' : ''} key={cell} />)}
      </div>
      <ChoiceButtons
        disabled={locked}
        choices={[{ id: 'no', label: 'Different' }, { id: 'yes', label: 'Match' }]}
        onChoose={(choice) => answer(choice === 'yes')}
      />
    </GameStage>
  );
}
