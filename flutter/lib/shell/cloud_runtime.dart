import 'dart:async';
import 'dart:io';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'cloud_gateway.dart';
import 'cloud_pilot.dart';
import 'cloud_restore.dart';
import 'cloud_settings_screen.dart';
import 'shared_state.dart';
import 'sudoku_support_service.dart';

/// App-owned OS vault. macOS uses non-sharing Keychain without requiring a
/// provisioned Data Protection sharing group; iOS retains device-only policy.
/// No preference/localStorage fallback and no changes to the pinned Auth SDK.
class PsyGamesAccountVault implements AccountVault {
  static const storage = FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
    mOptions: MacOsOptions(usesDataProtectionKeychain: false),
  );
  @override
  Future<String?> read(String key) => storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      storage.write(key: key, value: value);
  @override
  Future<void> remove(String key) => storage.delete(key: key);
}

/// Explicit developer pilot only. No shipped default cloud, recovery or uploads.
class PsyGamesCloudRuntime {
  PsyGamesCloudRuntime(this.pilot, this.links);
  final CloudPilot pilot;
  final Stream<Uri> links;
  static const enabled = bool.fromEnvironment('PSY_CLOUD_PILOT');
  static const callback = 'com.psygames.app://auth/callback';

  static Future<Directory> restoreDirectory() async => Directory(
    '${(await getApplicationSupportDirectory()).path}/ecosystem-cloud',
  );

  static PsyGamesCloudRuntime? fromEnvironment(
    SharedState state,
    Stream<Uri>? links,
  ) {
    if (!enabled) return null;
    const url = String.fromEnvironment('PSY_SUPABASE_URL');
    const key = String.fromEnvironment('PSY_SUPABASE_PUBLISHABLE_KEY');
    if (url != 'https://iuvvheeocobhiothfgei.supabase.co' ||
        !key.startsWith('sb_publishable_') ||
        links == null) {
      throw StateError(
        'Cloud pilot requires explicit approved client configuration',
      );
    }
    final account = EcosystemAccount(
      appId: 'psygames',
      url: url,
      publishableKey: key,
      callback: Uri.parse(callback),
      vault: PsyGamesAccountVault(),
    );
    final pilot = CloudPilot(
      state,
      PsyGamesCloudGateway(
        state: state,
        account: account,
        restoreDirectory: restoreDirectory,
      ),
    );
    pilot.support = SudokuSupportService(
      state: state,
      account: account,
      backupEnabled: () => pilot.enabled,
    );
    return PsyGamesCloudRuntime(pilot, links);
  }

  /// Invoked before language/theme/gameplay/WebView consumers. Failure propagates
  /// to a recovery-only UI; never silently launch over a partial replacement.
  static Future<bool> applyPending(
    SharedState state, {
    Directory? directory,
  }) async =>
      CloudRestore.applyPending(directory ?? await restoreDirectory(), state);
}

class CloudLinkHost extends StatefulWidget {
  const CloudLinkHost({
    super.key,
    required this.runtime,
    required this.navigatorKey,
    required this.child,
  });
  final PsyGamesCloudRuntime? runtime;
  final GlobalKey<NavigatorState> navigatorKey;
  final Widget child;
  @override
  State<CloudLinkHost> createState() => _CloudLinkHostState();
}

class _CloudLinkHostState extends State<CloudLinkHost>
    with WidgetsBindingObserver {
  StreamSubscription<Uri>? _subscription;
  bool _handling = false;
  Uri? _queued;
  Future<void> _startup = Future.value();
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startup = widget.runtime?.pilot.resumeExisting() ?? Future.value();
    _subscription = widget.runtime?.links.listen(
      (uri) => unawaited(_link(uri)),
      onError: (Object _) {},
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      unawaited(widget.runtime?.pilot.flushChanges());
    }
  }

  Future<void> _link(Uri uri) async {
    if (uri.scheme != 'com.psygames.app' ||
        uri.host != 'auth' ||
        uri.path != '/callback' ||
        uri.userInfo.isNotEmpty ||
        uri.hasPort ||
        uri.fragment.isNotEmpty ||
        (uri.queryParameters['code'] ?? '').isEmpty) {
      return;
    }
    if (_handling) {
      _queued = uri;
      return;
    }
    final runtime = widget.runtime;
    if (runtime == null) return;
    _handling = true;
    try {
      Uri? next = uri;
      while (next != null && mounted) {
        final current = next;
        _queued = null;
        // Clear BEFORE waiting so a newer URI arriving during recovery survives.
        await _startup;
        if (!mounted) return;
        await _process(runtime, current);
        next = _queued;
      }
    } finally {
      _handling = false;
    }
  }

  Future<void> _process(PsyGamesCloudRuntime runtime, Uri uri) async {
    final cold = runtime.pilot.stage == CloudPilotStage.local;
    await runtime.pilot.completeLink(uri);
    if (!mounted || !cold || runtime.pilot.stage != CloudPilotStage.history) {
      return;
    }
    // The callback is never sent to the WebView/router or an external window.
    final navigator = widget.navigatorKey.currentState;
    if (navigator != null) {
      unawaited(
        navigator.push(
          MaterialPageRoute<void>(
            builder: (_) => CloudSettingsScreen(pilot: runtime.pilot),
          ),
        ),
      );
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_subscription?.cancel());
    widget.runtime?.pilot.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
