import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/resume_store.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// НЕЗАКОНЧЕННАЯ ПАРТИЯ ЧИТАЕТСЯ ОБЕИМИ ПОЛОВИНАМИ ОДИНАКОВО.
///
/// 🔴 Проба сверяет формат С ВЕБ-СТОРОНОЙ, а не сама с собой. Ключ и конверт
/// заданы в `frontend/src/services/resume.ts`; разойдутся — партия, сохранённая
/// одной половиной, не откроется другой, и это будет выглядеть как сломанное
/// сохранение, а не как разъехавшийся формат.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'free'});
    state = await SharedState.open();
  });

  ResumeStore store({int v = 1}) => ResumeStore(state, 'sudoku', v);

  test('🔴 ключ ровно такой же, как у веб-версии', () async {
    await store().save({'board': '123'});
    expect(state.get('psygames_resume_sudoku_free'), isNotNull,
        reason: 'веб пишет psygames_resume_<игра>_<профиль> — расходиться нельзя');
  });

  test('🔴 конверт тот же: v, savedAt, state', () async {
    await store(v: 3).save({'board': '123'});
    final env = jsonDecode(state.get('psygames_resume_sudoku_free')!) as Map<String, dynamic>;
    expect(env.keys.toSet(), {'v', 'savedAt', 'state'});
    expect(env['v'], 3);
    expect(env['savedAt'], isA<int>());
    expect(env['state'], {'board': '123'});
  });

  test('партия читается обратно', () async {
    await store().save({'board': '123', 'moves': 7});
    expect(await store().load(), {'board': '123', 'moves': 7});
  });

  test('🔴 чужая версия состава не читается и стирается', () async {
    await store(v: 1).save({'board': '123'});
    expect(await store(v: 2).load(), isNull,
        reason: 'старая запись новым кодом дала бы доску, которой не бывает');
    expect(state.get('psygames_resume_sudoku_free'), isNull, reason: 'и не висит вечно');
  });

  test('🔴 просроченная партия не воскресает — срок тот же, что у веба', () async {
    final old = DateTime.now().millisecondsSinceEpoch - ResumeStore.maxAge.inMilliseconds - 1;
    await state.set('psygames_resume_sudoku_free',
        jsonEncode({'v': 1, 'savedAt': old, 'state': {'board': '1'}}));
    expect(await store().load(), isNull);
    expect(state.get('psygames_resume_sudoku_free'), isNull);
  });

  test('битая запись не роняет экран и не остаётся мусором', () async {
    await state.set('psygames_resume_sudoku_free', 'не json вовсе');
    expect(await store().load(), isNull);
    expect(state.get('psygames_resume_sudoku_free'), isNull);
  });

  test('пустое состояние не пишется — иначе «есть что продолжить», а нечего', () async {
    await store().save({});
    expect(state.get('psygames_resume_sudoku_free'), isNull);
  });

  test('🔴 партия принадлежит ПРОФИЛЮ: у другого профиля её нет', () async {
    await store().save({'board': '123'});
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final other = await SharedState.open();
    expect(await ResumeStore(other, 'sudoku', 1).load(), isNull,
        reason: 'иначе доска одного человека открылась бы у другого');
  });

  test('доиграл — записи нет', () async {
    await store().save({'board': '123'});
    await store().clear();
    expect(await store().load(), isNull);
  });
}
