/**
 * 🔴 ЗВУК БУДИТСЯ В САМОМ КАСАНИИ, А НЕ КОГДА ПОНАДОБИТСЯ.
 *
 * Отчёт Дениса 79e2ff09 (05.09.2026, v2.37.45, tauri-ios): «Звуки так и не
 * появились» — при том, что партия шла: на кадре «Повторите услышанный ритм»,
 * «Тапов: 0; в образце: 3». То есть движок считал звук доступным и честно
 * планировал тоны, а из динамика ничего не выходило.
 *
 * ПРИЧИНА — ПОРЯДОК, А НЕ ОТСУТСТВИЕ КОДА. Разогрев пустым буфером стоял на
 * месте (его добавили 04.09), но ПОСЛЕ `await context.resume()`. Первый `await`
 * заканчивает задачу пользовательского жеста, и для WebKit всё, что дальше, —
 * уже не «в ответ на касание». Контекст оставался немым навсегда.
 *
 * ⚠️ ПОЧЕМУ ЭТОГО НЕ ВИДНО В БРАУЗЕРЕ. Chrome обходится одним `resume()` и
 * звучит при любом порядке. Значит, проверка «послушал на десктопе — работает»
 * ничего не доказывает, и разница видна ТОЛЬКО по порядку вызовов. Его и
 * проверяем: подставной контекст записывает, что и когда его просили.
 */
import { WebToneAudioEngine } from '@/src/games/rhythm-pitch/audio/ToneAudioEngine';

/** Порядок вызовов у подставного AudioContext. */
let журнал: string[] = [];

/** Контекст, у которого `resume()` откладывается — как настоящий асинхронный. */
function поддельныйКонтекст(state: 'suspended' | 'running' = 'suspended') {
  const узел = () => ({ connect: () => {}, start: () => {}, stop: () => {}, disconnect: () => {} });
  return {
    state,
    currentTime: 0,
    destination: {},
    resume: () => {
      журнал.push('resume:начало');
      return new Promise<void>((готово) => {
        setTimeout(() => { журнал.push('resume:конец'); готово(); }, 0);
      });
    },
    createBuffer: () => { журнал.push('createBuffer'); return {}; },
    createBufferSource: () => {
      журнал.push('createBufferSource');
      return { buffer: null, connect: () => {}, start: () => { журнал.push('разогрев:start'); } };
    },
    createOscillator: () => узел(),
    createGain: () => ({ ...узел(), gain: { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} } }),
    close: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
  };
}

describe('звук «Ритма и высоты» будится в жесте', () => {
  beforeEach(() => { журнал = []; });

  it('есть что проверять: подставной контекст пишет свои вызовы', () => {
    const c = поддельныйКонтекст();
    c.createBufferSource().start();
    expect(журнал).toEqual(['createBufferSource', 'разогрев:start']);
  });

  it('🔴 разогрев пустым буфером идёт ДО первого await (до resume)', async () => {
    const engine = new WebToneAudioEngine({ contextFactory: () => поддельныйКонтекст() as any });
    const обещание = engine.initialize();
    /**
     * Ключевая строка пробы. До `await` успело выполниться ровно то, что
     * синхронно следует за созданием контекста. Если разогрев съехал за
     * `resume()`, здесь его в журнале НЕ БУДЕТ — и на телефоне звука не будет
     * тоже, только узнается это из отчёта через сутки.
     */
    expect(журнал).toContain('разогрев:start');
    expect(журнал.indexOf('разогрев:start')).toBeLessThan(журнал.indexOf('resume:начало'));
    await обещание;
  });

  it('🔴 разогрев один на весь сеанс — повторный вызов его не дублирует', async () => {
    const engine = new WebToneAudioEngine({ contextFactory: () => поддельныйКонтекст() as any });
    await engine.initialize();
    const было = журнал.filter((x) => x === 'разогрев:start').length;
    await engine.initialize();
    expect(журнал.filter((x) => x === 'разогрев:start').length).toBe(было);
    expect(было).toBe(1);
  });

  it('🔴 экран будит звук ПРЯМО в обработчике «Начать»', () => {
    /**
     * ⚠️ Здесь проверяется исходник, и это осознанно: довести живой рендер до
     * нажатия «Начать» с подставным Web Audio означало бы поднять весь экран с
     * его контекстами ради одной строки. Проверяется не наличие слова, а то, что
     * пробуждение стоит ВНУТРИ `begin` — там, где ещё длится жест.
     */
    const исходник: string = читать('../games/rhythm-pitch/RhythmPitchGame.tsx');
    const начало = исходник.indexOf('const begin = () => {');
    expect(начало).toBeGreaterThan(0);
    const конец = исходник.indexOf('\n  };', начало);
    const тело = исходник.slice(начало, конец);
    expect(тело).toContain('engine?.initialize()');
  });
});

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const читать = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');
