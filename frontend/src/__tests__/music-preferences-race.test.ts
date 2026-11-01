jest.mock('@/src/services/music', () => ({ startMusic: jest.fn(), stopMusic: jest.fn(), setMusicGain: jest.fn() }));

describe('music preferences hydrate once, before a user override', () => {
  beforeEach(() => { jest.resetModules(); });

  it('a late stored off does not overwrite a fresh toggle on', async () => {
    let release!: (v: string | null) => void;
    const pending = new Promise<string | null>((r) => { release = r; });
    const storage = jest.requireMock('@react-native-async-storage/async-storage') as { getItem: jest.Mock; setItem: jest.Mock };
    storage.getItem.mockImplementation((k: string) => k === 'psygames_music_on' ? pending : Promise.resolve(null));
    storage.setItem.mockResolvedValue(undefined);
    const fb = jest.requireActual<typeof import('@/src/services/feedback')>('@/src/services/feedback');
    const audio = jest.requireMock('@/src/services/music') as jest.Mocked<typeof import('@/src/services/music')>;
    const setting = fb.setMusicEnabled(true);
    release('false');
    await setting;
    expect(await fb.getMusicEnabled()).toBe(true);
    expect(audio.startMusic).toHaveBeenCalledTimes(1);
    expect(storage.getItem.mock.calls.filter(([k]: string[]) => k === 'psygames_music_on')).toHaveLength(1);
  });

  it('a fresh zero volume wins against hydration and also controls music gain', async () => {
    const storage = jest.requireMock('@react-native-async-storage/async-storage') as { getItem: jest.Mock; setItem: jest.Mock };
    storage.getItem.mockImplementation(() => Promise.resolve(null));
    storage.setItem.mockResolvedValue(undefined);
    const fb = jest.requireActual<typeof import('@/src/services/feedback')>('@/src/services/feedback');
    const audio = jest.requireMock('@/src/services/music') as jest.Mocked<typeof import('@/src/services/music')>;
    await fb.setVolume(0);
    expect(await fb.getVolume()).toBe(0);
    expect(audio.setMusicGain).toHaveBeenLastCalledWith(0);
  });
});
