import 'dart:convert';

import 'asset_json.dart';
import 'l10n.dart';
import 'profiles.dart';
import 'shared_state.dart';
import 'stats_model.dart' show activeProfileOf, jsNumStr;
import 'training_history.dart' show Wall;
import 'web_theme.dart';

/// 🔴 МОДЕЛЬ «МАГАЗИНА» НА DART (задача d6a60b02, вариант Б).
///
/// Повторяет `shopModel` из `app/shop.tsx` на тех же данных: очки, купленное и надетое профиля, звук-пак
/// и вещь питомца (глобальные), кошелёк способностей, ставка «всё или ничего». Правила — кодом
/// (`abilityButtons`, `cosmeticRow`, `shopItems`, `cosmeticName`, `peekWager`), таблицы — выгрузкой
/// `assets/shop.json` (проба `flutter-shop-asset-fresh`). Отчёт о последней трате (`note`) рождает только
/// действие страницы — он приходит поверх (`withShopPageEvents`). Вкладку раздела держит экран.
/// Сверка — эталоны веб-пробы `shop-dart-model.test.tsx` (`test/shop_model_test.dart`).
class ShopData {
  ShopData(this.j);

  /// `assets/shop.json`.
  final Map<String, Object?> j;

  List<Map<String, Object?>> _rows(String k) => [for (final x in (j[k]! as List)) (x as Map).cast<String, Object?>()];
  late final cats = _rows('cats');
  late final sections = _rows('sections');
  late final abilities = _rows('abilities');
  late final cosmetics = _rows('cosmetics');
  Map<String, Object?> get wager => (j['wager']! as Map).cast<String, Object?>();

  /// Стиль цифр профиля по умолчанию (`defaultStyleForProfile`).
  String digitDefault(String? pid) => ((j['digitDefaults']! as Map)[pid] ?? j['digitFallback']) as String;

  bool isRtl(String language) => (j['rtl']! as List).contains(language.split('-').first.toLowerCase());

  static ShopData? _cache;
  static Future<ShopData> load() async => _cache ??= ShopData(await loadJsonAsset('assets/shop.json'));
}

const _wagerKey = 'psygames_wager_v1';

Object? _parse(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  try {
    return jsonDecode(raw);
  } catch (_) {
    return null;
  }
}

Map<String, Object?> _map(Object? v) => v is Map ? v.cast<String, Object?>() : const {};
num _num(Object? v) => v is num ? v : 0;

/// Сутки ставки — `dayStr` веба: местные год, месяц и день без нулей.
String _day(DateTime d) => '${d.year}-${d.month}-${d.day}';

/// Что показывает ставка: `none`, `active` (засчитан сегодняшний или вчерашний день) или `lost`.
typedef ShopWager = ({String kind, num daysDone});

/// `peekWager` веба: запись профиля засчитана сегодня или вчера — идёт; старше — сгорела, и запись
/// стирается из памяти (как у веба: «честно показывает "сгорела", не списывая молча»).
Future<ShopWager> peekShopWager(SharedState state, String pid, {required int now, required Wall wall}) async {
  const none = (kind: 'none', daysDone: 0);
  final all = _parse(state.get(_wagerKey));
  if (all is! Map) return none;
  final rec = all[pid];
  if (rec is! Map) return none;
  final w = wall(now);
  final today = _day(w);
  final yesterday = _day(DateTime.utc(w.year, w.month, w.day - 1));
  if (rec['lastSeen'] == today || rec['lastSeen'] == yesterday) return (kind: 'active', daysDone: _num(rec['daysDone']));
  final rest = Map<String, Object?>.from(all)..remove(pid);
  await state.set(_wagerKey, jsonEncode(rest));
  return (kind: 'lost', daysDone: 0);
}

/// Модель «Магазина» — та же, что `shopModel` веба. [cat] — открытая вкладка раздела (`null` — все).
Map<String, Object?> shopModelFrom(
  SharedState state,
  ShopData d, {
  required Profiles profiles,
  required String language,
  required ShopWager wager,
  String? cat,
}) {
  final pid = activeProfileOf(profiles, state).id;
  final balance = _num(_map(_parse(state.get('psygames_tokens_v1')))[pid] ?? 0);
  final unlockedRaw = _parse(state.get('psygames_cosmetics_unlocked_$pid'));
  final unlocked = unlockedRaw is List ? unlockedRaw : const [];
  final equipped = _map(_parse(state.get('psygames_cosmetics_equipped_$pid')));
  // `_soundPack = sp || null` — пустая строка означает «без звук-пака».
  final sp = state.get('psygames_sound_pack');
  final soundPack = sp == null || sp.isEmpty ? null : sp;
  final acc = state.get('psygames_pet_acc');
  final petAcc = const {'party_hat', 'bow', 'glasses', 'bow_tie'}.contains(acc) ? acc : null;
  final wallet = _map(_map(_parse(state.get('psygames_abilities_v1')))[pid]);
  final primary = WebTheme.accentCss(state, profile: pid);
  final w = d.wager;
  final stake = _num(w['stake']), days = _num(w['days']), prize = _num(w['prize']);
  final digitDefault = d.digitDefault(pid);

  Map<String, Object?> abilityRow(Map<String, Object?> a) {
    final have = _num(wallet[a['id']] ?? 0);
    final usable = a['id'] == 'streak_shield';
    final cost = _num(a['cost']);
    // `abilityButtons`: полный кошелёк → «максимум»; хватает очков → «купить»; иначе «мало очков».
    final buy = have >= _num(a['max'])
        ? 'full'
        : balance >= cost
        ? 'buy'
        : 'need-more';
    return {
      'id': a['id'],
      'icon': a['icon'],
      'name': L.t(a['nameKey']! as String),
      'desc': L.t(a['descKey']! as String),
      'price': '${jsNumStr(cost)} ⭐ · ${L.t('abilityInWallet').replaceFirst('{n}', jsNumStr(have))}',
      'buy': {
        'label': buy == 'full'
            ? L.t('abilityFull')
            : buy == 'buy'
            ? L.t('buy')
            : L.t('needMoreTokens'),
        'enabled': buy == 'buy',
      },
      'use': usable ? {'label': L.t('abilityUse'), 'ready': have > 0} : null,
    };
  }

  Map<String, Object?> wagerBlock() {
    if (wager.kind == 'active') {
      final done = wager.daysDone;
      final left = days - done;
      return {
        'active': true,
        'title': L.t('wagerTitle'),
        'day': '${L.t('wagerDay').replaceFirst('{d}', jsNumStr(done)).replaceFirst('{t}', jsNumStr(days))} · +${jsNumStr(prize)} ⭐',
        'dots': '${'●' * done.toInt()}${'○' * (left > 0 ? left.toInt() : 0)}',
        'btn': null,
      };
    }
    final lost = wager.kind == 'lost';
    final enough = balance >= stake;
    return {
      'active': false,
      'lost': lost,
      'title': L.t('wagerTitle'),
      'desc':
          '${lost ? '${L.t('wagerLostMsg')} ' : ''}'
          '${L.t('wagerDesc').replaceFirst('{stake}', jsNumStr(stake)).replaceFirst('{prize}', jsNumStr(prize))}',
      'btn': {'label': enough ? L.t('wagerPlace').replaceFirst('{n}', jsNumStr(stake)) : L.t('needMoreTokens'), 'enabled': enough},
    };
  }

  /// `shopItems`: свой арт профиля и свои цифры по умолчанию не продаются — они и так применяются.
  bool forSale(Map<String, Object?> c) {
    final type = c['type'];
    if ((type == 'theme' || type == 'background' || type == 'badge') && c['value'] == pid) return false;
    return !(type == 'digits' && c['value'] == digitDefault);
  }

  Map<String, Object?> item(Map<String, Object?> c) {
    // `cosmeticRow`: звук-пак и вещь питомца — глобальные, у них «надето» своё.
    final type = c['type'];
    final owned = unlocked.contains(c['id']);
    final on = type == 'sound'
        ? soundPack == c['value']
        : type == 'pet'
        ? petAcc == c['value']
        : equipped[type] == c['id'];
    final cost = _num(c['cost']);
    final canAfford = balance >= cost;
    final accent = type == 'accent' || type == 'frame' ? c['value'] : primary;
    final swatch = Map<String, Object?>.from(c['swatch']! as Map);
    // Образец звука красится акцентом строки — в выгрузке цвет пустой.
    if (swatch.containsKey('color') && swatch['color'] == null) swatch['color'] = accent;
    final profileName = c['profileName'];
    return {
      'id': c['id'],
      'name': profileName is String ? profileName : L.t(c['nameKey']! as String),
      'desc': L.t(c['descKey']! as String),
      'price': owned ? L.t('ownedBadge') : '${jsNumStr(cost)} ⭐',
      'owned': owned,
      'on': on,
      'accent': accent,
      'swatch': swatch,
      'btn': owned
          ? {'label': on ? L.t('equipped') : L.t('equip'), 'enabled': true}
          : {'label': canAfford ? L.t('buy') : L.t('needMoreTokens'), 'enabled': canAfford},
    };
  }

  return {
    'v': 1,
    'title': L.t('shop'),
    'back': L.t('a11yBack'),
    'backIcon': d.isRtl(language) ? 'arrow-forward' : 'arrow-back',
    'primary': primary,
    'balance': jsNumStr(balance),
    'cats': [
      for (final c in d.cats) {'id': c['id'], 'icon': c['icon'], 'label': L.t(c['labelKey']! as String), 'on': cat == c['id']},
    ],
    'note': null,
    'abilities': cat == null || cat == 'ability'
        ? {
            'title': L.t('shopAbilitySection'),
            'rows': [for (final a in d.abilities) abilityRow(a)],
            'hint': L.t('shopAbilityHint'),
            'wager': wagerBlock(),
          }
        : null,
    'sections': [
      for (final s in d.sections)
        if (cat == null || cat == s['type'])
          {
            'type': s['type'],
            'title': L.t(s['titleKey']! as String),
            // Первый раздел прижат к верху, только когда над ним нет способностей.
            'first': cat != null && cat != 'ability',
            'items': [
              for (final c in d.cosmetics)
                if (c['type'] == s['type'] && forSale(c)) item(c),
            ],
          },
    ],
    'earnHint': L.t('shopEarnHint'),
  };
}

/// Нажатия страницы поверх своей модели: отчёт о последней трате (`note`) рождает только действие
/// веба — купить способность, применить щит, поставить. Остальное своё.
Map<String, Object?> withShopPageEvents(Map<String, Object?> own, Map<String, Object?>? page) {
  if (page == null || !page.containsKey('note')) return own;
  return {...own, 'note': page['note']};
}

/// Сгорела ли ставка по модели страницы: `peekWager` страницы уже стёр запись, и своя модель её не увидит.
bool pageSawLostWager(Map<String, Object?>? page) => _map(_map(page?['abilities'])['wager'])['lost'] == true;
