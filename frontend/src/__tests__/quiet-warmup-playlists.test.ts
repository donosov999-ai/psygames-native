import { GAMES } from '@/src/constants/games';
import { вСеткуЗарядки, заводскойСостав, разобрать, совместитьСоставы } from '@/src/services/playlistOverride';
import { заводскиеЗарядки, заводскойФайл } from '@/src/services/warmupData';
import { quietWarmupActive, setQuietWarmupActive } from '@/src/services/warmupAudio';
import { buildСвояСерия, prepareWarmup, resolveSlotPlaylist, stepToParams, установитьСеткуИзФайла, type Weekday } from '@/src/services/warmup';
import { игрыПодряд } from '@/src/services/languageFlow';

const factory = заводскойСостав()!;
const banned = new Set(Object.keys(заводскиеЗарядки.политика.замены));
const slots = ['morning', 'day', 'evening', 'night'] as const;
const durations = [5, 10, 15] as const;
const visual = { game_id: 'memory_matrix', game_route: '/games/memory-matrix', est_duration_sec: 90, settings: { size: 3 } };
const audio = { game_id: 'listening_span', game_route: '/games/listening-span', est_duration_sec: 70 };

afterEach(() => {
  установитьСеткуИзФайла(null);
  setQuietWarmupActive(false);
});

it('all 1092 factory cells, all named sets and Language flow contain no blocked game', () => {
  let count = 0;
  for (const cfg of Object.values(factory.профили)) {
    установитьСеткуИзФайла(вСеткуЗарядки(cfg.сетка));
    for (let d = 0; d < 7; d++) for (const slot of slots) for (const min of durations) {
      const meta = resolveSlotPlaylist({ morning_playlist: cfg.утро, evening_playlist: cfg.вечер }, slot, d as Weekday, min);
      expect(meta.steps.some(s => banned.has(s.game_id))).toBe(false);
      count++;
    }
  }
  expect(count).toBe(1092);
  expect(factory.наборы.flatMap(n => n.шаги).some(s => banned.has(s.game_id))).toBe(false);
  expect(игрыПодряд().some(id => banned.has(id))).toBe(false);
  const routes = new Map(GAMES.map(g => [g.id, g.route]));
  for (const plan of [заводскиеЗарядки.языки, ...Object.values(заводскиеЗарядки.темы)]) {
    for (const step of plan) expect(step.route).toBe(routes.get(step.id));
  }
  // The catalogue still contains the standalone games.
  for (const id of banned) expect(routes.has(id)).toBe(true);
});

it('an edited JSON cell controls preview and launch, including an explicitly empty cell', () => {
  const source = {
    app: заводскойФайл.app, format: заводскойФайл.format,
    профили: { free: { утро: [audio], сетка: { 0: { утро: { 5: [visual], 10: [] } } } } },
  };
  const parsed = разобрать(JSON.stringify(source));
  expect(parsed.отброшено).toEqual([]);
  const cfg = parsed.состав!.free;
  установитьСеткуИзФайла(вСеткуЗарядки(cfg.сетка));
  const preview = resolveSlotPlaylist({ morning_playlist: cfg.утро }, 'morning', 0, 5);
  expect(preview.steps).toEqual([visual]);
  expect(prepareWarmup(preview, 'free')).toEqual(preview);
  expect(resolveSlotPlaylist({ morning_playlist: cfg.утро }, 'morning', 0, 10).steps).toEqual([]);
  expect(resolveSlotPlaylist({ morning_playlist: cfg.утро }, 'morning', 0, 15).steps[0].game_id).not.toBe(audio.game_id);
});

it('old imports see a silent replacement plus new factory cells and renamed visual sets', () => {
  const imported = совместитьСоставы(factory, { профили: { free: {
    сетка: { 0: { утро: { 5: [audio] } } }, наборы: ['поток-хаб-hearing-5'],
  } } });
  expect(imported.профили.free.сетка?.[0]?.утро?.[10]).toEqual(factory.профили.free.сетка?.[0]?.утро?.[10]);
  expect(imported.профили.free.наборы).toEqual(['поток-тихая-память-5']);
  установитьСеткуИзФайла(вСеткуЗарядки(imported.профили.free.сетка));
  expect(resolveSlotPlaylist({}, 'morning', 0, 5).steps[0].game_id).toBe('corsi');
  expect(buildСвояСерия('старый набор', [audio], 0).steps[0].game_id).toBe('corsi');
});

it('first render after switching profiles uses the new explicit grid, never the previous global grid', () => {
  установитьСеткуИзФайла({ 0: { morning: { 5: [audio] } } });
  const meta = resolveSlotPlaylist({}, 'morning', 0, 5, undefined, { grid: { 0: { morning: { 5: [visual] } } } });
  expect(meta.steps).toEqual([visual]);
});

it('quiet presets override audio in full progressive rounds, without setting calm', () => {
  expect(stepToParams({ ...audio, game_id: 'digit_span', settings: { delivery: 'all' } }, 'morning', 'training'))
    .toEqual({ wu: '1', progress: '1', auto: '1', quiet: '1', delivery: 'screen' });
  expect(stepToParams({ ...audio, game_id: 'n_back', settings: { modality: 'dual' } }, 'day', 'training'))
    .toMatchObject({ quiet: '1', modality: 'single', progress: '1' });
  setQuietWarmupActive(true);
  expect(quietWarmupActive()).toBe(true);
  setQuietWarmupActive(false);
  expect(quietWarmupActive()).toBe(false);
});
