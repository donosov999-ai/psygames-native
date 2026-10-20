import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/diary_preferences.dart';
import '../core/photo_diary.dart';
import '../diary_controller.dart';
import 'diary_camera.dart';
import 'diary_repository.dart';
import 'diary_storage.dart';

/// No platform channel, directory, camera or permission work during creation.
/// Shared preferences contain consent flags only, never photos or diary entries.
DiaryController nativeDiaryController(SharedPreferences preferences) {
  const key = 'photo_diary_consent_v1';
  var consent = const DiaryPreferences();
  try {
    final raw = preferences.getString(key);
    if (raw != null) {
      final json = jsonDecode(raw);
      if (json is Map<String, dynamic>) {
        consent = DiaryPreferences.fromJson(json);
      }
    }
  } catch (_) {
    // Corrupt consent is not permission. Do not silently reset other app data.
  }
  FileDiaryRepository? repository;
  return DiaryController(
    consent,
    persistPreferences: (value) async {
      final saved = await preferences.setString(
        key,
        jsonEncode(value.toJson()),
      );
      if (!saved) throw StateError('Consent could not be saved');
    },
    loadDiary: () async {
      final repo = await DiaryStorage.open();
      await repo.recover();
      final diary = PhotoDiary(repo, FrontDiaryCamera());
      await diary.load();
      repository = repo;
      return diary;
    },
    readPhoto: (basename) async => repository?.readFrame(basename),
  );
}
