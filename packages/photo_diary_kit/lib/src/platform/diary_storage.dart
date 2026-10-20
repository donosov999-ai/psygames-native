import 'dart:io';

import 'package:flutter/services.dart';

import 'diary_repository.dart';

/// Fail closed if native no-backup storage is unavailable. No path fallback.
class DiaryStorage {
  static const channel = MethodChannel('com.odv999.photo_diary_kit/storage');
  static Future<FileDiaryRepository> open() async {
    final path = await channel
        .invokeMethod<String>('directory')
        .timeout(const Duration(seconds: 2));
    if (path == null ||
        !path.startsWith('/') ||
        !path.endsWith('/photo_diary') ||
        path.split('/').contains('..')) {
      throw StateError('Private diary storage unavailable');
    }
    return FileDiaryRepository(Directory(path));
  }
}
