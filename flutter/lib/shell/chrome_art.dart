import 'package:flutter/material.dart';

import 'design_template.dart';
import 'crystal_palette.dart';

/// Slice coordinates are LOGICAL image coordinates (raw pixels / asset scale),
/// as required by Flutter paintImage; never combine centerSlice with cover.
class ChromeArt {
  static const _root = 'assets/aurora_game_chrome';
  static DecorationImage header(bool dark, {BuildContext? context}) {
    final palette = context == null ? null : CrystalPalette.of(context);
    if (palette != null) {
      dark = true; // One sapphire master, including neutral/pink recipes.
    }
    final asset =
        'assets/aurora_tab_panels/header-${dark ? 'dark' : 'light'}.png';
    return DecorationImage(
      image:
          palette?.image(asset, scale: 6) ?? ExactAssetImage(asset, scale: 6),
      centerSlice: Rect.fromLTRB(
        42,
        14,
        (dark ? 2136 : 2113) / 6 - 42,
        (dark ? 389 : 371) / 6 - 14,
      ),
      fit: BoxFit.fill,
    );
  }

  static DecorationImage footer(bool dark, {BuildContext? context}) {
    final palette = context == null ? null : CrystalPalette.of(context);
    if (palette != null) dark = true;
    final asset =
        'assets/aurora_tab_panels/footer-${dark ? 'dark' : 'light'}.png';
    return DecorationImage(
      image:
          palette?.image(asset, scale: 6) ?? ExactAssetImage(asset, scale: 6),
      centerSlice: Rect.fromLTRB(
        42,
        14,
        (dark ? 2104 : 2097) / 6 - 42,
        (dark ? 391 : 400) / 6 - 14,
      ),
      fit: BoxFit.fill,
    );
  }

  static const action = DecorationImage(
    image: ExactAssetImage(
      '$_root/home_panels_pilot/approved_action.png',
      scale: 4,
    ),
    centerSlice: Rect.fromLTRB(35, 20, 221, 57.5),
    fit: BoxFit.fill,
  );

  /// Same approved gold artwork, with caps that fit four >=44px controls.
  static const compactAction = DecorationImage(
    image: ExactAssetImage(
      '$_root/home_panels_pilot/approved_action.png',
      scale: 4,
    ),
    centerSlice: Rect.fromLTRB(18, 16, 238, 61.5),
    fit: BoxFit.fill,
  );

  static bool aurora(BuildContext context) =>
      Theme.of(context).extension<UiTemplateTheme>()?.template ==
      UiTemplate.aurora;

  static BoxDecoration panel(
    BuildContext context, {
    bool selected = false,
    bool square = false,
  }) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final name =
        '${dark ? 'dark' : 'light'}-${square ? 'card' : 'panel${selected ? '-selected' : ''}'}';
    return BoxDecoration(
      borderRadius: BorderRadius.circular(20),
      image: DecorationImage(
        image: ExactAssetImage('assets/aurora_tab_panels/$name.png', scale: 3),
        centerSlice: square
            ? Rect.fromLTRB(
                18,
                18,
                (dark ? 341 : 370) / 3 - 18,
                (dark ? 336 : 363) / 3 - 18,
              )
            : const Rect.fromLTRB(36, 18, 276, 65),
        fit: BoxFit.fill,
      ),
    );
  }
}
