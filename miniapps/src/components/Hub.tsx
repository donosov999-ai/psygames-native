import { GAMES, PLATFORM_LABELS } from '../config/games';
import type { GameDefinition, GameSlug, PlatformId } from '../types';

function GameCard({ game, onOpen }: { game: GameDefinition; onOpen: (slug: GameSlug) => void }) {
  return (
    <article
      className="game-card"
      style={{ '--accent': game.accent, '--accent-2': game.accent2 } as React.CSSProperties}
    >
      <div className="game-card-index">{String(game.order).padStart(2, '0')}</div>
      <div className="game-card-glyph" aria-hidden="true">{game.glyph}</div>
      <p className="card-eyebrow">{game.eyebrow}</p>
      <h2>{game.name}</h2>
      <p className="card-hook">{game.hook}</p>
      <p className="card-rule">{game.rule}</p>
      <div className="platform-list" aria-label="Platforms">
        {game.platforms.map((platform) => <span key={platform}>{PLATFORM_LABELS[platform]}</span>)}
      </div>
      <button className="card-action" type="button" onClick={() => onOpen(game.slug)}>
        Open workout <span aria-hidden="true">↗</span>
      </button>
    </article>
  );
}

export function Hub({ onOpen, platform }: { onOpen: (slug: GameSlug) => void; platform: PlatformId }) {
  return (
    <main className="hub-shell">
      <header className="hub-hero">
        <div className="hero-copy">
          <div className="brand-line"><span className="brand-mark">P</span> PsyGames Mini · {PLATFORM_LABELS[platform]}</div>
          <p className="hero-kicker">Nine entry points. One ecosystem.</p>
          <h1>Training starts<br /><em>before installation.</em></h1>
          <p className="hero-lead">Short standalone games deliver a measurable result, then guide you into the full PsyGames program after a completed round.</p>
        </div>
        <div className="brain-orbit" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="orbit orbit-three" />
          <strong>9</strong>
          <small>mini-games</small>
        </div>
      </header>
      <section className="game-grid" aria-label="PsyGames mini-games">
        {GAMES.map((game) => <GameCard game={game} key={game.slug} onOpen={onOpen} />)}
      </section>
      <footer className="hub-footer">
        <span>PsyGames · Denis Onosov (ODV999)</span>
        <span>Privacy-first · no external analytics</span>
      </footer>
    </main>
  );
}
