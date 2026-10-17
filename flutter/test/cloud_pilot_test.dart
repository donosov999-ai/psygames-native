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

class DurablePilotFake extends PilotFake
    implements CloudResumeGateway, CloudAcknowledgedGateway {
  DurablePilotFake(this.state);
  final SharedState state;
  @override
  String? acknowledgedContent;
  @override
  bool hasPendingSave = false;
  String? pendingContent;
  @override
  Future<bool> resumeBackup() async {
    accountId = 'test-owner';
    return true;
  }

  @override
  Future<void> save({required bool keepLocalAfterConflict}) async {
    await super.save(keepLocalAfterConflict: keepLocalAfterConflict);
    acknowledgedContent =
        pendingContent ??
        jsonEncode(CloudSnapshot.capture(state.snapshot()).data);
    hasPendingSave = false;
    pendingContent = null;
  }
}

class DeletingPilotFake extends PilotFake
    implements CloudAccountDeletionGateway {
  bool failDeletion = false;
  Completer<void>? pendingDeletion;
  @override
  Future<void> deleteAccount() async {
    calls.add('delete-account');
    await pendingDeletion?.future;
    if (failDeletion) throw StateError('ambiguous remote deletion');
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
      expect(state.get(CloudPilot.consentKey), '0');
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
    expect(state.get(CloudPilot.consentKey), isNull);
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
      expect(state.get(CloudPilot.consentKey), '1');
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
    expect(state.get(CloudPilot.consentKey), '0');
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
    expect(state.get(CloudPilot.consentKey), isNull);
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
    expect(state.get(CloudPilot.consentKey), '0');
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
    expect(state.get(CloudPilot.consentKey), '0');
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
    expect(state.get(CloudPilot.consentKey), '0');
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

  test(
    'shared deletion is a distinct capability and preserves all local gameplay',
    () async {
      pilot.dispose();
      final deleting = DeletingPilotFake();
      gateway = deleting;
      pilot = CloudPilot(state, deleting);
      expect(pilot.canDeleteAccount, false);
      await signedIn();
      await pilot.confirmHistory();
      final progress = state.get('psygames_sudoku_level_women');
      final wallet = state.get('psygames_tokens_v1');
      expect(pilot.canDeleteAccount, true);
      await pilot.deleteAccount();
      expect(deleting.calls.where((c) => c == 'delete-account').length, 1);
      expect(deleting.calls.contains('delete'), false);
      expect(pilot.stage, CloudPilotStage.local);
      expect(state.get(CloudPilot.consentKey), '0');
      expect(state.get('psygames_sudoku_level_women'), progress);
      expect(state.get('psygames_tokens_v1'), wallet);
      expect(state.get('psygames_pet_name'), 'Synapse');
    },
  );

  test('ambiguous account deletion disables sync and requests sign-in, not false success', () async {
    pilot.dispose();
    final deleting = DeletingPilotFake()..failDeletion = true;
    gateway = deleting;
    pilot = CloudPilot(state, deleting);
    await signedIn();
    await pilot.confirmHistory();
    await pilot.deleteAccount();
    expect(pilot.stage, CloudPilotStage.local);
    expect(pilot.errorKey, 'cloudPilotAccountDeleteError');
    expect(state.get('psygames_sudoku_level_women'), '78');
    expect(state.get(CloudPilot.consentKey), '0');
  });

  test('late shared deletion cannot disable a new pilot generation', () async {
    pilot.dispose();
    final deleting = DeletingPilotFake()..pendingDeletion = Completer<void>();
    gateway = deleting;
    pilot = CloudPilot(state, deleting);
    await signedIn();
    await pilot.confirmHistory();
    final pending = pilot.deleteAccount();
    await Future<void>.delayed(Duration.zero);
    await pilot.disable();
    await signedIn();
    await pilot.confirmHistory();
    deleting.pendingDeletion!.complete();
    await pending;
    expect(pilot.enabled, true);
    expect(state.get(CloudPilot.consentKey), '1');
  });

  test(
    're-enable backs up progress made while OFF without another gameplay write',
    () async {
      pilot.dispose();
      final durable = DurablePilotFake(state)
        ..acknowledgedContent = jsonEncode(
          CloudSnapshot.capture(state.snapshot()).data,
        );
      gateway = durable;
      pilot = CloudPilot(state, gateway);
      await signedIn();
      await pilot.confirmHistory();
      await pilot.disable();
      await state.set('psygames_tokens_v1', '200');
      await signedIn();
      await pilot.confirmHistory();
      gateway.calls.clear();
      await pilot.flushChanges();
      expect(gateway.calls, ['save', 'versions']);
      expect(
        jsonDecode(durable.acknowledgedContent!)['psygames_tokens_v1'],
        '200',
      );
    },
  );

  test('resume reconciles pending B even when current A equals last acknowledged A', () async {
    pilot.dispose();
    final current = CloudSnapshot.capture(state.snapshot());
    final durable = DurablePilotFake(state)
      ..acknowledgedContent = jsonEncode(current.data)
      ..hasPendingSave = true
      ..pendingContent = jsonEncode({
        ...current.data,
        'psygames_tokens_v1': '200',
      });
    gateway = durable;
    pilot = CloudPilot(state, gateway);
    await state.set(CloudPilot.consentKey, '1');
    await pilot.resumeExisting();
    gateway.calls.clear();
    await pilot.flushChanges();
    expect(
      jsonDecode(durable.acknowledgedContent!)['psygames_tokens_v1'],
      '200',
    );
    expect(state.get('psygames_tokens_v1'), '{"women":100}');
    await pilot.flushChanges();
    expect(gateway.calls, ['save', 'versions', 'save', 'versions']);
    expect(durable.acknowledgedContent, jsonEncode(current.data));
  });

  test('changed progress flushes once after consent; OFF and metadata do not upload', () async {
    await state.set('psygames_tokens_v1', '120');
    await pilot.flushChanges();
    expect(gateway.calls, isEmpty);
    await signedIn();
    await pilot.confirmHistory();
    gateway.calls.clear();
    await state.set('psygames_tokens_v1', '130');
    await pilot.flushChanges();
    expect(gateway.calls, ['save', 'versions']);
    await pilot.flushChanges();
    expect(gateway.calls, ['save', 'versions']);
    await state.set(CloudPilot.receiptKey, 'metadata-only-change');
    await pilot.flushChanges();
    expect(gateway.calls, ['save', 'versions']);
    await pilot.disable();
    gateway.calls.clear();
    await state.set('psygames_tokens_v1', '140');
    await pilot.flushChanges();
    expect(gateway.calls, isEmpty);
  });

  test(
    'automatic conflict does not force overwrite or repeat on every flush',
    () async {
      await signedIn();
      await pilot.confirmHistory();
      gateway.calls.clear();
      gateway.saveConflict = true;
      await state.set('psygames_tokens_v1', '150');
      await pilot.flushChanges();
      expect(pilot.conflict, true);
      await pilot.flushChanges();
      expect(gateway.calls, ['save']);
      expect(state.get('psygames_tokens_v1'), '150');
    },
  );
}
