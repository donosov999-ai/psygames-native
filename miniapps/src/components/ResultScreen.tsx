import { useEffect, useMemo, useState } from 'react';
import type { GameDefinition, GameResultData, PlatformId } from '../types';
import { buildPsyGamesUrl, shareResult } from '../lib/platform';
import { currentStreak, loadRuns } from '../lib/storage';

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function downloadCard(game: GameDefinition, result: GameResultData) {
  const dimensions = result.dimensions ?? [];
  const bars = dimensions.map((item, index) => `
    <text x="90" y="${500 + index * 86}" fill="#cbd5e1" font-size="28">${item.label}</text>
    <rect x="90" y="${518 + index * 86}" width="720" height="20" rx="10" fill="#20242b"/>
    <rect x="90" y="${518 + index * 86}" width="${7.2 * item.value}" height="20" rx="10" fill="url(#accent)"/>
    <text x="836" y="${538 + index * 86}" text-anchor="end" fill="#ffffff" font-size="28">${item.value}</text>
  `).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
    <defs><linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${game.accent}"/><stop offset="1" stop-color="${game.accent2}"/></linearGradient></defs>
    <rect width="900" height="1200" fill="#050607"/>
    <circle cx="760" cy="110" r="240" fill="${game.accent}" opacity=".14"/>
    <text x="70" y="100" fill="#94a3b8" font-size="25" font-family="sans-serif">PSYGAMES · TODAY</text>
    <text x="70" y="190" fill="#ffffff" font-size="56" font-family="sans-serif" font-weight="700">${game.name}</text>
    <text x="70" y="310" fill="url(#accent)" font-size="118" font-family="sans-serif" font-weight="700">${result.primary}</text>
    <text x="76" y="358" fill="#94a3b8" font-size="27" font-family="sans-serif">${result.primaryLabel}</text>
    ${result.secondary ? `<text x="76" y="430" fill="#ffffff" font-size="34" font-family="sans-serif">${result.secondary}</text><text x="76" y="465" fill="#94a3b8" font-size="22" font-family="sans-serif">${result.secondaryLabel ?? ''}</text>` : ''}
    ${bars}
    <line x1="70" x2="830" y1="1080" y2="1080" stroke="#28303a"/>
    <text x="70" y="1140" fill="#ffffff" font-size="30" font-family="sans-serif">psy-games.pro</text>
    <text x="830" y="1140" text-anchor="end" fill="#94a3b8" font-size="22" font-family="sans-serif">Train the skill, not the promise</text>
  </svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(game.name)}-result.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ResultScreen({
  game,
  result,
  platform,
  challenge,
  onReplay,
  onHome,
}: {
  game: GameDefinition;
  result: GameResultData;
  platform: PlatformId;
  challenge?: number;
  onReplay: () => void;
  onHome: () => void;
}) {
  const [shareState, setShareState] = useState('Challenge a friend');
  const runs = useMemo(() => loadRuns(game.slug).slice(0, 3), [game.slug, result]);
  const streak = currentStreak(game.slug);
  const comparison = challenge === undefined ? null : game.lowerIsBetter
    ? (result.challengeValue ?? result.score) < challenge
    : (result.challengeValue ?? result.score) > challenge;

  useEffect(() => {
    document.title = `${result.primary} · ${game.name} · PsyGames`;
  }, [game.name, result.primary]);

  const handleShare = async () => {
    try {
      const outcome = await shareResult(game, result, platform);
      setShareState(outcome === 'copied' ? 'Link copied' : 'Shared');
    } catch {
      setShareState('Could not share');
    }
  };

  return (
    <main className="result-shell" style={{ '--accent': game.accent, '--accent-2': game.accent2 } as React.CSSProperties}>
      <section className="result-card">
        <p className="result-eyebrow">Workout complete</p>
        <div className="result-heading">
          <div>
            <h1>{game.name}</h1>
            <p>{game.hook}</p>
          </div>
          <span className="result-glyph" aria-hidden="true">{game.glyph}</span>
        </div>
        <div className="primary-result">
          <strong>{result.primary}</strong>
          <span>{result.primaryLabel}</span>
        </div>
        <div className="result-secondary-grid">
          {result.secondary && <div><span>{result.secondaryLabel}</span><strong>{result.secondary}</strong></div>}
          {result.errors !== undefined && <div><span>Errors</span><strong>{result.errors}</strong></div>}
          <div><span>Day streak</span><strong>{streak || 1}</strong></div>
        </div>
        {comparison !== null && (
          <div className={`challenge-outcome ${comparison ? 'won' : 'retry'}`}>
            {comparison ? 'Challenge complete: you beat your friend.' : 'You are close to your friend’s score.'}
          </div>
        )}
        {result.dimensions && (
          <div className="dimension-list" aria-label="Cognitive profile">
            {result.dimensions.map((dimension) => (
              <div className="dimension" key={dimension.label}>
                <div><span>{dimension.label}</span><strong>{dimension.value}</strong></div>
                <div className="dimension-track"><span style={{ width: `${dimension.value}%` }} /></div>
              </div>
            ))}
          </div>
        )}
        <div className="result-actions">
          <button className="button primary" type="button" onClick={handleShare}>{shareState}</button>
          <button className="button secondary" type="button" onClick={() => downloadCard(game, result)}>Download result card</button>
          <a className="button full-app" href={buildPsyGamesUrl(game, platform)} target="_blank" rel="noreferrer">Get PsyGames for Mac, Windows or Android</a>
          <button className="button ghost" type="button" onClick={onReplay}>Play another round</button>
          <button className="button ghost" type="button" onClick={onHome}>All mini-games</button>
        </div>
      </section>
      {runs.length > 0 && (
        <aside className="recent-runs">
          <p>Recent attempts on this device</p>
          {runs.map((run) => (
            <div key={run.id}><span>{new Date(run.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span><strong>{run.primary}</strong></div>
          ))}
        </aside>
      )}
    </main>
  );
}
