import 'package:flutter/material.dart';

/// Slice coordinates are LOGICAL image coordinates (raw pixels / asset scale),
/// as required by Flutter paintImage; never combine centerSlice with cover.
class ChromeArt {
  static const _root = 'assets/aurora_game_chrome';
  static DecorationImage header(bool dark) => DecorationImage(
    image: dark
      ? const ExactAssetImage('$_root/section-header-dark-trimmed.png', scale: 6)
      : const ExactAssetImage('$_root/home_panels_pilot/light_header.png', scale: 2),
    centerSlice: dark ? const Rect.fromLTRB(45, 15, 311.66, 73.83) : const Rect.fromLTRB(80, 20, 432, 69),
    fit: BoxFit.fill,
  );
  static DecorationImage footer(bool dark) => DecorationImage(
    image: dark
      ? const ExactAssetImage('$_root/section-header-dark-trimmed.png', scale: 8)
      : const ExactAssetImage('$_root/home_panels_pilot/light_footer.png', scale: 2),
    centerSlice: dark ? const Rect.fromLTRB(34, 13, 233.5, 53.625) : const Rect.fromLTRB(70, 20, 442, 78),
    fit: BoxFit.fill,
  );
  static const action = DecorationImage(
    image: ExactAssetImage('$_root/home_panels_pilot/approved_action.png', scale: 4),
    centerSlice: Rect.fromLTRB(35, 20, 221, 57.5),
    fit: BoxFit.fill,
  );
}
