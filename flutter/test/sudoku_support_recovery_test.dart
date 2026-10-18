import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/sudoku_support_recovery.dart';
import 'package:shared_preferences/shared_preferences.dart';

const owner = '11111111-1111-4111-8111-111111111111';
const issuer = 'https://iuvvheeocobhiothfgei.supabase.co/auth/v1';
const levelKey = 'psygames_sudoku_level_women';
const bestKey = 'psygames_sudoku_best_women';
const resumeKey = 'psygames_resume_sudoku_women';
final journalKey =
    'psygames_cloud_support_journal_${base64Url.encode(utf8.encode('$issuer|$owner'))}';

class _InterleavingState extends SharedState {
  _InterleavingState(super.prefs);
  @override
  Future<void> set(String key, String value) async {
    if (key == journalKey) {
      await super.set(resumeKey, 'new board during journal write');
    }
    await super.set(key, value);
  }
}

Map<String, dynamic> journal({
  String phase = 'prepared',
  bool restart = true,
}) => {
  'version': 1,
  'owner_id': owner,
  'issuer': issuer,
  'entries': [
    {
      'phase': phase,
      'restart': restart,
      'resume': 'original board',
      'record': {
        'id': '22222222-2222-4222-8222-222222222222',
        'owner_id': owner,
        'app_id': 'psygames',
        'grant_id': '33333333-3333-4333-8333-333333333333',
        'grant_revision': 7,
        'profile': 'women',
        'road': 'normal',
        'game_id': 'sudoku',
        'operation': 'unlock_at_least',
        'target_level': 80,
        'key_scope': levelKey,
      },
    },
  ],
};
Future<SharedState> open({
  Map<String, dynamic>? env,
  Map<String, Object> extra = const {},
}) async {
  SharedPreferences.setMockInitialValues({
    levelKey: '78',
    bestKey: '78',
    resumeKey: 'original board',
    'psygames_pet_name': 'Synapse',
    'psygames_tokens_v1': '51',
    journalKey: jsonEncode(env ?? journal()),
    ...extra,
  });
  return SharedState.open();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'offline committed intent finishes two keys, keeps backup, never ACKs',
    () async {
      final s = await open();
      addTearDown(s.dispose);
      await recoverSudokuSupportWrites(s);
      expect(s.get(levelKey), '80');
      expect(s.get(bestKey), '80');
      expect(s.get(resumeKey), isNull);
      expect(s.get(journalKey), contains('original board'));
      expect(
        jsonDecode(s.get(journalKey)!)['entries'][0]['phase'],
        'completed',
      );
      expect(s.get('psygames_pet_name'), 'Synapse');
      expect(s.get('psygames_tokens_v1'), '51');
      final after = s.snapshot();
      await recoverSudokuSupportWrites(s);
      expect(s.snapshot(), after);
    },
  );
  test(
    'partial level write and already removed resume recover monotonically',
    () async {
      final s = await open(extra: {levelKey: '81'});
      addTearDown(s.dispose);
      await s.remove(resumeKey);
      await recoverSudokuSupportWrites(s);
      expect(s.get(levelKey), '81');
      expect(s.get(bestKey), '81');
    },
  );
  test('completed and acked receipts never clear a new board', () async {
    for (final phase in ['completed', 'acked']) {
      final s = await open(
        env: journal(phase: phase),
        extra: {resumeKey: 'new board'},
      );
      final before = s.snapshot();
      await recoverSudokuSupportWrites(s);
      expect(s.snapshot(), before);
      s.dispose();
    }
  });
  test('changed resume blocks recovery without any writes', () async {
    final s = await open(extra: {resumeKey: 'new board'});
    addTearDown(s.dispose);
    final before = s.snapshot();
    await expectLater(recoverSudokuSupportWrites(s), throwsStateError);
    expect(s.snapshot(), before);
  });
  test(
    'resume changing while journal persistence awaits is never removed',
    () async {
      final seed = await open();
      seed.dispose();
      final s = _InterleavingState(await SharedPreferences.getInstance());
      addTearDown(s.dispose);
      await expectLater(recoverSudokuSupportWrites(s), throwsStateError);
      expect(s.get(resumeKey), 'new board during journal write');
      expect(s.get(levelKey), '78');
      expect(s.get(bestKey), '78');
    },
  );
  test(
    'no restart intent preserves same board and never discards it',
    () async {
      final s = await open(env: journal(restart: false));
      addTearDown(s.dispose);
      await recoverSudokuSupportWrites(s);
      expect(s.get(resumeKey), 'original board');
      expect(s.get(levelKey), '80');
    },
  );
  test('inherited higher road is kept without changing its key', () async {
    final s = await open(extra: {'psygames_sudoku_level_women_hard': '91'});
    addTearDown(s.dispose);
    await recoverSudokuSupportWrites(s);
    expect(s.get(levelKey), '91');
    expect(s.get('psygames_sudoku_level_women_hard'), '91');
  });
  for (final bad in [
    'owner',
    'issuer',
    'target',
    'key',
    'operation',
    'phase',
    'revision',
  ]) {
    test('rejects malformed $bad before local writes', () async {
      final env = journal();
      final e = (env['entries'] as List).first as Map;
      final r = e['record'] as Map;
      switch (bad) {
        case 'owner':
          env['owner_id'] = 'other';
        case 'issuer':
          env['issuer'] = 'https://foreign.invalid';
        case 'target':
          r['target_level'] = 181;
        case 'key':
          r['key_scope'] = 'psygames_tokens_v1';
        case 'operation':
          r['operation'] = 'win';
        case 'phase':
          e['phase'] = 'anything';
        case 'revision':
          r['grant_revision'] = 0;
      }
      final s = await open(env: env);
      addTearDown(s.dispose);
      final before = s.snapshot();
      await expectLater(recoverSudokuSupportWrites(s), throwsStateError);
      expect(s.snapshot(), before);
    });
  }
  test('malformed local level fails before clearing old resume', () async {
    final s = await open(extra: {bestKey: 'broken'});
    addTearDown(s.dispose);
    final before = s.snapshot();
    await expectLater(recoverSudokuSupportWrites(s), throwsStateError);
    expect(s.snapshot(), before);
  });
}
