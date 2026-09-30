import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';

/// 🔴 ОДИН ОТКРЫТЫЙ РАЗБОР НЕ ЗАМОРАЖИВАЕТ ЛЕСТНИЦЫ ВСЕХ ИГР.
///
/// Нашёл раздел «Объём памяти» 30.09.2026: отметка [LessonUsed] одна на всё
/// приложение, а снимали её только экраны, где сброс вписали руками. Разбор открыт
/// в Корси → две победы в «Матрице памяти», где разбора не было, — уровень стоит.
/// Человек видит, что уровень не растёт, и не знает почему.
///
/// Пробы меряют ПОВЕДЕНИЕ двух лестниц, а не наличие строки со сбросом: сброс
/// можно вписать в экран и всё равно не дать ему сработать.
void main() {
  tearDown(LessonUsed.reset);

  Future<LevelLadder> ladder(String id) async {
    final l = LevelLadder(gameId: id, store: MemoryLevelStore());
    await l.load();
    return l;
  }

  test('партия с разбором не засчитана, следующая партия той же игры — засчитана', () async {
    final corsi = await ladder('corsi');
    LessonUsed.mark();
    await corsi.win();
    expect(corsi.level, 1, reason: 'партия с открытым разбором поднимать уровень не должна');
    await corsi.win();
    expect(corsi.level, 2, reason: 'отметку должна съесть партия, которую она не засчитала');
  });

  test('🔴 разбор в одной игре, победа в ДРУГОЙ — уровень растёт', () async {
    final corsi = await ladder('corsi');
    final matrix = await ladder('memory_matrix');
    LessonUsed.mark();
    await corsi.win();                       // партия с разбором — законно не засчитана
    await matrix.win();
    await matrix.win();
    expect(matrix.level, 3,
        reason: 'разбора в «Матрице памяти» не было — её лестница стоять не должна');
  });

  test('проигрыш с разбором провал не копит и отметку тоже снимает', () async {
    final corsi = await ladder('corsi');
    await corsi.win();
    await corsi.win();                       // уровень 3
    LessonUsed.mark();
    await corsi.fail();                      // с разбором — не в счёт
    await corsi.fail();
    await corsi.fail();
    expect(corsi.level, 3, reason: 'два честных провала подряд уровень ещё не опускают');
    await corsi.fail();
    expect(corsi.level, 2, reason: 'третий честный провал подряд опускает — значит, отметка снята');
  });

  test('разбор открыли и бросили партию: вход в другую игру отметку снимает', () async {
    LessonUsed.mark();                       // разбор открыт, партия брошена
    final matrix = await ladder('memory_matrix');
    await matrix.win();
    expect(matrix.level, 2, reason: 'первая же партия новой игры обязана быть зачётной');
  });
}
