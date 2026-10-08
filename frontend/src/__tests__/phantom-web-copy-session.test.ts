/* psygames-phantom-web-copy-session · VER 1 · 07.10.2026 */
/**
 * 🔴 ПАРТИЯ ВЕБ-КОПИИ ПОД НАТИВНЫМ ЭКРАНОМ НЕ ЗАСЧИТЫВАЕТСЯ, ПАРТИЯ ОБОЛОЧКИ — ЗАСЧИТЫВАЕТСЯ
 * (задача 5f9d4ea0; учёт — `services/hostSessions.ts`, точка — `saveSession` в `services/api.ts`).
 *
 * Отчёт 02d98918 (2.56.12): «SDMT — партий: 2» — веб-копия SDMT при `wu=1` стартовала сама под
 * нативным экраном, шла по своим часам и сохранилась: вторая запись, токены, серия за неигранное.
 * Метку `window.__psyNativeOver` ставит оболочка (`_openNative` в `flutter/lib/shell/hybrid_app.dart`).
 * Здесь — настоящие `saveSession`, журнал и токены, мост оболочки (`nativeSessionBridge.ts`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка модулей после очистки хранилища */
const { saveSession, getSessions } = require('@/src/services/api');
const { __test: bridge, installNativeSessionBridge } = require('@/src/services/nativeSessionBridge');
const { getTokens } = require('@/src/services/tokens');
/* eslint-enable @typescript-eslint/no-require-imports */

const PID = 'nzt48';
const g = globalThis as any;
const партия = (id: string) => ({ id, game_type: 'sdmt', score: 42, time_seconds: 60, profile_id: PID, passed: true });

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', PID);
  g.__psygames_active_profile_id = PID;
  bridge.reset();
  delete g.__psyNativeOver;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete g.__psyNativeOver;
  bridge.reset();
  jest.restoreAllMocks();
});

const ids = async () => (await getSessions()).map((s: any) => s.id);
const осесть = async () => { for (let i = 0; i < 20; i += 1) await new Promise((ok) => setTimeout(ok, 0)); };

describe('фантом веб-копии под нативным экраном', () => {
  it('🔴 пока поверх нативный экран — партия страницы не пишется и токены не растут', async () => {
    g.__psyNativeOver = '1 /games/sdmt';
    const before = await getTokens(PID);
    await saveSession(партия('phantom'));
    await осесть();
    expect(await ids()).toEqual([]);
    expect(await getTokens(PID)).toBe(before);
  });

  it('🔴 партия оболочки в то же время — пишется (приёмник `__psySaveSession`)', async () => {
    installNativeSessionBridge();
    g.__psyNativeOver = '1 /games/sdmt';
    g.__psySaveSession(партия('native'));
    await осесть();
    expect(await ids()).toEqual(['native']);
  });

  it('нативного экрана нет (или метку сняли) — партия страницы пишется как обычно', async () => {
    await saveSession(партия('web-1'));
    g.__psyNativeOver = null;
    await saveSession(партия('web-2'));
    await осесть();
    expect(await ids()).toEqual(['web-1', 'web-2']);
  });
});
