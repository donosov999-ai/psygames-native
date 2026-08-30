/**
 * ОТВЕТ ИГРЫ ИДЁТ ОДНИМ КАНАЛОМ, И ЗВУК НЕ ЗВУЧИТ ДВАЖДЫ.
 *
 * 🔴 ЗАЧЕМ. Звук на верный ход, серия в шапке и реакция питомца — три подписки
 * на одно событие «игрок сходил верно». Через пропы это три пропа × 72 игры, и
 * каждая новая игра забудет половину. Через канал игра говорит одну строку.
 *
 * ⚠️ ОТДЕЛЬНО ПРО ДВОЙНОЙ ЗВУК. `hapticSuccess()` ЗВУЧИТ САМ (внутри
 * `_sfxCorrect()`), и это неочевидно из имени. 30.08.2026 я на этом попался:
 * добавил `sndCorrect()` рядом с `hapticSuccess()` в четырёх играх — игрок
 * получал «динь» дважды. Поэтому здесь две проверки: событие из хаптика
 * помечено `silent`, и ни одна игра не зовёт звук рядом с хаптиком.
 */
declare const __dirname: string;
declare function require(m: string): any;

import { onGameEvent, emitGameEvent, gameGood, gameBad, __resetGameEvents, type GameEvent } from '@/src/services/gameEvents';

const fs = require('fs');
const path = require('path');
const GAMES = path.join(__dirname, '..', '..', 'app', 'games');
const src = (n: string) => fs.readFileSync(path.join(GAMES, n), 'utf8');
const list = (): string[] => fs.readdirSync(GAMES).filter((f: string) => f.endsWith('.tsx'));

describe('канал событий партии', () => {
  beforeEach(() => __resetGameEvents());

  it('подписчик слышит событие, отписка молчит', () => {
    const heard: GameEvent[] = [];
    const off = onGameEvent((e) => heard.push(e));
    gameGood(50);
    expect(heard).toEqual([{ kind: 'good', value: 50, at: undefined }]);
    off();
    gameBad();
    expect(heard.length).toBe(1);
  });

  it('🔴 сломавшийся слушатель не роняет партию — остальные получают событие', () => {
    const heard: string[] = [];
    onGameEvent(() => { throw new Error('слушатель сломался'); });
    onGameEvent((e) => heard.push(e.kind));
    expect(() => emitGameEvent({ kind: 'win' })).not.toThrow();
    expect(heard).toEqual(['win']);
  });

  it('🔴 событие из хаптика помечено silent — иначе звук сыграет дважды', () => {
    const h = fs.readFileSync(path.join(__dirname, '..', 'components', 'juice', 'haptics.ts'), 'utf8');
    // Хаптик звучит сам и шлёт событие — значит обязан пометить его беззвучным.
    expect(/hapticSuccess[\s\S]{0,400}emitGameEvent\(\{ kind: 'good', silent: true \}\)/.test(h)).toBe(true);
    expect(/hapticError[\s\S]{0,400}emitGameEvent\(\{ kind: 'bad', silent: true \}\)/.test(h)).toBe(true);
  });

  it('🔴 каркас не повторяет звук, который источник уже сыграл', () => {
    const shell = fs.readFileSync(path.join(__dirname, '..', 'components', 'GameShell.tsx'), 'utf8');
    expect(shell.includes('onGameEvent')).toBe(true);
    // Каждый звук в подписке — под проверкой признака.
    const calls = shell.match(/if \(!e\.silent\) snd[A-Za-z]+\(\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it('🔴 ни одна игра не зовёт звук рядом с хаптиком (двойной «динь»)', () => {
    const bad: string[] = [];
    for (const f of list()) {
      const s = src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      // Ищем звук и хаптик в одном выражении — так выглядела моя ошибка.
      if (/sndCorrect\(\)[^;\n]{0,40}hapticSuccess\(\)|hapticSuccess\(\)[^;\n]{0,40}sndCorrect\(\)/.test(s)) bad.push(`${f}: успех`);
      if (/sndWrong\(\)[^;\n]{0,40}hapticError\(\)|hapticError\(\)[^;\n]{0,40}sndWrong\(\)/.test(s)) bad.push(`${f}: ошибка`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 слово похвалы приходит с ТРЕТЬЕГО верного хода, а не с каждого', () => {
    /**
     * На каждый ход слово превращается в шум: доказательная база даёт этому и
     * цифру — ОЖИДАЕМАЯ похвала подрывает мотивацию так же, как деньги
     * (d = −0,40), неожиданная безвредна. Поэтому порог по серии и три ступени.
     */
    const shell = fs.readFileSync(path.join(__dirname, '..', 'components', 'GameShell.tsx'), 'utf8');
    expect(/praise_perfect/.test(shell)).toBe(true);
    expect(/praise_great/.test(shell)).toBe(true);
    expect(/praise_good/.test(shell)).toBe(true);
    // Порог: слово не показывается, пока серия короче трёх.
    expect(/n >= 3 \? t\('praise_good'\) : null/.test(shell)).toBe(true);
  });

  it('есть что проверять: хаптик реально стоит в играх', () => {
    const withHaptic = list().filter((f) => /haptic(Success|Error)\(/.test(src(f)));
    // Меньше двадцати — значит правка развалила связь, и канал молчит почти везде.
    expect(withHaptic.length).toBeGreaterThanOrEqual(20);
  });
});
