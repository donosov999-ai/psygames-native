#!/usr/bin/env python3
"""
Создаёт сертификат распространения и профиль App Store через App Store Connect API.

🔴 ЗАЧЕМ ЭТО ОТДЕЛЬНЫМ ШАГОМ, А НЕ ФЛАГОМ XCODE.

`xcodebuild -allowProvisioningUpdates` с ключом API умеет создавать профили сам — но
только DEVELOPMENT, а такому профилю нужны зарегистрированные устройства. Проверено
живьём 02.09.2026: на чистой машине Apple отвечает «Your team has no devices from
which to generate a provisioning profile», и сборка встаёт. Для App Store нужен
DISTRIBUTION, и его приходится создавать явно — что этот скрипт и делает.

⚠️ ВТОРАЯ ГРАБЛЯ ТОГО ЖЕ ДНЯ. Сертификат, импортированный в связку без промежуточного
Apple WWDR, не становится identity: `security find-identity` показывает «0 valid
identities found», а подпись падает без внятной причины. WWDR ставит соседний
`ios-signing-setup.sh` — здесь только API.

Секреты берутся из переменных окружения (в CI — из секретов репозитория), а на
машине разработчика — из файла `apple_appstore.json` в локальном хранилище,
каталог которого задаётся переменной `SECRETS_DIR`.
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import time
import urllib.request

try:
    import jwt  # pyjwt
except ImportError:
    sys.exit('нужен pyjwt: pip3 install --break-system-packages pyjwt cryptography')

BASE = 'https://api.appstoreconnect.apple.com/v1'


def доступ() -> tuple[str, str, str]:
    """Ключ, его id и issuer: из окружения (CI) либо из хранилища секретов (мак)."""
    key_id = os.environ.get('APPLE_API_KEY_ID')
    issuer = os.environ.get('APPLE_API_ISSUER')
    if key_id and issuer:
        путь = os.path.expanduser(f'~/private_keys/AuthKey_{key_id}.p8')
        if not os.path.exists(путь):
            sys.exit(f'ключ не найден: {путь}')
        return open(путь, encoding='utf-8').read(), key_id, issuer

    каталог = os.environ.get('SECRETS_DIR', os.path.expanduser('~/.config/psygames'))
    файл = os.path.join(каталог, 'apple_appstore.json')
    if not os.path.exists(файл):
        sys.exit('нет ни переменных окружения, ни файла apple_appstore.json в хранилище секретов')
    d = json.load(open(файл, encoding='utf-8'))
    return open(os.path.expanduser(d['key_file']), encoding='utf-8').read(), d['key_id'], d['issuer_id']


def токен() -> str:
    ключ, key_id, issuer = доступ()
    now = int(time.time())
    return jwt.encode(
        {'iss': issuer, 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'},
        ключ, algorithm='ES256', headers={'kid': key_id, 'typ': 'JWT'},
    )


ПОПЫТОК = 4
ПАУЗА_СЕК = 5


def стоит_повторить(код: int) -> bool:
    """
    🔴 ПОВТОРЯЕМ ТОЛЬКО СЕРВЕРНЫЕ ОШИБКИ И ПЕРЕГРУЗКУ.

    📍 06.09.2026 ТРИ выпуска подряд (2.42.0, 2.43.0, 2.44.0, 2.45.0 — четыре)
    легли на шаге «Сертификат и профиль» с одним и тем же ответом Apple:
    `{"code": "UNEXPECTED_ERROR", "title": "An unexpected error occurred.",
    "detail": "An unexpected error occurred on the server side"}` — то есть 500.
    Каждый раз тот же прогон, запущенный заново без единой правки, проходил.
    Три совпадения подряд — это уже не случайность, а свойство API.

    ⚠️ ЧЕТЫРЁХСОТЫЕ НЕ ПОВТОРЯЕМ. 401 (ключ не тот), 403 (нет прав), 404 (не тот
    идентификатор), 409 (профиль уже есть) — это НАСТОЯЩИЕ ошибки, и повтор их не
    вылечит, а только спрячет за четырьмя минутами ожидания и запутает разбор.
    """
    return код == 429 or 500 <= код <= 599


def запрос(tok: str, method: str, path: str, body=None) -> dict:
    """
    Вызов App Store Connect API. Серверные ошибки повторяются — см. `стоит_повторить`.

    🔴 ОТВЕТ БЫВАЕТ ПУСТЫМ, И ЭТО НЕ ОШИБКА. На `DELETE` Apple отвечает 204 без
    тела. Первая редакция звала `json.loads` безусловно и падала на пустой строке:
    `JSONDecodeError: Expecting value: line 1 column 1`.

    Дефект прятался за состоянием аккаунта: пока профиля с нужным именем НЕ
    существовало, ветка удаления не выполнялась вовсе — скрипт прошёл живой прогон
    02.09.2026 и был признан рабочим. На следующей же сборке профиль уже был, и
    джоба iOS упала на ровном месте. Поэтому: пустое тело → пустой словарь.
    """
    for попытка in range(1, ПОПЫТОК + 1):
        r = urllib.request.Request(f'{BASE}{path}',
                                   data=json.dumps(body).encode() if body else None, method=method)
        r.add_header('Authorization', f'Bearer {tok}')
        r.add_header('Content-Type', 'application/json')
        try:
            сырое = urllib.request.urlopen(r, timeout=90).read()
        except urllib.error.HTTPError as e:
            текст = e.read().decode()[:400]
            if стоит_повторить(e.code) and попытка < ПОПЫТОК:
                пауза = ПАУЗА_СЕК * (2 ** (попытка - 1))
                print(f'  ⚠️ {method} {path} → {e.code}, попытка {попытка} из {ПОПЫТОК}, '
                      f'повтор через {пауза} с: {текст[:120]}', flush=True)
                time.sleep(пауза)
                continue
            sys.exit(f'{method} {path} → {e.code}: {текст}')
        except urllib.error.URLError as e:
            if попытка < ПОПЫТОК:
                пауза = ПАУЗА_СЕК * (2 ** (попытка - 1))
                print(f'  ⚠️ {method} {path} → сеть не отвечает, попытка {попытка} из {ПОПЫТОК}, '
                      f'повтор через {пауза} с: {e.reason}', flush=True)
                time.sleep(пауза)
                continue
            sys.exit(f'{method} {path} → сеть: {e.reason}')
        if not сырое.strip():
            return {}
        return json.loads(сырое)
    return {}          # недостижимо: цикл либо вернул, либо вышел через sys.exit


def идентификатор_ios() -> str:
    """Тот же источник, что у скрипта подписи: `ios-bundle-id.py`. Импортировать
    его нельзя (дефис в имени), поэтому запускаем и читаем строку — зато источник
    остаётся ОДИН, а не копия логики в двух местах."""
    import subprocess
    файл = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ios-bundle-id.py')
    return subprocess.run([sys.executable, файл, 'ios'], capture_output=True, text=True,
                          check=True).stdout.strip()


def главное() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--csr', required=True, help='файл запроса на сертификат')
    p.add_argument('--out-cert', required=True, help='куда записать сертификат (DER)')
    # Идентификатор — у общего источника, того же, что у скрипта подписи.
    p.add_argument('--bundle', default=идентификатор_ios())
    p.add_argument('--profile-name', default='PsyGames App Store')
    a = p.parse_args()

    tok = токен()

    # 1. Сертификат распространения. Если такой уже есть — берём его: лимит на число
    #    сертификатов в аккаунте конечен, и плодить их на каждую сборку нельзя.
    #    ⚠️ Переиспользовать можно ТОЛЬКО когда рядом лежит его приватный ключ; в CI
    #    ключа нет, поэтому там всегда создаётся новый — а старые чистит `--prune`.
    сертификаты = запрос(tok, 'GET', '/certificates?limit=200')['data']
    свои = [c for c in сертификаты if c['attributes']['certificateType'] == 'DISTRIBUTION']

    """
    🔴 ОТЗЫВАЕМ ТОЛЬКО СВОЙ СЕРТИФИКАТ — ТОТ, ЧТО ЛЕЖИТ В НАШЕМ ЖЕ ПРОФИЛЕ.

    В CI приватного ключа от прошлого сертификата нет, поэтому каждый прогон
    создаёт новый, а старый надо убирать: Apple держит лимит на число действующих
    сертификатов распространения (обычно три), и иначе создание однажды ответит
    отказом — на шаге, до которого доходит только выпуск.

    ⚠️ 23.09.2026 ЗДЕСЬ БЫЛА ЛОВУШКА НА ЧУЖИЕ ПРИЛОЖЕНИЯ. Раньше стояло `KEEP = 1`
    по ВСЕМУ списку аккаунта: скрипт брал все сертификаты распространения и отзывал
    самые старые, не разбирая, чьи они. Пока приложение в аккаунте было одно, это
    работало. 23.09 в том же аккаунте появился будильник (сертификат 65YAYGW494,
    раздел «Зарядки и серии»), и наш следующий выпуск снёс бы его молча — чужие
    заливки в TestFlight перестали бы подписываться, а причина нашлась бы нескоро.

    Поэтому отзываем ровно те сертификаты, на которые ссылается НАШ профиль
    (`--profile-name`). Он всё равно пересоздаётся ниже, так что его сертификат
    больше не нужен. Отзыв безопасен: подписанные ранее сборки продолжают работать,
    сертификат нужен только в момент подписи.

    Если своих не нашлось (первый прогон), не отзываем ничего: упереться в лимит с
    внятной ошибкой лучше, чем сломать соседнее приложение.
    """
    профили = запрос(tok, 'GET', '/profiles?limit=200')['data']
    наш_профиль = next((p for p in профили if p['attributes']['name'] == a.profile_name), None)
    наши_ид: set = set()
    if наш_профиль:
        связ = запрос(tok, 'GET', f"/profiles/{наш_профиль['id']}/certificates")['data']
        наши_ид = {c['id'] for c in связ}

    for c in свои:
        if c['id'] not in наши_ид:
            continue
        запрос(tok, 'DELETE', f"/certificates/{c['id']}")
        print(f"отозван наш прошлый сертификат: {c['attributes'].get('displayName', c['id'])}")

    чужих = len([c for c in свои if c['id'] not in наши_ид])
    if чужих:
        print(f"чужих сертификатов в аккаунте: {чужих} — не трогаем их")

    csr = open(a.csr, encoding='utf-8').read()
    новый = запрос(tok, 'POST', '/certificates', {'data': {
        'type': 'certificates',
        'attributes': {'certificateType': 'DISTRIBUTION', 'csrContent': csr}}})
    атр = новый['data']['attributes']
    open(a.out_cert, 'wb').write(base64.b64decode(атр['certificateContent']))
    print(f"сертификат: {атр['displayName']} · до {атр['expirationDate'][:10]} · всего было {len(свои)}")

    # 2. Профиль App Store под этот сертификат. Старый с тем же именем удаляем: профиль
    #    привязан к конкретным сертификатам, и старый после смены сертификата мёртв.
    if наш_профиль:
        запрос(tok, 'DELETE', f"/profiles/{наш_профиль['id']}")
        print(f"старый профиль «{a.profile_name}» удалён")

    ид = next((b for b in запрос(tok, 'GET', '/bundleIds?limit=200')['data']
               if b['attributes']['identifier'] == a.bundle), None)
    if not ид:
        sys.exit(f'bundleId {a.bundle} не найден в аккаунте')

    профиль = запрос(tok, 'POST', '/profiles', {'data': {
        'type': 'profiles',
        'attributes': {'name': a.profile_name, 'profileType': 'IOS_APP_STORE'},
        'relationships': {
            'bundleId': {'data': {'type': 'bundleIds', 'id': ид['id']}},
            'certificates': {'data': [{'type': 'certificates', 'id': новый['data']['id']}]}}}})
    па = профиль['data']['attributes']

    каталог = os.path.expanduser('~/Library/MobileDevice/Provisioning Profiles')
    os.makedirs(каталог, exist_ok=True)
    файл = os.path.join(каталог, f"{па['uuid']}.mobileprovision")
    open(файл, 'wb').write(base64.b64decode(па['profileContent']))
    print(f"профиль: {па['name']} · {па['profileType']} · {па['profileState']}")
    print(f"установлен: {файл}")


if __name__ == '__main__':
    главное()
