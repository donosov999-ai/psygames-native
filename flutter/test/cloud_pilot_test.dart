import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/cloud_backup.dart';
import 'package:psygames_flutter/shell/cloud_pilot.dart';
import 'package:psygames_flutter/shell/cloud_snapshot.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

// No Supabase client, real credentials, email or network in these UI-host tests.
class PilotFake implements CloudPilotGateway {
  @override
  String issuer = 'https://pilot.example/auth/v1';
  @override
  String? accountId;
  @override
  String? email;
  final calls = <String>[];
  final copies = [CloudVersion('one', 1, DateTime.utc(2026, 10, 16))];
  Completer<void>? pendingLink;
  Completer<CloudSnapshot>? pendingDownload;
  Completer<void>? pendingRestore;
  Completer<void>? pendingEnable;
  bool failEnable = false;
  bool failRestore = false;
  bool saveConflict = false;
  CloudSnapshot? prepared;
  @override
  Future<void> requestLink(String value) async {
    calls.add('link');
    email = value;
    await pendingLink?.future;
  }

  @override
  Future<void> completeLink(Uri uri) async {
    calls.add('callback');
    accountId = 'test-owner';
  }

  @override
  Future<List<CloudVersion>> versions() async {
    calls.add('versions');
    return copies;
  }

  @override
  Future<void> enableBackup() async {
    calls.add('enable');
    await pendingEnable?.future;
    if (failEnable) throw StateError('fixture');
  }

  @override
  Future<void> save({required bool keepLocalAfterConflict}) async {
    calls.add(keepLocalAfterConflict ? 'force-save' : 'save');
    if (saveConflict && !keepLocalAfterConflict) throw CloudConflict();
  }

  @override
  Future<CloudSnapshot> download(CloudVersion version) async {
    calls.add('download');
    return pendingDownload == null
        ? CloudSnapshot.capture({
            'psygames_sudoku_level_women': '79',
            'psygames_tokens_v1': '{"women":50}',
          })
        : await pendingDownload!.future;
  }

  @override
  Future<void> prepareRestore(CloudSnapshot snapshot) async {
    calls.add('prepare');
    await pendingRestore?.future;
    if (failRestore) throw StateError('fixture');
    prepared = snapshot;
  }

  @override
  Future<void> deleteCopies() async {
    calls.add('delete');
  }

  @override
  Future<void> signOut() async {
    calls.add('sign-out');
    accountId = null;
  }

  @override
  void suspend() {
    calls.add('suspend');
  }
}

void main() {
  late SharedState state;
  late CloudPilot pilot;
  late PilotFake gateway;
  Future<void> signedIn() async {
    pilot.begin();
    pilot.acceptExplanation();
    await pilot.sendLink('fixture@example.test');
    await pilot.completeLink(
      Uri.parse('com.psygames.app://auth/callback?code=fixture'),
    );
  }

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_tokens_v1': '{"women":100}',
      'psygames_pet_name': 'Synapse',
      'psygames_sudoku_level_women': '78',
    });
    state = await SharedState.open();
    gateway = PilotFake();
    pilot = CloudPilot(state, gateway);
  });
  tearDown(() {
    pilot.dispose();
    state.dispose();
  });

  test(
    'opening and declining do not recover/upload or enable saved consent',
    () async {
      expect(pilot.stage, CloudPilotStage.local);
      expect(gateway.calls, isEmpty);
      pilot.begin();
      expect(gateway.calls, isEmpty);
      await pilot.disable();
      expect(gateway.calls, ['suspend']);
      expect(state.get(CloudBackup.consentKey), '0');
      expect(state.get('psygames_sudoku_level_women'), '78');
    },
  );

  test('login cannot begin without explanation acceptance; invalid email stays local', () async {
    await pilot.sendLink('fixture@example.test');
    expect(gateway.calls, isEmpty);
    pilot.begin();
    pilot.acceptExplanation();
    await pilot.sendLink('broken');
    expect(pilot.errorKey, 'cloudPilotEmailInvalid');
    expect(gateway.calls, isEmpty);
  });

  test('authenticated history preview is NOT upload consent', () async {
    await signedIn();
    expect(pilot.stage, CloudPilotStage.history);
    expect(gateway.calls, ['link', 'callback', 'versions']);
    expect(state.get(CloudBackup.consentKey), isNull);
    expect(state.get(CloudPilot.receiptKey), isNull);
    await pilot.save();
    expect(gateway.calls.contains('save'), false);
  });

  test(
    'explicit history choice persists scoped receipt before enable',
    () async {
      await signedIn();
      await pilot.confirmHistory();
      expect(pilot.enabled, true);
      expect(state.get(CloudBackup.consentKey), '1');
      final receipt = jsonDecode(state.get(CloudPilot.receiptKey)!) as Map;
      expect(receipt['app_id'], 'psygames');
      expect(receipt['account_id'], 'test-owner');
      expect(receipt['issuer'], gateway.issuer);
      expect(receipt['version'], 1);
      expect(
        CloudSnapshot.capture(state.snapshot()).data
            .containsKey(CloudPilot.receiptKey),
        false,
      );
    },
  );

  test('failed enable withdraws receipt and returns LOCAL with local balance intact', () async {
    await signedIn();
    gateway.failEnable = true;
    await pilot.confirmHistory();
    expect(pilot.stage, CloudPilotStage.local);
    expect(state.get(CloudBackup.consentKey), '0');
    expect(state.get(CloudPilot.receiptKey), isNull);
    expect(state.get('psygames_tokens_v1'), '{"women":100}');
    expect(pilot.errorKey, 'cloudPilotError');
  });

  test(
    'OFF during pending login rejects late completion and preserves gameplay',
    () async {
      pilot.begin();
      pilot.acceptExplanation();
      gateway.pendingLink = Completer<void>();
      final pending = pilot.sendLink('fixture@example.test');
      expect(pilot.busy, true);
      await pilot.disable();
      gateway.pendingLink!.complete();
      await pending;
      expect(pilot.stage, CloudPilotStage.local);
      expect(pilot.busy, false);
      expect(gateway.calls, ['link', 'suspend']);
      await pilot.completeLink(
        Uri.parse('com.psygames.app://auth/callback?code=late'),
      );
      expect(gateway.calls.contains('callback'), false);
      expect(state.get('psygames_pet_name'), 'Synapse');
    },
  );

  test('account or issuer mismatch cannot link local history', () async {
    await signedIn();
    gateway.accountId = 'other-owner';
    await pilot.confirmHistory();
    expect(pilot.enabled, false);
    expect(gateway.calls.contains('enable'), false);
    gateway.accountId = 'test-owner';
    gateway.issuer = 'https://other.example/auth/v1';
    await pilot.confirmHistory();
    expect(gateway.calls.contains('enable'), false);
    expect(state.get(CloudBackup.consentKey), isNull);
  });

  test(
    'conflict requires explicit keep-local action, no reward or balance replay',
    () async {
      await signedIn();
      await pilot.confirmHistory();
      gateway.saveConflict = true;
      await pilot.save();
      expect(pilot.conflict, true);
      expect(gateway.calls.contains('force-save'), false);
      await pilot.save(keepLocalAfterConflict: true);
      expect(pilot.conflict, false);
      expect(state.get('psygames_tokens_v1'), '{"women":100}');
    },
  );

  test('restore preview changes no local data; cancellation never prepares journal', () async {
    await signedIn();
    await pilot.previewVersion(pilot.versions.first);
    expect(pilot.preview!.data['psygames_sudoku_level_women'], '79');
    expect(state.get('psygames_sudoku_level_women'), '78');
    pilot.cancelPreview();
    await pilot.confirmRestore();
    expect(gateway.prepared, isNull);
    expect(state.get('psygames_tokens_v1'), '{"women":100}');
  });

  test('OFF discards late download before restore can be prepared', () async {
    await signedIn();
    gateway.pendingDownload = Completer<CloudSnapshot>();
    final download = pilot.previewVersion(pilot.versions.first);
    await pilot.disable();
    gateway.pendingDownload!.complete(
      CloudSnapshot.capture({'psygames_sudoku_level_women': '79'}),
    );
    await download;
    expect(pilot.preview, isNull);
    expect(pilot.stage, CloudPilotStage.local);
    await pilot.confirmRestore();
    expect(gateway.prepared, isNull);
  });

  test('restore suspends sends and only prepares journal, never applies/sums rewards', () async {
    await signedIn();
    await pilot.confirmHistory();
    await pilot.previewVersion(pilot.versions.first);
    await pilot.confirmRestore();
    expect(pilot.stage, CloudPilotStage.restorePrepared);
    expect(state.get(CloudBackup.consentKey), '0');
    expect(
      gateway.calls.indexOf('suspend'),
      lessThan(gateway.calls.indexOf('prepare')),
    );
    expect(state.get('psygames_sudoku_level_women'), '78');
    expect(state.get('psygames_tokens_v1'), '{"women":100}');
    expect(gateway.prepared!.data['psygames_tokens_v1'], '{"women":50}');
  });

  test('restore failure does not pretend sync is still enabled', () async {
    await signedIn();
    await pilot.confirmHistory();
    await pilot.previewVersion(pilot.versions.first);
    gateway.failRestore = true;
    await pilot.confirmRestore();
    expect(pilot.stage, CloudPilotStage.local);
    expect(pilot.errorKey, 'cloudPilotError');
    expect(state.get('psygames_sudoku_level_women'), '78');
  });

  test('confirmed in-flight restore is not falsely cancelled by OFF', () async {
    await signedIn();
    await pilot.previewVersion(pilot.versions.first);
    gateway.pendingRestore = Completer<void>();
    final restore = pilot.confirmRestore();
    await Future<void>.delayed(Duration.zero);
    expect(pilot.stage, CloudPilotStage.restoring);
    await pilot.disable();
    expect(pilot.stage, CloudPilotStage.restoring);
    gateway.pendingRestore!.complete();
    await restore;
    expect(pilot.stage, CloudPilotStage.restorePrepared);
    expect(gateway.prepared, isNotNull);
    expect(state.get('psygames_sudoku_level_women'), '78');
  });

  test('account switching during enable withdraws the stale receipt', () async {
    await signedIn();
    gateway.pendingEnable = Completer<void>();
    final enable = pilot.confirmHistory();
    await Future<void>.delayed(Duration.zero);
    gateway.accountId = 'other-owner';
    gateway.pendingEnable!.complete();
    await enable;
    expect(pilot.stage, CloudPilotStage.local);
    expect(state.get(CloudBackup.consentKey), '0');
    expect(state.get(CloudPilot.receiptKey), isNull);
    expect(state.get('psygames_tokens_v1'), '{"women":100}');
  });

  test('OFF during enable cannot be undone by its late success', () async {
    await signedIn();
    gateway.pendingEnable = Completer<void>();
    final enable = pilot.confirmHistory();
    await Future<void>.delayed(Duration.zero);
    await pilot.disable();
    gateway.pendingEnable!.complete();
    await enable;
    expect(pilot.stage, CloudPilotStage.local);
    expect(state.get(CloudBackup.consentKey), '0');
    expect(state.get(CloudPilot.receiptKey), isNull);
  });

  test(
    'OFF and sign-out do not delete remote copies or local gameplay',
    () async {
      await signedIn();
      await pilot.confirmHistory();
      await pilot.signOut();
      expect(gateway.calls.contains('sign-out'), true);
      expect(gateway.calls.contains('delete'), false);
      expect(state.get(CloudPilot.receiptKey), isNull);
      expect(state.get('psygames_tokens_v1'), '{"women":100}');
    },
  );

  test(
    'explicit deletion removes only copies through gateway and disables sync',
    () async {
      await signedIn();
      await pilot.confirmHistory();
      await pilot.deleteCopies();
      expect(gateway.calls.contains('delete'), true);
      expect(pilot.stage, CloudPilotStage.local);
      expect(state.get('psygames_sudoku_level_women'), '78');
    },
  );
}
