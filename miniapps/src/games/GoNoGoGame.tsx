import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import type { GameProps } from '../types';

type Stimulus = 'go' | 'nogo';

export default function GoNoGoGame({ fastMode, onFinish, onExit }: GameProps) {
  const total = fastMode ? 6 : 30;
  const windowMs = fastMode ? 260 : 900;
  const [round, setRound] = useState(1);
  const [stimulus, setStimulus] = useState<Stimulus>(() => Math.random() < 0.75 ? 'go' : 'nogo');
  const [visible, setVisible] = useState(false);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [falseAlarms, setFalseAlarms] = useState(0);
  const [correctRejects, setCorrectRejects] = useState(0);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const responded = useRef(false);
  const shownAt = useRef(0);
  const timerRef = useRef<number | null>(null);
  const statsRef = useRef({ hits: 0, misses: 0, falseAlarms: 0, correctRejects: 0, reactionTimes: [] as number[] });

  const finish = (h: number, m: number, fa: number, cr: number, rts: number[]) => {
    const accuracy = (h + cr) / total;
    const avgRt = rts.length ? Math.round(rts.reduce((sum, value) => sum + value, 0) / rts.length) : 0;
    onFinish({
      score: Math.max(0, Math.round(h * 10 + cr * 12 - fa * 18 - m * 8)),
      primary: `${fa}`,
      primaryLabel: 'impulsive errors',
      secondary: `${Math.round(accuracy * 100)}%`,
      secondaryLabel: `accuracy · ${avgRt} ms`,
      errors: m + fa,
      challengeValue: Math.round(accuracy * 1000 - fa * 100 - avgRt / 20),
      shareText: `Impulse Control: ${fa} impulsive errors, ${Math.round(accuracy * 100)}% accuracy. Can you stop in time?`,
      details: { hits: h, misses: m, falseAlarms: fa, correctRejects: cr, avgRt },
    });
  };

  const nextTrial = (nextRound: number) => {
    setVisible(false);
    responded.current = false;
    const nextStimulus: Stimulus = Math.random() < 0.75 ? 'go' : 'nogo';
    setStimulus(nextStimulus);
    timerRef.current = window.setTimeout(() => {
      shownAt.current = performance.now();
      setVisible(true);
      timerRef.current = window.setTimeout(() => resolve(false, nextStimulus, nextRound), windowMs);
    }, fastMode ? 60 : 280 + Math.random() * 360);
  };

  const resolve = (pressed: boolean, currentStimulus = stimulus, currentRound = round) => {
    if (responded.current) return;
    responded.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const isHit = currentStimulus === 'go' && pressed;
    const isMiss = currentStimulus === 'go' && !pressed;
    const isFalseAlarm = currentStimulus === 'nogo' && pressed;
    const isCorrectReject = currentStimulus === 'nogo' && !pressed;
    const current = statsRef.current;
    const nextHits = current.hits + (isHit ? 1 : 0);
    const nextMisses = current.misses + (isMiss ? 1 : 0);
    const nextFalse = current.falseAlarms + (isFalseAlarm ? 1 : 0);
    const nextCorrect = current.correctRejects + (isCorrectReject ? 1 : 0);
    const nextRts = isHit ? [...current.reactionTimes, performance.now() - shownAt.current] : current.reactionTimes;
    statsRef.current = { hits: nextHits, misses: nextMisses, falseAlarms: nextFalse, correctRejects: nextCorrect, reactionTimes: nextRts };
    setHits(nextHits); setMisses(nextMisses); setFalseAlarms(nextFalse); setCorrectRejects(nextCorrect); setReactionTimes(nextRts); setVisible(false);
    if (currentRound >= total) {
      window.setTimeout(() => finish(nextHits, nextMisses, nextFalse, nextCorrect, nextRts), fastMode ? 50 : 300);
      return;
    }
    const nextRound = currentRound + 1;
    setRound(nextRound);
    timerRef.current = window.setTimeout(() => nextTrial(nextRound), fastMode ? 40 : 220);
  };

  useEffect(() => {
    nextTrial(1);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GameStage
      title="Impulse Control"
      kicker="Green means tap · red means stop"
      stats={[{ label: 'Trial', value: `${round}/${total}` }, { label: 'Correct', value: hits + correctRejects }, { label: 'Impulses', value: falseAlarms }]}
      progress={(round - 1) / total}
      footer={<button className="text-button" type="button" onClick={onExit}>Exit</button>}
    >
      <button className={`gonogo-field ${visible ? stimulus : 'hidden'}`} type="button" onClick={() => visible && resolve(true)} aria-label={visible ? stimulus === 'go' ? 'Green signal, tap' : 'Red signal, do not tap' : 'Waiting for the signal'}>
        <span className="gonogo-light" />
        <strong>{visible ? stimulus === 'go' ? 'TAP' : 'STOP' : 'GET READY'}</strong>
      </button>
    </GameStage>
  );
}
