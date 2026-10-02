import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/progress_transfer.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КОД ПЕРЕНОСА И КОПИЯ — СОВМЕСТИМЫ С ВЕБОМ В ОБЕ СТОРОНЫ (задача eae0879c).
///
/// Эталон снят с живых `exportProgress` / `buildBackupJSON` / `importProgress`
/// (`frontend/scripts/flutter-settings-transfer-reference.test.ts`). Человек переносит прогресс
/// со старого телефона (веб) на новый (натив) — код одного обязан открываться другим.
void main() {
  final ref = jsonDecode(File('test/fixtures/settings-transfer-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final data = (ref['data'] as Map).cast<String, String>();

  Future<SharedState> state(Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues(prefs);
    return SharedState.open();
  }

  test('код, выданный ВЕБОМ, открывается нативом: те же ключи, без device_id', () async {
    final s = await state({});
    final r = await ProgressTransfer.importCode(s, ref['code'] as String);
    expect(r.ok, isTrue, reason: '${r.error}');
    final webKeys = (jsonDecode(utf8.decode(base64Decode(ref['code'] as String)))['data'] as Map).keys.toSet();
    expect(r.count, webKeys.length);
    for (final k in webKeys) {
      expect(s.get(k), data[k], reason: k);
    }
    expect(s.get('psygames_device_id'), isNull, reason: 'device_id уникален на установку — не переносится');
  });

  test('код НАТИВА раскладывается в ту же структуру, что у веба', () async {
    final s = await state(data);
    final mine = jsonDecode(utf8.decode(base64Decode(ProgressTransfer.exportCode(s)))) as Map;
    final web = jsonDecode(utf8.decode(base64Decode(ref['code'] as String))) as Map;
    expect(mine.keys.toList(), ['v', 'ts', 'n', 'data'], reason: 'порядок полей как у JSON.stringify веба');
    expect(mine['v'], web['v']);
    expect(mine['n'], web['n']);
    expect(mine['data'], web['data'], reason: 'состав кода разошёлся с вебом');
    expect((ref['nativeStyleAccepted'] as Map)['ok'], isTrue, reason: 'веб не принял код, собранный по правилам натива');
  });

  test('ошибки кода — метками веба', () async {
    final s = await state({});
    expect((await ProgressTransfer.importCode(s, '  \n ')).error, 'empty');
    expect((await ProgressTransfer.importCode(s, base64Encode(utf8.encode('{"x":1}')))).error, 'bad-format');
    expect((await ProgressTransfer.importCode(s, base64Encode(utf8.encode('{"data":{"language":"ru"}}')))).error, 'no-keys');
    expect((await ProgressTransfer.importCode(s, '###')).ok, isFalse);
  });

  test('копия, сохранённая ВЕБОМ, восстанавливается нативом целиком', () async {
    final s = await state({});
    final n = await ProgressTransfer.restoreBackup(s, ref['backup'] as String);
    final webData = (jsonDecode(ref['backup'] as String)['data'] as Map);
    expect(n, webData.length);
    for (final e in webData.entries) {
      expect(s.get(e.key as String), e.value, reason: '${e.key}');
    }
  });

  test('копия НАТИВА — тот же формат: поля, порядок, отступ, время как у JS', () async {
    final s = await state(data);
    final mine = ProgressTransfer.buildBackup(s,
        appVersion: '2.56.4', now: DateTime.utc(2026, 10, 2), device: 'ios');
    final web = ref['backup'] as String;
    final a = jsonDecode(mine) as Map, b = jsonDecode(web) as Map;
    expect(a.keys.toList(), b.keys.toList(), reason: 'порядок полей');
    expect(a, b, reason: 'содержимое копии разошлось с вебом');
    expect(mine.split('\n')[1], web.split('\n')[1], reason: 'отступ 2 пробела, как JSON.stringify(_, null, 2)');
  });

  test('ошибки копии — метками, а не русской фразой', () async {
    final s = await state({});
    Future<String?> code(String j) async {
      try {
        await ProgressTransfer.restoreBackup(s, j);
        return null;
      } on BackupError catch (e) {
        return e.code;
      }
    }

    expect(await code('не json'), 'not-json');
    expect(await code('{"app":"Другое","data":{}}'), 'not-backup');
    expect(await code('{"app":"PsyGames-Backup","data":{"language":"ru"}}'), 'empty');
  });

  test('время — как Date.prototype.toISOString', () {
    expect(ProgressTransfer.jsIso(DateTime.utc(2026, 1, 2, 3, 4, 5, 6, 7)), '2026-01-02T03:04:05.006Z');
  });
}
