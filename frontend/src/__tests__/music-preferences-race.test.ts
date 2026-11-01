jest.mock('@/src/services/music', () => ({ startMusic: jest.fn(), stopMusic: jest.fn(), setMusicGain: jest.fn() }));

describe('music preferences hydrate once, before a user override', () => {
  beforeEach(() => { jest.resetModules(); });

  it('a late stored off does not overwrite a fresh toggle on', async () => {
    let release!: (v: string | null) => void;
    const pending = new Promise<string | null>((r) => { release = r; });
    const storage = require('@react-native-async-storage/async-storage');
    storage.getItem.mockImplementation((k: string) => k === 'psygames_music_on' ? pending : Promise.resolve(null));
    storage.setItem.mockResolvedValue(undefined);
    const fb = require('@/src/services/feedback');
    const audio = require('@/src/services/music');
    const setting = fb.setMusicEnabled(true);
    release('false');
    await setting;
    expect(await fb.getMusicEnabled()).toBe(true);
    expect(audio.startMusic).toHaveBeenCalledTimes(1);
    expect(storage.getItem.mock.calls.filter(([k]: string[]) => k === 'psygames_music_on')).toHaveLength(1);
  });

  it('a fresh zero volume wins against hydration and also controls music gain', async () => {
    const storage = require('@react-native-async-storage/async-storage');
    storage.getItem.mockImplementation(() => Promise.resolve(null));
    storage.setItem.mockResolvedValue(undefined);
    const fb = require('@/src/services/feedback');
    const audio = require('@/src/services/music');
    await fb.setVolume(0);
    expect(await fb.getVolume()).toBe(0);
    expect(audio.setMusicGain).toHaveBeenLastCalledWith(0);
  });
});
