/* psygames-mic-bridge-patch-test · VER 1 · 29.08.2026 */
/**
 * ПАТЧ MainActivity ИЗ build.yml — ПРОГОН НА ЗАГОТОВКЕ, НЕ ЧТЕНИЕ.
 *
 * Урок саги немых голосовых (дважды наступали): патч, проверенный чтением,
 * рапортовал успех при мосте, который никогда не устанавливался — якорь попадал
 * в объявление вместо вызова. Ловится только ИСПОЛНЕНИЕМ на заготовке.
 *
 * Здесь тот самый прогон зашит в jest: скрипт извлекается из build.yml (боевой,
 * не копия — копия разошлась бы в первый день), применяется к макету
 * MainActivity.kt и проверяется результат: вызовы моста в двух местах, методы
 * записи на месте, повторный прогон идемпотентен.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, writeFileSync, mkdtempSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { execFileSync } = require('child_process');

const ROOT = join(__dirname, '..', '..', '..');
const MOCK_MAIN = `package com.psygames.app

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setup()
  }
  private fun clampTextZoom() {
    val wv = findWebView(findViewById(android.R.id.content)) ?: return
  }
  private fun setup() {
    clampTextZoom()
  }
}
`;

function extractMicPatch(): string {
  const wf = readFileSync(join(ROOT, '.github/workflows/build.yml'), 'utf8');
  const blocks = [...wf.matchAll(/python3 - "\$MAIN" <<'PYEOF'\n([\s\S]*?)\n\s+PYEOF\n/g)].map((m) => m[1]);
  const mic = blocks.filter((b) => b.includes('psyStartRec'));
  expect(mic.length).toBe(1);   // патч записи существует и он один
  // Строки в YAML с отступом 10 пробелов — снимаем его, чтобы питон исполнился.
  return mic[0].split('\n').map((l: string) => (l.startsWith(' '.repeat(10)) ? l.slice(10) : l)).join('\n');
}

describe('патч моста микрофона (build.yml) — прогон на заготовке', () => {
  it('🔴 патч встаёт: вызовы в двух местах, запись на месте, идемпотентен', () => {
    const dir = mkdtempSync(join(tmpdir(), 'psy-mic-'));
    const scriptPath = join(dir, 'patch.py');
    const mainPath = join(dir, 'MainActivity.kt');
    writeFileSync(scriptPath, extractMicPatch());
    writeFileSync(mainPath, MOCK_MAIN);

    const out1 = String(execFileSync('python3', [scriptPath, mainPath]));
    expect(out1).toContain('мост привязан в 2 местах');

    const patched = readFileSync(mainPath, 'utf8');
    // ВЫЗОВЫ (перевод строки после скобок), не объявление — тот самый класс бага.
    const calls = patched.match(/\n\s*psyInstallMicBridge\(\)\n/g) || [];
    expect(calls.length).toBe(2);
    // Запись: и натив, и его лицо в мосте.
    // `recLevel`/`maxAmplitude` — уровень записи на нативном пути (04.09.2026). Без
    // него полоска уровня прячется, и человек не узнаёт, что телефон пишет тишину:
    // так ушли 80 немых заметок с одного аппарата, каждая — уверенность, что отчёт
    // отправлен. Держим в списке обязательного, чтобы правка моста не унесла замер.
    for (const needle of ['psyStartRec', 'psyStopRec', 'psyCancelRec', 'fun startRec()', 'fun stopRec()', 'fun recLevel()', 'maxAmplitude', 'MediaRecorder']) {
      expect(patched).toContain(needle);
    }
    // Разрешение спрашивается по-прежнему — запись его не вытеснила.
    expect(patched).toContain('fun requestMic()');

    // Повторный прогон не дублирует мост.
    const out2 = String(execFileSync('python3', [scriptPath, mainPath]));
    expect(out2).toContain('already present');
    expect(readFileSync(mainPath, 'utf8')).toBe(patched);
  });
});
