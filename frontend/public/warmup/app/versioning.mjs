export const VERSION_MANIFEST = Object.freeze({
  schemaVersion: 1,
  app: Object.freeze({
    id: 'com.odv999.smartalarm',
    version: '0.1.0',
    channel: 'local',
    displayVersion: '0.1.0-local',
  }),
  practiceBlocks: Object.freeze({
    breathing: '0.1.0',
    'eye-gym': '0.1.0',
    'face-speech': '0.1.0',
    relaxation: '0.1.0',
    'pelvic-floor': '0.1.0',
    mobility: '0.1.0',
    postures: '0.1.0',
    isometrics: '0.1.0',
    abdomen: '0.1.0',
    feldenkrais: '0.1.0',
  }),
});

export function getPracticeBlockVersion(setId) {
  const version = VERSION_MANIFEST.practiceBlocks[setId];
  if (!version) throw new Error(`Missing version for practice block: ${setId}`);
  return version;
}

export function getVersionedPracticeBlockIds() {
  return Object.keys(VERSION_MANIFEST.practiceBlocks);
}
