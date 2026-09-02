#!/usr/bin/env bash
# 🔴 ПОДГОТОВКА ПОДПИСИ iOS ИЗ ОДНОГО КЛЮЧА API.
#
# Классический путь требует, чтобы человек раз в год экспортировал .p12 из Keychain,
# не перепутал тип сертификата и не забыл пароль. Здесь всё выводится из ключа
# App Store Connect API: сертификат распространения и профиль App Store СОЗДАЮТСЯ
# через API, и на чистой машине (а раннер CI — всегда чистая машина) это
# единственный способ, не требующий человека.
#
# ⚠️ ПРОВЕРЕНО ЖИВЬЁМ 02.09.2026, две грабли по дороге:
#  1. `xcodebuild -allowProvisioningUpdates` с ключом API отвечает «Your team has no
#     devices from which to generate a provisioning profile»: он делает DEVELOPMENT
#     профиль, которому нужны зарегистрированные устройства. Для App Store нужен
#     DISTRIBUTION — его и создаём сами.
#  2. Сертификат, импортированный без промежуточного Apple WWDR, не виден как
#     identity: `security find-identity` показывает «0 valid identities found», и
#     подпись падает без внятной причины. WWDR обязателен.
#
# Переменные: APPLE_API_KEY_ID, APPLE_API_ISSUER, APPLE_TEAM_ID, KEYCHAIN_PASSWORD;
# ключ .p8 лежит в ~/private_keys/AuthKey_${APPLE_API_KEY_ID}.p8
set -euo pipefail

: "${APPLE_API_KEY_ID:?нужен APPLE_API_KEY_ID}"
: "${APPLE_API_ISSUER:?нужен APPLE_API_ISSUER}"
: "${APPLE_TEAM_ID:?нужен APPLE_TEAM_ID}"
KEYCHAIN_PASSWORD="${KEYCHAIN_PASSWORD:-psygames-ci}"
# Идентификатор берём у общего источника (`ios-bundle-id.py`): базовый конфиг
# описывает десктоп, а iOS и Android переопределяют его на тот, что заведён в
# аккаунте Apple и опубликован в Google Play. Подробности и история ошибки — в
# шапке самого скрипта.
BUNDLE_ID="${BUNDLE_ID:-$(python3 "$(dirname "$0")/ios-bundle-id.py" ios)}"
# ⚠️ ИМЕНА ПЕРЕМЕННЫХ — ТОЛЬКО ЛАТИНИЦЕЙ.
# На маке (zsh) кириллическое имя работает, а в CI (bash) даёт
# «РАБОЧАЯ=/Users/runner/work/_temp: No such file or directory» — bash не считает
# такое имя переменной и пытается выполнить строку как команду. Поймано на первой
# же пятиплатформенной сборке 02.09.2026; урок был записан раньше и всё равно
# повторён — потому что локально всё прошло.
WORKDIR="${RUNNER_TEMP:-/tmp}"

python3 -m pip install --quiet --break-system-packages pyjwt cryptography 2>/dev/null || true

# 1. Ключ и запрос на сертификат
openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$WORKDIR/dist.key" -out "$WORKDIR/dist.csr" \
  -subj "/CN=PsyGames Distribution/O=PsyGames/C=KZ" >/dev/null 2>&1

# 2. Сертификат распространения и профиль App Store — через API
python3 "$(dirname "$0")/ios-provision.py" \
  --csr "$WORKDIR/dist.csr" --out-cert "$WORKDIR/dist.cer" --bundle "$BUNDLE_ID"

# 3. Связка ключей: сертификат + приватный ключ + промежуточный Apple
openssl x509 -inform DER -in "$WORKDIR/dist.cer" -out "$WORKDIR/dist.pem"
openssl pkcs12 -export -legacy -inkey "$WORKDIR/dist.key" -in "$WORKDIR/dist.pem" \
  -out "$WORKDIR/dist.p12" -passout "pass:$KEYCHAIN_PASSWORD" -name "Apple Distribution"

security create-keychain -p "$KEYCHAIN_PASSWORD" ios-build.keychain
security unlock-keychain -p "$KEYCHAIN_PASSWORD" ios-build.keychain
security set-keychain-settings -lut 3600 ios-build.keychain
security list-keychains -d user -s ios-build.keychain "$HOME/Library/Keychains/login.keychain-db"
security import "$WORKDIR/dist.p12" -k ios-build.keychain -P "$KEYCHAIN_PASSWORD" \
  -T /usr/bin/codesign -T /usr/bin/security

curl -sSL -o "$WORKDIR/wwdr.cer" https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
security import "$WORKDIR/wwdr.cer" -k ios-build.keychain -T /usr/bin/codesign

security set-key-partition-list -S apple-tool:,apple:,codesign: \
  -s -k "$KEYCHAIN_PASSWORD" ios-build.keychain >/dev/null

echo "— identities в связке:"
security find-identity -v -p codesigning | sed 's/^/  /'
rm -f "$WORKDIR/dist.key" "$WORKDIR/dist.p12" "$WORKDIR/dist.pem" "$WORKDIR/dist.csr"
