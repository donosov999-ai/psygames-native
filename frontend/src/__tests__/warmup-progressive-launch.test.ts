import { stepToParams, установитьПравилоУровня, type PlaylistStep } from '@/src/services/warmup';
import { isProgressiveWarmup, trainingLevelId } from '@/src/services/warmupProgression';

const step: PlaylistStep = {
  game_id: 'digit_span', game_route: '/games/digit-span', est_duration_sec: 60,
  trials: 2, difficulty: 'easy', settings: { startLen: 3, size: 4 },
};

afterEach(() => установитьПравилоУровня(null, 'default'));

test('training launches a full progressive round, not permanently easy abbreviated trials', () => {
  const p = stepToParams(step, 'morning', 'training');
  expect(p).toEqual({ wu: '1', progress: '1', auto: '1' });
  expect(isProgressiveWarmup(p)).toBe(true);
  expect(trainingLevelId('digit_span_audio', true)).toBe('digit_span_audio_warmup');
  expect(trainingLevelId('digit_span_audio', false)).toBe('digit_span_audio');
});

test.each(['assessment', 'measure-peak', 'measure-baseline', 'financial-battery', 'rest'] as const)(
  '%s keeps fixed presets and does not promote training', track => {
    expect(isProgressiveWarmup(stepToParams(step, 'morning', track))).toBe(false);
  },
);

test('fixed baseline and deliberately fixed level are not turned into progression', () => {
  expect(isProgressiveWarmup(stepToParams({ ...step, is_fixed_baseline: true }, 'morning', 'training'))).toBe(false);
  expect(stepToParams({ ...step, settings: { level: 3 } }, 'morning', 'training').level).toBe('3');
  expect(isProgressiveWarmup(stepToParams({ ...step, settings: { level: 3 } }, 'morning', 'training'))).toBe(false);
});

test('night is relaxation, evening keeps calm without changing the progression contract', () => {
  expect(isProgressiveWarmup(stepToParams(step, 'night', 'training'))).toBe(false);
  expect(stepToParams(step, 'evening', 'training').calm).toBe('1');
  expect(isProgressiveWarmup(stepToParams(step, 'evening', 'training'))).toBe(true);
});
