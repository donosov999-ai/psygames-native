#!/usr/bin/env bash
# Гибрид PsyGames под macOS — собрать и поставить на этот мак одной командой.
#
#   flutter/tool/build_macos_app.sh            → ~/Applications/PsyGames.app
#   DEST=/путь flutter/tool/build_macos_app.sh → в другую папку
#
# 🔴 ПОЧЕМУ ОТДЕЛЬНЫЙ СКРИПТ (01.10.2026). `flutter build macos` даёт приложение, которое на маке
# не работает целиком, и все три дыры повторяют Android-выпуск той же ночи:
#   · веб-часть не вложена — её вкладывает tools/embed-web.sh (иначе белый экран);
#   · движка Тэтхэма в приложении нет — головоломки падали «нужен путь к libtatham.dylib»;
#     теперь .dylib лежит в Contents/Frameworks, и TathamEngine.openPlatform берёт её оттуда сам;
#   · право сервера в песочнице (network.server) было только в DebugProfile — релиз не поднимал
#     сервер веб-части на 127.0.0.1. Добавлено в Release.entitlements.
# Подпись — локальная (ad-hoc): этого достаточно, чтобы приложение запускалось на ЭТОМ маке.
# Для Mac App Store нужна подпись магазина — это отдельная задача (a0d07f5f).
#
# ⚠️ Старую линию не трогает: /Applications/PsyGames.app (Tauri, com.odv999.psygames) остаётся.
# Перезаписывает только свою прошлую сборку в DEST — и только если это она (по идентификатору).
set -euo pipefail

FLUTTER_DIR=$(cd "$(dirname "$0")/.." && pwd)
DEST="${DEST:-$HOME/Applications}"
PUZZLES_SRC="${PUZZLES_SRC:-$HOME/dev/puzzles}"
BUNDLE_ID=pro.psygames.psygamesFlutter
APP_NAME=PsyGames.app

# embed-web.sh дописывает каталоги веб-части в pubspec.yaml — это след сборки, а не правка проекта.
cp "${FLUTTER_DIR}/pubspec.yaml" "${FLUTTER_DIR}/pubspec.yaml.mac-bak"
trap 'mv -f "${FLUTTER_DIR}/pubspec.yaml.mac-bak" "${FLUTTER_DIR}/pubspec.yaml"' EXIT

# Версия — из frontend/app.json, одна линия на все сборки (как у TestFlight и Play).
VERSION=$(node -p "require('${FLUTTER_DIR}/../frontend/app.json').expo.version")
sed -i '' "s/^version: .*/version: ${VERSION}+$(date +%Y%m%d%H)/" "${FLUTTER_DIR}/pubspec.yaml"

echo "1/5 веб-часть внутрь приложения…"
REBUILD="${REBUILD:-1}" bash "${FLUTTER_DIR}/tools/embed-web.sh"

echo "2/5 движок Тэтхэма (библиотека под этот мак)…"
(cd "${FLUTTER_DIR}" && PUZZLES_SRC="${PUZZLES_SRC}" tool/build_tatham.sh >/dev/null)
DYLIB="${FLUTTER_DIR}/build/tatham/libtatham.dylib"
[ -f "${DYLIB}" ] || { echo "🔴 нет ${DYLIB}"; exit 2; }

echo "3/5 сборка приложения (release)…"
(cd "${FLUTTER_DIR}" && flutter build macos --release >/dev/null)
APP=$(ls -d "${FLUTTER_DIR}"/build/macos/Build/Products/Release/*.app | head -1)

echo "4/5 движок в Contents/Frameworks и подпись…"
mkdir -p "${APP}/Contents/Frameworks"
cp "${DYLIB}" "${APP}/Contents/Frameworks/"
codesign --force -s - "${APP}/Contents/Frameworks/libtatham.dylib"
codesign --force -s - --entitlements "${FLUTTER_DIR}/macos/Runner/Release.entitlements" "${APP}"
codesign --verify --deep --strict "${APP}"
# Права песочницы — из ПОДПИСИ собранного приложения, а не из исходника (см. шапку).
ENT=$(codesign -d --entitlements - "${APP}" 2>/dev/null)
echo "${ENT}" | grep -q "network.server" || { echo "🔴 в подписи нет network.server — сервер веб-части не поднимется"; exit 3; }

echo "5/5 установка в ${DEST}/${APP_NAME}…"
mkdir -p "${DEST}"
if [ -d "${DEST}/${APP_NAME}" ]; then
  OLD_ID=$(defaults read "${DEST}/${APP_NAME}/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || true)
  [ "${OLD_ID}" = "${BUNDLE_ID}" ] || { echo "🔴 ${DEST}/${APP_NAME} — чужое приложение (${OLD_ID}), не трогаю"; exit 4; }
  rm -rf "${DEST}/${APP_NAME}"
fi
cp -R "${APP}" "${DEST}/${APP_NAME}"
VERSION=$(defaults read "${DEST}/${APP_NAME}/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "?")
echo "✅ ${DEST}/${APP_NAME} · версия ${VERSION} · открыть: open \"${DEST}/${APP_NAME}\""
