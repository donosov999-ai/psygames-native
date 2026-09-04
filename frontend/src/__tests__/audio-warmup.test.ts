/**
 * 🔴 РАЗОГРЕВ ЗВУКА — В КАЖДОМ КОНТЕКСТЕ, А НЕ ТОЛЬКО В ОБЩЕМ.
 *
 * Отчёт Дениса 04.09.2026 по «Ритму и высоте»: «звука вообще нет, никаких
 * динамиков звуков не издаёт». Причина не в игре: WKWebView (Safari, Tauri на
 * iOS и macOS) держит AudioContext молчащим даже после `resume()` — ему нужно
 * проиграть ПУСТОЙ буфер от пользовательского жеста. В общем звуке приложения
 * приём стоял с июня, а у движка тонов свой контекст, и там его не было.
 *
 * ⚠️ В Chrome одного `resume()` хватает. Поэтому в браузере звук есть, а на
 * телефоне тишина — проверкой «у меня играет» этот дефект не ловится, только
 * чтением кода или живым телефоном.
 */
declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

import { warmUpAudioContext } from '@/src/services/feedback';

const код = (п: string) => fs.readFileSync(path.join(__dirname, '../..', п), 'utf8');

describe('разогрев звука', () => {
  it('🔴 играет пустой буфер и подключает его к выходу', () => {
    const события: string[] = [];
    const src = {
      buffer: null as unknown,
      connect: (куда: unknown) => события.push(`connect:${куда}`),
      start: (t: number) => события.push(`start:${t}`),
    };
    warmUpAudioContext({
      createBuffer: (к: number, д: number, ч: number) => { события.push(`buffer:${к}/${д}/${ч}`); return 'BUF'; },
      createBufferSource: () => src,
      destination: 'OUT',
    });
    expect(события).toEqual(['buffer:1/1/22050', 'connect:OUT', 'start:0']);
    expect(src.buffer).toBe('BUF');
  });

  it('нет Web Audio — не роняет приложение', () => {
    expect(() => warmUpAudioContext({
      createBuffer: () => { throw new Error('нет'); },
      createBufferSource: () => ({}),
      destination: null,
    })).not.toThrow();
  });

  it('🔴 движок тонов зовёт ОБЩИЙ разогрев, а не заводит свою копию приёма', () => {
    const движок = код('src/games/rhythm-pitch/audio/ToneAudioEngine.ts');
    expect(движок).toContain("import { warmUpAudioContext } from '@/src/services/feedback'");
    expect(движок).toContain('warmUpAudioContext(');
    // Своей копии быть не должно: две реализации одного приёма разойдутся.
    expect(движок).not.toContain('createBuffer(1, 1, 22050)');
  });

  it('разогрев идёт ПОСЛЕ resume и до первой ноты', () => {
    const движок = код('src/games/rhythm-pitch/audio/ToneAudioEngine.ts');
    const i = движок.indexOf('await this.context.resume()');
    const j = движок.indexOf('warmUpAudioContext(');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });

  it('в общем звуке приложения приём остался и он один', () => {
    const общий = код('src/services/feedback.ts');
    expect((общий.match(/createBuffer\(1, 1, 22050\)/g) || []).length).toBe(1);
    expect(общий).toContain('export function warmUpAudioContext');
  });
});
