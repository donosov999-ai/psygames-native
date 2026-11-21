import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../shell/answer_feedback.dart';
import '../../shell/audio_host.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_result.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/voice.dart';
import '../languages/bilingual.dart';
import '../languages/lang_names.dart';
import '../languages/lang_picker.dart';
import '../languages/pronunciation.dart';
import '../languages/word_bank.dart';
import 'model.dart';
import 'typing.dart';

/// «Словарь SRS» — первый экран раздела «Языки» на Flutter.
///
/// На исходном экране был блокер на iOS (отчёт e0ad9f91, 18.09.2026): правая колонка
/// шапки и нижний ряд ответов уходили за край экрана, и партию нельзя было
/// закончить. Здесь этого класса беды нет по устройству каркаса: счётчики живут
/// в `Wrap` (переносятся, а не вылезают), название — в `Expanded` с многоточием,
/// а ряд ответов прибит снизу самим `GameShell`.
///
/// Правила и их сверка с живым TS — в `model.dart` и `test/vocab_srs_test.dart`.

/// Направление опроса.
///
/// 🔴 ЗАЧЕМ ТРЕТЬЕ. Выбор из вариантов меряет УЗНАВАНИЕ: правильный ответ лежит
/// на экране, его надо опознать. Печать меряет извлечение из памяти — тот самый
/// testing effect (Roediger & Karpicke 2006: через неделю вспоминают примерно на
/// половину больше). Это же структурное отличие от Duolingo.
///
/// ⚠️ ОТЛИЧИЕ ОТ ВЕБ-ВЕРСИИ, НАМЕРЕННОЕ И ЗАМЕТНОЕ. В вебе печать показывается
/// только при ФИЗИЧЕСКОЙ клавиатуре (`hasPhysicalKeyboard`, проверка
/// `pointer: fine`): там та же сборка открывается и на макбуке, и метод Шестова
/// без настоящих клавиш не метод. Здесь сборка мобильная, и экранная клавиатура —
/// это и есть клавиатура телефона; печать слова меряет ПРИПОМИНАНИЕ, а не
/// слепой набор, поэтому запрет не переносится. Если решим иначе — вернуть
/// проверку одной строкой.
enum VocabDirection { recognize, recall, typing }

enum VocabPhase { config, playing, result }

typedef _SessionQueue = ({
  List<CardRef> cards,
  Map<String, List<({String base, String target})>> pools,
  int switches,
});
typedef _SpokenWord = ({String text, String lang});

/// Сколько новых слов за подход — те же четыре значения, что в веб-версии.
const List<int> vocabNewLimits = [5, 10, 20, 30];

/// Пауза перед следующей карточкой. На ошибке дольше: верный ответ надо успеть
/// прочитать, иначе ошибка ничему не учит (числа из веб-версии).
const int vocabNextDelayOkMs = 450;
const int vocabNextDelayWrongMs = 1100;

class VocabSrsScreen extends StatefulWidget {
  const VocabSrsScreen({
    super.key,
    required this.state,
    this.clock,
    this.vocabOverride,
    this.storeOverride,
    this.random,
    this.voice,
  });

  final SharedState state;

  /// Часы партии. Не заданы — настоящие. Задаются пробой и замером.
  final int Function()? clock;

  /// Словарь мимо ассетов — только для проб.
  final List<VocabEntry>? vocabOverride;

  /// Колода мимо общей памяти — только для проб.
  final DeckStore? storeOverride;

  final double Function()? random;
  final VoiceLayer? voice;

  @override
  State<VocabSrsScreen> createState() => _VocabSrsScreenState();
}

class _VocabSrsScreenState extends State<VocabSrsScreen> {
  late LevelLadder _runs;
  late final SharedPreferences _preferences;
  late final String _settingsKey;
  late final Map<String, String> _preset;
  late final bool _autostart;
  late final bool _temporarySettings;
  late final _feedback = AnswerFeedback(widget.state);
  WordBank? _wordBank;
  LangNames _names = LangNames.empty;

  VocabPhase _phase = VocabPhase.config;
  String _targetLang = 'es';
  int _newLimit = 10;
  VocabDirection _direction = VocabDirection.recognize;

  /// Режим билингво: две колоды вперемешку в одной партии.
  bool _bilingual = false;

  /// Второй язык, КАК ЕГО ВЫБРАЛ человек. Настоящий второй — [_second]: он
  /// гарантированно не совпадает ни с первым, ни с родным.
  String _wantedSecond = 'es';
  bool _autoPronounce = false;
  bool _pronounceBoth = false;

  List<CardRef> _queue = [];
  int _idx = 0;
  List<String> _options = [];
  String? _picked;
  int _correct = 0;
  int _wrong = 0;
  int _shownAtMs = 0;
  SrsStats? _stats;
  bool _starting = false;
  bool _finishing = false;
  bool _hasNext = false;
  int? _completedLevel;
  int? _nextReviewAt;
  WordPronunciations _ipa = const {};
  VoiceLayer? _voice;
  int _voiceTicket = 0;
  int? _speakingTicket;
  Future<void>? _voiceStop;
  String? _voiceMessage;
  bool _reviewReady = false;

  /// Набор ответа: живёт ровно одну карточку.
  TypingState? _typing;
  int _typos = 0;

  /// 🔴 КОЛОДА ЖИВЁТ НА ПАРЕ ЯЗЫКОВ, А В БИЛИНГВО ПАР ДВЕ. Движок и пул
  /// отвлекающих — по языку карточки: у английского и испанского расписание
  /// повторов своё, и оценка, ушедшая не в ту колоду, вернула бы карточку по
  /// чужому графику. Отвлекающие из чужого языка сделали бы ответ очевидным.
  final Map<(String, String?), VocabSrs> _engines = {};
  int _statsRequest = 0;
  Map<String, List<({String base, String target})>> _pools = const {};

  /// Сколько раз язык НА САМОМ ДЕЛЕ сменился за партию (0 вне билингво).
  int _switches = 0;

  // Замеры партии — те же поля, что пишет веб-версия в `details`.
  int _startMs = 0;
  int _answers = 0;
  int _rtSum = 0;
  int _typosTotal = 0;
  int _reviewsDone = 0;
  final Set<String> _newLearned = {};

  int get _now =>
      (widget.clock ?? () => DateTime.now().millisecondsSinceEpoch)();

  /// Язык интерфейса — он же базовый язык колоды.
  ///
  /// Берётся готовым геттером моста, а не чтением ключа руками: язык веб-сторона
  /// держит под ГОЛЫМ `language`, без приставки `psygames_`, и мост возит его
  /// через поимённое исключение [SharedState.extraKeys]. Гейт
  /// `flutter/test/bridge_carries_every_web_key_test.dart` сторожит, что ни один
  /// ключ веб-стороны не остался за границей.
  late final String _baseLang;

  String? get _second {
    final choices = _langs.where((l) => l != _targetLang);
    if (choices.contains(_wantedSecond)) return _wantedSecond;
    return choices.firstOrNull;
  }

  List<String> get _langsInPlay =>
      _bilingual ? [_targetLang, _second!] : [_targetLang];
  bool get _dualRecognition =>
      _bilingual && _direction == VocabDirection.recognize;

  @override
  void initState() {
    super.initState();
    _baseLang = widget.state.language;
    // Local UI preferences, not part of the WebView/cloud progress snapshot.
    _settingsKey = 'device_vocab_srs_settings_${widget.state.activeProfile}';
    _preset = GamePreset.params;
    _autostart = GamePreset.autostart;
    _temporarySettings =
        _autostart ||
        [
          'targetLang',
          'newLimit',
          'direction',
          bilingualKey,
          'lang2',
        ].any(_preset.containsKey);
    _runs = LevelLadder(
      gameId: 'vocab_srs',
      store: SharedLevelStore(widget.state),
    );
    _boot();
  }

  @override
  void dispose() {
    _stopVoice();
    unawaited(_feedback.dispose());
    super.dispose();
  }

  Future<void> _boot() async {
    _preferences = await SharedPreferences.getInstance();
    await _runs.load();
    final override = widget.vocabOverride;
    final bank = override == null
        ? await loadWordBank()
        : WordBank(core: override);
    final names = await LangNames.load();
    final ipa = await loadWordPronunciations();
    if (!mounted) return;
    final saved = _temporarySettings
        ? const <String, Object?>{}
        : _loadSettings();
    setState(() {
      _names = names;
      _wordBank = bank;
      _ipa = ipa;
      // 🔴 НАСТРОЙКИ ШАГА ЗАРЯДКИ — ИЗ АДРЕСА, КАК В ВЕБЕ (`useGamePreset`).
      // Языковая зарядка открывает словарь с `?targetLang=…&bilingual=1&lang2=…`;
      // без этого шаг зарядки открылся бы с настройками по умолчанию, и «два языка
      // вперемешку» молча стали бы одним. Умолчание языка — как в веб-версии:
      // англичанину испанский, остальным английский.
      final defaultLang = _baseLang == 'en' ? 'es' : 'en';
      final target = _preset['targetLang'] ?? saved['targetLang'];
      _targetLang = target is String && _langs.contains(target)
          ? target
          : _langs.contains(defaultLang)
          ? defaultLang
          : _langs.firstOrNull ?? defaultLang;
      final limit = _preset.containsKey('newLimit')
          ? int.tryParse(_preset['newLimit']!)
          : saved['newLimit'];
      _newLimit = limit is int && vocabNewLimits.contains(limit) ? limit : 10;
      _direction = switch (_preset['direction'] ?? saved['direction']) {
        'recall' => VocabDirection.recall,
        'typing' => VocabDirection.typing,
        _ => VocabDirection.recognize,
      };
      final second = _preset['lang2'] ?? saved['lang2'];
      _wantedSecond = second is String && _langs.contains(second)
          ? second
          : pairFor(_baseLang)[1];
      final bilingual = _preset[bilingualKey] ?? saved[bilingualKey];
      _bilingual =
          _second != null &&
          (bilingual == true || bilingual == 'true' || bilingual == '1');
      _autoPronounce = saved['autoPronounce'] == true;
      _pronounceBoth = saved['pronounceBoth'] == true;
    });
    await _refreshStats();
    // Уровень уже загружен — только теперь можно стартовать сам: иначе автостарт
    // («Вызов дня», шаг зарядки) сыграл бы первый подход человеку с двенадцатым.
    if (mounted && _autostart) await _start();
  }

  void _stopVoice() {
    _voiceTicket++;
    final wasSpeaking = _speakingTicket != null;
    _speakingTicket = null;
    final voice = _voice;
    if (wasSpeaking && voice != null) {
      final previous = _voiceStop;
      _voiceStop = _cancelVoice(voice, previous);
    }
  }

  Future<void> _cancelVoice(VoiceLayer voice, Future<void>? previous) async {
    try {
      await previous;
      await voice.cancel().timeout(const Duration(milliseconds: 750));
    } catch (_) {
      // Cancelling an optional audio aid must not stop a round.
    }
  }

  Future<void> _speak(String word, String lang) =>
      _speakWords([(text: word, lang: lang)]);

  Future<void> _speakWords(List<_SpokenWord> words) async {
    _stopVoice();
    final ticket = _voiceTicket;
    final route = ModalRoute.of(context);
    bool current() =>
        mounted && ticket == _voiceTicket && (route?.isCurrent ?? true);
    setState(() => _voiceMessage = null);
    try {
      final voice = _voice ??=
          widget.voice ?? await AudioHost.voice(widget.state);
      if (!current()) return;
      await _voiceStop;
      if (!current()) return;
      _speakingTicket = ticket;
      var missed = false;
      for (final word in words) {
        if (!current()) return;
        final spoken = await voice.speak(
          word.text,
          word.lang,
          stillCurrent: current,
          requireSystemVoice: true,
        );
        missed |= !spoken;
      }
      if (missed && current()) {
        setState(
          () => _voiceMessage = L.t(
            voice.soundOn() ? 'srsPronunciationUnavailable' : 'voiceSoundOff',
          ),
        );
      }
    } catch (_) {
      if (current()) {
        setState(() => _voiceMessage = L.t('srsPronunciationUnavailable'));
      }
    } finally {
      if (_speakingTicket == ticket) _speakingTicket = null;
    }
  }

  void _scheduleAutoVoice(CardRef card) {
    if (!_autoPronounce || _temporarySettings || !appSoundOn(widget.state)) {
      return;
    }
    final first = _langOf(card);
    final words = <_SpokenWord>[
      if (wordPronunciationLanguages.contains(first) &&
          (_pronounceBoth || first == _targetLang))
        (text: card.target, lang: first),
      if (_pronounceBoth &&
          card.secondTarget != null &&
          wordPronunciationLanguages.contains(card.secondLang))
        (text: card.secondTarget!, lang: card.secondLang!),
    ];
    if (words.isEmpty) return;
    final ticket = _voiceTicket;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted &&
          ticket == _voiceTicket &&
          _phase == VocabPhase.playing &&
          _idx < _queue.length &&
          identical(_queue[_idx], card) &&
          (ModalRoute.of(context)?.isCurrent ?? true)) {
        unawaited(_speakWords(words));
      }
    });
  }

  Map<String, Object?> _loadSettings() {
    final raw = _preferences.getString(_settingsKey);
    if (raw == null) return const {};
    try {
      final value = jsonDecode(raw);
      return value is Map<String, Object?> ? value : const {};
    } on FormatException {
      return const {};
    }
  }

  void _changeSettings(VoidCallback change, {bool affectsBank = false}) {
    if (_starting) return;
    setState(change);
    if (affectsBank) unawaited(_refreshStats());
    if (_temporarySettings) return;
    unawaited(_saveSettings());
  }

  Future<void> _saveSettings() async {
    try {
      final written = await _preferences.setString(
        _settingsKey,
        jsonEncode({
          'targetLang': _targetLang,
          'lang2': _wantedSecond,
          bilingualKey: _bilingual,
          'newLimit': _newLimit,
          'direction': _direction.name,
          'autoPronounce': _autoPronounce,
          'pronounceBoth': _pronounceBoth,
        }),
      );
      if (!written) throw StateError('SRS preferences were not saved');
    } catch (error, stack) {
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: error,
          stack: stack,
          library: 'SRS settings',
        ),
      );
    }
  }

  List<String> get _langs {
    final v = _wordBank?.core;
    if (v == null || v.isEmpty) return const [];
    return [
      for (final k in v.first.keys)
        if (k != 'cat' && k != _baseLang) k,
    ];
  }

  VocabSrs _engineFor(String lang) {
    final paired = _dualRecognition
        ? (lang == _targetLang ? _second : _targetLang)
        : null;
    return _engines.putIfAbsent(
      (lang, paired),
      () => VocabSrs(
        vocab:
            _wordBank
                ?.forLanguages({_baseLang, lang, ?paired}, interleave: true)
                .where(
                  (row) =>
                      row[_baseLang] != row[lang] &&
                      (paired == null || row[_baseLang] != row[paired]),
                )
                .toList() ??
            const [],
        baseLang: _baseLang,
        targetLang: lang,
        store: widget.storeOverride ?? SharedDeckStore(widget.state),
        nowMs: () => _now,
        random: widget.random,
      ),
    );
  }

  Future<void> _refreshStats() async {
    final request = ++_statsRequest;
    final lang = _targetLang;
    final s = await _engineFor(lang).getStats();
    if (mounted && request == _statsRequest) setState(() => _stats = s);
  }

  Future<_SessionQueue> _buildSessionQueue() async {
    final langs = _langsInPlay;
    final byLang = <String, List<CardRef>>{};
    final pools = <String, List<({String base, String target})>>{};
    for (final l in langs) {
      final q = await _engineFor(l).buildQueue(_newLimit);
      pools[l] = q.pool;
      byLang[l] = [
        for (final c in [...q.due, ...q.fresh]) c.withLang(l),
      ];
    }

    List<CardRef> cards;
    var switches = 0;
    if (_dualRecognition) {
      cards = _combineDual(byLang);
    } else if (_bilingual) {
      final total = byLang.values.fold<int>(0, (n, v) => n + v.length);
      final spread = spreadByRow(byLang, total, langs);
      cards = [for (final x in spread.items) x.item];
      switches = spread.switches;
    } else {
      cards = byLang[_targetLang] ?? const [];
    }

    return (cards: cards, pools: pools, switches: switches);
  }

  Future<void> _start() async {
    if (_starting || _phase == VocabPhase.playing) return;
    setState(() => _starting = true);
    try {
      _feedback.clear();
      _engines.clear();
      final q = await _buildSessionQueue();
      if (!mounted) return;
      if (q.cards.isEmpty) {
        await _showResult(hasNext: false);
        return;
      }
      setState(() {
        _pools = q.pools;
        _switches = q.switches;
        _queue = q.cards;
        _idx = 0;
        _correct = 0;
        _wrong = 0;
        _picked = null;
        _answers = 0;
        _rtSum = 0;
        _typosTotal = 0;
        _reviewsDone = 0;
        _newLearned.clear();
        _startMs = _now;
        _phase = VocabPhase.playing;
        _prepare(q.cards.first);
        _shownAtMs = _now;
      });
      if (_direction == VocabDirection.recognize) {
        _scheduleAutoVoice(q.cards.first);
      }
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<void> _showResult({int? completedLevel, required bool hasNext}) async {
    final stats = await Future.wait([
      for (final lang in _langsInPlay) _engineFor(lang).getStats(),
    ]);
    if (!mounted) return;
    final dates = stats.map((s) => s.nextDueAt).whereType<int>();
    final next = dates.isEmpty ? null : dates.reduce((a, b) => a < b ? a : b);
    setState(() {
      _stats = stats.first;
      _nextReviewAt = next;
      _hasNext = hasNext;
      _completedLevel = completedLevel;
      _phase = VocabPhase.result;
    });
  }

  List<CardRef> _combineDual(Map<String, List<CardRef>> byLang) {
    final first = byLang[_targetLang] ?? const [];
    final secondLang = _second!;
    final second = byLang[secondLang] ?? const [];
    final firstById = {for (final c in first) c.id: c};
    final secondById = {for (final c in second) c.id: c};
    final ids = <String>[
      ...firstById.keys,
      ...secondById.keys.where((id) => !firstById.containsKey(id)),
    ];
    final out = <CardRef>[];
    for (final id in ids) {
      final a = firstById[id], b = secondById[id];
      final base = a?.base ?? b?.base ?? _wordFor(id, _baseLang) ?? '';
      final firstTarget = a?.target ?? _wordFor(id, _targetLang) ?? '';
      final secondTarget = b?.target ?? _wordFor(id, secondLang) ?? '';
      if (base.isEmpty || firstTarget.isEmpty || secondTarget.isEmpty) continue;
      out.add(
        CardRef(
          id: id,
          base: base,
          target: firstTarget,
          isNew: (a?.isNew ?? false) || (b?.isNew ?? false),
          lang: _targetLang,
          secondTarget: secondTarget,
          secondLang: secondLang,
        ),
      );
    }
    return out;
  }

  String? _wordFor(String id, String lang) {
    if (!id.startsWith('v:')) return null;
    final en = id.substring(2);
    final bank = _wordBank;
    if (bank == null) return null;
    for (final word in [...bank.core, ...bank.extension]) {
      if (word['en'] == en) return word[lang];
    }
    return null;
  }

  String _langOf(CardRef card) => card.lang ?? _targetLang;

  /// Что показать под карточкой: варианты ответа или поле набора.
  void _prepare(CardRef card) {
    _reviewReady = false;
    _voiceMessage = null;
    if (_direction == VocabDirection.typing) {
      _typing = TypingState.create([card.target], nowMs: () => _now);
      _typos = 0;
      _options = const [];
    } else {
      _typing = null;
      _options = _optionsFor(card);
    }
  }

  List<String> _optionsFor(CardRef card) {
    final pool = _pools[_langOf(card)] ?? const [];
    final right = _direction == VocabDirection.recognize
        ? card.base
        : card.target;
    final words = [
      for (final p in pool)
        // Several words can have the same translation. Do not offer a second
        // valid answer just because the bank stores it on another card.
        if (_direction == VocabDirection.recognize
            ? p.target != card.target
            : p.base != card.base)
          _direction == VocabDirection.recognize ? p.base : p.target,
    ];
    return _engineFor(_langOf(card)).buildOptions(right, words);
  }

  void _countAnswer(CardRef card, {required bool correct, required int rt}) {
    _answers += 1;
    _rtSum += rt;
    if (!correct) return;
    if (card.isNew) {
      _newLearned.add(card.id);
    } else {
      _reviewsDone += 1;
    }
  }

  Future<void> _pick(String option) async {
    if (_picked != null || _feedback.busy || _phase != VocabPhase.playing) {
      return;
    }
    final card = _queue[_idx];
    final right = _direction == VocabDirection.recognize
        ? card.base
        : card.target;
    final rt = _now - _shownAtMs;
    final correct = option == right;
    _stopVoice();

    setState(() {
      _picked = option;
      if (correct) {
        _correct += 1;
      } else {
        _wrong += 1;
      }
    });
    _countAnswer(card, correct: correct, rt: rt);

    var queue = _queue;
    if (!correct) {
      queue = [..._queue];
      queue.insert(
        (_idx + vocabRetryOffset).clamp(0, queue.length),
        CardRef(
          id: card.id,
          base: card.base,
          target: card.target,
          isNew: card.isNew,
          lang: card.lang,
          secondTarget: card.secondTarget,
          secondLang: card.secondLang,
        ),
      );
      if (mounted) setState(() => _queue = queue);
    }

    final grade = gradeFromAnswer(correct: correct, rtMs: rt);
    final grading = Future.wait([
      _engineFor(_langOf(card)).gradeCard(card.id, grade),
      if (_dualRecognition)
        _engineFor(card.secondLang!).gradeCard(card.id, grade),
    ]);
    await _feedback.show(option, right, right: correct);
    await grading;
    if (!mounted || _picked != option) return;
    await _answerChecked(card);
  }

  /// Нажатие клавиши при печати ответа.
  ///
  /// Проводка та же, что у выбора, — карточка, оценка SM-2, переход; отличий
  /// ровно два, и оба по ТЗ веб-версии:
  ///   · дойти до конца можно только набрав слово ЦЕЛИКОМ верно, значит ответ
  ///     всегда верный;
  ///   · опечатки НЕ идут в ошибки сессии — они блокировали курсор и уже
  ///     исправлены, считать их провалом значило бы наказывать за то, чему
  ///     упражнение учит. Они уходят в ОЦЕНКУ карточки: без единой опечатки
  ///     «easy», с опечатками «good».
  Future<void> _type(String ch) async {
    final st = _typing;
    if (st == null ||
        _picked != null ||
        _feedback.busy ||
        _phase != VocabPhase.playing) {
      return;
    }
    final r = st.pressChar(ch, blockOnError: true);
    if (r.wrong) _typos += 1;
    setState(() {});
    if (!r.finished) return;

    final card = _queue[_idx];
    final rt = _now - _shownAtMs;
    setState(() {
      _picked = card.target;
      _correct += 1;
    });
    _countAnswer(card, correct: true, rt: rt);
    _typosTotal += _typos;
    final grading = _engineFor(_langOf(card)).gradeCard(
      card.id,
      _typos == 0 && rt < vocabEasyRtMs * 3 ? Grade.easy : Grade.good,
    );
    await _feedback.show('typing', 'typing');
    await grading;
    if (!mounted || _picked != card.target) return;
    await _answerChecked(card);
  }

  Future<void> _answerChecked(CardRef card) async {
    // In an ordinary recall/typing round the answer stays readable and
    // replayable after grading. Timed/playlist launches keep their cadence.
    if (_direction != VocabDirection.recognize &&
        !_autostart &&
        wordPronunciationLanguages.contains(_langOf(card))) {
      setState(() => _reviewReady = true);
      _scheduleAutoVoice(card);
      return;
    }
    await _advanceCard();
  }

  Future<void> _advanceCard() async {
    _stopVoice();
    if (_reviewReady) setState(() => _reviewReady = false);
    final next = _idx + 1;
    if (next >= _queue.length) {
      await _finish();
      return;
    }
    setState(() {
      _idx = next;
      _picked = null;
      _prepare(_queue[next]);
      _shownAtMs = _now;
    });
    if (_direction == VocabDirection.recognize) {
      _scheduleAutoVoice(_queue[next]);
    }
  }

  Future<void> _finish() async {
    if (_finishing) return;
    _finishing = true;
    try {
      final played = _runs.level;
      await _recordRound(played);
      if (!mounted) return;
      final next = await _buildSessionQueue();
      if (!mounted) return;
      await _showResult(completedLevel: played, hasNext: next.cards.isNotEmpty);
    } finally {
      _finishing = false;
    }
  }

  Future<void> _recordRound(int doneRun) async {
    // 🔴 ОТЧЁТ О ПАРТИИ — ОДИН, И ШЛЁТ ЕГО ЛЕСТНИЦА. `LevelLadder.win()` сама
    // отдаёт партию в веб-половину (шаг зарядки, статистика, токены, серия дней).
    // Первая редакция слала ещё и свой отчёт — проба поймала ДВЕ партии на одну
    // игру: шаг зарядки двигался бы дважды, статистика удваивалась.
    //
    // Подход доведён до конца — счётчик прохождений растёт. Это НЕ ступень
    // сложности: трудность задаёт расписание повторов. ⚠️ В шаге зарядки счётчик
    // НЕ растёт — так решила оболочка для всех игр (`GamePreset.isPreset` в
    // `LevelLadder.win`); веб-версия считала и шаги зарядки. Партия при этом всё
    // равно уходит в статистику.
    //
    // Поля `details` — те же, что пишет веб-версия, до имени. `passed` не пишем
    // НАМЕРЕННО, как и веб: провала у подхода нет.
    await _runs.win(
      score: _correct,
      timeSeconds: ((_now - _startMs) / 1000).round(),
      errors: _wrong,
      mode: _direction.name,
      difficulty: '$_baseLang→$_targetLang',
      details: {
        'level': doneRun,
        'base_lang': _baseLang,
        // В билингво цель не одна — пишем пару и ЧИСЛО НАСТОЯЩИХ СМЕН: по флагу
        // не видно, что материал одного языка кончился на середине.
        'target_lang': _bilingual ? _langsInPlay.join('+') : _targetLang,
        if (_bilingual) 'lang_switches': _switches,
        'cards_total': _queue.length,
        // ⚠️ Считается по id карточки, как в вебе: в билингво «house» английской и
        // испанской колоды — один id, и новое слово засчитывается один раз. Так
        // пишет и веб-версия, а статистика обязана совпадать у обеих половин.
        'new_learned': _newLearned.length,
        'reviews_done': _reviewsDone,
        'accuracy': _answers > 0 ? _correct / _answers : 0,
        'mean_rt_ms': _answers > 0 ? (_rtSum / _answers).round() : 0,
        'new_limit': _newLimit,
        'typos': _typosTotal,
      },
    );
  }

  Widget _result(double height) {
    final completed = _completedLevel;
    final unavailable = _hasNext
        ? null
        : (
            message: L.t('srsAllDone'),
            detail: _nextReviewAt == null
                ? null
                : '${L.t('srsNextDue')}: ${_when(_nextReviewAt!)}',
          );
    void openSettings() => setState(() => _phase = VocabPhase.config);
    if (completed == null) {
      return SizedBox(
        height: height,
        child: LevelResult.adapt(
          ReportOutcomeAdapter(
            title: unavailable!.message,
            details: unavailable.detail == null
                ? null
                : Text(unavailable.detail!),
            action: GameResultAction(
              key: const Key('level-result-settings'),
              label: L.t('settings'),
              icon: Icons.tune_rounded,
              onTap: openSettings,
            ),
          ),
        ),
      );
    }
    final stats = _stats;
    return SizedBox(
      height: height,
      child: LevelResult.adapt(
        LevelOutcomeAdapter(
          passed: true,
          playedLevel: completed,
          score:
              '${L.t('hud_correct')}: $_correct · ${L.t('hud_errors')}: $_wrong',
          details: stats == null
              ? null
              : Text(
                  '${L.t('srsLearnedLabel')}: ${stats.learned}/${stats.totalWords}',
                ),
          playNext: _hasNext ? _start : null,
          unavailable: unavailable,
          nextLabel: _runs.level > completed
              ? '${L.t('sdkNextLevel')} · ${_runs.level}'
              : L.t('retry'),
          settings: openSettings,
        ),
      ),
    );
  }

  static String _when(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}';
  }

  /// 🔴 РАЗБОР — ДО ПАРТИИ И НА ДАННЫХ САМОЙ ИГРЫ.
  ///
  /// Цель Дениса 24.09.2026: разбор у каждой игры; гейт `test/lesson_census_test.dart`
  /// не пустит нативный экран без кнопки `game-lesson`. Кнопка стоит во всех фазах,
  /// а не только в партии: разбор, привязанный к начатой партии, до первого раунда
  /// не виден вовсе, а нужен он именно тогда.
  ///
  /// Примеры — первое слово колоды ЭТОЙ пары языков из того же словаря, а не
  /// выдуманные: разбор на «похожем» слове учил бы не этой колоде. Правило —
  /// готовые ключи веб-версии (`vocabSrsIntroDesc` — как игра засчитывает ответ и
  /// двигает интервал; `srsTypingHint` — чем печать отличается), они уже
  /// переведены на все двенадцать языков, новых строк не заведено.
  List<DemoTrial> _demoTrials() {
    final v = _wordBank?.core ?? const <VocabEntry>[];
    final w = v.firstWhere(
      (e) =>
          (e[_baseLang] ?? '').isNotEmpty && (e[_targetLang] ?? '').isNotEmpty,
      orElse: () => const <String, String>{},
    );
    final base = w[_baseLang] ?? '';
    final target = w[_targetLang] ?? '';
    return [
      DemoTrial(
        text: target,
        sub: L.t('vocabSrsHint'),
        answer: base,
        rule: L.t('vocabSrsIntroDesc'),
      ),
      DemoTrial(
        text: base,
        sub: L.t('srsTypingTask'),
        answer: target,
        rule: L.t('srsTypingHint'),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (_wordBank == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final card = _phase == VocabPhase.playing ? _queue[_idx] : null;
    return GameShell(
      title: L.t('vocabSrs'),
      startAction: _phase == VocabPhase.config && !_autostart
          ? GameStartAction(
              key: const Key('vocab-start'),
              onTap: _starting ? null : _start,
            )
          : null,
      onBack: () {
        _stopVoice();
        Navigator.of(context).maybePop();
      },
      onLesson: () => openDemoLesson(
        context,
        title: L.t('vocabSrs'),
        trials: _demoTrials(),
      ),
      hud: card == null
          ? const []
          : [
              // Пилюля языка — там же, где в веб-версии: в билингво и в шаге зарядки.
              // «EN·es»: текущий прописными, второй строчными — видно, что языков два.
              if ((_bilingual || GamePreset.isPreset) && card.lang != null)
                HudItem(
                  label: L.t('bilingualMode'),
                  value: pairPill(
                    card.lang!,
                    _bilingual ? _langsInPlay : const [],
                  ),
                  icon: Icons.translate,
                ),
              HudItem(
                label: L.t('round'),
                value: '${_idx + 1}/${_queue.length}',
                icon: Icons.numbers,
              ),
              HudItem(
                label: L.t('hud_correct'),
                value: '$_correct',
                icon: Icons.check,
              ),
              HudItem(
                label: L.t('hud_errors'),
                value: '$_wrong',
                icon: Icons.close,
              ),
            ],
      field: (context, h) => switch (_phase) {
        VocabPhase.config => Material(
          type: MaterialType.transparency,
          child: _Config(
            height: h,
            langs: _langs,
            targetLang: _targetLang,
            newLimit: _newLimit,
            direction: _direction,
            stats: _stats,
            runs: _runs.level,
            bilingual: _bilingual,
            autoPronounce: _autoPronounce,
            pronounceBoth: _pronounceBoth,
            second: _second,
            bilingualDesc: _second == null
                ? null
                : _names.bilingualDesc(_targetLang, _second!),
            langLabel: _names.name,
            secondChoices: [
              for (final l in _langs)
                if (l != _targetLang) l,
            ],
            onLang: (l) =>
                _changeSettings(() => _targetLang = l, affectsBank: true),
            onLimit: (n) => _changeSettings(() => _newLimit = n),
            onDirection: (d) =>
                _changeSettings(() => _direction = d, affectsBank: true),
            onBilingual: _second == null
                ? null
                : (v) =>
                      _changeSettings(() => _bilingual = v, affectsBank: true),
            onSecond: (l) =>
                _changeSettings(() => _wantedSecond = l, affectsBank: true),
            onAutoPronounce: (v) => _changeSettings(() => _autoPronounce = v),
            onPronounceBoth: (v) => _changeSettings(() => _pronounceBoth = v),
          ),
        ),
        VocabPhase.playing => _Card(
          height: h,
          card: card!,
          direction: _direction,
          targetLang: _langOf(card),
          reveal: _reviewReady,
          ipa: _ipa,
          onSpeak: _speak,
          voiceMessage: _picked == null || _reviewReady ? _voiceMessage : null,
        ),
        VocabPhase.result => _result(h),
      },
      toolbar: card == null
          ? null
          : _reviewReady
          ? FilledButton(
              key: const Key('vocab-next-card'),
              onPressed: _advanceCard,
              child: Text(L.t('nextLabel')),
            )
          : _direction == VocabDirection.typing
          ? AnswerMark(
              feedback: _feedback,
              value: 'typing',
              child: _Typing(
                state: _typing!,
                onKey: _type,
                done: _picked != null,
              ),
            )
          : _Options(
              options: _options,
              picked: _picked,
              right: _direction == VocabDirection.recognize
                  ? card.base
                  : card.target,
              feedback: _feedback,
              onPick: _pick,
            ),
    );
  }
}

/// Колода поверх общей памяти: та же запись, что пишет веб-сторона.
class SharedDeckStore implements DeckStore {
  SharedDeckStore(this.state);
  final SharedState state;

  @override
  Future<String?> read(String key) async => state.get(key);

  @override
  Future<void> write(String key, String value) => state.set(key, value);
}

class _Config extends StatelessWidget {
  const _Config({
    required this.height,
    required this.langs,
    required this.targetLang,
    required this.newLimit,
    required this.direction,
    required this.stats,
    required this.runs,
    required this.bilingual,
    required this.autoPronounce,
    required this.pronounceBoth,
    required this.second,
    required this.bilingualDesc,
    required this.secondChoices,
    required this.langLabel,
    required this.onLang,
    required this.onLimit,
    required this.onDirection,
    required this.onBilingual,
    required this.onSecond,
    required this.onAutoPronounce,
    required this.onPronounceBoth,
  });

  final double height;
  final List<String> langs;
  final String targetLang;
  final int newLimit;
  final VocabDirection direction;
  final SrsStats? stats;
  final int runs;
  final bool bilingual;
  final bool autoPronounce;
  final bool pronounceBoth;

  /// Настоящий второй язык — уже не совпадающий ни с первым, ни с родным.
  final String? second;

  /// Подпись режима «два языка сразу» с подставленной парой.
  final String? bilingualDesc;
  final List<String> secondChoices;
  final String Function(String) langLabel;
  final void Function(String) onLang;
  final void Function(int) onLimit;
  final void Function(VocabDirection) onDirection;
  final void Function(bool)? onBilingual;
  final void Function(String) onSecond;
  final ValueChanged<bool> onAutoPronounce;
  final ValueChanged<bool> onPronounceBoth;

  @override
  Widget build(BuildContext context) {
    final s = stats;
    return SizedBox(
      height: height,
      child: ListView(
        key: const Key('vocab-settings-scroll'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Text(L.t('vocabSrs'), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            L.t('vocabSrsDesc'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 4),
          // Та же строка, что в веб-версии: выучено / к повтору / своих.
          Text(
            s == null
                ? '…'
                : '${L.t('srsLearnedLabel')}: ${s.learned}/${s.totalWords} · '
                      '${L.t('srsDueLabel')}: ${s.dueNow} · ${L.t('srsOwnLabel')}: ${s.customCount}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),

          // 🔴 ВЫПАДАЮЩАЯ СТРОКА, А НЕ СЕТКА ИЗ ОДИННАДЦАТИ КНОПОК.
          // В веб-версии выбор языка нарисован сеткой: 11 кнопок, 277 px, из-за
          // неё экран настроек уходит на полтора экрана вниз (замер 17.09.2026,
          // задача a0ae517f). Переносить эту беду в Flutter незачем — здесь она
          // чинится одной строкой.
          Text(L.t('language')),
          const SizedBox(height: 6),
          LangDropdown(
            key: const Key('vocab-lang'),
            keyPrefix: 'vocab-lang',
            langs: langs,
            value: targetLang,
            label: langLabel,
            onChanged: onLang,
          ),
          const SizedBox(height: 8),

          // 🔴 ДВА ЯЗЫКА СРАЗУ — тот же режим, что в веб-версии (`BilingualToggle`).
          // Второй язык выбирает человек, а не интерфейс: первая редакция веба
          // брала его от языка интерфейса и молча отменяла выбор (отчёт 2aa5892c).
          SwitchListTile(
            key: const Key('vocab-bilingual'),
            contentPadding: EdgeInsets.zero,
            title: Text(L.t('bilingualMode')),
            subtitle: bilingualDesc == null
                ? null
                : Text(
                    bilingualDesc!,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
            value: bilingual,
            onChanged: onBilingual,
          ),
          if (bilingual) ...[
            const SizedBox(height: 6),
            LangDropdown(
              key: const Key('vocab-lang2'),
              keyPrefix: 'vocab-lang2',
              langs: secondChoices,
              value: second,
              label: langLabel,
              onChanged: onSecond,
            ),
          ],
          SwitchListTile(
            key: const Key('vocab-auto-pronounce'),
            contentPadding: EdgeInsets.zero,
            title: Text(L.t('srsAutoPronounce')),
            subtitle: Text(
              L.t('srsAutoPronounceDesc'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            value: autoPronounce,
            onChanged: onAutoPronounce,
          ),
          if (autoPronounce && bilingual)
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  key: const Key('vocab-pronounce-primary'),
                  label: Text(L.t('srsPronouncePrimary')),
                  selected: !pronounceBoth,
                  onSelected: (_) => onPronounceBoth(false),
                ),
                ChoiceChip(
                  key: const Key('vocab-pronounce-both'),
                  label: Text(L.t('srsPronounceBoth')),
                  selected: pronounceBoth,
                  onSelected: (_) => onPronounceBoth(true),
                ),
              ],
            ),
          const SizedBox(height: 16),

          Text(L.t('srsNewPerSession')),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              for (final n in vocabNewLimits)
                ChoiceChip(
                  key: Key('vocab-limit-$n'),
                  label: Text('$n'),
                  selected: newLimit == n,
                  onSelected: (_) => onLimit(n),
                ),
            ],
          ),
          const SizedBox(height: 16),

          Text(L.t('srsDirection')),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              ChoiceChip(
                key: const Key('vocab-dir-recognize'),
                label: Text(L.t('srsRecognize')),
                selected: direction == VocabDirection.recognize,
                onSelected: (_) => onDirection(VocabDirection.recognize),
              ),
              ChoiceChip(
                key: const Key('vocab-dir-recall'),
                label: Text(L.t('srsRecall')),
                selected: direction == VocabDirection.recall,
                onSelected: (_) => onDirection(VocabDirection.recall),
              ),
              ChoiceChip(
                key: const Key('vocab-dir-typing'),
                label: Text(L.t('srsTyping')),
                selected: direction == VocabDirection.typing,
                onSelected: (_) => onDirection(VocabDirection.typing),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.height,
    required this.card,
    required this.direction,
    required this.targetLang,
    required this.reveal,
    required this.ipa,
    required this.onSpeak,
    this.voiceMessage,
  });

  final double height;
  final CardRef card;
  final VocabDirection direction;
  final String targetLang;
  final bool reveal;
  final Map<String, Map<String, String>> ipa;
  final void Function(String word, String lang) onSpeak;
  final String? voiceMessage;

  Widget _pronunciation(
    BuildContext context,
    String word,
    String lang,
    String slot,
  ) {
    if (!wordPronunciationLanguages.contains(lang)) {
      return const SizedBox.shrink();
    }
    final text = wordIpaFor(ipa, lang, word);
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (text != null)
          Text(
            text,
            key: Key('vocab-ipa-$slot'),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        IconButton(
          key: Key('vocab-speak-$slot'),
          tooltip: '${L.t('srsListen')}: $word',
          onPressed: () => onSpeak(word, lang),
          icon: const Icon(Icons.volume_up_rounded),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    // Узнавание: показываем изучаемое слово, спрашиваем родное. Припоминание и
    // печать — наоборот: на экране родное, набрать надо изучаемое.
    final shown = direction == VocabDirection.recognize
        ? card.target
        : card.base;
    // Подпись задания — та же, что в веб-версии (`vocabSrsHint`), а при печати
    // своя (`srsTypingTask`): задание другое, «выбери» там было бы враньём.
    final hint = direction == VocabDirection.typing
        ? L.t('srsTypingTask')
        : L.t('vocabSrsHint');
    return SizedBox(
      height: height,
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (card.isNew)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Chip(
                    label: Text(L.t('srsNew')),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              if (card.secondTarget != null)
                Text(
                  targetLang.toUpperCase(),
                  key: const Key('vocab-lang-first'),
                ),
              Text(
                shown,
                key: const Key('vocab-word'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: card.secondTarget == null ? 38 : 30,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (direction == VocabDirection.recognize)
                _pronunciation(context, card.target, targetLang, 'first'),
              if (card.secondTarget != null) ...[
                const SizedBox(height: 10),
                Text(
                  card.secondLang!.toUpperCase(),
                  key: const Key('vocab-lang-second'),
                ),
                Text(
                  card.secondTarget!,
                  key: const Key('vocab-word-second'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                _pronunciation(
                  context,
                  card.secondTarget!,
                  card.secondLang!,
                  'second',
                ),
              ],
              if (reveal) ...[
                const SizedBox(height: 8),
                Text(
                  card.target,
                  key: const Key('vocab-checked-word'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                _pronunciation(context, card.target, targetLang, 'first'),
              ],
              if (voiceMessage case final message?)
                Semantics(
                  liveRegion: true,
                  child: Text(message, textAlign: TextAlign.center),
                ),
              const SizedBox(height: 12),
              if (!reveal)
                Text(
                  hint,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// ПОЛЕ НАБОРА: образец нарисован посимвольно, ввод принимает ДВИЖОК.
///
/// 🔴 НЕ ОБЫЧНОЕ ПОЛЕ ВВОДА. Обычное разрешает вставку из буфера, стирание
/// середины и автозамену — то есть даёт обойти саму механику. Поле здесь
/// невидимое и служит только приёмником нажатий: после каждого символа
/// содержимое сбрасывается, и движок видит РОВНО ОДНО нажатие. Вставленный
/// кусок он не примет (проба «вставка целого слова одним куском не проходит»).
class _Typing extends StatefulWidget {
  const _Typing({required this.state, required this.onKey, required this.done});
  final TypingState state;
  final void Function(String) onKey;

  /// Слово набрано — ввод заперт до следующей карточки.
  final bool done;

  @override
  State<_Typing> createState() => _TypingState();
}

class _TypingState extends State<_Typing> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _changed(String v) {
    // Сбрасываем СРАЗУ: поле — приёмник, а не хранилище. Иначе второе нажатие
    // пришло бы как строка из двух символов, и движок посчитал бы её ошибкой.
    _ctrl.clear();
    if (v.isEmpty) return;
    widget.onKey(v.characters.last);
  }

  @override
  Widget build(BuildContext context) {
    final st = widget.state;
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Wrap(
            alignment: WrapAlignment.center,
            children: [
              for (var i = 0; i < st.pattern.length; i += 1)
                Container(
                  key: Key('vocab-char-$i'),
                  padding: const EdgeInsets.symmetric(horizontal: 1),
                  decoration: i == st.pos && !widget.done
                      ? BoxDecoration(
                          border: Border(
                            bottom: BorderSide(color: scheme.primary, width: 2),
                          ),
                        )
                      : null,
                  child: Text(
                    st.pattern[i],
                    style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w500,
                      color: switch (st.marks[i]) {
                        Mark.correct => const Color(0xFF22C55E),
                        Mark.wrong => const Color(0xFFEF4444),
                        _ => scheme.onSurfaceVariant,
                      },
                    ),
                  ),
                ),
            ],
          ),
          SizedBox(
            height: 1,
            child: TextField(
              key: const Key('vocab-typing-input'),
              controller: _ctrl,
              focusNode: _focus,
              autofocus: true,
              enabled: !widget.done,
              showCursor: false,
              autocorrect: false,
              enableSuggestions: false,
              style: const TextStyle(color: Colors.transparent, fontSize: 1),
              decoration: const InputDecoration(
                border: InputBorder.none,
                isDense: true,
              ),
              onChanged: _changed,
            ),
          ),
        ],
      ),
    );
  }
}

class _Options extends StatelessWidget {
  const _Options({
    required this.options,
    required this.picked,
    required this.right,
    required this.feedback,
    required this.onPick,
  });

  final List<String> options;
  final String? picked;
  final String right;
  final AnswerFeedback feedback;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final o in options)
            SizedBox(
              width: (MediaQuery.sizeOf(context).width - 24 - 8) / 2,
              height: 56,
              child: AnswerMark(
                feedback: feedback,
                value: o,
                radius: 16,
                child: FilledButton(
                  key: Key('vocab-option-$o'),
                  onPressed: picked == null ? () => onPick(o) : null,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(o, maxLines: 2, textAlign: TextAlign.center),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
