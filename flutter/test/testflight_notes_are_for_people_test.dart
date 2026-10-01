import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 «ЧТО ТЕСТИРОВАТЬ» В TESTFLIGHT — ТОЛЬКО ДЛЯ ЛЮДЕЙ: БЕЗ КОММИТА И ССЫЛКИ НА GITHUB.
///
/// 📍 01.10.2026, Денис со скрином TestFlight: у 2.56.2 (37) в поле стояло «Коммит 6afc0067e45c ·
/// прогон https://github.com/…/actions/runs/…». Строку дописывал `flutter/tool/testflight_assign.py`
/// (`provenance_line`, 26.09). Поле видит каждый тестировщик на телефоне, включая семью.
/// Проба зовёт настоящую `stamp_what_to_test` с окружением GitHub Actions и подменённым
/// API App Store Connect и читает, ЧТО ушло бы в поле.
void main() {
  test('🔴 в поле уходят заметки как есть — ни коммита, ни ссылки', () async {
    const probe = r'''
import importlib.util, json, os, sys
spec = importlib.util.spec_from_file_location('tfa', 'tool/testflight_assign.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sent = []
def call(method, path, body=None):
    if method == 'GET':
        return {'data': [{'id': 'loc1', 'attributes': {'locale': 'en-US'}}]}
    sent.append(body['data']['attributes']['whatsNew'])
    return {}
m.call = call
m.stamp_what_to_test('build1', 'Зарядка целиком в приложении')
print(json.dumps(sent, ensure_ascii=False))
''';
    final r = await Process.run('python3', ['-c', probe], environment: {
      'GITHUB_SHA': '6afc0067e45c0000000000000000000000000000',
      'GITHUB_RUN_ID': '36825652585',
      'GITHUB_REPOSITORY': 'donosov999-ai/psygames-native',
      'GITHUB_SERVER_URL': 'https://github.com',
    });
    expect(r.exitCode, 0, reason: '${r.stderr}');
    final lines = (r.stdout as String).trim().split('\n');
    final sent = (jsonDecode(lines.last) as List).cast<String>();
    expect(sent, ['Зарядка целиком в приложении'], reason: 'в «Что тестировать» ушло лишнее: $sent');
    for (final t in sent) {
      expect(t, isNot(contains('github')), reason: 'ссылка на GitHub в поле тестировщика');
      expect(t, isNot(contains('6afc0067')), reason: 'коммит в поле тестировщика');
    }
  });
}
