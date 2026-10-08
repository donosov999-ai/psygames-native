import 'asset_json.dart';
import 'l10n.dart';
import 'sessions.dart' show jsTruthy;
import 'stats_model.dart' show jsNumStr;

/// СБОРЩИК МОДЕЛИ ГЛАВНОЙ НА DART (задача d6a60b02, вариант Б, Главная — шаг «сборщик»).
///
/// Перенос `buildHomeModel` из `frontend/src/services/homeModel.ts` один в один: вход → модель, которую
/// рисует `home_screen.dart`. Вход — то, что Главная прочитала и посчитала (`HomeModelInput` веба):
/// игры — по id (поля из `assets/catalog.json`), картинки — адресами сборки. Цвета текста на карточках
/// (`onLook`: `onGradientText`, `innerScrim`) не считаются здесь второй копией — их готовым ответом веба
/// отдаёт `assets/home.json` (проба `flutter-home-asset-fresh.test.ts`) по концам градиента.
///
/// Сбор входа на Dart — следующие шаги; эталон этого шага — вход с живой Главной и модель того же
/// сборщика веба (`fixtures/home_builder_*`), проба `home_model_test.dart`.

/// Ключи блоков Главной — имена схемы веба (`показыватьБлок`, `constants/homeBlocks.ts`), а не текст
/// экрана: кодами символов, чтобы сторожа кириллицы в коде считали только видимый текст.
abstract final class HomeBlockKeys {
  /// «цель_дня»
  static const goal = '\u0446\u0435\u043b\u044c\u005f\u0434\u043d\u044f';

  /// «сегодня»
  static const today = '\u0441\u0435\u0433\u043e\u0434\u043d\u044f';

  /// «рекомендации»
  static const reco = '\u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438';

  /// «практики»
  static const practices = '\u043f\u0440\u0430\u043a\u0442\u0438\u043a\u0438';

  /// «любимые_разделы»
  static const favourites = '\u043b\u044e\u0431\u0438\u043c\u044b\u0435\u005f\u0440\u0430\u0437\u0434\u0435\u043b\u044b';
}

/// Тексты блока цели дня — списком для сборщика словаря (`embed-l10n.mjs`).
const homeGoalTextKeys = <String>[
  'dayGoalTitle', 'dayGoalCloseA11y', 'dayGoalAsk', 'dayGoalSave', 'dayGoalAskHint', 'dayGoalPlaceholder', //
  'notNow', 'dayGoalExamplesTitle', 'dayGoalTodayLine', 'dayGoalRoundsNone', 'dayGoalReview', 'dayGoalYes', 'dayGoalNo',
  'dayGoalDoneNote', 'dayGoalMissedNote', 'dayGoalRewardNeedsRound',
];

/// Ключи, которые сборщик зовёт переменной, а не литералом, — списком для сборщика словаря.
const homeVariableKeys = <String>['recoDoneToday'];

/// Модель и вход — словари, как их видит JSON.
typedef HomeJson = Map<String, Object?>;

/// Данные сборки, которые читает сборщик: игры каталога и готовые цвета карточек.
class HomeData {
  HomeData({required this.games, required this.heroLooks, required this.textOn});
  final Map<String, HomeJson> games;
  final Map<String, HomeJson> heroLooks;
  final Map<String, String> textOn;

  factory HomeData.fromJson(HomeJson catalog, HomeJson home) => HomeData(
    games: {for (final g in (catalog['games']! as List).cast<Map>()) g['id'] as String: g.cast<String, Object?>()},
    heroLooks: {for (final e in (home['heroLooks']! as Map).entries) e.key as String: (e.value as Map).cast<String, Object?>()},
    textOn: (home['textOn']! as Map).cast<String, String>(),
  );

  static HomeData? _cache;
  static Future<HomeData> load() async =>
      _cache ??= HomeData.fromJson(await loadJsonAsset('assets/catalog.json'), await loadJsonAsset('assets/home.json'));

  /// `onLook(c1, c2)` веба — готовым ответом.
  HomeJson look(String a, String b) => heroLooks['$a|$b'] ?? (throw StateError('no hero look for $a|$b: regenerate assets/home.json'));
}

/// `encodeURIComponent` веба: не трогает `A–Z a–z 0–9 - _ . ! ~ * ' ( )`.
String jsEncodeUriComponent(String s) =>
    Uri.encodeComponent(s)
        .replaceAll('%21', '!')
        .replaceAll('%2A', '*')
        .replaceAll('%27', "'")
        .replaceAll('%28', '(')
        .replaceAll('%29', ')');

/// `String(v)` веба для чисел и строк из JSON.
String _js(Object? v) => v is num ? jsNumStr(v) : '$v';

/// `hrefOf` веба — адрес с параметрами, как `router.push({ pathname, params })`.
String hrefOf(String pathname, Map<String, Object?>? params) {
  final q = [
    for (final e in (params ?? const {}).entries)
      if (e.value != null && e.value != '') '${jsEncodeUriComponent(e.key)}=${jsEncodeUriComponent(_js(e.value))}',
  ].join('&');
  return q.isEmpty ? pathname : '$pathname?$q';
}

/// Модель Главной — та же, что `buildHomeModel` веба. [i] — вход в виде образца (`home_builder_input_*`).
HomeJson buildHomeModel(HomeJson i, HomeData d) {
  String t(Object? k) => L.t('$k');
  String withN(String s, Object? n) => s.replaceFirst('{n}', _js(n));
  HomeJson map(Object? v) => v is Map ? v.cast<String, Object?>() : const {};
  List<String> pair(List g) => ['${g.first}', '${g.last}'];

  final images = map(i['images']);
  final onPhoto = images['onPhoto'] == true;
  final show = map(i['showBlock']);
  bool showBlock(String k) => show[k] == true;
  final profile = map(i['profile']);
  final colors = map(i['colors']);
  final level = map(i['level']);
  final today = map(i['today']);
  final streak = i['streak'];
  final blocks = <HomeJson>[];

  blocks.add({'kind': 'search', 'placeholder': L.t('catalogSearch'), 'button': '${L.t('tabGames')} · ${L.t('catalogFilter')}'});

  if (i['ladder'] case final Map ladder) {
    blocks.add({
      'kind': 'ladder',
      'text': L.t('ladderNext').replaceFirst('{n}', _js(ladder['n'])).replaceFirst('{what}', t(ladder['titleKey'])),
    });
  }

  final chest = map(i['chest']);
  final chestText = jsTruthy(chest['face'])
      ? L
            .t('chestToNext')
            .replaceFirst('{n}', _js(chest['left']))
            .replaceFirst('{have}', _js(chest['have']))
            .replaceFirst('{all}', _js(chest['all']))
      : L.t('chestFull');
  blocks.add({
    'kind': 'chest',
    'face': chest['face'] ?? '🏆',
    'text': chestText,
    'ratio': chest['ratio'],
    'label': '$chestText — ${L.t('collectionOpen')}',
  });

  if (i['resume'] case final String id when d.games[id] != null) {
    final g = d.games[id]!;
    final title = L.t('resumeGameTitle').replaceFirst('{game}', t(g['nameKey']));
    blocks.add({
      'kind': 'resume',
      'title': title,
      'sub': t(g['skillKey']),
      'gradient': pair(g['gradient']! as List),
      'href': g['route'],
      'label': title,
    });
  }

  final goalCard = map(i['goalCard']);
  if (showBlock(HomeBlockKeys.goal) && goalCard['state'] != 'hidden') {
    final g = goalCard['goal'] is Map ? map(goalCard['goal']) : null;
    final texts = <String, String>{for (final k in homeGoalTextKeys) k: L.t(k)};
    texts['rounds'] = withN(L.t('dayGoalRounds'), today['rounds']);
    texts['rewardNote'] = withN(L.t('dayGoalRewardNote'), g?['reward'] ?? 0);
    texts['yesFg'] = d.textOn['#22c55e']!;
    blocks.add({
      'kind': 'goal',
      'state': goalCard['state'],
      'goalText': g?['text'],
      'outcome': g?['outcome'],
      'reward': g?['reward'],
      'roundsToday': today['rounds'],
      'maxLen': i['goalMaxLen'],
      'texts': texts,
      'examples': [for (final k in (i['goalExampleKeys']! as List)) '— ${t(k)}'],
    });
  }

  if (showBlock(HomeBlockKeys.today)) {
    final rows = (today['rows']! as List).cast<Map>();
    final max = (i['todayRowsMax']! as num).toInt();
    blocks.add({
      'kind': 'today',
      'title': L.t('today'),
      'total': today['total'],
      'totalLabel': '${L.t('todayEarnedTitle')}: ${_js(today['total'])}',
      'rows': [
        for (final r in rows.take(max))
          {
            'name': d.games[r['game']] != null ? t(d.games[r['game']]!['nameKey']) : r['game'],
            'rounds': withN(L.t('todayRoundsLabel'), r['rounds']),
            'doubled': jsTruthy(r['doubled']),
            'gain': r['total'],
          },
      ],
      'empty': rows.isEmpty ? L.t('todayEmptyHint') : null,
      'more': rows.length > max ? withN(L.t('todayMore'), rows.length - max) : null,
      'streakNote': rows.isNotEmpty && (today['dayStreak'] as num) >= (i['dayStreakForMult'] as num)
          ? withN(L.t('todayStreakNote'), today['dayStreak'])
          : null,
    });
  }

  final reco = (i['reco']! as List).cast<Map>();
  if (reco.isNotEmpty && showBlock(HomeBlockKeys.reco)) {
    blocks.add({
      'kind': 'reco',
      'title': L.t('recoTitle'),
      'hint': L.t('recoHint'),
      'cards': [
        for (final r in reco)
          () {
            final pick = map(r['pick']);
            final game = d.games[r['gameId']]!;
            final done = jsTruthy(pick['doneToday']);
            final why = done ? homeVariableKeys[0] : '${pick['reasonKey']}';
            final g = pair(game['gradient']! as List);
            final look = d.look(g[0], g[1]);
            return <String, Object?>{
              'id': pick['gameId'],
              'href': hrefOf('${game['route']}', map(i['recoParams'])),
              'gradient': g,
              'look': look,
              'icon': {'ion': game['icon'], 'size': 26},
              'chip': done ? '✓' : null,
              'chipBg': look['scrim35'],
              'title': t(game['nameKey']),
              'sub': t(why),
              'cta': {'ion': 'play', 'text': done ? L.t('ctaRepeat') : L.t('ctaStart'), 'bg': look['scrim35'], 'fg': look['fg']},
              'label': '${t(game['nameKey'])} — ${t(why)}',
            };
          }(),
      ],
    });
  }

  if (showBlock(HomeBlockKeys.practices)) {
    final cards = <HomeJson>[];
    if (i['warmup'] case final Map warmup) {
      final g = pair(warmup['gradient']! as List);
      final look = d.look(g[0], g[1]);
      final slot = '${warmup['slotKey']}';
      cards.add({
        'id': 'warmup',
        'href': '/warmup-picker',
        'gradient': g,
        'look': look,
        'icon': {'image': images['warmup'], 'size': 30},
        'chip': streak is num && streak > 0 ? '🔥${_js(streak)}' : null,
        'chipBg': look['scrim20'],
        'title': L.t('warmupPickerTitle'),
        'sub': '${t(slot)} · ${t('${slot}Desc')}',
        'cta': {'ion': 'chevron-forward', 'text': L.t('ctaChoose'), 'bg': look['scrim35'], 'fg': look['fg']},
        'label': L.t('warmupPickerTitle'),
      });
    }
    final pg = pair(map(i['pause'])['gradient']! as List);
    final pl = d.look(pg[0], pg[1]);
    cards.add({
      'id': 'relaxation',
      'href': '/games/relaxation-hub',
      'gradient': pg,
      'look': pl,
      'icon': {'ion': 'leaf-outline', 'size': 26},
      'chip': null,
      'chipBg': pl['scrim20'],
      'title': L.t('relaxationGroup'),
      'sub': L.t('relaxationGroupDesc'),
      'cta': {'ion': 'chevron-forward', 'text': L.t('ctaChoose'), 'bg': '#FFF', 'fg': '#185a9d'},
      'label': L.t('relaxationGroup'),
    });
    final ch = map(i['challenge']);
    final cgame = d.games[ch['gameId']]!;
    final cg = pair(cgame['gradient']! as List);
    final cl = d.look(cg[0], cg[1]);
    final done = jsTruthy(ch['done']);
    cards.add({
      'id': 'challenge',
      'href': null,
      'action': 'challenge',
      'gradient': cg,
      'look': cl,
      'icon': {'ion': 'flash', 'size': 26},
      'chip': done ? '✓' : '🔥${_js(ch['streak'])}',
      'chipBg': cl['scrim35'],
      'title': L.t('dailyChallenge'),
      'sub': '${t(cgame['nameKey'])} · ${t(ch['difficultyKey'])}',
      'cta': {'ion': 'play', 'text': done ? L.t('ctaRepeat') : L.t('ctaStart'), 'bg': cl['scrim35'], 'fg': cl['fg']},
      'label': L.t('dailyChallenge'),
    });
    blocks.add({'kind': 'practices', 'title': L.t('practicesTitle'), 'cards': cards});
  }

  final favourites = (i['favourites']! as List).cast<Map>();
  if (favourites.isNotEmpty && showBlock(HomeBlockKeys.favourites)) {
    blocks.add({
      'kind': 'favourites',
      'title': L.t('favouriteSections'),
      'allLabel': '${L.t('allGames')} ›',
      'sections': [
        for (final f in favourites)
          {
            'category': f['category'],
            'total': f['total'],
            'routes': f['routes'],
            'more': (f['hidden'] as num) > 0 ? withN(L.t('andMore'), f['hidden']) : null,
          },
      ],
    });
  }

  blocks.add({'kind': 'allForks', 'label': '${L.t('allForks')} ›', 'href': '/games?filter=hubs'});

  final wager = i['wagerToast'] is Map ? map(i['wagerToast']) : null;
  final sheet = i['goalSheet'] is Map ? map(i['goalSheet']) : null;
  final frameColor = i['frameColor'];
  final update = i['update'];
  return {
    'v': 1,
    'profileId': profile['id'],
    'background': {
      'image': onPhoto ? images['profileBg'] : null,
      'tint': '${colors['primary']}${onPhoto ? '2E' : '4D'}',
      'veil': onPhoto ? colors['background'] : null,
    },
    'toasts': {
      'streak': i['streakToast'] != null ? {'text': '+${_js(i['streakToast'])} ⭐', 'bg': '#ef4444', 'fg': d.textOn['#ef4444']} : null,
      'wager': wager == null
          ? null
          : {
              'text': (wager['kind'] == 'won' ? L.t('wagerWonToast') : L.t('wagerLostToast')).replaceFirst('{n}', _js(wager['amount'])),
              'emoji': wager['kind'] == 'won' ? '🏆' : '💸',
              'bg': wager['kind'] == 'won' ? '#22c55e' : '#475569',
            },
      'levelUp': i['levelUp'] != null ? {'title': '${L.t('level')} ${_js(i['levelUp'])}!', 'sub': t(level['titleKey'])} : null,
    },
    'header': {
      'logo': images['logo'],
      'logoPlate': i['logoPlate'],
      'tokens': i['tokens'],
      'level': 'Lv ${_js(level['level'])}',
      'streak': streak,
      'streakLabel': '${L.t('streakLabel')}: ${_js(streak)}',
      'friendsLabel': L.t('friendsTitle'),
      'league': level['span'] != null ? level['progress'] : null,
      'leaguesLabel': L.t('leaguesTitle'),
      'pet': i['pet'],
      'petLabel': L.t('petSynapse'),
      'chip': {
        'name': L.t('profileName_${profile['id']}'),
        'image': images['chip'],
        'emoji': profile['emoji'],
        'bg': onPhoto ? '${colors['surface']}F2' : '${profile['color']}22',
        'border': frameColor ?? '${profile['color']}88',
        'borderWidth': jsTruthy(frameColor) ? 2.5 : 1.5,
      },
      'title': i['titleLabel'],
      'onPhoto': onPhoto,
      'achievements': i['achievementsCount'],
      'labels': {
        'achievements': L.t('achievementsTitle'),
        'shop': L.t('shop'),
        'statistics': L.t('statistics'),
        'settings': L.t('settings'),
      },
      'subtitle': '${L.t('trainYourBrain')} · ${L.t('homeSwitchHint')}',
      'update': jsTruthy(update) ? {'text': '${L.t('updAvailable')} v${_js(update)} · ${L.t('updDownload')}'} : null,
    },
    'blocks': blocks,
    'goalSheet': sheet == null
        ? null
        : {
            'pet': sheet['petState'],
            'line': sheet['line'],
            'options': [
              for (final days in (sheet['options']! as List))
                {
                  'days': days,
                  'text': withN(L.t('goalSheetDays'), days),
                  'why': days == sheet['chosen'] && sheet['whyKey'] != null && sheet['basis'] != null
                      ? withN(t(sheet['whyKey']), sheet['basis'])
                      : null,
                  'chosen': days == sheet['chosen'],
                },
            ],
            'today': L
                .t('goalSheetToday')
                .replaceFirst('{g}', _js(sheet['games']))
                .replaceFirst('{p}', _js(sheet['tokens']))
                .replaceFirst('{s}', _js(sheet['streak'])),
            'skip': L.t('notNow'),
          },
  };
}
