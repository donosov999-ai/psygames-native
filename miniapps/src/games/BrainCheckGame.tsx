import { useEffect, useMemo, useRef, useState } from 'react';
import { ChoiceButtons, GameStage } from '../components/GameStage';
import { makeStroopTrial, median, pickUnique, scoreBrainCheck, STROOP_COLORS, type StroopColorId } from '../lib/engine';
import type { GameProps } from '../types';

type Stage = 'reaction' | 'memory' | 'stroop' | 'control';
type ReactionPhase = 'waiting' | 'ready' | 'feedback';
const STAGES: Stage[] = ['reaction', 'memory', 'stroop', 'control'];
const COLOR_LABEL: Record<StroopColorId, string> = { red: 'RED', blue: 'BLUE', green: 'GREEN', yellow: 'YELLOW' };

export default function BrainCheckGame({ fastMode, onFinish, onExit }: GameProps) {
  const reactionTotal = fastMode ? 2 : 5;
  const stroopTotal = fastMode ? 3 : 12;
  const controlTotal = fastMode ? 4 : 16;
  const [stage, setStage] = useState<Stage>('reaction');

  const [reactionPhase, setReactionPhase] = useState<ReactionPhase>('waiting');
  const [reactionTrial, setReactionTrial] = useState(1);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [reactionFalse, setReactionFalse] = useState(0);
  const reactionReadyAt = useRef(0);
  const timerRef = useRef<number | null>(null);

  const [memoryTargets] = useState(() => pickUnique(16, fastMode ? 3 : 6));
  const [memoryShowing, setMemoryShowing] = useState(true);
  const [memorySelected, setMemorySelected] = useState<number[]>([]);
  const [memoryAccuracy, setMemoryAccuracy] = useState(0);

  const [stroopTrial, setStroopTrial] = useState(() => makeStroopTrial());
  const [stroopRound, setStroopRound] = useState(1);
  const [stroopHits, setStroopHits] = useState(0);
  const [stroopLocked, setStroopLocked] = useState(false);

  const [controlRound, setControlRound] = useState(1);
  const [controlStimulus, setControlStimulus] = useState<'go' | 'stop'>(() => Math.random() < 0.72 ? 'go' : 'stop');
  const [controlHits, setControlHits] = useState(0);
  const [controlLocked, setControlLocked] = useState(false);

  const stageIndex = STAGES.indexOf(stage);
  const stageLabels: Record<Stage, string> = { reaction: 'Speed', memory: 'Memory', stroop: 'Attention', control: 'Control' };

  useEffect(() => {
    if (stage !== 'reaction' || reactionPhase !== 'waiting') return;
    const delay = fastMode ? 120 : 650 + Math.random() * 1150;
    timerRef.current = window.setTimeout(() => {
      reactionReadyAt.current = performance.now();
      setReactionPhase('ready');
    }, delay);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [stage, reactionPhase, reactionTrial, fastMode]);

  useEffect(() => {
    if (stage !== 'memory') return;
    setMemoryShowing(true);
    timerRef.current = window.setTimeout(() => setMemoryShowing(false), fastMode ? 300 : 1800);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [stage, fastMode]);

  const nextStage = (next: Stage) => {
    setStage(next);
    if (next === 'memory') setMemoryShowing(true);
  };

  const pressReaction = () => {
    if (reactionPhase === 'feedback') return;
    if (reactionPhase === 'waiting') {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setReactionFalse((value) => value + 1);
      setReactionPhase('feedback');
      timerRef.current = window.setTimeout(() => setReactionPhase('waiting'), fastMode ? 50 : 450);
      return;
    }
    const rt = Math.max(1, Math.round(performance.now() - reactionReadyAt.current));
    const nextTimes = [...reactionTimes, rt];
    setReactionTimes(nextTimes);
    setReactionPhase('feedback');
    if (reactionTrial >= reactionTotal) {
      timerRef.current = window.setTimeout(() => nextStage('memory'), fastMode ? 60 : 450);
    } else {
      setReactionTrial((value) => value + 1);
      timerRef.current = window.setTimeout(() => setReactionPhase('waiting'), fastMode ? 45 : 400);
    }
  };

  const chooseMemory = (cell: number) => {
    if (memoryShowing || memorySelected.includes(cell)) return;
    const next = [...memorySelected, cell];
    setMemorySelected(next);
    if (next.length < memoryTargets.length) return;
    const overlap = next.filter((value) => memoryTargets.includes(value)).length;
    const accuracy = overlap / memoryTargets.length;
    setMemoryAccuracy(accuracy);
    timerRef.current = window.setTimeout(() => nextStage('stroop'), fastMode ? 70 : 600);
  };

  const chooseStroop = (raw: string) => {
    if (stroopLocked) return;
    setStroopLocked(true);
    const correct = raw === stroopTrial.ink;
    const nextHits = stroopHits + (correct ? 1 : 0);
    setStroopHits(nextHits);
    if (stroopRound >= stroopTotal) {
      timerRef.current = window.setTimeout(() => nextStage('control'), fastMode ? 55 : 380);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setStroopRound((value) => value + 1);
      setStroopTrial(makeStroopTrial());
      setStroopLocked(false);
    }, fastMode ? 45 : 230);
  };

  const finish = (finalControlHits: number) => {
    const reactionMs = median(reactionTimes) + reactionFalse * 120;
    const stroopAccuracy = stroopHits / stroopTotal;
    const controlAccuracy = finalControlHits / controlTotal;
    const scores = scoreBrainCheck({ reactionMs, memoryAccuracy, stroopAccuracy, controlAccuracy });
    onFinish({
      score: scores.total,
      primary: `${scores.total}/100`,
      primaryLabel: 'profile today',
      secondary: `${Math.round(reactionMs)} ms`,
      secondaryLabel: 'reaction speed',
      errors: reactionFalse + (stroopTotal - stroopHits) + (controlTotal - finalControlHits),
      challengeValue: scores.total,
      shareText: `My Brain Check today is ${scores.total}/100: memory ${scores.memory}, attention ${scores.attention}, speed ${scores.speed}, control ${scores.control}. Compare yours?`,
      dimensions: [
        { label: 'Memory', value: scores.memory },
        { label: 'Attention', value: scores.attention },
        { label: 'Speed', value: scores.speed },
        { label: 'Control', value: scores.control },
      ],
      details: { reactionMs: Math.round(reactionMs), memoryAccuracy, stroopAccuracy, controlAccuracy },
    });
  };

  const chooseControl = (choice: string) => {
    if (controlLocked) return;
    setControlLocked(true);
    const correct = (controlStimulus === 'go' && choice === 'go') || (controlStimulus === 'stop' && choice === 'stop');
    const nextHits = controlHits + (correct ? 1 : 0);
    setControlHits(nextHits);
    if (controlRound >= controlTotal) {
      timerRef.current = window.setTimeout(() => finish(nextHits), fastMode ? 55 : 420);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setControlRound((value) => value + 1);
      setControlStimulus(Math.random() < 0.72 ? 'go' : 'stop');
      setControlLocked(false);
    }, fastMode ? 45 : 240);
  };

  const field = useMemo(() => {
    if (stage === 'reaction') {
      const text = reactionPhase === 'waiting' ? 'WAIT' : reactionPhase === 'ready' ? 'TAP' : reactionTimes.at(-1) ? `${reactionTimes.at(-1)} ms` : 'TOO EARLY';
      return <button className={`brain-reaction ${reactionPhase}`} type="button" onClick={pressReaction}><strong>{text}</strong><span>{reactionTrial}/{reactionTotal}</span></button>;
    }
    if (stage === 'memory') {
      return (
        <div className="brain-memory">
          <p>{memoryShowing ? 'Memorize the cells' : 'Recreate the pattern'}</p>
          <div className="mini-matrix">
            {Array.from({ length: 16 }, (_, cell) => <button className={`${memoryShowing && memoryTargets.includes(cell) ? 'active' : ''} ${memorySelected.includes(cell) ? 'selected' : ''}`} disabled={memoryShowing} aria-label={`Cell ${cell + 1}`} key={cell} type="button" onClick={() => chooseMemory(cell)} />)}
          </div>
        </div>
      );
    }
    if (stage === 'stroop') {
      return (
        <div className="brain-subtest">
          <span className={`stroop-word ink-${stroopTrial.ink}`}>{COLOR_LABEL[stroopTrial.word]}</span>
          <ChoiceButtons disabled={stroopLocked} choices={STROOP_COLORS.map((color) => ({ id: color, label: COLOR_LABEL[color], className: `color-choice color-${color}` }))} onChoose={chooseStroop} />
        </div>
      );
    }
    return (
      <div className="brain-subtest">
        <div className={`control-signal ${controlStimulus}`}><span />{controlStimulus === 'go' ? 'TAP' : 'STOP'}</div>
        <ChoiceButtons disabled={controlLocked} choices={[{ id: 'stop', label: 'Stop' }, { id: 'go', label: 'Tap' }]} onChoose={chooseControl} />
      </div>
    );
  }, [stage, reactionPhase, reactionTrial, reactionTimes, memoryShowing, memorySelected, stroopTrial, stroopLocked, controlStimulus, controlLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const detail = stage === 'reaction' ? `${reactionTrial}/${reactionTotal}` : stage === 'memory' ? `${memorySelected.length}/${memoryTargets.length}` : stage === 'stroop' ? `${stroopRound}/${stroopTotal}` : `${controlRound}/${controlTotal}`;

  return (
    <GameStage
      title="3‑Minute Brain Check"
      kicker={`${stageIndex + 1}/4 · ${stageLabels[stage]}`}
      stats={[{ label: 'Stage', value: stageLabels[stage] }, { label: 'Progress', value: detail }]}
      progress={(stageIndex + (stage === 'reaction' ? reactionTrial / reactionTotal : stage === 'memory' ? memorySelected.length / memoryTargets.length : stage === 'stroop' ? stroopRound / stroopTotal : controlRound / controlTotal)) / 4}
      footer={<button className="text-button" type="button" onClick={onExit}>Exit</button>}
    >
      {field}
    </GameStage>
  );
}
