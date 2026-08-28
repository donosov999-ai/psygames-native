/* psygames-resume-entry-context-gate · VER 1 · 28.08.2026 */
/**
 * СНИМОК ПАРТИИ ОБЯЗАН СВЕРЯТЬСЯ С КОНТЕКСТОМ ВХОДА.
 *
 * Класс бага (сага Валентины «Ур.45/8», 28.08, три волны за день): экран умеет
 * входы С ПАРАМЕТРОМ (?mode= из хаба, ?megaboss= с вехи), а useResumeBoot
 * поднимал незаконченную партию БЕЗ сверки с этим параметром. Итоги дня:
 *   · судоку утаскивала в чужой режим — «всё ещё неравенства запускаются»;
 *   · самурай вешал чужой бейдж мега-босса на обычную поднятую партию.
 *
 * Правило: в файле, где живут И useResumeBoot, И useLocalSearchParams, колбэк
 * подъёма обязан сверять снимок со входом. Гейт держит реестр: каждый такой
 * экран записан со своей строкой-сверкой (она же и проверяется в исходнике).
 * Новый экран с обоими хуками, не вписанный сюда, валит тест — реши сверку
 * и впиши её маркер, а не проходи мимо.
 */
declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

const GAMES_DIR = path.join(__dirname, '..', '..', 'app', 'games');

/** Экран → маркер сверки контекста в колбэке подъёма (+ почему так). */
const CONTEXT_CHECKS: Record<string, { marker: string; why: string }> = {
  'sudoku.tsx': {
    marker: 'if (sideSnapshot !== sideEntry) return;',
    why: 'side-снимок (towers/unequal) живёт за своей карточкой; обычный вход его не поднимает и не стирает',
  },
  'sudoku-samurai.tsx': {
    marker: 'if (megabossRoute && (saved.megaboss ?? null) !== megabossRoute) return;',
    why: 'мега-вход с вехи поднимает только мега-снимок той же вехи; метка — свойство партии в снимке',
  },
};

describe('снимок × контекст входа', () => {
  const files: string[] = fs.readdirSync(GAMES_DIR).filter((f: string) => f.endsWith('.tsx'));
  const both = files.filter((f: string) => {
    const src = fs.readFileSync(path.join(GAMES_DIR, f), 'utf8');
    return src.includes('useResumeBoot') && src.includes('useLocalSearchParams');
  });

  it('есть что сторожить — экраны с двумя хуками существуют', () => {
    expect(both.length).toBeGreaterThanOrEqual(2);
  });

  it('🔴 каждый экран с подъёмом и параметрами входа записан в реестр со сверкой', () => {
    const missing = both.filter((f: string) => !(f in CONTEXT_CHECKS));
    expect(`не записано: ${missing.length} → ${missing.join(', ')}`).toBe('не записано: 0 → ');
  });

  it('🔴 записанная сверка стоит в исходнике, а не только в реестре', () => {
    for (const [f, { marker }] of Object.entries(CONTEXT_CHECKS)) {
      const src = fs.readFileSync(path.join(GAMES_DIR, f), 'utf8');
      expect(`${f}: ${src.includes(marker)}`).toBe(`${f}: true`);
    }
  });

  it('реестр не протух — каждый записанный файл всё ещё с обоими хуками', () => {
    for (const f of Object.keys(CONTEXT_CHECKS)) {
      expect(`${f}: ${both.includes(f)}`).toBe(`${f}: true`);
    }
  });

  it('у каждой записи причина, а не отметка', () => {
    for (const [f, { why }] of Object.entries(CONTEXT_CHECKS)) {
      expect(`${f}: ${why.length > 40}`).toBe(`${f}: true`);
    }
  });
});
