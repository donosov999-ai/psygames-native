library;

import 'dart:convert';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/services.dart';

import 'shared_state.dart';

/// 🔴 ПРОФИЛИ — ВЫГРУЗКА ЖИВОГО TS, А НЕ КОПИЯ (задача eae0879c).
///
/// `assets/profiles.json` пишет и держит свежим веб-проба
/// `frontend/src/__tests__/flutter-profiles-asset-fresh.test.ts`: поля карточек из
/// `PROFILES`, а «заперт ли» и «скоро ли» — результатом `requiresUnlock` / `isComingSoon`
/// (`unlock.ts`). Правило доступа здесь не повторяется — только читается.
class Profile {
  Profile(this.raw);

  final Map<String, dynamic> raw;

  String get id => raw['id'] as String;
  String get group => (raw['group'] as String?) ?? 'personal';
  String get emoji => (raw['emoji'] as String?) ?? '';
  String? get color => raw['color'] as String?;
  bool get requiresUnlock => raw['requiresUnlock'] == true;
  bool get comingSoon => raw['comingSoon'] == true;

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

  bool get monetization => flags['MONETIZATION_ENABLED'] == true;
  bool get codesEnabled => flags['UNLOCK_CODES_ENABLED'] == true;
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

  // ── Разблокировки — как `ProfileContext.tsx` ────────────────────────────────────
  static const unlockedKey = '${SharedState.prefix}unlocked_themed';
  static const activeKey = '${SharedState.prefix}active_profile';

  static Set<String> unlocked(SharedState s) {
    try {
      return {for (final v in jsonDecode(s.get(unlockedKey) ?? '[]') as List) '$v'};
    } catch (_) {
      return const {};
    }
  }

  bool accessible(SharedState s, String id) => !(byId(id)?.requiresUnlock ?? false) || unlocked(s).contains(id);

  /// `switchProfile`: запертый без разблокировки — не переключаем.
  Future<bool> switchTo(SharedState s, String id) async {
    if (byId(id) == null || !accessible(s, id)) return false;
    await s.set(activeKey, id);
    return true;
  }

  /// `resetUnlocks`: снять все разблокировки; текущий запертый → «free».
  Future<void> resetUnlocks(SharedState s) async {
    await s.remove(unlockedKey);
    if (byId(s.activeProfile)?.requiresUnlock ?? false) await s.set(activeKey, 'free');
  }
}
