import 'dart:async';

import 'package:flutter/material.dart';

import 'cloud_backup.dart';
import 'cloud_pilot.dart';
import 'l10n.dart';
import 'sudoku_support_screen.dart';
import 'sudoku_support_recovery.dart';

/// Injected pilot only. This screen does not create a backend, recover a session
/// or issue requests on open. The host owns and disposes [pilot].
class CloudSettingsScreen extends StatefulWidget {
  const CloudSettingsScreen({super.key, required this.pilot});
  final CloudPilot pilot;
  @override
  State<CloudSettingsScreen> createState() => _CloudSettingsScreenState();
}

class _CloudSettingsScreenState extends State<CloudSettingsScreen> {
  final _email = TextEditingController();
  CloudPilot get _p => widget.pilot;

  @override
  void initState() {
    super.initState();
    _p.addListener(_changed);
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _p.removeListener(_changed);
    _email.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(L.t('cloudPilotDelete')),
        content: Text(L.t('cloudPilotDeleteWarning')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(L.t('btn_cancel')),
          ),
          FilledButton(
            key: const Key('cloud-delete-confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: Text(L.t('cloudPilotDelete')),
          ),
        ],
      ),
    );
    if (accepted == true && mounted) await _p.deleteCopies();
  }

  Future<void> _deleteAccount() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(L.t('cloudPilotDeleteAccount')),
        content: Text(L.t('cloudPilotDeleteAccountWarning')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(L.t('btn_cancel')),
          ),
          FilledButton(
            key: const Key('cloud-delete-account-confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: Text(L.t('cloudPilotDeleteAccount')),
          ),
        ],
      ),
    );
    if (accepted == true && mounted) await _p.deleteAccount();
  }

  Widget _button(
    String key,
    String label,
    VoidCallback action, {
    bool active = true,
  }) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: FilledButton(
      key: Key(key),
      onPressed: active && !_p.busy ? action : null,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Text(label, textAlign: TextAlign.center),
      ),
    ),
  );

  Widget _copy(CloudVersion version) {
    final date = MaterialLocalizations.of(context)
        .formatMediumDate(version.createdAt.toLocal());
    return Card(
      child: ListTile(
        key: Key('cloud-version-${version.id}'),
        title: Text(
          L.f('cloudPilotVersion', {'n': '${version.revision}', 'date': date}),
        ),
        trailing: const Icon(Icons.preview_outlined),
        enabled: !_p.busy,
        onTap: () => unawaited(_p.previewVersion(version)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => PopScope<void>(
    canPop: _p.stage != CloudPilotStage.restoring,
    onPopInvokedWithResult: (popped, _) {
      // Abandoned onboarding must not accept a later callback in the background.
      if (popped &&
          !_p.enabled &&
          _p.stage != CloudPilotStage.restorePrepared) {
        unawaited(_p.disable());
      }
    },
    child: Directionality(
      textDirection: L.locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(title: Text(L.t('cloudPilotTitle'))),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  L.t('cloudPilotTest'),
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                const SizedBox(height: 16),
                Text(
                  _p.enabled ? L.t('cloudPilotOn') : L.t('cloudPilotLocal'),
                  key: const Key('cloud-status'),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(L.t('cloudPilotLocalHint')),
                if (_p.busy)
                  const Padding(
                    padding: EdgeInsets.only(top: 16),
                    child: LinearProgressIndicator(),
                  ),
                if (_p.errorKey != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text(
                      L.t(_p.errorKey!),
                      key: const Key('cloud-error'),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                if (_p.stage == CloudPilotStage.local)
                  _button('cloud-begin', L.t('cloudPilotBegin'), _p.begin),
                if (_p.stage == CloudPilotStage.explanation) ...[
                  const SizedBox(height: 20),
                  Text(
                    L.t('cloudPilotIncluded'),
                    key: const Key('cloud-data-explanation'),
                  ),
                  const SizedBox(height: 12),
                  Text(L.t('cloudPilotExcluded')),
                  _button(
                    'cloud-accept',
                    L.t('cloudPilotAgree'),
                    _p.acceptExplanation,
                  ),
                ],
                if (_p.stage == CloudPilotStage.login) ...[
                  const SizedBox(height: 20),
                  TextField(
                    key: const Key('cloud-email'),
                    controller: _email,
                    enabled: !_p.busy,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    textCapitalization: TextCapitalization.none,
                    decoration: InputDecoration(
                      labelText: L.t('cloudPilotEmail'),
                    ),
                  ),
                  _button(
                    'cloud-send-link',
                    L.t('cloudPilotSend'),
                    () => unawaited(_p.sendLink(_email.text)),
                  ),
                ],
                if (_p.stage == CloudPilotStage.linkSent) ...[
                  const SizedBox(height: 20),
                  Text(L.t('cloudPilotLinkSent')),
                ],
                if (_p.stage == CloudPilotStage.history || _p.enabled) ...[
                  const SizedBox(height: 20),
                  if (_p.email != null)
                    Text(_p.email!, key: const Key('cloud-account')),
                  Text(
                    L.t('cloudPilotHistory'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(L.t('cloudPilotHistoryHint')),
                  if (_p.historyLoaded && _p.versions.isEmpty)
                    Text(L.t('cloudPilotNoCopies')),
                  if (!_p.historyLoaded || _p.errorKey != null)
                    _button(
                      'cloud-refresh-history',
                      L.t('retry'),
                      () => unawaited(_p.refreshHistory()),
                    ),
                  for (final version in _p.versions) _copy(version),
                  if (_p.stage == CloudPilotStage.history && _p.preview == null)
                    _button(
                      'cloud-confirm-history',
                      L.t('cloudPilotEnable'),
                      () => unawaited(_p.confirmHistory()),
                      active: _p.historyLoaded,
                    ),
                  if (_p.enabled) ...[
                    if (_p.support != null)
                      _button('cloud-support', L.t('sudokuSupportTitle'), () {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => SudokuSupportScreen(
                              service: _p.support!,
                              profile: _p.state.activeProfile,
                              recoverLocal: () =>
                                  recoverSudokuSupportWrites(_p.state),
                            ),
                          ),
                        );
                      }),
                    _button(
                      'cloud-save',
                      L.t('cloudPilotSave'),
                      () => unawaited(_p.save()),
                    ),
                    if (_p.conflict)
                      _button(
                        'cloud-keep-local',
                        L.t('cloudPilotKeepLocal'),
                        () => unawaited(_p.save(keepLocalAfterConflict: true)),
                      ),
                  ],
                ],
                if (_p.preview != null) ...[
                  const SizedBox(height: 20),
                  Text(
                    L.f('cloudPilotRestorePreview', {
                      'n': '${_p.preview!.data.length}',
                    }),
                    key: const Key('cloud-restore-preview'),
                  ),
                  _button(
                    'cloud-restore-confirm',
                    L.t('cloudPilotRestore'),
                    () => unawaited(_p.confirmRestore()),
                  ),
                  TextButton(
                    onPressed: _p.busy ? null : _p.cancelPreview,
                    child: Text(L.t('btn_cancel')),
                  ),
                ],
                if (_p.stage == CloudPilotStage.restorePrepared) ...[
                  const SizedBox(height: 20),
                  Text(
                    L.t('cloudPilotRestart'),
                    key: const Key('cloud-restore-pending'),
                  ),
                ],
                if (_p.stage != CloudPilotStage.local &&
                    _p.stage != CloudPilotStage.restoring &&
                    _p.stage != CloudPilotStage.restorePrepared)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: OutlinedButton(
                      key: const Key('cloud-off'),
                      onPressed: () => unawaited(_p.disable()),
                      child: Text(L.t('cloudPilotOff')),
                    ),
                  ),
                if (_p.enabled) ...[
                  TextButton(
                    key: const Key('cloud-sign-out'),
                    onPressed: _p.busy ? null : () => unawaited(_p.signOut()),
                    child: Text(L.t('cloudPilotSignOut')),
                  ),
                  TextButton(
                    key: const Key('cloud-delete'),
                    onPressed: _p.busy ? null : _delete,
                    child: Text(L.t('cloudPilotDelete')),
                  ),
                  if (_p.canDeleteAccount)
                    TextButton(
                      key: const Key('cloud-delete-account'),
                      onPressed: _p.busy ? null : _deleteAccount,
                      child: Text(L.t('cloudPilotDeleteAccount')),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

// Dynamic error keys must also be present in the generated native dictionaries.
const cloudPilotErrorKeys = <String>[
  'cloudPilotConflict',
  'cloudPilotError',
  'cloudPilotEmailInvalid',
  'cloudPilotAccountDeleteError',
];
