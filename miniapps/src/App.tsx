import { useEffect, useMemo, useState } from 'react';
import { GAMES, GAME_BY_SLUG, isGameSlug, PLATFORM_LABELS } from './config/games';
import { Hub } from './components/Hub';
import { ResultScreen } from './components/ResultScreen';
import { detectPlatform, initPlatform } from './lib/platform';
import { recordLocalEvent, saveRun } from './lib/storage';
import type { GameDefinition, GameResultData, GameSlug } from './types';
import BrainCheckGame from './games/BrainCheckGame';
import SchulteGame from './games/SchulteGame';
import ReactionDuelGame from './games/ReactionDuelGame';
import MemoryMatrixGame from './games/MemoryMatrixGame';
import StroopGame from './games/StroopGame';
import NBackGame from './games/NBackGame';
import GoNoGoGame from './games/GoNoGoGame';
import TowerGame from './games/TowerGame';
import FlankerGame from './games/FlankerGame';

const GAME_COMPONENTS: Record<GameSlug, React.ComponentType<import('./types').GameProps>> = {
  '3-minute-brain-check': BrainCheckGame,
  'schulte-speed': SchulteGame,
  'reaction-duel': ReactionDuelGame,
  'memory-matrix': MemoryMatrixGame,
  'stroop-challenge': StroopGame,
  'n-back-daily': NBackGame,
  'impulse-control': GoNoGoGame,
  'tower-puzzle': TowerGame,
  'focus-defender': FlankerGame,
};

function slugFromLocation(): GameSlug | null {
  const params = new URLSearchParams(window.location.search);
  const querySlug = params.get('game');
  if (querySlug && isGameSlug(querySlug)) return querySlug;
  const segments = window.location.pathname.split('/').filter(Boolean);
  const segment = segments[0] === 'mini' ? segments[1] : segments[0];
  return segment && isGameSlug(segment) ? segment : null;
}

function gameStyle(game: GameDefinition) {
  return { '--accent': game.accent, '--accent-2': game.accent2 } as React.CSSProperties;
}

export default function App() {
  const platform = useMemo(detectPlatform, []);
  const [slug, setSlug] = useState<GameSlug | null>(slugFromLocation);
  const [phase, setPhase] = useState<'intro' | 'playing' | 'result'>(slug ? 'intro' : 'playing');
  const [result, setResult] = useState<GameResultData | null>(null);
  const [runKey, setRunKey] = useState(0);
  const params = new URLSearchParams(window.location.search);
  const fastMode = params.get('fast') === '1';
  const rawChallenge = params.get('challenge');
  const challenge = rawChallenge === null ? undefined : Number(rawChallenge);

  useEffect(() => {
    initPlatform();
    recordLocalEvent('mini_open', { platform, game: slug ?? 'hub' });
  }, [platform, slug]);

  const openGame = (nextSlug: GameSlug) => {
    window.history.pushState({}, '', `/mini/${nextSlug}/?platform=${platform}`);
    setSlug(nextSlug);
    setPhase('intro');
    setResult(null);
    window.scrollTo({ top: 0 });
  };

  const goHome = () => {
    window.history.pushState({}, '', '/mini/');
    setSlug(null);
    setResult(null);
    setPhase('playing');
  };

  if (!slug) return <Hub onOpen={openGame} platform={platform} />;

  const game = GAME_BY_SLUG[slug];
  const GameComponent = GAME_COMPONENTS[slug];

  if (phase === 'result' && result) {
    return <ResultScreen game={game} result={result} platform={platform} challenge={challenge} onReplay={() => { setResult(null); setRunKey((key) => key + 1); setPhase('playing'); }} onHome={goHome} />;
  }

  if (phase === 'intro') {
    return (
      <main className="intro-shell" style={gameStyle(game)}>
        <button className="back-link" type="button" onClick={goHome}>← All games</button>
        <section className="intro-card">
          <div className="intro-number">{String(game.order).padStart(2, '0')}</div>
          <div className="intro-glyph" aria-hidden="true">{game.glyph}</div>
          <p className="intro-eyebrow">{game.eyebrow} · {PLATFORM_LABELS[platform]}</p>
          <h1>{game.name}</h1>
          <p className="intro-hook">{game.hook}</p>
          <p className="intro-rule">{game.rule}</p>
          {challenge !== undefined && Number.isFinite(challenge) && <div className="challenge-banner">A friend scored {challenge}. Can you beat it?</div>}
          <div className="distribution-note"><span>After the round</span>{game.distribution}</div>
          <button className="start-button" type="button" onClick={() => { recordLocalEvent('round_start', { platform, game: slug }); setPhase('playing'); }}>Start</button>
        </section>
      </main>
    );
  }

  return (
    <main className="play-shell" style={gameStyle(game)}>
      <GameComponent
        key={`${slug}-${runKey}`}
        fastMode={fastMode}
        challenge={challenge}
        onExit={goHome}
        onFinish={(nextResult) => {
          saveRun(slug, nextResult);
          recordLocalEvent('round_complete', { platform, game: slug, score: nextResult.score });
          setResult(nextResult);
          setPhase('result');
        }}
      />
    </main>
  );
}
