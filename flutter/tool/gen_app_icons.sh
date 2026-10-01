#!/usr/bin/env bash
# Значки приложения из store/appstore/icon-1024-noalpha.png → ios/, android/, macos/.
# Конфиг: flutter/flutter_launcher_icons.yaml. Сторож: flutter/test/app_icon_is_ours_test.dart.
set -euo pipefail
cd "$(dirname "$0")/.."
flutter pub get >/dev/null
dart run flutter_launcher_icons -f flutter_launcher_icons.yaml
# flutter_launcher_icons 0.14 переписывает в project.pbxproj чужой ключ
# (ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES → AppIcon). Значку он не нужен —
# имя набора и так AppIcon, — а сборке Xcode вредит. Возвращаем как было.
perl -pi -e 's/(ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = )AppIcon;/${1}YES;/' ios/Runner.xcodeproj/project.pbxproj
