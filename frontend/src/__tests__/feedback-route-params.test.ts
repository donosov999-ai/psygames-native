/* psygames-feedback-route-params · VER 1 · 17.09.2026 */
/**
 * ЧИСТКА ПАРАМЕТРОВ ЭКРАНА ДЛЯ ОТЧЁТА (задача 75348e44).
 *
 * Сам перенос в отчёт сторожит `feedback-short-silent-send` (виджет монтируется, отчёт
 * уходит, режим в контексте). Здесь — правила чистки на выдуманных входах: что берём,
 * что режем и что отчёту не нужно вовсе.
 */
import { параметрыЭкранаДляОтзыва } from '@/src/services/feedbackGameState';

describe('параметры экрана для отчёта', () => {
  it('режим и флаги зарядки проходят как есть', () => {
    expect(параметрыЭкранаДляОтзыва({ mode: 'Singles', wu: '1', diff: 'easy' }))
      .toEqual({ mode: 'Singles', wu: '1', diff: 'easy' });
  });

  it('служебные ключи роутера не берём, пустые значения тоже', () => {
    expect(параметрыЭкранаДляОтзыва({ __EXPO_ROUTER_key: 'x', mode: 'Net', seed: '', extra: undefined }))
      .toEqual({ mode: 'Net' });
  });

  it('массив склеиваем, длинное режем до 120 знаков', () => {
    const длинное = 'а'.repeat(500);
    const итог = параметрыЭкранаДляОтзыва({ tags: ['a', 'b'], note: длинное })!;
    expect(`${итог.tags} · ${итог.note.length}`).toBe('a,b · 120');
  });

  it('не больше 12 ключей', () => {
    const много = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, String(i)]));
    expect(Object.keys(параметрыЭкранаДляОтзыва(много)!).length).toBe(12);
  });

  it('пусто — undefined, а не {} в отчёте', () => {
    expect(параметрыЭкранаДляОтзыва({})).toBeUndefined();
    expect(параметрыЭкранаДляОтзыва(null)).toBeUndefined();
    expect(параметрыЭкранаДляОтзыва({ __only_internal: 'x' })).toBeUndefined();
  });
});
