/// КАРТИНКИ РЕЖИМОВ АНАГРАММ ПО ПРОФИЛЮ — перенос `frontend/src/games/anagrams/core/modeThumbs.ts`.
///
/// Просьба Дениса 06.09.2026: «где есть картинки — делать их красивыми и разными под разные
/// профили». Четыре режима × семь материальных стилей; тринадцать профилей сведены в семь стилей,
/// неизвестный профиль получает запасной (светлый), а не пустоту.
///
/// Данные — выгрузка веба (`flutter/tools/embed-anagram-modes.mjs` → `mode_thumbs.g.dart` и
/// `assets/anagram_modes/`), второй копии карты в Dart нет. «Корректура» берёт [profileThumbStyle]
/// отсюда — как веб берёт `стильПрофиля` из `anagrams/core/modeThumbs.ts`.
library;

import 'mode_thumbs.g.dart';
import 'word_lang.dart' show AnagramMode;

/// Стиль картинок под профиль (`стильПрофиля`).
String profileThumbStyle(String? profileId) =>
    anagramThumbProfileStyleData[profileId] ?? anagramThumbFallbackStyleData;

/// Картинка режима под профиль (`превьюРежима`) — путь ассета.
String anagramModeThumb(AnagramMode mode, String? profileId) =>
    'assets/anagram_modes/${mode.name}__${profileThumbStyle(profileId)}.webp';
