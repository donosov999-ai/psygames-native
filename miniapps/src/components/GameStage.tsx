import type { ReactNode } from 'react';

interface GameStageProps {
  title: string;
  kicker?: string;
  stats?: Array<{ label: string; value: string | number }>;
  progress?: number;
  children: ReactNode;
  footer?: ReactNode;
  live?: string;
}

export function GameStage({ title, kicker, stats = [], progress, children, footer, live }: GameStageProps) {
  return (
    <section className="game-stage" aria-label={title}>
      <header className="stage-header">
        <div>
          {kicker && <p className="stage-kicker">{kicker}</p>}
          <h1 className="stage-title">{title}</h1>
        </div>
        {stats.length > 0 && (
          <div className="stage-stats" aria-label="Current metrics">
            {stats.map((stat) => (
              <div className="stage-stat" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        )}
      </header>
      {progress !== undefined && (
        <div className="progress-track" aria-label={`Progress ${Math.round(progress * 100)}%`}>
          <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </div>
      )}
      <div className="stage-field">{children}</div>
      {footer && <footer className="stage-footer">{footer}</footer>}
      {live && <p className="sr-only" aria-live="polite">{live}</p>}
    </section>
  );
}

export function ChoiceButtons({
  choices,
  onChoose,
  disabled = false,
}: {
  choices: Array<{ id: string; label: string; className?: string; ariaLabel?: string }>;
  onChoose: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="choice-row">
      {choices.map((choice) => (
        <button
          key={choice.id}
          className={`choice-button ${choice.className ?? ''}`}
          type="button"
          aria-label={choice.ariaLabel ?? choice.label}
          disabled={disabled}
          onClick={() => onChoose(choice.id)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
