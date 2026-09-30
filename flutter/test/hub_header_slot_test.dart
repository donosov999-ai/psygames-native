import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// У РАЗВИЛКИ ЕСТЬ МЕСТО ПОД ШАПКУ РАЗДЕЛА — И ОНО НАД КАРТОЧКАМИ.
///
/// 🔴 ЗАЧЕМ. В вебе над выбором игр стоит ЗАРЯДКА раздела: карточка, которая
/// ставит несколько упражнений подряд по их собственным лестницам. Такие есть у
/// «Шахмат» и у «Слов». Без слота раздел вынужден либо писать свой экран
/// развилки вместо общего — и счёт «правок каркаса ноль» кончается, — либо
/// включить перехват и молча отнять у человека рабочую зарядку.
///
/// ⚠️ Порядок не косметика: шапка ВЫШЕ градиентного заголовка, потому что
/// зарядка — это действие, а заголовок только называет раздел. Человек,
/// пришедший «размяться», не должен искать кнопку под описанием.
void main() {
  testWidgets('🔴 шапка показывается над карточками, и без неё развилка прежняя', (t) async {
    // ⚠️ ОДНА ПРОБА НА ОБА СЛУЧАЯ, А НЕ ДВЕ. Две пробы здесь зависели от ПОРЯДКА:
    // вторая не находила шапку, хотя поодиночке проходила обе. Причина — общий
    // экран грузит карточки из ассета, и незавершённый хвост первой пробы мешал
    // второй. Проба, зависящая от порядка, краснеет на чужой правке и уводит
    // искать дефект там, где его нет.
    SharedPreferences.setMockInitialValues({});
    final s = await SharedState.open();

    Widget hub({Widget? header}) => MaterialApp(
          home: HubScreen(
            state: s,
            hubRoute: '/games/chess-hub',
            icon: Icons.extension,
            gradient: const [Colors.blue, Colors.indigo],
            header: header,
          ),
        );

    await t.pumpWidget(hub());
    await t.pump();
    await t.pump(const Duration(milliseconds: 100));
    // ⚠️ Название раздела встречается ДВАЖДЫ — в строке приложения и в градиентном
    // заголовке. Это не дубль и не дефект, просто finder обязан это знать.
    expect(find.text('Шахматы'), findsNWidgets(2), reason: 'развилка загрузилась');
    expect(find.text('зарядка раздела'), findsNothing, reason: 'без шапки её и нет');

    await t.pumpWidget(hub(header: const Text('зарядка раздела')));
    await t.pump();
    expect(find.text('зарядка раздела'), findsOneWidget);

    // Порядок не косметика: зарядка — действие, заголовок только называет раздел.
    final header = t.getTopLeft(find.text('зарядка раздела')).dy;
    // ⚠️ Якорь — ОПИСАНИЕ раздела, а не его название: название встречается дважды,
    // и одно из них в строке приложения, которая законно выше всего на экране.
    final title = t.getTopLeft(find.textContaining('Доска, поля и фигуры')).dy;
    expect(header, lessThan(title),
        reason: 'шапка обязана быть ВЫШЕ градиентного заголовка');
  });
}
