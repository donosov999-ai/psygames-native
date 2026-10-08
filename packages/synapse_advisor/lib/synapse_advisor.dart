/// Synapse advisor — what the pet says after a game, built only from facts.
///
/// Author: Denis Onosov (ODV999) · Confidential · 2026-10-07
///
/// WHY OFFLINE FIRST. The pet must talk on a plane, cost nothing per line and never invent a
/// record. Every sentence here is a template whose numbers come from the app's own saved games;
/// nothing is generated. A language model can later rephrase a chosen line on the server, but
/// the choice of WHAT to say (praise, next step, technique, or silence) stays here, in code.
///
/// RULES THAT ARE NOT NEGOTIABLE (owner decisions, 2026-10-04):
///  * no chat, no input field: the pet speaks after a confirmed result, "Next" shows another line;
///  * comparisons only between comparable games (same game, difficulty and mode);
///  * no invented history, fatigue, diagnoses or "your brain improved" claims;
///  * never the answer to the current task;
///  * silence is a valid answer: lessons, unknown outcomes and disabled pets say nothing;
///  * no line repeats while it carries no new information.
///
/// The file has no dependencies so an app can vendor it as is (PsyGames: lib/synapse/).
library;

import 'dart:convert';

/// How a game ended, as the app knows it. Closing a screen is NOT finishing a game.
enum Outcome { won, finished, lesson, unknown }

/// One saved game, in the app's own numbers.
class SessionFact {
  SessionFact({
    required this.gameId,
    required this.outcome,
    required this.at,
    this.score,
    this.higherIsBetter = true,
    this.timeSeconds,
    this.errors,
    this.level,
    this.levelBefore,
    this.difficulty,
    this.mode,
    this.hintsUsed,
    this.unit,
  });

  final String gameId;
  final Outcome outcome;
  final DateTime at;
  final int? score;
  final bool higherIsBetter;
  final int? timeSeconds;
  final int? errors;
  final int? level;
  final int? levelBefore;
  final String? difficulty;
  final String? mode;
  final int? hintsUsed;

  /// Short localized unit for [score] ("с", "s", "очк."); null — bare number.
  final String? unit;

  String scoreText(int v) => unit == null ? '$v' : '$v $unit';

  /// Two games compare only when they are the same game at the same settings.
  String get comparableKey => '$gameId|${difficulty ?? ''}|${mode ?? ''}';

  bool get counts => outcome == Outcome.won || outcome == Outcome.finished;

  Map<String, Object?> toJson() => {
        'gameId': gameId, 'outcome': outcome.name, 'at': at.toIso8601String(),
        'score': score, 'higherIsBetter': higherIsBetter, 'timeSeconds': timeSeconds,
        'errors': errors, 'level': level, 'levelBefore': levelBefore,
        'difficulty': difficulty, 'mode': mode, 'hintsUsed': hintsUsed, 'unit': unit,
      };

  static SessionFact fromJson(Map<String, Object?> j) => SessionFact(
        gameId: j['gameId'] as String,
        outcome: Outcome.values.firstWhere((o) => o.name == j['outcome'], orElse: () => Outcome.unknown),
        at: DateTime.parse(j['at'] as String),
        score: j['score'] as int?, higherIsBetter: (j['higherIsBetter'] as bool?) ?? true,
        timeSeconds: j['timeSeconds'] as int?, errors: j['errors'] as int?,
        level: j['level'] as int?, levelBefore: j['levelBefore'] as int?,
        difficulty: j['difficulty'] as String?, mode: j['mode'] as String?,
        hintsUsed: j['hintsUsed'] as int?, unit: j['unit'] as String?,
      );
}

/// What the advisor needs to know about a game: its localized name and its category.
class GameInfo {
  const GameInfo({required this.id, required this.name, required this.category});
  final String id;
  final String name;
  final String category;
}

/// What kind of line this is — the app may style or voice them differently.
enum LineKind { praise, support, nextStep, technique }

class Line {
  const Line(this.semanticId, this.kind, this.text, this.evidence);

  /// Meaning plus the value that makes it news: "record:schulte_table:42".
  final String semanticId;
  final LineKind kind;
  final String text;

  /// Which facts the line rests on — for tests and for review, never shown.
  final List<String> evidence;

  @override
  String toString() => '[$kind] $text';
}

/// Lines said recently. The app persists [toJson] per profile.
class AdvisorMemory {
  AdvisorMemory([List<_Said>? said]) : _said = said ?? [];
  final List<_Said> _said;

  bool saidRecently(String semanticId, DateTime now, Duration window) =>
      _said.any((s) => s.id == semanticId && now.difference(s.at) < window);

  int lastVariant(String meaning) {
    for (final s in _said.reversed) {
      if (s.meaning == meaning) return s.variant;
    }
    return -1;
  }

  void remember(String semanticId, String meaning, int variant, DateTime now) {
    _said.add(_Said(semanticId, meaning, variant, now));
    if (_said.length > 60) _said.removeRange(0, _said.length - 60);
  }

  String toJson() => jsonEncode([for (final s in _said) [s.id, s.meaning, s.variant, s.at.toIso8601String()]]);

  static AdvisorMemory fromJson(String? text) {
    if (text == null || text.isEmpty) return AdvisorMemory();
    try {
      final list = jsonDecode(text) as List;
      return AdvisorMemory([
        for (final r in list.cast<List>())
          _Said(r[0] as String, r[1] as String, r[2] as int, DateTime.parse(r[3] as String)),
      ]);
    } catch (_) {
      return AdvisorMemory(); // a broken store must not break the pet
    }
  }
}

class _Said {
  _Said(this.id, this.meaning, this.variant, this.at);
  final String id;
  final String meaning;
  final int variant;
  final DateTime at;
}

/// Picks what to say after a game. Pure: same facts and memory give the same lines.
class Advisor {
  Advisor({required this.locale, Map<String, Map<String, List<String>>>? phrases})
      : _phrases = phrases ?? defaultPhrases;

  final String locale;
  final Map<String, Map<String, List<String>>> _phrases;

  /// How long a line with the same meaning AND the same value stays quiet.
  static const quiet = Duration(hours: 6);

  /// Up to [max] lines for the game that just ended; empty means "stay silent".
  ///
  /// [history] — this profile's earlier saved games (any order, any games; the advisor filters).
  /// [catalog] — games the app can offer as a next step.
  List<Line> react(
    SessionFact fact,
    List<SessionFact> history, {
    required GameInfo game,
    List<GameInfo> catalog = const [],
    required AdvisorMemory memory,
    DateTime? now,
    int max = 3,
  }) {
    final t = now ?? fact.at;
    if (!fact.counts) return const []; // lesson / unknown: say nothing
    final same = history
        .where((h) => h.counts && h.comparableKey == fact.comparableKey && h.at.isBefore(fact.at))
        .toList()
      ..sort((a, b) => a.at.compareTo(b.at));
    final candidates = <_Cand>[];

    // 1. First game here — nothing to compare yet, and saying so is honest.
    if (same.isEmpty) {
      candidates.add(_Cand('first', 'first:${fact.comparableKey}', LineKind.praise, {'game': game.name}, ['no comparable history']));
    }

    // 2. Personal best on comparable games (needs at least two earlier ones to mean anything).
    final scored = same.where((h) => h.score != null).toList();
    if (fact.score != null && scored.length >= 2) {
      final best = fact.higherIsBetter
          ? scored.map((h) => h.score!).reduce((a, b) => a > b ? a : b)
          : scored.map((h) => h.score!).reduce((a, b) => a < b ? a : b);
      final beat = fact.higherIsBetter ? fact.score! > best : fact.score! < best;
      if (beat) {
        candidates.add(_Cand('record', 'record:${fact.comparableKey}:${fact.score}', LineKind.praise,
            {'game': game.name, 'score': fact.scoreText(fact.score!), 'prev': fact.scoreText(best)}, ['score', 'best of ${scored.length} comparable']));
      }
    }

    // 2b. Better than the previous comparable game, when there is too little history for a record.
    if (fact.score != null && scored.length == 1) {
      final last = scored.last.score!;
      if (fact.higherIsBetter ? fact.score! > last : fact.score! < last) {
        candidates.add(_Cand('better', 'better:${fact.comparableKey}:${fact.score}', LineKind.praise,
            {'game': game.name, 'score': fact.scoreText(fact.score!), 'prev': fact.scoreText(last)}, ['score', 'previous comparable']));
      }
    }

    // 3. Level up — the app says the level changed, we only name it.
    if (fact.level != null && fact.levelBefore != null && fact.level! > fact.levelBefore!) {
      candidates.add(_Cand('level', 'level:${fact.gameId}:${fact.level}', LineKind.praise,
          {'game': game.name, 'level': '${fact.level}'}, ['level', 'levelBefore']));
    }

    // 4. Clean game after games with errors.
    if (fact.errors == 0 && same.any((h) => (h.errors ?? 0) > 0)) {
      candidates.add(_Cand('clean', 'clean:${fact.comparableKey}:${_day(t)}', LineKind.praise, {'game': game.name},
          ['errors=0', 'earlier comparable games had errors']));
    }

    // 5. Solved without hints after earlier games that used them.
    if (fact.hintsUsed == 0 && same.any((h) => (h.hintsUsed ?? 0) > 0)) {
      candidates.add(_Cand('nohints', 'nohints:${fact.comparableKey}:${_day(t)}', LineKind.praise, {'game': game.name},
          ['hintsUsed=0', 'earlier comparable games used hints']));
    }

    // 6. A rough game: support with a real number from the person's own past, never a diagnosis.
    final withErr = same.where((h) => h.errors != null).toList();
    if (fact.errors != null && withErr.length >= 3) {
      final sorted = withErr.map((h) => h.errors!).toList()..sort();
      final median = sorted[sorted.length ~/ 2];
      final bestErr = sorted.first;
      if (fact.errors! > median + 1 && fact.errors! >= 3) {
        candidates.add(_Cand('rough', 'rough:${fact.comparableKey}:${_day(t)}', LineKind.support,
            {'game': game.name, 'best': '$bestErr'}, ['errors above own median', 'own best errors']));
      }
    }

    // 7. Next step: a new level to try, or another game of the same skill after a long run of one game.
    final today = same.where((h) => _day(h.at) == _day(t)).length + 1;
    if (fact.level != null && fact.levelBefore != null && fact.level! > fact.levelBefore!) {
      candidates.add(_Cand('next_level', 'next_level:${fact.gameId}:${fact.level}', LineKind.nextStep,
          {'level': '${fact.level! + 1}'}, ['level up']));
    } else if (today >= 5) {
      final other = catalog.where((g) => g.category == game.category && g.id != game.id).toList();
      if (other.isNotEmpty) {
        final pick = other[(today + t.day) % other.length];
        candidates.add(_Cand('switch', 'switch:${fact.gameId}:${_day(t)}', LineKind.nextStep,
            {'game': game.name, 'other': pick.name, 'count': '$today'}, ['$today games of this kind today', 'catalog category']));
      }
    }

    // 8. A technique for this skill — general method, labelled as such, never about this person.
    final tips = _phrases['tip:${game.category}']?[locale];
    if (tips != null && tips.isNotEmpty) {
      candidates.add(_Cand('tip:${game.category}', 'tip:${game.category}', LineKind.technique, const {}, ['category ${game.category}']));
    }

    // What matters most goes first: the news, then where to go next, then the smaller praise, then a technique.
    const order = ['rough', 'record', 'level', 'first', 'better', 'next_level', 'switch', 'clean', 'nohints'];
    int rank(_Cand c) { final i = order.indexOf(c.meaning); return i < 0 ? order.length : i; }
    candidates.sort((a, b) => rank(a).compareTo(rank(b)));
    final out = <Line>[];
    for (final c in candidates) {
      if (out.length >= max) break;
      if (memory.saidRecently(c.semanticId, t, quiet)) continue;
      final variants = _phrases[c.meaning]?[locale] ?? _phrases[c.meaning]?['en'];
      if (variants == null || variants.isEmpty) continue;
      // rotate variants so the same meaning never comes out in the same words twice in a row
      final v = (memory.lastVariant(c.meaning) + 1) % variants.length;
      var text = variants[v];
      c.slots.forEach((k, val) => text = text.replaceAll('{$k}', val));
      if (text.contains('{')) continue; // a missing fact: say nothing rather than a broken line
      memory.remember(c.semanticId, c.meaning, v, t);
      out.add(Line(c.semanticId, c.kind, text, c.evidence));
    }
    return out;
  }

  static String _day(DateTime d) => '${d.year}-${d.month}-${d.day}';
}

class _Cand {
  _Cand(this.meaning, this.semanticId, this.kind, this.slots, this.evidence);
  final String meaning;
  final String semanticId;
  final LineKind kind;
  final Map<String, String> slots;
  final List<String> evidence;
}

/// Phrase bank. Keys are meanings; each has variants per locale. Slots in braces are filled
/// only from facts; a line with an unfilled slot is dropped, not shown.
const Map<String, Map<String, List<String>>> defaultPhrases = {
  'first': {
    'ru': [
      'Первая партия в игре «{game}» — теперь есть с чем сравнивать.',
      'Начало положено: первая партия в игре «{game}» записана. Дальше буду следить за твоим прогрессом здесь.',
      'Первый результат в игре «{game}» есть. Следующая партия покажет, куда он движется.',
    ],
    'en': [
      'First game of {game} — now there is something to compare with.',
      'A start: {game} is on record. I will track your progress here.',
      'Your first {game} result is in. The next game will show where it is heading.',
    ],
    'de': [
      'Erstes Spiel in {game} — jetzt gibt es etwas zum Vergleichen.',
      'Der Anfang ist gemacht: {game} ist gespeichert. Ich verfolge deinen Fortschritt.',
    ],
    'es': [
      'Primera partida de {game}: ya hay con qué comparar.',
      'Buen comienzo: {game} está registrado. Seguiré tu progreso aquí.',
    ],
    'fr': [
      'Première partie de {game} — il y a désormais de quoi comparer.',
      'C’est parti : {game} est enregistré. Je suivrai tes progrès ici.',
    ],
    'it': [
      'Prima partita a {game}: ora c’è qualcosa con cui confrontarsi.',
      'Si comincia: {game} è registrato. Seguirò i tuoi progressi.',
    ],
    'pt': [
      'Primeira partida de {game} — agora há com o que comparar.',
      'Começou: {game} está registrado. Vou acompanhar seu progresso.',
    ],
    'ar': [
      'أول مباراة في {game} — الآن لدينا ما نقارن به.',
      'بداية جيدة: تم تسجيل {game}. سأتابع تقدّمك هنا.',
    ],
    'hi': [
      '{game} में पहला गेम — अब तुलना करने के लिए कुछ है।',
      'शुरुआत हो गई: {game} दर्ज हो गया। मैं यहाँ तुम्हारी प्रगति देखूँगा।',
    ],
    'ja': [
      '{game}の初プレイ。これで比べる基準ができたね。',
      'スタート！{game}を記録したよ。ここで成長を見ていくね。',
    ],
    'ko': [
      '{game} 첫 게임이에요. 이제 비교할 기준이 생겼어요.',
      '시작! {game} 기록 완료. 여기서 실력이 느는 걸 지켜볼게요.',
    ],
    'zh': [
      '{game}的第一局——现在有了可以比较的基准。',
      '开局了：{game}已记录。我会在这里关注你的进步。',
    ],
  },
  'record': {
    'ru': [
      'Новый личный рекорд в игре «{game}»: {score}. Прежний лучший — {prev}.',
      '{score} — это лучше твоего прошлого лучшего ({prev}) в игре «{game}».',
      'Рекорд обновлён: {prev} → {score}.',
    ],
    'en': [
      'New personal best in {game}: {score}. Previous best was {prev}.',
      '{score} beats your previous best of {prev} in {game}.',
      'Record updated: {prev} → {score}.',
    ],
    'de': [
      'Neuer persönlicher Rekord in {game}: {score}. Bisher bestes: {prev}.',
      'Rekord verbessert: {prev} → {score}.',
    ],
    'es': [
      'Nuevo récord personal en {game}: {score}. El anterior: {prev}.',
      'Récord superado: {prev} → {score}.',
    ],
    'fr': [
      'Nouveau record personnel dans {game} : {score}. L’ancien : {prev}.',
      'Record battu : {prev} → {score}.',
    ],
    'it': [
      'Nuovo record personale in {game}: {score}. Il precedente: {prev}.',
      'Record migliorato: {prev} → {score}.',
    ],
    'pt': [
      'Novo recorde pessoal em {game}: {score}. O anterior: {prev}.',
      'Recorde batido: {prev} → {score}.',
    ],
    'ar': [
      'رقم قياسي شخصي جديد في {game}: {score}. الأفضل السابق: {prev}.',
      'تحطّم الرقم القياسي: {prev} ← {score}.',
    ],
    'hi': [
      '{game} में नया निजी रिकॉर्ड: {score}। पिछला सबसे अच्छा: {prev}।',
      'रिकॉर्ड टूटा: {prev} → {score}।',
    ],
    'ja': [
      '{game}で自己ベスト更新：{score}。これまでの最高は{prev}。',
      '記録更新：{prev} → {score}。',
    ],
    'ko': [
      '{game} 개인 최고 기록 경신: {score}. 이전 최고는 {prev}.',
      '기록 갱신: {prev} → {score}.',
    ],
    'zh': [
      '{game}个人新纪录：{score}。之前最好是{prev}。',
      '纪录刷新：{prev} → {score}。',
    ],
  },
  'better': {
    'ru': [
      '{score} — лучше прошлой партии ({prev}).',
      'Прогресс: было {prev}, стало {score}.',
    ],
    'en': [
      '{score} — better than last time ({prev}).',
      'Progress: {prev} last time, {score} now.',
    ],
    'de': [
      '{score} — besser als beim letzten Mal ({prev}).',
      'Fortschritt: letztes Mal {prev}, jetzt {score}.',
    ],
    'es': [
      '{score}: mejor que la última vez ({prev}).',
      'Progreso: antes {prev}, ahora {score}.',
    ],
    'fr': [
      '{score} — mieux que la dernière fois ({prev}).',
      'Progrès : {prev} la dernière fois, {score} maintenant.',
    ],
    'it': [
      '{score}: meglio dell’ultima volta ({prev}).',
      'Progresso: prima {prev}, ora {score}.',
    ],
    'pt': [
      '{score} — melhor que da última vez ({prev}).',
      'Progresso: antes {prev}, agora {score}.',
    ],
    'ar': [
      '{score} — أفضل من المرة السابقة ({prev}).',
      'تقدّم: كان {prev} والآن {score}.',
    ],
    'hi': [
      '{score} — पिछली बार ({prev}) से बेहतर।',
      'प्रगति: पिछली बार {prev}, अब {score}।',
    ],
    'ja': [
      '{score}。前回（{prev}）より良くなったよ。',
      '前進：前回 {prev} → 今回 {score}。',
    ],
    'ko': [
      '{score} — 지난번({prev})보다 좋아요.',
      '발전: 지난번 {prev}, 이번 {score}.',
    ],
    'zh': [
      '{score}——比上次（{prev}）更好。',
      '进步：上次 {prev}，这次 {score}。',
    ],
  },
  'level': {
    'ru': [
      'Уровень {level} в игре «{game}» открыт.',
      'Ты на уровне {level}. Хорошая работа.',
      'Уровень {level} — следующая ступень взята.',
    ],
    'en': [
      'Level {level} in {game} unlocked.',
      'You are on level {level}. Nice work.',
      'Level {level} — another step up.',
    ],
    'de': [
      'Level {level} in {game} freigeschaltet.',
      'Du bist auf Level {level}. Gut gemacht.',
    ],
    'es': [
      'Nivel {level} de {game} desbloqueado.',
      'Estás en el nivel {level}. ¡Bien hecho!',
    ],
    'fr': [
      'Niveau {level} de {game} débloqué.',
      'Tu es au niveau {level}. Bravo.',
    ],
    'it': [
      'Livello {level} di {game} sbloccato.',
      'Sei al livello {level}. Ottimo lavoro.',
    ],
    'pt': [
      'Nível {level} de {game} desbloqueado.',
      'Você está no nível {level}. Muito bem.',
    ],
    'ar': [
      'تم فتح المستوى {level} في {game}.',
      'أنت الآن في المستوى {level}. عمل رائع.',
    ],
    'hi': [
      '{game} में लेवल {level} खुल गया।',
      'तुम लेवल {level} पर हो। बढ़िया।',
    ],
    'ja': [
      '{game}のレベル{level}が解放されたよ。',
      'レベル{level}到達。よくやったね。',
    ],
    'ko': [
      '{game} 레벨 {level} 열림.',
      '레벨 {level} 달성. 잘했어요.',
    ],
    'zh': [
      '{game}第{level}级已解锁。',
      '你到了第{level}级，干得好。',
    ],
  },
  'clean': {
    'ru': [
      'Ни одной ошибки в этой партии.',
      'Чисто: ноль ошибок.',
      'Без единой ошибки — так и держать.',
    ],
    'en': [
      'Not a single mistake this game.',
      'Clean run: zero mistakes.',
      'No mistakes at all — keep it up.',
    ],
    'de': [
      'Kein einziger Fehler in diesem Spiel.',
      'Sauber: null Fehler.',
    ],
    'es': [
      'Ni un solo error en esta partida.',
      'Partida limpia: cero errores.',
    ],
    'fr': [
      'Pas une seule erreur cette partie.',
      'Partie parfaite : zéro erreur.',
    ],
    'it': [
      'Nemmeno un errore in questa partita.',
      'Partita pulita: zero errori.',
    ],
    'pt': [
      'Nenhum erro nesta partida.',
      'Partida limpa: zero erros.',
    ],
    'ar': [
      'ولا خطأ واحد في هذه المباراة.',
      'أداء نظيف: صفر أخطاء.',
    ],
    'hi': [
      'इस गेम में एक भी गलती नहीं।',
      'बिल्कुल साफ़: शून्य गलतियाँ।',
    ],
    'ja': [
      '今回はミスゼロ。',
      'ノーミス達成。',
    ],
    'ko': [
      '이번 게임은 실수 하나 없었어요.',
      '깔끔해요: 실수 0개.',
    ],
    'zh': [
      '这一局一个错误都没有。',
      '零失误，很干净。',
    ],
  },
  'nohints': {
    'ru': [
      'Решено без подсказок.',
      'В этот раз обошёлся без подсказок.',
      'Ни одной подсказки — всё сам.',
    ],
    'en': [
      'Solved without hints.',
      'No hints needed this time.',
      'Zero hints — all on your own.',
    ],
    'de': [
      'Ohne Hinweise gelöst.',
      'Diesmal ganz ohne Hinweise.',
    ],
    'es': [
      'Resuelto sin pistas.',
      'Esta vez sin ninguna pista.',
    ],
    'fr': [
      'Résolu sans indice.',
      'Aucun indice cette fois.',
    ],
    'it': [
      'Risolto senza suggerimenti.',
      'Questa volta nessun suggerimento.',
    ],
    'pt': [
      'Resolvido sem dicas.',
      'Desta vez sem nenhuma dica.',
    ],
    'ar': [
      'تم الحل بدون تلميحات.',
      'هذه المرة بلا أي تلميح.',
    ],
    'hi': [
      'बिना संकेत के हल किया।',
      'इस बार कोई संकेत नहीं लिया।',
    ],
    'ja': [
      'ヒントなしでクリア。',
      '今回はヒントを使わなかったね。',
    ],
    'ko': [
      '힌트 없이 해결했어요.',
      '이번엔 힌트를 하나도 안 썼어요.',
    ],
    'zh': [
      '没用提示就解出来了。',
      '这次一个提示都没用。',
    ],
  },
  'rough': {
    'ru': [
      'Не каждая партия ровная. Твой лучший результат здесь — {best} ошибок, он никуда не делся.',
      'Сегодня ошибок больше обычного. Это бывает; твой лучший — {best}.',
      'Неровная партия — нормальная часть тренировки. Лучшее у тебя здесь: {best} ошибок.',
    ],
    'en': [
      'Not every game is smooth. Your best here is {best} mistakes, and it still stands.',
      'More mistakes than usual today. It happens; your best is {best}.',
      'An uneven game is a normal part of practice. Your best here: {best} mistakes.',
    ],
    'de': [
      'Nicht jedes Spiel läuft rund. Dein Bestwert hier sind {best} Fehler — der bleibt.',
      'Heute mehr Fehler als sonst. Das passiert; dein Bestwert: {best}.',
    ],
    'es': [
      'No todas las partidas salen redondas. Tu mejor marca aquí es {best} errores y sigue en pie.',
      'Hoy más errores de lo normal. Pasa; tu mejor marca: {best}.',
    ],
    'fr': [
      'Toutes les parties ne sont pas fluides. Ton meilleur ici : {best} erreurs, et il tient toujours.',
      'Plus d’erreurs que d’habitude aujourd’hui. Ça arrive ; ton meilleur : {best}.',
    ],
    'it': [
      'Non tutte le partite filano lisce. Il tuo migliore qui è {best} errori, e resta.',
      'Oggi più errori del solito. Capita; il tuo migliore: {best}.',
    ],
    'pt': [
      'Nem toda partida sai redonda. Seu melhor aqui é {best} erros, e continua valendo.',
      'Mais erros que o normal hoje. Acontece; seu melhor: {best}.',
    ],
    'ar': [
      'ليست كل مباراة سلسة. أفضل نتيجة لك هنا {best} أخطاء، وما زالت قائمة.',
      'أخطاء أكثر من المعتاد اليوم. يحدث هذا؛ أفضل نتيجة لك: {best}.',
    ],
    'hi': [
      'हर गेम आसान नहीं होता। यहाँ तुम्हारा सबसे अच्छा {best} गलतियाँ है, और वह कायम है।',
      'आज सामान्य से ज़्यादा गलतियाँ। ऐसा होता है; तुम्हारा सबसे अच्छा: {best}।',
    ],
    'ja': [
      'うまくいかない回もあるよ。ここでのベストはミス{best}回、それは変わらない。',
      '今日はいつもよりミスが多め。よくあること。ベストは{best}。',
    ],
    'ko': [
      '모든 게임이 순조로울 순 없어요. 여기서 최고 기록은 실수 {best}개, 그대로예요.',
      '오늘은 평소보다 실수가 많네요. 그럴 수 있어요. 최고 기록: {best}.',
    ],
    'zh': [
      '不是每一局都顺利。你在这里的最好成绩是{best}个错误，它依然有效。',
      '今天错误比平时多。这很正常；你的最好成绩：{best}。',
    ],
  },
  'next_level': {
    'ru': [
      'Следующий шаг — уровень {level}. Попробуешь?',
      'Можно двигаться дальше: уровень {level} ждёт.',
    ],
    'en': [
      'Next step: level {level}. Want to try?',
      'You can move on: level {level} is waiting.',
    ],
    'de': [
      'Nächster Schritt: Level {level}. Probierst du es?',
      'Weiter geht’s: Level {level} wartet.',
    ],
    'es': [
      'Siguiente paso: nivel {level}. ¿Lo intentas?',
      'Puedes seguir: el nivel {level} te espera.',
    ],
    'fr': [
      'Prochaine étape : niveau {level}. Tu tentes ?',
      'Tu peux avancer : le niveau {level} t’attend.',
    ],
    'it': [
      'Prossimo passo: livello {level}. Ci provi?',
      'Puoi andare avanti: il livello {level} ti aspetta.',
    ],
    'pt': [
      'Próximo passo: nível {level}. Vamos tentar?',
      'Pode seguir: o nível {level} está esperando.',
    ],
    'ar': [
      'الخطوة التالية: المستوى {level}. هل تجرّب؟',
      'يمكنك المتابعة: المستوى {level} بانتظارك.',
    ],
    'hi': [
      'अगला कदम: लेवल {level}। कोशिश करोगे?',
      'आगे बढ़ो: लेवल {level} इंतज़ार कर रहा है।',
    ],
    'ja': [
      '次はレベル{level}。やってみる？',
      '先へ進もう。レベル{level}が待ってるよ。',
    ],
    'ko': [
      '다음 단계: 레벨 {level}. 도전해 볼래요?',
      '다음으로 가요. 레벨 {level}이 기다려요.',
    ],
    'zh': [
      '下一步：第{level}级。试试吗？',
      '可以继续了：第{level}级在等你。',
    ],
  },
  'switch': {
    'ru': [
      'Уже {count} партий в игре «{game}» сегодня. Для разнообразия попробуй игру «{other}» — она тренирует то же.',
      '{count} партий подряд! Переключись на игру «{other}» — навык тот же, задача новая.',
    ],
    'en': [
      '{count} games of {game} today. For variety, try {other} — it trains the same skill.',
      '{count} in a row! Switch to {other} — same skill, a new challenge.',
    ],
    'de': [
      'Schon {count} Spiele {game} heute. Zur Abwechslung: {other} trainiert dasselbe.',
      '{count} am Stück! Wechsle zu {other} — gleiche Fähigkeit, neue Aufgabe.',
    ],
    'es': [
      'Ya van {count} partidas de {game} hoy. Para variar, prueba {other}: entrena lo mismo.',
      '¡{count} seguidas! Cambia a {other}: misma habilidad, nuevo reto.',
    ],
    'fr': [
      'Déjà {count} parties de {game} aujourd’hui. Pour varier, essaie {other} — même compétence.',
      '{count} d’affilée ! Passe à {other} — même compétence, nouveau défi.',
    ],
    'it': [
      'Già {count} partite a {game} oggi. Per cambiare, prova {other}: allena la stessa abilità.',
      '{count} di fila! Passa a {other}: stessa abilità, nuova sfida.',
    ],
    'pt': [
      'Já são {count} partidas de {game} hoje. Para variar, tente {other} — treina o mesmo.',
      '{count} seguidas! Troque para {other} — mesma habilidade, novo desafio.',
    ],
    'ar': [
      'لعبت {game} {count} مرات اليوم. للتنويع جرّب {other} — تدرّب المهارة نفسها.',
      '{count} على التوالي! انتقل إلى {other} — المهارة نفسها وتحدٍّ جديد.',
    ],
    'hi': [
      'आज {game} के {count} गेम हो गए। बदलाव के लिए {other} आज़माओ — वही कौशल।',
      'लगातार {count}! {other} पर जाओ — वही कौशल, नई चुनौती।',
    ],
    'ja': [
      '今日は{game}をもう{count}回。気分転換に{other}もどう？同じ力が鍛えられるよ。',
      '{count}回連続！{other}に切り替えよう。同じ力、新しい挑戦。',
    ],
    'ko': [
      '오늘 {game}만 {count}판째예요. 기분 전환으로 {other}도 해 봐요. 같은 능력을 길러요.',
      '{count}판 연속! {other}로 바꿔 봐요. 같은 능력, 새 도전.',
    ],
    'zh': [
      '今天已经玩了{count}局{game}。换换口味，试试{other}——练的是同一种能力。',
      '连续{count}局！换成{other}吧——同样的能力，新的挑战。',
    ],
  },
  // Techniques: well-known general methods for the skill, not a statement about the player.
  'tip:memory': {
    'ru': [
      'Приём: разбивай длинную последовательность на группы по 3–4 элемента — так её легче удержать.',
      'Приём: проговаривай про себя то, что запоминаешь, — звук держится дольше картинки.',
      'Приём: свяжи элементы в маленькую историю — связанное помнится лучше разрозненного.',
    ],
    'en': [
      'Technique: split a long sequence into chunks of 3–4 — it is easier to hold.',
      'Technique: repeat what you memorise under your breath — sound lasts longer than a picture.',
      'Technique: link the items into a tiny story — connected things are remembered better.',
    ],
    'de': [
      'Technik: Teile eine lange Folge in Gruppen zu 3–4 — so behältst du sie leichter.',
      'Technik: Verknüpfe die Elemente zu einer kleinen Geschichte — Verbundenes merkt man sich besser.',
    ],
    'es': [
      'Técnica: divide una secuencia larga en grupos de 3–4; así es más fácil retenerla.',
      'Técnica: une los elementos en una pequeña historia; lo conectado se recuerda mejor.',
    ],
    'fr': [
      'Technique : découpe une longue suite en groupes de 3–4, c’est plus facile à retenir.',
      'Technique : relie les éléments en une petite histoire, on retient mieux ce qui est lié.',
    ],
    'it': [
      'Tecnica: dividi una sequenza lunga in gruppi da 3–4, così è più facile ricordarla.',
      'Tecnica: collega gli elementi in una piccola storia: ciò che è collegato si ricorda meglio.',
    ],
    'pt': [
      'Técnica: divida uma sequência longa em grupos de 3–4 — fica mais fácil de guardar.',
      'Técnica: ligue os itens numa pequena história — o que está ligado se lembra melhor.',
    ],
    'ar': [
      'أسلوب: قسّم السلسلة الطويلة إلى مجموعات من 3–4 عناصر، فيسهل حفظها.',
      'أسلوب: اربط العناصر في قصة صغيرة؛ المترابط يُتذكّر أفضل.',
    ],
    'hi': [
      'तरीका: लंबी शृंखला को 3–4 के समूहों में बाँटो — याद रखना आसान होगा।',
      'तरीका: चीज़ों को एक छोटी कहानी में जोड़ो — जुड़ी हुई चीज़ें बेहतर याद रहती हैं।',
    ],
    'ja': [
      'コツ：長い並びは3〜4個ずつに区切ると覚えやすいよ。',
      'コツ：項目を小さな物語でつなげよう。つながったものは覚えやすい。',
    ],
    'ko': [
      '요령: 긴 순서는 3~4개씩 묶어 보세요. 기억하기 쉬워요.',
      '요령: 항목을 짧은 이야기로 이어 보세요. 연결된 건 더 잘 기억돼요.',
    ],
    'zh': [
      '技巧：把长序列分成3–4个一组，更容易记住。',
      '技巧：把各项串成一个小故事，有联系的东西更好记。',
    ],
  },
  'tip:attention': {
    'ru': [
      'Приём: смотри в центр поля и замечай цели боковым зрением, не бегая глазами.',
      'Приём: сначала скорость не важна — сначала точность, скорость придёт сама.',
      'Приём: если сбился — не догоняй, продолжи с текущего места спокойно.',
    ],
    'en': [
      'Technique: keep your eyes on the centre and catch targets with peripheral vision.',
      'Technique: accuracy first, speed follows on its own.',
      'Technique: lost your place? Do not rush to catch up — calmly continue from where you are.',
    ],
    'de': [
      'Technik: Blick in die Mitte und Ziele mit dem Seitenblick erfassen, nicht mit den Augen springen.',
      'Technik: Erst Genauigkeit, das Tempo kommt von allein.',
    ],
    'es': [
      'Técnica: mira al centro y capta los objetivos con la visión periférica, sin saltar con los ojos.',
      'Técnica: primero precisión; la velocidad llega sola.',
    ],
    'fr': [
      'Technique : regarde le centre et repère les cibles en vision périphérique, sans balayer des yeux.',
      'Technique : d’abord la précision, la vitesse viendra d’elle-même.',
    ],
    'it': [
      'Tecnica: guarda il centro e cogli gli obiettivi con la vista periferica, senza saltare con gli occhi.',
      'Tecnica: prima la precisione, la velocità arriva da sola.',
    ],
    'pt': [
      'Técnica: olhe para o centro e capte os alvos com a visão periférica, sem pular com os olhos.',
      'Técnica: primeiro precisão, a velocidade vem sozinha.',
    ],
    'ar': [
      'أسلوب: ثبّت نظرك في المنتصف والتقط الأهداف بالرؤية الجانبية دون تحريك عينيك.',
      'أسلوب: الدقة أولاً، والسرعة تأتي وحدها.',
    ],
    'hi': [
      'तरीका: बीच में देखो और लक्ष्य किनारे की नज़र से पकड़ो, आँखें इधर-उधर मत दौड़ाओ।',
      'तरीका: पहले सटीकता, गति अपने आप आएगी।',
    ],
    'ja': [
      'コツ：中心を見て、目を動かさず周辺視野でターゲットをとらえよう。',
      'コツ：まず正確さ。速さは後からついてくる。',
    ],
    'ko': [
      '요령: 가운데를 보고 시선을 옮기지 말고 주변 시야로 목표를 잡으세요.',
      '요령: 정확성이 먼저예요. 속도는 저절로 따라와요.',
    ],
    'zh': [
      '技巧：盯住中心，用余光找目标，不要来回扫视。',
      '技巧：先求准确，速度自然会来。',
    ],
  },
  'tip:logic': {
    'ru': [
      'Приём: начинай с места, где вариантов меньше всего.',
      'Приём: если застрял — ищи, что точно НЕ может стоять в клетке.',
      'Приём: проверяй каждый вывод одним условием, прежде чем ставить.',
    ],
    'en': [
      'Technique: start where there are the fewest options.',
      'Technique: stuck? Look for what definitely CANNOT go in a cell.',
      'Technique: check each conclusion against one rule before you place it.',
    ],
    'de': [
      'Technik: Beginne dort, wo es am wenigsten Möglichkeiten gibt.',
      'Technik: Festgefahren? Suche, was in ein Feld sicher NICHT passt.',
    ],
    'es': [
      'Técnica: empieza donde hay menos opciones.',
      'Técnica: ¿atascado? Busca lo que seguro NO puede ir en una casilla.',
    ],
    'fr': [
      'Technique : commence là où il y a le moins de possibilités.',
      'Technique : bloqué ? Cherche ce qui ne peut certainement PAS aller dans une case.',
    ],
    'it': [
      'Tecnica: inizia dove ci sono meno opzioni.',
      'Tecnica: bloccato? Cerca cosa di sicuro NON può stare in una casella.',
    ],
    'pt': [
      'Técnica: comece onde há menos opções.',
      'Técnica: travou? Procure o que com certeza NÃO pode ir numa casa.',
    ],
    'ar': [
      'أسلوب: ابدأ من المكان الذي فيه أقل عدد من الاحتمالات.',
      'أسلوب: هل علِقت؟ ابحث عمّا لا يمكن بالتأكيد أن يوضع في الخانة.',
    ],
    'hi': [
      'तरीका: वहाँ से शुरू करो जहाँ सबसे कम विकल्प हों।',
      'तरीका: अटक गए? देखो कि किसी खाने में क्या पक्का नहीं आ सकता।',
    ],
    'ja': [
      'コツ：選択肢がいちばん少ない所から始めよう。',
      'コツ：行き詰まったら、そのマスに絶対入らないものを探そう。',
    ],
    'ko': [
      '요령: 선택지가 가장 적은 곳부터 시작하세요.',
      '요령: 막혔다면 그 칸에 절대 들어갈 수 없는 걸 찾아보세요.',
    ],
    'zh': [
      '技巧：从可能性最少的地方开始。',
      '技巧：卡住了？找出某一格里肯定不能放什么。',
    ],
  },
  'tip:action': {
    'ru': [
      'Приём: смотри туда, где появится сигнал, а не на свой палец.',
      'Приём: держи палец рядом с экраном — так быстрее первое касание.',
    ],
    'en': [
      'Technique: watch where the signal appears, not your own finger.',
      'Technique: keep your finger close to the screen for a faster first tap.',
    ],
    'de': [
      'Technik: Schau dorthin, wo das Signal erscheint, nicht auf deinen Finger.',
      'Technik: Halte den Finger nah am Bildschirm für einen schnelleren ersten Tipp.',
    ],
    'es': [
      'Técnica: mira donde aparece la señal, no tu dedo.',
      'Técnica: mantén el dedo cerca de la pantalla para un primer toque más rápido.',
    ],
    'fr': [
      'Technique : regarde là où le signal apparaît, pas ton doigt.',
      'Technique : garde le doigt près de l’écran pour un premier appui plus rapide.',
    ],
    'it': [
      'Tecnica: guarda dove compare il segnale, non il tuo dito.',
      'Tecnica: tieni il dito vicino allo schermo per un primo tocco più rapido.',
    ],
    'pt': [
      'Técnica: olhe para onde o sinal aparece, não para o seu dedo.',
      'Técnica: mantenha o dedo perto da tela para um primeiro toque mais rápido.',
    ],
    'ar': [
      'أسلوب: انظر إلى مكان ظهور الإشارة، لا إلى إصبعك.',
      'أسلوب: أبقِ إصبعك قريباً من الشاشة لنقرة أولى أسرع.',
    ],
    'hi': [
      'तरीका: वहाँ देखो जहाँ संकेत आता है, अपनी उँगली पर नहीं।',
      'तरीका: पहले टैप को तेज़ करने के लिए उँगली स्क्रीन के पास रखो।',
    ],
    'ja': [
      'コツ：指ではなく、合図が出る場所を見よう。',
      'コツ：指を画面の近くに置いておくと最初のタップが速くなるよ。',
    ],
    'ko': [
      '요령: 손가락이 아니라 신호가 나타나는 곳을 보세요.',
      '요령: 첫 터치를 빠르게 하려면 손가락을 화면 가까이 두세요.',
    ],
    'zh': [
      '技巧：看信号出现的位置，而不是自己的手指。',
      '技巧：手指靠近屏幕，第一下点得更快。',
    ],
  },
};
