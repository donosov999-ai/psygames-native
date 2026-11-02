// Isolated, session-only review of the REAL GoodsSortScreen/model/assets.
// Never use this entrypoint for store release or installed user data.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'games/goods_sort/feedback.dart';
import 'games/goods_sort/screen.dart';
import 'shell/app_look.dart';
import 'shell/app_theme.dart';
import 'shell/asset_server.dart';
import 'shell/design_template.dart';
import 'shell/game_clock.dart';
import 'shell/game_rules.dart';
import 'shell/game_shell.dart';
import 'shell/l10n.dart';
import 'shell/level_rules.dart';
import 'shell/shared_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // ignore: invalid_use_of_visible_for_testing_member
  SharedPreferences.setMockInitialValues({
    uiTemplateKey: 'aurora_v1',
    'psygames_theme_override': 'dark',
    'psygames_active_profile': 'nzt48',
    'language': 'en',
  });
  final state = await SharedState.open();
  await L.load('en');
  await AppLook.load(state);
  await GameRules.load();
  await LevelRules.load();
  final server = await AssetServer.start();
  server.reviveOnResume();
  installGameClockLifecycle();
  runApp(GoodsFeedbackReview(state: state));
}

class GoodsFeedbackReview extends StatefulWidget {
  const GoodsFeedbackReview({super.key, required this.state});
  final SharedState state;
  @override
  State<GoodsFeedbackReview> createState() => _GoodsFeedbackReviewState();
}

class _GoodsFeedbackReviewState extends State<GoodsFeedbackReview> {
  final options = GoodsFeedbackOptions(
    motion: true,
    rewards: true,
    haptics: true,
  );
  final navigator = GlobalKey<NavigatorState>();
  @override
  void dispose() {
    options.dispose();
    super.dispose();
  }

  Future<void> _controls() async {
    // The actual pause screen closes before dispatching this review-only action.
    final release = holdGame();
    try {
      await showModalBottomSheet<void>(
        context: navigator.currentContext!,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (context) => StatefulBuilder(
          builder: (context, refresh) {
            void change(VoidCallback action) {
              action();
              refresh(() {});
            }

            bool on(String key) => widget.state.get(key) != 'false';
            Future<void> put(String key, bool value) async {
              await widget.state.set(key, '$value');
              if (context.mounted) refresh(() {});
            }

            return SafeArea(
              child: SingleChildScrollView(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Goods effects · review only',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const Text(
                        'Same real game. Controls last only until this review app restarts. Audio engines are candidates, not a selected winner.',
                      ),
                      SwitchListTile(
                        title: const Text('Motion & landing'),
                        value: options.motion,
                        onChanged: (v) =>
                            change(() => options.update(motion: v)),
                      ),
                      SwitchListTile(
                        title: const Text('Victory sparks'),
                        value: options.rewards,
                        onChanged: (v) =>
                            change(() => options.update(rewards: v)),
                      ),
                      SwitchListTile(
                        title: const Text('Move / win haptic pilot'),
                        value: options.haptics,
                        onChanged: (v) =>
                            change(() => options.update(haptics: v)),
                      ),
                      const Text('Game SFX engine'),
                      Wrap(
                        spacing: 8,
                        children: [
                          for (final e in GoodsAudioEngine.values)
                            ChoiceChip(
                              label: Text(e.name),
                              selected: e == options.engine,
                              onSelected: (_) =>
                                  change(() => options.update(engine: e)),
                            ),
                        ],
                      ),
                      ValueListenableBuilder<String?>(
                        valueListenable: options.audioError,
                        builder: (_, error, _) => error == null
                            ? const SizedBox.shrink()
                            : Text(
                                'Audio unavailable: $error. The game still works.',
                              ),
                      ),
                      SwitchListTile(
                        title: const Text('App sound (existing master switch)'),
                        value: on('psygames_sound_enabled'),
                        onChanged: (v) => put('psygames_sound_enabled', v),
                      ),
                      SwitchListTile(
                        title: const Text(
                          'App haptics (existing master switch)',
                        ),
                        value: on('psygames_haptic_enabled'),
                        onChanged: (v) => put('psygames_haptic_enabled', v),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Back to the game'),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      );
    } finally {
      release();
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    navigatorKey: navigator,
    debugShowCheckedModeBanner: false,
    theme: appShellTheme(widget.state, brightness: Brightness.dark),
    home: GoodsSortScreen(
      state: widget.state,
      feedback: options,
      reviewAction: PauseAction(
        label: 'Effects lab',
        icon: Icons.tune,
        onPressed: () => unawaited(_controls()),
      ),
    ),
  );
}
