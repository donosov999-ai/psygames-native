import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/mode_thumbs.g.dart';
import 'package:psygames_flutter/games/proofreading/model.dart';
import 'package:psygames_flutter/games/proofreading/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// КАРТИНКИ ЗАДАНИЙ «КОРРЕКТУРЫ» (задача eb88829b) — как у веба (`превьюРежимаКорректуры`).
///
/// Стиль — по профилю, той же картой, что у анаграмм (`profileThumbStyle`, выгрузка «Слов»);
/// картинки — копией `frontend/assets/images/fillwords-modes/`.
void main() {
  setUp(() async {
    await L.load('en');
    final ref = jsonDecode(File('test/fixtures/proofreading-reference.json').readAsStringSync()) as Map<String, dynamic>;
    ProofScripts.useForTest((ref['scripts'] as Map).map((k, v) => MapEntry('$k', '$v')), '${ref['digits']}');
  });

  test('🔴 у каждого профиля есть картинка обоих заданий, и копия равна вебу байт в байт', () {
    for (final profile in [...anagramThumbProfileStyleData.keys, 'незнакомый']) {
      for (final task in [proofTaskLetters, proofTaskFillwords]) {
        final path = proofModeThumb(task, profile);
        final f = File(path);
        expect(f.existsSync(), isTrue, reason: '$profile/$task: нет $path');
        final web = File('../frontend/assets/images/fillwords-modes/${path.split('/').last}');
        expect(f.readAsBytesSync(), web.readAsBytesSync(), reason: '$path разошёлся с вебом');
      }
    }
  });

  for (final (profile, style) in const [('kids', 'kids'), ('nzt48', 'neuro'), ('drivers', 'speed')]) {
    testWidgets('🔴 профиль $profile — картинки стиля $style на плашках задания', (tester) async {
      SharedPreferences.setMockInitialValues({'${SharedState.prefix}active_profile': profile});
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: ProofreadingScreen(state: state, fwSeed: 3)));
      await tester.pumpAndSettle();
      for (final task in ['letters', 'fillwords']) {
        final img = tester.widget<Image>(find.byKey(Key('proof-task-$task-thumb')));
        expect((img.image as AssetImage).assetName, 'assets/proofreading_modes/${task}__$style.webp');
      }
      await tester.pumpWidget(const SizedBox());
    });
  }
}
