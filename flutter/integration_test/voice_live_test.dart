/// ЖИВАЯ ПРОВЕРКА ГОЛОСА — НА НАСТОЯЩЕМ УСТРОЙСТВЕ, А НЕ ПОДСТАВНОМ.
///
/// 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ test/voice_test.dart. Та проба меряет ПРАВИЛА подставным
/// устройством и потому зелёная всегда, даже если в системе нет ни одного голоса,
/// а сеть лежит. Здесь наоборот: правила не проверяются вовсе, проверяется РУКА —
/// действительно ли `flutter_tts` произносит, а `just_audio` играет запись по сети.
/// Без этого «слой готов» — слова, а не факт: ровно так у нас уже уезжали в выпуск
/// экраны, которые «работали» только в пробах.
///
/// Запуск (звук пойдёт в колонки, это и есть смысл):
///   cd flutter && flutter test integration_test/voice_live_test.dart -d macos
///   (или `-d <id симулятора iPhone>`)
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:psygames_flutter/shell/voice_index.dart';
import 'package:psygames_flutter/shell/voice_system.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  test('🔴 указатель читается из настоящего ассета, а не из головы', () async {
    final index = await VoiceIndex.load();
    expect(index.live.isNotEmpty, isTrue, reason: 'живой корпус не прочитался');
    expect(index.samples.isNotEmpty, isTrue, reason: 'корпус семплов не прочитался');
    expect(index.letters.isNotEmpty, isTrue, reason: 'имена букв не прочитались');
    // Числа те же, что печатает генератор: расхождение значит, что ассет протух.
    final live = index.live.values.fold<int>(0, (a, m) => a + m.length);
    final samples = index.samples.values.fold<int>(0, (a, m) => a + m.length);
    // ignore: avoid_print — это живая проверка, её читают глазами
    print('УКАЗАТЕЛЬ: живых $live, семплов $samples, букв ${index.letters.length}');
    expect(live, 988);
    expect(samples, 1438);
  });

  test('🔴 системный голос ОТВЕЧАЕТ, а не молчит', () async {
    final backend = SystemVoiceBackend();
    final ru = await backend.hasSystemVoice('ru-RU');
    final en = await backend.hasSystemVoice('en-US');
    // ignore: avoid_print
    print('ГОЛОСА СИСТЕМЫ: ru-RU $ru · en-US $en');
    expect(en || ru, isTrue, reason: 'ни одного системного голоса — говорить нечем');

    final spoken = await backend.speakSystem('раз', 'ru-RU', 0.9);
    // ignore: avoid_print
    print('СИНТЕЗ «раз»: $spoken');
    expect(spoken, isTrue);
    await backend.cancel();
  });

  test('🔴 запись по сети ИГРАЕТСЯ: адрес слоя ведёт к настоящему файлу', () async {
    final index = await VoiceIndex.load();
    final layer = VoiceLayer(
      backend: SystemVoiceBackend(),
      soundOn: () => true,
      live: index.live,
      samples: index.samples,
      letters: index.letters,
    );
    final letter = index.letters.keys.first;
    final url = layer.letterUrl(letter);
    // ignore: avoid_print
    print('ЗАПИСЬ БУКВЫ $letter: $url');
    expect(url, isNotNull);

    final played = await layer.speakLetter(letter);
    // ignore: avoid_print
    print('ПРОИГРАЛАСЬ: $played');
    expect(played, isTrue, reason: 'файл есть на сервере (проверено curl), значит дело в устройстве');
    await layer.cancel();
  });
}
