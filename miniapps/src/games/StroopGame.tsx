import { useRef, useState } from 'react';
import { ChoiceButtons, GameStage } from '../components/GameStage';
import { makeStroopTrial, mean, STROOP_COLORS, type StroopColorId } from '../lib/engine';
import type { GameProps } from '../types';

const LABELS: Record<StroopColorId, string> = { red: 'RED', blue: 'BLUE', green: 'GREEN', yellow: 'YELLOW' };

export default function StroopGame({ fastMode, onFinish, onExit }: GameProps) {
  const total = fastMode ? 5 : 20;
  const [round, setRound] = useState(1);
  const [trial, setTrial] = useState(() => makeStroopTrial());
  const [hits, setHits] = useState(0);
  const [errors, setErrors] = useState(0);
  const [rts, setRts] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const shownAt = useRef(performance.now());

  const finish = (finalHits: number, finalErrors: number, finalRts: number[]) => {
    const average = Math.round(mean(finalRts));
    const accuracy = finalHits / total;
    onFinish({
      score: Math.max(0, Math.round(finalHits * 100 - finalErrors * 55 - average * 0.08)),
      primary: `${Math.round(accuracy * 100)}%`,
      primaryLabel: 'response accuracy',
      secondary: `${average} ms`,
      secondaryLabel: 'average speed',
      errors: finalErrors,
      challengeValue: Math.round(accuracy * 1000 - average / 10),
      shareText: `Stroop Challenge: ${Math.round(accuracy * 100)}% accuracy, ${average} ms, ${finalErrors} errors. Test your control?`,
      details: { hits: finalHits, trials: total, averageMs: average },
    });
  };

  const choose = (raw: string) => {
    if (locked) return;
    setLocked(true);
    const color = raw as StroopColorId;
    const correct = color === trial.ink;
    const rt = performance.now() - shownAt.current;
    const nextHits = hits + (correct ? 1 : 0);
    const nextErrors = errors + (correct ? 0 : 1);
    const nextRts = correct ? [...rts, rt] : rts;
    setHits(nextHits); setErrors(nextErrors); setRts(nextRts);
    if (round >= total) {
      window.setTimeout(() => finish(nextHits, nextErrors, nextRts), fastMode ? 60 : 280);
      return;
    }
    window.setTimeout(() => {
      setRound((value) => value + 1);
      setTrial(makeStroopTrial());
      shownAt.current = performance.now();
      setLocked(false);
    }, fastMode ? 50 : 260);
  };

  return (
    <GameStage
      title="Stroop Challenge"
      kicker="Name the ink color"
      stats={[{ label: 'Trial', value: `${round}/${total}` }, { label: 'Correct', value: hits }, { label: 'Errors', value: errors }]}
      progress={(round - 1) / total}
      footer={<button className="text-button" type="button" onClick={onExit}>Exit</button>}
    >
      <div className="stroop-field">
        <span className={`stroop-word ink-${trial.ink}`}>{LABELS[trial.word]}</span>
        <p>Ignore the meaning of the word</p>
      </div>
      <ChoiceButtons
        disabled={locked}
        choices={STROOP_COLORS.map((color) => ({ id: color, label: LABELS[color], className: `color-choice color-${color}` }))}
        onChoose={choose}
      />
    </GameStage>
  );
}
