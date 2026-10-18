// Explicit synthetic-only host test. Skipped by default; never uses real players.
import 'dart:convert';
import 'dart:io';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/io_client.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/sudoku_support_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Vault implements AccountVault {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    values.remove(key);
  }
}

class _RealHttp extends HttpOverrides {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final path = Platform.environment['PSY_SYNTHETIC_SUPPORT_FILE'];
  test(
    'live scoped queue -> real SDK -> durable local80 -> filtered ACK -> revoke',
    () async {
      final fixture =
          jsonDecode(File(path!).readAsStringSync()) as Map<String, dynamic>;
      expect(fixture['synthetic_only'], true);
      expect(fixture['url'], 'https://iuvvheeocobhiothfgei.supabase.co');
      SharedPreferences.setMockInitialValues({
        'psygames_sudoku_level_women': '78',
        'psygames_sudoku_best_women': '78',
        'psygames_resume_sudoku_women': 'synthetic-old-board-retain-verbatim',
        'psygames_tokens_v1': '51',
        'psygames_pet_name': 'Synthetic pet',
        'psygames_shop_owned_v1': '["synthetic-hat"]',
        'psygames_sessions': '[{"synthetic":true}]',
      });
      final state = await SharedState.open();
      final before = state.snapshot();
      final vault = _Vault();
      // Flutter's test binding deliberately returns HTTP400. This explicit
      // environment-gated integration test alone opts into a real TLS client.
      final transport = IOClient(
        HttpOverrides.runWithHttpOverrides(() => HttpClient(), _RealHttp()),
      );
      final account = EcosystemAccount(
        appId: 'psygames',
        url: fixture['url'] as String,
        publishableKey: fixture['publishable_key'] as String,
        callback: Uri.parse('com.psygames.app://auth/callback'),
        vault: vault,
        transport: transport,
      );
      final service = SudokuSupportService(
        state: state,
        account: account,
        backupEnabled: () => true,
      );
      try {
        vault.values['${account.storageNamespace}.session'] = jsonEncode({
          'schema': 1,
          'app_id': 'psygames',
          'issuer': account.issuer,
          'account_id': fixture['owner'],
          'session': fixture['session'],
        });
        expect(
          await account.resume(
            consent: true,
            expectedAccountId: fixture['owner'] as String,
          ),
          true,
        );
        await service.refresh();
        expect(service.error, isNull);
        expect(service.grants.length, 1);
        expect(service.corrections.single['id'], fixture['correction_id']);
        await service.apply(fixture['correction_id'] as String);
        expect(service.needsResumeChoice, true);
        expect(state.get('psygames_sudoku_level_women'), '78');
        expect(
          state.get('psygames_resume_sudoku_women'),
          before['psygames_resume_sudoku_women'],
        );
        await service.apply(
          fixture['correction_id'] as String,
          restartSavedGame: true,
        );
        expect(service.error, isNull);
        expect(state.get('psygames_sudoku_level_women'), '80');
        expect(state.get('psygames_sudoku_best_women'), '80');
        expect(state.get('psygames_resume_sudoku_women'), isNull);
        for (final key in before.keys.where((k) => !k.contains('sudoku_'))) {
          expect(
            state.get(key),
            before[key],
            reason: 'non-game state must stay unchanged',
          );
        }
        final journal = state
            .snapshot()
            .entries
            .singleWhere((e) => e.key.startsWith('psygames_cloud_support_'))
            .value;
        expect(journal, contains('synthetic-old-board-retain-verbatim'));
        expect(journal, contains('acked'));
        await service.refresh();
        expect(service.error, isNull);
        expect(service.corrections.single['status'], 'applied');
        final report = await account
            .from('psygames_support_reports')
            .select()
            .eq('owner_id', fixture['owner']);
        expect(report.single['level'], 80);
        expect(report.single['resume_present'], false);
        await service.revoke(fixture['grant_id'] as String);
        expect(service.error, isNull);
        expect(service.grants.single['enabled'], false);
      } finally {
        service.suspend();
        await service.drain();
        service.dispose();
        await account.dispose();
        transport.close();
        state.dispose();
      }
    },
    skip: path == null ? 'Requires explicit isolated synthetic fixture' : false,
    timeout: const Timeout(Duration(seconds: 90)),
  );
}
