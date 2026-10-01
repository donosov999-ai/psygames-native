// Общая память, которая пишет МЕДЛЕННО, — для проб щели «партия сдана, итога ещё нет».
//
// На телефоне запись лестницы идёт каналом к платформе и занимает миллисекунды: всё это
// время экран ещё в фазе «игра», последняя проба на экране, и нажатие в этот миг прошло
// бы в закрытую пробу и сдало партию второй раз — уровень прыгнул бы через ступень. В пробе
// подставная память отвечает мгновенно, и щель закрывается раньше, чем проба успевает нажать:
// охрана от повторной сдачи осталась бы непроверенной, а её снятие — незамеченным. Здесь
// запись растянута до [delay], и пробы нажимают внутри щели так же, как человек.
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SlowWriteState extends SharedState {
  SlowWriteState(super.prefs, {this.delay = const Duration(milliseconds: 300)});

  final Duration delay;

  /// Как `SharedState.open`, только запись медленная. Начальные значения — из
  /// `SharedPreferences.setMockInitialValues`, как у обычной памяти в пробах.
  static Future<SlowWriteState> open({Duration delay = const Duration(milliseconds: 300)}) async =>
      SlowWriteState(await SharedPreferences.getInstance(), delay: delay);

  @override
  Future<void> set(String key, String value) async {
    await Future<void>.delayed(delay);
    await super.set(key, value);
  }
}
