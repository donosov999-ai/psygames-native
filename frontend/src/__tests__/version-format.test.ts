/* psygames-version-format-gate · VER 1 · 29.08.2026 */
/**
 * ПОТОЛКИ ФОРМАТА ВЕРСИИ. Срез тега 1.256.0 (29.08.2026): Windows MSI-бандлер
 * Tauri упал с «app version minor number cannot be greater than 255» — ProductVersion
 * в MSI держит major.minor.build с minor ≤ 255, и схема 1.256.x умерла на ровном
 * месте. Play при этом успел потребить versionCode — тег пришлось хоронить.
 * Гейт ловит потолок ДО тега, на обычном jest.
 */
declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

const FILES = [
  join(__dirname, '..', '..', 'package.json'),
  join(__dirname, '..', '..', 'app.json'),
  join(__dirname, '..', '..', '..', 'src-tauri', 'tauri.conf.json'),
];

describe('формат версии', () => {
  it('🔴 minor ≤ 255 и patch ≤ 255 во всех трёх манифестах (потолок MSI ProductVersion)', () => {
    for (const f of FILES) {
      const m = /"version":\s*"(\d+)\.(\d+)\.(\d+)"/.exec(readFileSync(f, 'utf8'));
      expect(`${f.split('/').slice(-2).join('/')}: ${!!m}`).toBe(`${f.split('/').slice(-2).join('/')}: true`);
      const [, , minor, patch] = m!;
      expect(Number(minor)).toBeLessThanOrEqual(255);
      expect(Number(patch)).toBeLessThanOrEqual(255);
    }
  });

  it('версии трёх манифестов совпадают', () => {
    const vs = FILES.map((f) => /"version":\s*"([\d.]+)"/.exec(readFileSync(f, 'utf8'))![1]);
    expect(new Set(vs).size).toBe(1);
  });
});
