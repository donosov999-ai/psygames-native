/* eslint-disable @typescript-eslint/no-require-imports */
import { clampVolume, getVolume, setVolume, getSoundEnabled, masterGain } from '@/src/services/feedback';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const __dirname: string;

/**
 * ГРОМКОСТЬ — задача fe7f2020.
 *
 * 🔴 ГЛАВНОЕ, ЧТО СТОРОЖИТ ПРОБА: громкость и тумблер — РАЗНЫЕ величины. Ползунок в
 * нуле и выключенный звук выглядят одинаково (тишина), но означают разное: из нуля
 * человек ждёт возврата движением пальца, из выключенного тумблера — тумблером.
 * Свести их в одно значит получить «у меня пропал звук» без виноватых.
 *
 * ⚠️ И умолчание 80 — не круглое число «на глаз», а прежняя константа MASTER_GAIN
 * 0.8. У того, кто ничего не трогал, звук после обновления обязан остаться тем же:
 * молчаливая смена громкости читается как поломка.
 */
describe('громкость', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('🔴 умолчание 80 — ровно прежняя константа, поведение не менялось', async () => {
    expect(await getVolume()).toBe(80);
  });

  it('🔴 ноль громкости НЕ выключает тумблер: это разные ручки', async () => {
    await setVolume(0);
    expect(await getVolume()).toBe(0);
    expect(await getSoundEnabled()).toBe(true);   // тумблер не тронут
  });

  it('🔴 звук ПРАВДА следует за ползунком, а не остался константой', async () => {
    /**
     * ⚠️ Эта проба появилась после мутации: я вернул `masterGain` к жёсткому 0.8, и
     * все пять проверок остались зелёными. То есть ползунок мог не влиять на звук
     * вовсе, а гейт бы молчал — ровно тот случай, когда проверяют настройку, но не
     * её действие.
     */
    await setVolume(100); expect(masterGain()).toBeCloseTo(1, 5);
    await setVolume(50);  expect(masterGain()).toBeCloseTo(0.5, 5);
    await setVolume(0);   expect(masterGain()).toBe(0);
    await setVolume(80);  expect(masterGain()).toBeCloseTo(0.8, 5);
  });

  it('мусор и края не рвут звук', () => {
    expect(clampVolume(Number.NaN)).toBe(80);
    expect(clampVolume(-40)).toBe(0);
    expect(clampVolume(1000)).toBe(100);
    expect(clampVolume(37.4)).toBe(37);
  });

  it('значение переживает перезапуск', async () => {
    await setVolume(35);
    // Читается из хранилища, а не из памяти процесса.
    expect(await AsyncStorage.getItem('psygames_volume')).toBe('35');
  });

  it('🔴 ползунок стоит ПОД тумблером и только при включённом звуке', () => {
    const fs = require('fs');
    const path = require('path');
    const settings = fs.readFileSync(path.resolve(__dirname, '../../app/settings.tsx'), 'utf8') as string;
    // Две ручки на одно молчание — самая частая жалоба на такие настройки.
    expect(settings).toMatch(/\{soundOn && \(/);
    expect(settings).toContain('<VolumeSlider');
  });
});
