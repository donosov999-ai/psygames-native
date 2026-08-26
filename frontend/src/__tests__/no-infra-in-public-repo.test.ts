/* psygames-no-infra-leak-gate · VER 1 · 26.08.2026 */
/**
 * РЕПОЗИТОРИЙ ПУБЛИЧНЫЙ — АДРЕСАМ УЗЛОВ И ПУТЯМ К СЕКРЕТАМ В НЁМ НЕ МЕСТО.
 *
 * 🔴 ЗАМЕР 26.08.2026, ПОЧЕМУ ГЕЙТ ЗАВЕДЁН. `gh repo view --json isPrivate`
 * вернул `false`, а поиск по отслеживаемым файлам дал ВОСЕМЬ строк в пяти
 * файлах. Задача на вычистку висела с 24.08 и была помечена «вычищено локально,
 * нужен коммит» — на деле локальный файл был таким же, как на GitHub, то есть
 * не вычищено ничего. Проверка расхождения делается одной командой, а поверив
 * записи, я бы закрыл задачу впустую.
 *
 * ⚠️ ХУДШЕЕ БЫЛО НЕ В КОММЕНТАРИИ, А В КОДЕ:
 *   `const EMBED_URL = process.env.BRAINKIT_EMBED_URL || 'http://<узел>:<порт>/embed'`
 * Значение по умолчанию выдавало и хост, и открытый порт разом. Остальное —
 * упоминания хоста в пояснениях и путь к локальному хранилищу секретов.
 *
 * ⚠️ ЧЕГО ЭТОТ ГЕЙТ НЕ ДЕЛАЕТ: он смотрит РАБОЧЕЕ ДЕРЕВО, а не историю git.
 * Строки, уже ушедшие в публичные коммиты, остаются в истории и после правки;
 * вычистить их можно только переписыванием истории, и это отдельное решение.
 * Здесь сторожится лишь то, что не станет хуже.
 *
 * Домены при этом РАЗРЕШЕНЫ намеренно: `sb.asibots.pro` и `llm.asibots.pro`
 * стоят в коде клиента, потому что приложение к ним обращается — скрыть их
 * нельзя, они и так видны в сетевом трафике. Скрывается то, что за ними:
 * адрес узла, порт, путь к ключам.
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** Что искать. Каждый образец — с объяснением, зачем он тут. */
const FORBIDDEN: [RegExp, string][] = [
  [/\b37\.60\.\d{1,3}\.\d{1,3}\b/, 'адрес ИИ-узла целиком'],
  [/\b89\.116\.\d{1,3}\.\d{1,3}\b/, 'адрес узла ботов целиком'],
  [/\b194\.87\.\d{1,3}\.\d{1,3}\b/, 'адрес дев-узла целиком'],
  [/\b5\.189\.\d{1,3}\.\d{1,3}\b/, 'адрес Contabo целиком'],
  [/\b(?:37\.60|89\.116|194\.87|5\.189)(?![\d.])/, 'первые октеты адреса узла'],
  [/\.sdt_secrets/, 'путь к локальному хранилищу секретов'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY/, 'закрытый ключ'],
  [/\bssh\s+root@/, 'команда входа под root'],
  [/_ed25519\b/, 'имя файла ssh-ключа'],
];

const BINARY = /\.(png|jpg|jpeg|webp|gif|ttf|otf|woff2?|mp3|wav|zip|keystore|jks|ico|icns|pdf)$/i;

function trackedFiles(): string[] {
  const out = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').filter((f: string) => f && !BINARY.test(f));
}

describe('публичный репозиторий: инфраструктура наружу не течёт', () => {
  const files = trackedFiles();

  it('есть что проверять — файлы перечислены и сам гейт в списке', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('frontend/src/__tests__/no-infra-in-public-repo.test.ts');
  });

  it('🔴 ни адресов узлов, ни путей к секретам, ни ключей', () => {
    const found: string[] = [];
    for (const rel of files) {
      let text: string;
      try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Строки самого гейта — это описание образцов, а не утечка.
        if (rel.endsWith('no-infra-in-public-repo.test.ts')) continue;
        for (const [re, why] of FORBIDDEN) {
          if (re.test(lines[i])) found.push(`${rel}:${i + 1} — ${why}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('🔴 проверка живая: образцы действительно срабатывают на примерах', () => {
    // Без этого «ничего не найдено» могло бы означать «регулярки не совпадают
    // ни с чем никогда» — а именно так гейт и выглядел бы после опечатки.
    const samples = [
      'whisper на brainkit 37.60.245.18',
      'релей на 89.116.28.119',
      'ключ лежит в ~/.sdt_secrets/supabase_db.json',
      'ssh root@example',
      'brainkit_3760_ed25519',
      '-----BEGIN OPENSSH PRIVATE KEY-----',
    ];
    for (const s of samples) {
      expect(FORBIDDEN.some(([re]) => re.test(s))).toBe(true);
    }
    // И обратная сторона: разрешённое НЕ должно краснеть.
    for (const ok of ['релей sb.asibots.pro (Caddy)', 'llm.asibots.pro', 'https://iuvvheeocobhiothfgei.supabase.co']) {
      expect(FORBIDDEN.some(([re]) => re.test(ok))).toBe(false);
    }
  });
});
