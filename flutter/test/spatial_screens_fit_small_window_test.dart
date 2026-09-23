import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/mental_rotation/screen.dart';
import 'package:psygames_flutter/games/spatial_hub/screen.dart';
import 'package:psygames_flutter/games/spatial_lab/screen.dart';
import 'package:psygames_flutter/games/spatial_span/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЧЕТЫРЕ ЭКРАНА РАЗДЕЛА ПОМЕЩАЮТСЯ В САМОЕ УЗКОЕ ОКНО, КОТОРОЕ У НАС ЕСТЬ.
///
/// 📍 Урок «Поиска и счёта» 23.09.2026, записка в канал psygames: «проба РАСКЛАДКИ ловит
/// то, чего не видит ни одна проба правил». У них два захода подряд она нашла настоящие
/// дефекты в уже написанных экранах — поле переполнялось на 23 точки, а ряд вставал
/// столбцом вместо строки. Числа рядов и ответы при этом были верными всё время.
///
/// 🔴 И ЭТО РОВНО МОЯ ДЫРА. У трёх экранов раздела из четырёх пробы раскладки не было
/// вовсе, а жалоба Дениса «игры ездят» (отчёт e5bfc2f0) — про это же самое: в вебе
/// страница прокручивалась и прятала переполнение, а в каркасе высота приходит ЧИСЛОМ,
/// и содержимое обязано в неё уложиться.
///
/// ⚠️ ЧТО ИМЕННО СТОРОЖИТСЯ. Не «красиво», а исключение раскладки: Flutter на
/// переполнении бросает `FlutterError` («A RenderFlex overflowed by N pixels»), и
/// `tester.takeException()` его отдаёт. Окно 360×640 — самое узкое из замеренных
/// координатором 17.09; 390×844 — обычный телефон.
///
/// ⚠️ ГРАНИЦА ПРОБЫ, И ЕЁ НАДО ЗНАТЬ. Смотрится ПЕРВЫЙ кадр каждого экрана, а не вся
/// партия: переполнение, которое вылезет на длинном ряду или на карточке итога, сюда не
/// попадёт. Расширять — теми же тремя строками на нужную фазу.
///
/// ДОКАЗАНО МУТАЦИЯМИ 23.09.2026, три из трёх краснеют: широкий кусок в ряду карточки
/// развилки (2 из 8 проверок), подмена корневой раскладки на заведомо большую в «Ряде»
/// и во «Вращении».
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_mental_rotation_level_nzt48': '7',
      'psygames_spatial_lab_net_level_nzt48': '3',
    });
    state = await SharedState.open();
    await L.load('ru');
  });

  /// Открыть экран в окне заданного размера и вернуть исключение раскладки, если оно было.
  /// ⚠️ Имена здесь латиницей: Dart не принимает кириллицу в идентификаторах — только
  /// в строках и комментариях.
  Future<Object?> openAt(WidgetTester tester, Widget screen, Size window) async {
    tester.view.physicalSize = window;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(home: screen));
    await tester.pump();
    await tester.pump();
    return tester.takeException();
  }

  final windows = <String, Size>{
    'узкое 360×640': const Size(360, 640),
    'обычное 390×844': const Size(390, 844),
  };

  for (final w in windows.entries) {
    testWidgets('🔴 «Вращение» не переполняет ${w.key}', (tester) async {
      expect(await openAt(tester, MentalRotationScreen(state: state), w.value), isNull);
    });

    testWidgets('🔴 «Ряд» не переполняет ${w.key}', (tester) async {
      expect(await openAt(tester, SpatialSpanScreen(state: state), w.value), isNull);
    });

    testWidgets('🔴 «Лаборатория» не переполняет ${w.key}', (tester) async {
      expect(await openAt(tester, SpatialLabScreen(state: state), w.value), isNull);
    });

    testWidgets('🔴 Развилка не переполняет ${w.key}', (tester) async {
      expect(await openAt(tester, SpatialHubScreen(state: state, onOpen: (_) {}), w.value), isNull);
    });
  }
}
