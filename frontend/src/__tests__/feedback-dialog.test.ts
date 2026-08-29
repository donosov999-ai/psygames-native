/* psygames-feedback-dialog-test · VER 1 · 28.08.2026 */
/**
 * ОКНО ДИАЛОГОВ — репорт NZT-48 «а где окно диалогов? я не вижу?» (26.08),
 * расшифровка Дениса 28.08: чат с разработчиком — мои сообщения и наши ответы.
 * Логика ленты — чистая (toBubbles), проверяется поведением; проводка виджета
 * и словарь — устройством.
 */
import { toBubbles, type DialogRow } from '@/src/services/feedbackDialog';

declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

const row = (over: Partial<DialogRow>): DialogRow => ({
  id: 'r1', created_at: '2026-08-28T10:00:00Z', message: 'привет', transcript: null,
  game_id: 'sudoku', has_audio: false, status: 'new',
  fixed_in_version: null, fix_note: null, fixed_at: null,
  dev_reply: null, dev_replied_at: null,
  ...over,
});

describe('диалог с разработчиком', () => {
  it('репорт без ответов — один пузырь «я»', () => {
    const b = toBubbles([row({})]);
    expect(b).toHaveLength(1);
    expect(b[0]!.who).toBe('me');
    expect(b[0]!.text).toBe('привет');
  });

  it('🔴 ответ и починка — отдельные пузыри разработчика, починка с версией', () => {
    const b = toBubbles([row({
      dev_reply: 'посмотрим', dev_replied_at: '2026-08-28T11:00:00Z',
      fix_note: 'починили', fixed_in_version: '1.256.0', fixed_at: '2026-08-28T12:00:00Z',
    })]);
    expect(b.map((x) => x.who)).toEqual(['me', 'dev', 'dev']);
    expect(b[1]!.text).toBe('посмотрим');
    expect(b[1]!.fixedIn).toBeNull();
    expect(b[2]!.fixedIn).toBe('1.256.0');
  });

  it('лента идёт по времени СОБЫТИЙ: поздняя починка первого репорта встаёт после второго репорта', () => {
    const b = toBubbles([
      row({ id: 'a', created_at: '2026-08-28T10:00:00Z', fix_note: 'готово', fixed_in_version: '1.1', fixed_at: '2026-08-28T13:00:00Z' }),
      row({ id: 'b', created_at: '2026-08-28T11:00:00Z', message: 'второй' }),
    ]);
    expect(b.map((x) => x.key)).toEqual(['a-me', 'b-me', 'a-fix']);
  });

  it('немое голосовое — пустой текст (экран подпишет «голосовое» по has_audio)', () => {
    const b = toBubbles([row({ message: '[голосом, без текста]', transcript: '[тишина]', has_audio: true })]);
    expect(b[0]!.text).toBe('');
  });

  it('виджет несёт вкладку и ленту, строки — на всех двенадцати языках', () => {
    const w = readFileSync(join(__dirname, '..', 'components', 'FeedbackWidget.tsx'), 'utf8');
    expect(w).toContain('testID="fb-dialog"');
    expect(w).toContain("'feedbackTabDialog'");
    expect(w).toContain('getMyDialog');
    const base = readFileSync(join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');
    for (const key of ['feedbackTabWrite', 'feedbackTabDialog', 'dialogEmpty', 'dialogFixedIn', 'dialogVoiceNote']) {
      expect(`base ${key}: ${base.includes(`  ${key}:`)}`).toBe(`base ${key}: true`);
      for (const lang of ['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh']) {
        const overlay = readFileSync(join(__dirname, '..', 'contexts', 'translations', `${lang}.ts`), 'utf8');
        expect(`${lang} ${key}: ${overlay.includes(`"${key}"`)}`).toBe(`${lang} ${key}: true`);
      }
    }
  });
});
