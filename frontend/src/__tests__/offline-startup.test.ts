/**
 * Контракт офлайн-старта: сеть не запускается при импорте api.ts; RootLayout
 * включает cloud только после первого рендера и выбора direct/relay.
 */
import {
  preferredSupabaseBase,
  SUPABASE_RELAY_URL,
  SUPABASE_URL,
} from '@/src/services/supabase';

declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

describe('офлайн-старт приложения', () => {
  const api = read('src/services/api.ts');
  const layout = read('app/_layout.tsx');
  const supabase = read('src/services/supabase.ts');

  it('не запускает migration/outbox в module scope', () => {
    expect(api).toContain('export function startSessionCloudSync(): void');
    expect(api).not.toMatch(/if\s*\(!IS_WEB_DEMO\)\s*\{\s*maybeMigrateLegacy\(\);/);
  });

  it('запускает cloud после задержки и после выбора адреса', () => {
    expect(layout).toContain('setTimeout(() =>');
    expect(layout).toMatch(/pickSupabaseBase\(\)[\s\S]*startSessionCloudSync\(\)/);
    expect(layout).toMatch(/startSessionCloudSync\(\);[\s\S]*flushFeedbackQueue\(\)/);
  });

  it('использует сохранённый relay сразу, а direct перепроверяет фоном', () => {
    expect(preferredSupabaseBase(SUPABASE_RELAY_URL)).toBe(SUPABASE_RELAY_URL);
    expect(preferredSupabaseBase(SUPABASE_URL)).toBe(SUPABASE_URL);
    expect(preferredSupabaseBase('broken-value')).toBe(SUPABASE_URL);
    expect(supabase).toContain('export function preferredSupabaseBase');
    expect(supabase).toMatch(/activate\(SUPABASE_RELAY_URL\);[\s\S]*void reachable\(SUPABASE_URL\)\.then/);
  });
});
