/* eslint-disable @typescript-eslint/no-require-imports */
declare const __dirname: string;

/**
 * 🔴 ОДИН СЧЁТЧИК — ОДИН ЦВЕТ ВО ВСЕХ УПРАЖНЕНИЯХ.
 *
 * Просьба Дениса 03.09.2026: «расцветка ошибок, левел и прочее, и бонусов в верхнем
 * тулбаре должна быть единой во всех упражнениях». Замер того же дня по всем играм:
 * 46 ключей счётчиков, из них СЕМЬ красились по-разному в разных играх —
 * correct (good ×16 / neutral ×1), lvl (neutral ×12 / accent ×2), len, span, err,
 * streak, score. Шапку читают боковым зрением: если «ошибки» в одной игре красные,
 * а в соседней серые, взгляд каждый раз ищет заново.
 *
 * Проба держит обе половины правила:
 *   · канон в каркасе покрывает ключи, встречающиеся больше чем в одной игре;
 *   · ни одна игра не передаёт тон, спорящий с каноном (иначе автор нового экрана
 *     тихо вернёт разнобой — его тон просто перестанет действовать, и он не узнает).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src/components/GameShell.tsx'), 'utf8');

/** Канон из каркаса — читаем его же, чтобы проба не завела вторую копию правды. */
function канон(): Record<string, string> {
  const m = SHELL.match(/const TONE_BY_KEY: Record<string, NonNullable<HudItem\['tone'\]>> = \{([\s\S]*?)\n\};/);
  expect(m).toBeTruthy();
  const out: Record<string, string> = {};
  for (const [, k, v] of (m![1] as string).matchAll(/(\w+):\s*'(\w+)'/g)) out[k] = v;
  return out;
}

/** Все объявления счётчиков по играм: ключ → {тон → в скольких играх}. */
function поИграм(): Map<string, Map<string, string[]>> {
  const dir = path.join(ROOT, 'app/games');
  const карта = new Map<string, Map<string, string[]>>();
  for (const f of fs.readdirSync(dir).filter((x: string) => x.endsWith('.tsx'))) {
    const src: string = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\{\s*key:\s*'([^']+)'[^}]*?\}/g)) {
      const блок = m[0];
      if (!блок.includes('label') && !блок.includes('value')) continue;   // не счётчик
      const key = m[1];
      const tone = (блок.match(/tone:\s*'(\w+)'/) || [, 'neutral'])[1] as string;
      if (!карта.has(key)) карта.set(key, new Map());
      const по = карта.get(key)!;
      if (!по.has(tone)) по.set(tone, []);
      по.get(tone)!.push(f);
    }
  }
  return карта;
}

describe('единая расцветка счётчиков шапки', () => {
  it('есть что проверять — канон непустой и игры объявляют счётчики', () => {
    expect(Object.keys(канон()).length).toBeGreaterThan(10);
    expect(поИграм().size).toBeGreaterThan(20);
  });

  it('🔴 канон СИЛЬНЕЕ тона, переданного игрой — иначе разнобой вернётся', () => {
    expect(SHELL).toContain('TONE[TONE_BY_KEY[it.key] ?? it.tone ?? \'neutral\']');
  });

  it('🔴 ключи, встречающиеся больше чем в одной игре, названы в каноне', () => {
    const k = канон();
    const пропущены: string[] = [];
    for (const [key, тона] of поИграм()) {
      const игр = new Set([...тона.values()].flat()).size;
      if (игр > 1 && !k[key]) пропущены.push(`${key} (в ${игр} играх)`);
    }
    expect(пропущены).toEqual([]);
  });

  it('🔴 ни одна игра не передаёт тон, спорящий с каноном', () => {
    const k = канон();
    const споры: string[] = [];
    for (const [key, тона] of поИграм()) {
      if (!k[key]) continue;
      for (const [tone, файлы] of тона) {
        // `neutral` — это «тон не указан», спором он не считается.
        if (tone !== 'neutral' && tone !== k[key]) споры.push(`${key}: ${файлы.join(', ')} просят ${tone}, канон ${k[key]}`);
      }
    }
    expect(споры).toEqual([]);
  });
});
