// Explicit synthetic-only backend acceptance, not a device/PKCE test.
// Kept outside integration_test: this uses the VM test runner, not Xcode builds.
// Run only with a private PSY_SYNTHETIC_ACCOUNT_FILE created for this test.
import 'dart:convert';
import 'dart:io';
import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/cloud_gateway.dart';
import 'package:psygames_flutter/shell/cloud_pilot.dart';
import 'package:psygames_flutter/shell/cloud_restore.dart';
import 'package:psygames_flutter/shell/cloud_snapshot.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SyntheticVault implements AccountVault {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async { values[key] = value; }
  @override
  Future<void> remove(String key) async { values.remove(key); }
}

void main() {
  final path = Platform.environment['PSY_SYNTHETIC_ACCOUNT_FILE'];
  test('owned synthetic backend: resume, backup, preview, restart restore, deletion', () async {
    final config = jsonDecode(await File(path!).readAsString()) as Map;
    expect(config['synthetic_only'], true);
    expect(config['url'], 'https://iuvvheeocobhiothfgei.supabase.co');
    final owner = config['owner'] as String;
    final session = config['session'] as Map;
    // Abort before networking unless the administrator-created marker matches.
    expect(session['user']['app_metadata']['purpose'], 'psygames-host-synthetic');
    expect(session['user']['id'], owner);
    final url = config['url'] as String;
    final issuer = '$url/auth/v1';
    final vault = SyntheticVault();
    final account = EcosystemAccount(appId:'psygames', url:url,
      publishableKey:config['publishable_key'] as String,
      callback:Uri.parse('com.psygames.app://auth/callback'), vault:vault);
    vault.values['${account.storageNamespace}.session'] = jsonEncode({
      'schema':1,'app_id':'psygames','issuer':issuer,'account_id':owner,'session':session,
    });
    SharedPreferences.setMockInitialValues({
      CloudPilot.consentKey:'1', CloudPilot.receiptKey:jsonEncode({
        'version':1,'app_id':'psygames','issuer':issuer,'account_id':owner,
      }),
      'psygames_sudoku_level_women':'79', 'psygames_tokens_v1':'{"women":50}',
      'psygames_pet_name':'Synthetic original', 'psygames_shop_owned':'["synthetic-hat"]',
    });
    final state = await SharedState.open();
    final directory = await Directory.systemTemp.createTemp('psygames-owned-cloud-');
    final gateway = PsyGamesCloudGateway(state:state, account:account,
      restoreDirectory:() async => directory);
    final pilot = CloudPilot(state,gateway);
    try {
      await pilot.resumeExisting();
      expect(pilot.enabled,true); expect(pilot.errorKey,isNull);
      await pilot.save();
      expect(pilot.errorKey,isNull); expect(pilot.versions.length,1);
      final first = pilot.versions.single;
      await state.set('psygames_sudoku_level_women','80');
      await state.set('psygames_tokens_v1','{"women":99}');
      await state.set('psygames_pet_name','Synthetic newer');
      await pilot.save();
      expect(pilot.errorKey,isNull); expect(pilot.versions.length,2);
      final old = pilot.versions.firstWhere((v) => v.id == first.id);
      await pilot.previewVersion(old);
      expect(pilot.preview?.data['psygames_sudoku_level_women'],'79');
      expect(state.get('psygames_sudoku_level_women'),'80');
      await pilot.confirmRestore();
      expect(pilot.stage,CloudPilotStage.restorePrepared);
      expect(state.get('psygames_tokens_v1'),'{"women":99}');
      expect(await CloudRestore.applyPending(directory,state),true);
      expect(state.get('psygames_sudoku_level_women'),'79');
      expect(state.get('psygames_tokens_v1'),'{"women":50}');
      expect(state.get('psygames_pet_name'),'Synthetic original');
      expect(state.get('psygames_shop_owned'),'["synthetic-hat"]');
      final safety = CloudSnapshot.decode(await File('${directory.path}/${CloudRestore.safetyFileName}').readAsString());
      expect(safety.data['psygames_tokens_v1'],'{"women":99}');
      expect(await CloudRestore.applyPending(directory,state),false);
      expect(await account.resume(consent:true,expectedAccountId:owner),true);
      await account.deleteAccount(confirmAllApps:true);
      expect(account.accountId,isNull);
      expect(state.get('psygames_sudoku_level_women'),'79');
      expect(state.get('psygames_tokens_v1'),'{"women":50}');
    } catch (_) {
      // Never expose provider responses/session dumps in Flutter failure logs.
      fail('Synthetic backend host acceptance failed; inspect scoped step privately');
    } finally {
      pilot.dispose(); await account.dispose(); state.dispose();
      // Test-created directory only; no app support directories or real backups.
      await directory.delete(recursive:true);
    }
  },skip:path==null ? 'Explicit synthetic backend fixture required' : false);
}
