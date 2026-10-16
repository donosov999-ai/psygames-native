import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/cloud_pilot.dart';
import 'package:psygames_flutter/shell/cloud_runtime.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('release client configuration constructs an inert opt-in runtime only', () async {
    SharedPreferences.setMockInitialValues({'psygames_pet_name':'Local pet'});
    final state = await SharedState.open();
    final runtime = PsyGamesCloudRuntime.fromEnvironment(state,const Stream<Uri>.empty());
    if (PsyGamesCloudRuntime.enabled) {
      expect(runtime,isNotNull);
      expect(runtime!.pilot.stage,CloudPilotStage.local);
      expect(runtime.pilot.gateway.accountId,isNull);
      expect(runtime.pilot.enabled,false);
      runtime.pilot.dispose();
    } else {
      expect(runtime,isNull);
    }
    expect(state.get(CloudPilot.consentKey),isNull);
    expect(state.get('psygames_pet_name'),'Local pet');
    state.dispose();
  });
}
