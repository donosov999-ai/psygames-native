/* eslint-env jest */
// Официальный in-memory мок AsyncStorage — сервисы (tokens, cleanRun, vocab-srs,
// daily-challenge) читают/пишут хранилище в тестах без нативного слоя.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
