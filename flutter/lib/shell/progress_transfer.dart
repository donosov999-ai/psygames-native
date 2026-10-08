library;

import 'dart:convert';
import 'dart:io' show Platform;

import 'shared_state.dart';

/// 🔴 ПЕРЕНОС ПРОГРЕССА КОДОМ И РЕЗЕРВНАЯ КОПИЯ — ФОРМАТОМ ВЕБА (задача eae0879c).
///
/// Код (`frontend/src/services/dataTransfer.ts`) и копию (`frontend/src/services/backup.ts`)
/// выдаёт и старая веб-версия: код со старого телефона обязан открыться в нативных настройках,
/// а код отсюда — в вебе. Сверка — эталон живого TS
/// `flutter/test/fixtures/settings-transfer-reference.json` (прибор
/// `frontend/scripts/flutter-settings-transfer-reference.test.ts`), проба `settings_transfer_test.dart`.
///
/// ⚠️ Состав — РОВНО как у веба: только ключи `psygames_`. Личные рекорды `psygames.bestStreak.*`
/// и язык веб в код НЕ кладёт и при приёме отбрасывает (замер 02.10.2026). Положить их здесь —
/// веб на том конце их всё равно выкинет; чинить — в обеих половинах сразу, отдельной задачей.
class ProgressTransfer {
  static const _prefix = SharedState.prefix;
  static const _deviceId = '${_prefix}device_id';

  static Map<String, String> _ours(SharedState s, {required bool withDevice}) => {
        for (final e in s.snapshot().entries)
          if (e.key.startsWith(_prefix) && (withDevice || e.key != _deviceId)) e.key: e.value,
      };

  /// `exportProgress`: base64 от UTF-8 JSON `{v, ts, n, data}`; `device_id` не переносится.
  static String exportCode(SharedState s, {DateTime? now}) {
    final data = _ours(s, withDevice: false);
    final payload = jsonEncode({'v': 1, 'ts': (now ?? DateTime.now()).millisecondsSinceEpoch, 'n': data.length, 'data': data});
    return base64Encode(utf8.encode(payload));
  }

  /// `importProgress`: пробелы и переводы строк в коде игнорируются (код копируют из сообщений).
  /// Ошибки — те же метки, что у веба: `empty`, `bad-format`, `no-keys`, иначе текст исключения.
  static Future<({bool ok, int count, String? error})> importCode(SharedState s, String code) async {
    try {
      final clean = code.replaceAll(RegExp(r'\s+'), '');
      if (clean.isEmpty) return (ok: false, count: 0, error: 'empty');
      final parsed = jsonDecode(utf8.decode(base64Decode(clean)));
      final data = parsed is Map ? parsed['data'] : null;
      if (data is! Map) return (ok: false, count: 0, error: 'bad-format');
      final entries = <String, String>{
        for (final e in data.entries)
          if (e.key is String && (e.key as String).startsWith(_prefix) && e.key != _deviceId && e.value is String)
            e.key as String: e.value as String,
      };
      if (entries.isEmpty) return (ok: false, count: 0, error: 'no-keys');
      for (final e in entries.entries) {
        await s.set(e.key, e.value);
      }
      return (ok: true, count: entries.length, error: null);
    } catch (e) {
      final t = '$e';
      return (ok: false, count: 0, error: t.length > 120 ? t.substring(0, 120) : t);
    }
  }

  static const backupMagic = 'PsyGames-Backup';

  /// Время как `Date.prototype.toISOString` в JS: миллисекунды, `Z`, без микросекунд.
  static String jsIso(DateTime t) {
    final u = t.toUtc();
    String p(int n, [int w = 2]) => '$n'.padLeft(w, '0');
    return '${p(u.year, 4)}-${p(u.month)}-${p(u.day)}T${p(u.hour)}:${p(u.minute)}:${p(u.second)}.${p(u.millisecond, 3)}Z';
  }

  /// `buildBackupJSON`: все ключи `psygames_` (с `device_id` — как у веба), отступ 2.
  static String buildBackup(SharedState s, {required String appVersion, DateTime? now, String? device}) =>
      const JsonEncoder.withIndent('  ').convert({
        'app': backupMagic,
        'format': 1,
        'app_version': appVersion,
        'exported_at': jsIso(now ?? DateTime.now()),
        'device': device ?? Platform.operatingSystem,
        'data': _ours(s, withDevice: true),
      });

  /// `restoreBackupJSON`: число восстановленных ключей. Ошибка — метка для словаря экрана
  /// (`not-json`, `not-backup`, `empty`), а не русская фраза: веб здесь отдавал «Файл не
  /// читается — это не JSON» на любом языке, и англоязычный видел русский текст.
  static Future<int> restoreBackup(SharedState s, String json) async {
    Object? parsed;
    try {
      parsed = jsonDecode(json);
    } catch (_) {
      throw const BackupError('not-json');
    }
    final data = parsed is Map && parsed['app'] == backupMagic ? parsed['data'] : null;
    if (data is! Map) throw const BackupError('not-backup');
    final pairs = <String, String>{
      for (final e in data.entries)
        if (e.key is String && (e.key as String).startsWith(_prefix)) e.key as String: '${e.value}',
    };
    if (pairs.isEmpty) throw const BackupError('empty');
    for (final e in pairs.entries) {
      await s.set(e.key, e.value);
    }
    return pairs.length;
  }
}

class BackupError implements Exception {
  const BackupError(this.code);
  final String code;
  @override
  String toString() => 'BackupError($code)';
}
