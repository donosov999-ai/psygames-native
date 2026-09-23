/// Голосовой слой приложения: озвучка слов, фонем и псевдослов.
///
/// 🔴 ПЕРЕНОС, А НЕ ИЗОБРЕТЕНИЕ. Веб-сторона живёт двумя файлами, и их правила
/// переносятся сюда целиком:
/// · `frontend/src/services/tts.ts` — системный голос ОС, карта кодов BCP-47,
///   честная проверка «есть ли голос» и ЗАГЛУШКА вместо молчания;
/// · `frontend/src/services/voiceSamples.ts` — записи людей (Викисловарь),
///   которые раздаются ПО СЕТИ с psy-games.pro, а не лежат в сборке.
///
/// 🔴 ЗАПИСЬ ЖИВОГО ЧЕЛОВЕКА ВЫШЕ СИНТЕЗА, И ЭТО НЕ ВКУСОВЩИНА. Отчёт
/// тестировщика: «даже английский очень криво произносит машинным голосом».
/// После него веб-слой стал сперва искать запись и только потом синтезировать —
/// тот же порядок здесь: `sampleUrl` → системный голос → честный отказ.
///
/// 🔴 НЕ МОЛЧАТЬ БЕЗЗВУЧНО. Если голоса нет, упражнение обязано СКАЗАТЬ об этом,
/// а не показать тишину: человек иначе ждёт звука, которого не будет, и считает
/// сломанным себя. Поэтому `speak` возвращает `bool` (прозвучало или нет), а
/// `blockedReason` называет причину словом — экран показывает заглушку.
///
/// ⚠️ ПОЧЕМУ СЛОЙ НЕ ЗНАЕТ НИ ПРО СЕТЬ, НИ ПРО ОС. Всё, что умеет говорить и
/// качать, спрятано за `VoiceBackend`. Причина прозаична: проба, которая ходит
/// в сеть и в системный синтезатор, меряет не правила, а погоду на машине —
/// она то зелёная, то красная, и ей перестают верить. Здесь правила
/// проверяются подставным устройством, а настоящее живёт одной реализацией.
library;

/// Почему речи сейчас нет. Пустое значение — речь возможна.
enum VoiceBlock {
  /// Звук выключен самим человеком в настройках — чинить нечего, надо включить.
  soundOff,

  /// Голоса этого языка нет ни записью, ни в системе — упражнение показывает заглушку.
  noVoice,
}

/// Устройство, которое умеет издавать звук. Подменяется в пробах.
abstract class VoiceBackend {
  /// Проиграть готовую запись по ссылке. `true` — прозвучало.
  Future<bool> playUrl(String url, double rate);

  /// Сказать текст системным голосом. `true` — прозвучало.
  Future<bool> speakSystem(String text, String bcp47, double rate);

  /// Есть ли в системе голос под этот код. Проверяется ДО партии.
  Future<bool> hasSystemVoice(String bcp47);

  /// Прервать текущую озвучку: переход между раундами, уход с экрана.
  Future<void> cancel();
}

/// Где лежат записи. Адреса те же, что у веб-стороны, — корпус один на оба
/// приложения, и расходиться им нельзя.
const String voiceBase = 'https://psy-games.pro/voice';
const String voiceLiveBase = 'https://psy-games.pro/voice-live';

/// Коды языков приложения → BCP-47 для голосов ОС. Список взят из
/// `frontend/src/services/tts.ts`: языков в приложении больше, но озвучены эти.
const Map<String, String> voiceBcp47 = {
  'en': 'en-US',
  'ru': 'ru-RU',
  'es': 'es-ES',
  'pt': 'pt-BR',
  'de': 'de-DE',
  'zh': 'zh-CN',
  'hi': 'hi-IN',
};

/// Скорость речи: медленнее 0.6 разваливает слово на звуки, быстрее 1.6
/// превращает в скороговорку. Границы те же, что в вебе (`tts.ts`, `сыграть`).
double clampVoiceRate(double rate) => rate < 0.6 ? 0.6 : (rate > 1.6 ? 1.6 : rate);

/// Один голосовой слой на всё приложение.
class VoiceLayer {
  VoiceLayer({
    required this.backend,
    required this.soundOn,
    Set<String> liveWords = const {},
    Set<String> sampleWords = const {},
  })  : _live = liveWords,
        _samples = sampleWords;

  final VoiceBackend backend;

  /// Включён ли звук в настройках приложения. Читается КАЖДЫЙ раз, а не
  /// запоминается: человек выключает звук посреди партии.
  final bool Function() soundOn;

  /// Слова, у которых есть живая запись человека, и слова с синтезированной.
  /// Ключ — «язык:слово» в нижнем регистре, как в индексах веб-стороны.
  final Set<String> _live;
  final Set<String> _samples;

  static String _key(String text, String lang) =>
      '${lang.toLowerCase()}:${text.trim().toLowerCase()}';

  /// Ссылка на запись или `null`, если записи нет.
  ///
  /// ⚠️ ЖИВАЯ ЗАПИСЬ ПРОВЕРЯЕТСЯ ПЕРВОЙ. В вебе так же: `voice-live` — голоса
  /// людей из Викисловаря, `voice` — синтез, сделанный нами заранее. Порядок
  /// обратный сломал бы то, ради чего живые записи и заводили.
  String? sampleUrl(String text, String lang) {
    final key = _key(text, lang);
    final name = Uri.encodeComponent(text.trim().toLowerCase());
    if (_live.contains(key)) return '$voiceLiveBase/$lang/$name.opus';
    if (_samples.contains(key)) return '$voiceBase/$lang/$name.opus';
    return null;
  }

  /// Есть ли живая запись человека — экран источников показывает чтецов только
  /// для них (условие лицензий CC BY / CC BY-SA, а не украшение).
  bool isLive(String text, String lang) => _live.contains(_key(text, lang));

  /// Почему речь сейчас невозможна. `null` — возможна.
  ///
  /// Порядок ответов не случаен: выключенный звук чинится одним движением
  /// самого человека, и предлагать ему «голоса нет» вместо «включите звук»
  /// значит врать о причине.
  Future<VoiceBlock?> blockedReason(String lang) async {
    if (!soundOn()) return VoiceBlock.soundOff;
    if (await hasVoice(lang)) return null;
    return VoiceBlock.noVoice;
  }

  /// Есть ли чем озвучить этот язык: запись или системный голос.
  Future<bool> hasVoice(String lang) async {
    final hasSamples = _live.any((k) => k.startsWith('${lang.toLowerCase()}:')) ||
        _samples.any((k) => k.startsWith('${lang.toLowerCase()}:'));
    if (hasSamples) return true;
    return backend.hasSystemVoice(voiceBcp47[lang] ?? lang);
  }

  /// Произнести текст. `true` — прозвучало; `false` — экран обязан показать
  /// заглушку и НЕ делать вид, что упражнение идёт.
  Future<bool> speak(String text, String lang, {double rate = 0.9}) async {
    if (!soundOn()) return false;
    final speed = clampVoiceRate(rate);
    final url = sampleUrl(text, lang);
    if (url != null && await backend.playUrl(url, speed)) return true;
    // Запись не проигралась (нет сети, битый файл) — это не повод молчать:
    // синтез остаётся вторым шансом, и в вебе он ровно так же второй.
    return backend.speakSystem(text, voiceBcp47[lang] ?? lang, speed);
  }

  /// Проговорить ряд слов по очереди — «слуховой охват» и «эхо псевдослов».
  /// Возвращает число прозвучавших: ряд, прозвучавший наполовину, — это не
  /// успех, и экран должен знать об этом числом.
  Future<int> speakSequence(
    List<String> words,
    String lang, {
    double rate = 0.9,
    Duration gap = const Duration(milliseconds: 600),
  }) async {
    var spoken = 0;
    for (final w in words) {
      if (await speak(w, lang, rate: rate)) spoken++;
      if (w != words.last) await Future<void>.delayed(gap);
    }
    return spoken;
  }

  Future<void> cancel() => backend.cancel();
}
