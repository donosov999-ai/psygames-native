library;

import 'dart:convert';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/services.dart';

import 'shared_state.dart';

/// 🔴 ПРОФИЛИ — ВЫГРУЗКА ЖИВОГО TS, А НЕ КОПИЯ (задача eae0879c).
///
/// `assets/profiles.json` пишет и держит свежим веб-проба
/// `frontend/src/__tests__/flutter-profiles-asset-fresh.test.ts`: поля карточек из
/// `PROFILES`. С 21.10.2026 (решение Дениса, d5e5814a) монетизации нет: замков, кодов и «скоро»
/// нет — все профили открыты всем на всех платформах.
class Profile {
  Profile(this.raw);

  final Map<String, dynamic> raw;

  String get id => raw['id'] as String;
  String get group => (raw['group'] as String?) ?? 'personal';
  String get emoji => (raw['emoji'] as String?) ?? '';
  String? get color => raw['color'] as String?;

  /// `null` — вся библиотека (`allowed_games: 'all'`).
  List<String>? get games => raw['allowed_games'] is List ? (raw['allowed_games'] as List).cast<String>() : null;
  String? get sessionMinutes => raw['session_minutes'] as String?;
  bool get warmup => raw['warmup_enabled'] == true;
  bool get financialDay => raw['financial_brain_day_enabled'] == true;
  bool get assessment => raw['assessment_enabled'] == true;

  /// Текст на двух языках из данных профиля: русскому — русский, ВСЕМ ОСТАЛЬНЫМ — английский
  /// (как `language === 'ru' ? p.x : (p.x_en ?? p.x)` в вебе; основной язык — английский).
  String? text(String field, String locale) =>
      locale == 'ru' ? raw[field] as String? : (raw['${field}_en'] as String?) ?? raw[field] as String?;
}

class Profiles {
  Profiles._(this.list, this.games, this.flags);

  final List<Profile> list;

  /// Игра из списка профиля → ключ имени и категория (значок в листе деталей).
  final Map<String, Map<String, dynamic>> games;
  final Map<String, dynamic> flags;

  static Profiles empty = Profiles._(const [], const {}, const {});
  static Profiles current = empty;

  int get publicGameCount => (flags['PUBLIC_GAME_COUNT'] as num?)?.toInt() ?? 0;

  Profile? byId(String id) {
    for (final p in list) {
      if (p.id == id) return p;
    }
    return null;
  }

  static Profiles parse(String raw) {
    final j = (jsonDecode(raw) as Map).cast<String, dynamic>();
    return Profiles._(
      [for (final p in (j['profiles'] as List? ?? const [])) Profile((p as Map).cast<String, dynamic>())],
      {for (final e in ((j['games'] as Map?) ?? const {}).entries) '${e.key}': (e.value as Map).cast<String, dynamic>()},
      ((j['flags'] as Map?) ?? const {}).cast<String, dynamic>(),
    );
  }

  static Future<Profiles> load({AssetBundle? bundle}) async {
    try {
      current = parse(await (bundle ?? rootBundle).loadString('assets/profiles.json'));
    } catch (_) {
      current = empty;
    }
    return current;
  }

  @visibleForTesting
  static void useForTest(Profiles p) => current = p;

  static const activeKey = '${SharedState.prefix}active_profile';

  /// `switchProfile`: любой существующий профиль.
  Future<bool> switchTo(SharedState s, String id) async {
    if (byId(id) == null) return false;
    await s.set(activeKey, id);
    return true;
  }
}
