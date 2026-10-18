import 'dart:async';

import 'package:flutter/material.dart';

import 'l10n.dart';
import 'sudoku_support_service.dart';

/// All local support writes finish before this route permits gameplay again.
/// Merely opening the screen never grants permission or applies a new request.
class SudokuSupportScreen extends StatefulWidget {
  const SudokuSupportScreen({
    super.key,
    required this.service,
    required this.profile,
    this.recoverLocal,
  });
  final SudokuSupportService service;
  final String profile;
  final Future<void> Function()? recoverLocal;
  @override
  State<SudokuSupportScreen> createState() => _SudokuSupportScreenState();
}

class _SudokuSupportScreenState extends State<SudokuSupportScreen> {
  String _road = 'normal';
  bool _leaving = false;
  bool _canPop = false;
  bool _recoveryFailed = false;
  SudokuSupportService get _s => widget.service;
  @override
  void initState() {
    super.initState();
    _s.addListener(_changed);
    unawaited(_s.refresh());
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _s.removeListener(_changed);
    _s.suspend();
    super.dispose();
  }

  Future<void> _leave() async {
    if (_leaving) return;
    setState(() => _leaving = true);
    _s.suspend();
    await _s.drain();
    try {
      await widget.recoverLocal?.call();
      if (_s.hasPendingLocalWrite) {
        throw StateError('support_local_recovery_required');
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _leaving = false;
          _recoveryFailed = true;
        });
      }
      return;
    }
    if (!mounted) return;
    setState(() => _canPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).pop();
    });
  }

  Future<void> _apply(String id) async {
    await _s.apply(id);
    if (!mounted) return;
    if (!_s.needsResumeChoice) {
      if (_s.error == null) await _s.refresh();
      return;
    }
    final restart = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        scrollable: true,
        title: Text(L.t('sudokuSupportSavedTitle')),
        content: Text(L.t('sudokuSupportSavedHint')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(L.t('btn_cancel')),
          ),
          FilledButton(
            key: const Key('support-restart-confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: Text(L.t('sudokuSupportRestart')),
          ),
        ],
      ),
    );
    if (restart == true && mounted) {
      await _s.apply(id, restartSavedGame: true);
      if (mounted && _s.error == null) await _s.refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final grants = _s.grants
        .where((g) => g['profile'] == widget.profile && g['road'] == _road)
        .toList();
    final live = grants
        .where(
          (g) =>
              g['enabled'] == true &&
              (DateTime.tryParse('${g['expires_at']}')
                      ?.isAfter(DateTime.now().toUtc()) ??
                  false),
        )
        .toList();
    final rows = _s.corrections
        .where((c) => c['profile'] == widget.profile && c['road'] == _road)
        .toList();
    return PopScope<void>(
      canPop: _canPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_leave());
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(L.t('sudokuSupportTitle')),
          leading: BackButton(
            onPressed: _leaving ? null : () => unawaited(_leave()),
          ),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(L.t('sudokuSupportExplanation')),
              const SizedBox(height: 16),
              Text(L.f('sudokuSupportProfile', {'profile': widget.profile})),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: const Key('support-road'),
                initialValue: _road,
                decoration: InputDecoration(
                  labelText: L.t('sudokuSupportRoad'),
                ),
                items: [
                  DropdownMenuItem(
                    value: 'easy',
                    child: Text(L.t('sudokuRoadEasy')),
                  ),
                  DropdownMenuItem(
                    value: 'normal',
                    child: Text(L.t('sudokuRoadNormal')),
                  ),
                  DropdownMenuItem(
                    value: 'hard',
                    child: Text(L.t('sudokuRoadHard')),
                  ),
                ],
                onChanged: _s.busy || _leaving
                    ? null
                    : (value) => setState(() => _road = value!),
              ),
              const SizedBox(height: 16),
              if (!_s.ready) Text(L.t('sudokuSupportSignIn')),
              if (_s.busy || _leaving) const LinearProgressIndicator(),
              if (_s.error != null || _recoveryFailed)
                Text(
                  L.t('sudokuSupportError'),
                  key: const Key('support-error'),
                ),
              if (_s.ready) ...[
                if (live.isEmpty)
                  FilledButton(
                    key: const Key('support-enable'),
                    onPressed: _s.busy || _leaving
                        ? null
                        : () async {
                            await _s.enable(
                              profile: widget.profile,
                              road: _road,
                            );
                            if (mounted) await _s.refresh();
                          },
                    child: Text(L.t('sudokuSupportEnable')),
                  ),
                for (final grant in live) ...[
                  Text(
                    L.f('sudokuSupportUntil', {
                      'time':
                          '${DateTime.parse(grant['expires_at'] as String).toLocal()}',
                    }),
                  ),
                  OutlinedButton(
                    key: const Key('support-revoke'),
                    onPressed: _s.busy || _leaving
                        ? null
                        : () => unawaited(_s.revoke(grant['id'] as String)),
                    child: Text(L.t('sudokuSupportRevoke')),
                  ),
                ],
                OutlinedButton(
                  key: const Key('support-refresh'),
                  onPressed: _s.busy || _leaving
                      ? null
                      : () => unawaited(_s.refresh()),
                  child: Text(L.t('sudokuSupportRefresh')),
                ),
                if (rows.isEmpty) Text(L.t('sudokuSupportNoChanges')),
                for (final row in rows)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            L.f('sudokuSupportTarget', {
                              'level': '${row['target_level']}',
                            }),
                          ),
                          if (row['status'] == 'pending')
                            FilledButton(
                              key: Key('support-apply-${row['id']}'),
                              onPressed: _s.busy || _leaving
                                  ? null
                                  : () =>
                                        unawaited(_apply(row['id'] as String)),
                              child: Text(L.t('sudokuSupportApply')),
                            )
                          else
                            Text(L.t('sudokuSupportApplied')),
                        ],
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
