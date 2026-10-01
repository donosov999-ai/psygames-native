#!/usr/bin/env python3
"""РАЗДАТЬ ЗАЛИТУЮ СБОРКУ ВНУТРЕННЕЙ ГРУППЕ TESTFLIGHT.

🔴 ПОВОД, 23.09.2026. Четыре гибридные сборки (2.55.0 … 2.55.4) лежали в App Store
Connect со статусом VALID и НИ В ОДНОЙ группе тестировщиков. На телефоне Дениса всё
это время показывалась 2.54.23 — предыдущая, обычная. Итог прогона при этом писал
«внутренняя группа видит сборку сразу», и это было неправдой: группе сборку надо
отдать, само это не происходит.

🔴 И ПОЧЕМУ ОТДАТЬ НЕ ПОЛУЧАЛОСЬ. `betaGroups/.../relationships/builds` отвечал
422 «Build is not in an internally testable state». Настоящая причина —
`internalBuildState: MISSING_EXPORT_COMPLIANCE`: у гибридных сборок поле
`usesNonExemptEncryption` пустое, тогда как у всех 2.54.x того же приложения оно
`false`. Ответ на экспортный вопрос ставится в `Info.plist`
(`ITSAppUsesNonExemptEncryption`), а этот скрипт закрывает ещё и уже залитые.

⚠️ ВНЕШНЮЮ ГРУППУ НЕ ТРОГАЕМ. «Семья и близкие» — внешняя, шесть человек, и выдача
им означает и проверку Apple, и письмо каждому. Правило Дениса: тестировщикам не
писать без явного «да». Поэтому здесь только внутренняя группа.

Запуск:  python3 tool/testflight_assign.py <версия> <номер сборки> [имя группы]
         python3 tool/testflight_assign.py --show <версия> <номер сборки>   — только чтение:
                 состояние сборки и «Что тестировать», где записан коммит
Окружение: APPLE_API_KEY_ID · APPLE_API_ISSUER · APPLE_API_KEY_FILE (путь к .p8)
           WHAT_TO_TEST — заметки для тестировщиков; коммит и прогон дописываются сами
           из GITHUB_SHA / GITHUB_RUN_ID
           и BUNDLE_ID — приложение ищется по нему, чтобы не заводить ещё один секрет
           (APPLE_APP_ID перебивает поиск, если он почему-то понадобится).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = 'https://api.appstoreconnect.apple.com/v1'
WAIT_SECONDS = 20 * 60          # обработка на стороне Apple занимает минуты, не часы
POLL_SECONDS = 30


_TOKEN = {'value': None, 'born': 0.0}


def token() -> str:
    """Пропуск к App Store Connect, живой на ЭТОТ вызов.

    🔴 ПОЧЕМУ НЕ ОДИН НА ВЕСЬ ЗАПУСК. Apple разрешает жизнь пропуска не больше
    двадцати минут, а скрипт ЖДЁТ, пока Apple доварит сборку, — это десятки
    минут. Замер 24.09.2026: 2.55.13 собралась и залилась, а последний шаг
    «раздать группе» упал с `HTTP Error 401: Unauthorized` — пропуск, выписанный
    в начале запуска, к моменту раздачи протух. Сборка при этом лежит в
    TestFlight и НЕ РОЗДАНА: человек её не видит, а прогон выглядит почти
    успешным.

    Поэтому пропуск выписывается заново, когда ему больше десяти минут.
    """
    import jwt                                        # ставится шагом прогона
    if _TOKEN['value'] and time.time() - _TOKEN['born'] < 600:
        return _TOKEN['value']
    key_id = os.environ['APPLE_API_KEY_ID']
    issuer = os.environ['APPLE_API_ISSUER']
    key_file = os.environ['APPLE_API_KEY_FILE']
    with open(key_file) as f:
        key = f.read()
    _TOKEN['value'] = jwt.encode(
        {'iss': issuer, 'exp': int(time.time()) + 900, 'aud': 'appstoreconnect-v1'},
        key, algorithm='ES256', headers={'kid': key_id, 'typ': 'JWT'})
    _TOKEN['born'] = time.time()
    return _TOKEN['value']


def call(method: str, path: str, body=None):
    head = {'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=head, method=method)
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def app_by_bundle(bundle_id: str) -> str:
    """Номер приложения по идентификатору пакета — лишний секрет тогда не нужен."""
    r = call('GET', f'/apps?filter[bundleId]={bundle_id}&limit=2')
    if not r['data']:
        raise SystemExit(f'::error title=TestFlight::приложения с идентификатором {bundle_id} нет')
    return r['data'][0]['id']


def find_build(app_id: str, version: str, number: str):
    """Сборку ищем по ПАРЕ «версия + номер»: номер сам по себе не уникален."""
    r = call('GET', f'/builds?filter[app]={app_id}&limit=20&include=preReleaseVersion')
    inc = {(i['type'], i['id']): i for i in r.get('included', [])}
    for b in r['data']:
        pre = ((b.get('relationships') or {}).get('preReleaseVersion') or {}).get('data')
        ver = inc.get(('preReleaseVersions', pre['id']), {}).get('attributes', {}).get('version') if pre else None
        if ver == version and str(b['attributes'].get('version')) == str(number):
            return b
    return None


PROVENANCE_MARK = 'Коммит '


def provenance_line():
    """Строка происхождения сборки: коммит и прогон — из окружения GitHub Actions.

    🔴 ПОВОД, 26.09.2026 (задача aa56958d). Приёмка TestFlight встала: установленную
    сборку нельзя было доказательно сопоставить с коммитом — номер версии один на
    десятки коммитов, а поле «Что тестировать» у гибрида не заполнялось вовсе (вход
    `notes` рабочего процесса был объявлен и никуда не шёл).
    """
    sha = os.environ.get('GITHUB_SHA')
    if not sha:
        return None
    line = PROVENANCE_MARK + sha[:12]
    run, repo = os.environ.get('GITHUB_RUN_ID'), os.environ.get('GITHUB_REPOSITORY')
    if run and repo:
        line += f" · прогон {os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{repo}/actions/runs/{run}"
    return line


def stamp_what_to_test(bid: str, notes: str) -> None:
    """«Что тестировать» у сборки — ТОЛЬКО заметки для людей.

    🔴 01.10.2026, Денис со скрином TestFlight: в поле «Что тестировать» у 2.56.2 (37) стояло
    «Коммит 6afc0067e45c · прогон https://github.com/…/actions/runs/…». Это поле видит КАЖДЫЙ
    тестировщик на телефоне, включая семью; служебной строке и ссылке на GitHub там не место.
    Связь «сборка → коммит» и без неё однозначна: номер сборки — это номер прогона
    (`github.run_number`), коммит по нему даёт `gh run list --workflow flutter-testflight.yml`.
    Строка происхождения остаётся в журнале прогона. Сторож — `flutter/test/testflight_notes_are_for_people_test.dart`.
    Не вышло записать — это предупреждение, а не провал: раздача группе важнее подписи.
    """
    print('· происхождение (только в журнал):', provenance_line() or '—')
    text = notes.strip()
    if not text:
        return
    try:
        locs = call('GET', f'/builds/{bid}/betaBuildLocalizations?limit=50').get('data', [])
        if not locs:
            call('POST', '/betaBuildLocalizations', {'data': {
                'type': 'betaBuildLocalizations',
                'attributes': {'locale': 'en-US', 'whatsNew': text},
                'relationships': {'build': {'data': {'type': 'builds', 'id': bid}}}}})
        for loc in locs:
            call('PATCH', f"/betaBuildLocalizations/{loc['id']}", {'data': {
                'type': 'betaBuildLocalizations', 'id': loc['id'],
                'attributes': {'whatsNew': text}}})
        print('· «Что тестировать» записано:', text.replace('\n', ' | '))
    except urllib.error.HTTPError as e:
        print(f'::warning title=TestFlight::«Что тестировать» не записалось ({e.code}): '
              f'{e.read().decode()[:300]}')


def show(version: str, number: str) -> int:
    """Только чтение: состояние сборки и её «Что тестировать» — там коммит."""
    app_id = os.environ.get('APPLE_APP_ID') or app_by_bundle(os.environ['BUNDLE_ID'])
    build = find_build(app_id, version, number)
    if not build:
        print(f'сборки {version}+{number} нет среди последних двадцати')
        return 1
    a = build['attributes']
    print(f"{version}+{number}: {a.get('processingState')} · залита {a.get('uploadedDate')}")
    for loc in call('GET', f"/builds/{build['id']}/betaBuildLocalizations?limit=50").get('data', []):
        print(f"  [{loc['attributes'].get('locale')}] {loc['attributes'].get('whatsNew') or '— пусто —'}")
    return 0


def main() -> int:
    if len(sys.argv) >= 4 and sys.argv[1] == '--show':
        return show(sys.argv[2], sys.argv[3])
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    version, number = sys.argv[1], sys.argv[2]
    group_name = sys.argv[3] if len(sys.argv) > 3 else 'Свои'
    app_id = os.environ.get('APPLE_APP_ID') or app_by_bundle(os.environ['BUNDLE_ID'])

    deadline = time.time() + WAIT_SECONDS
    build = None
    while time.time() < deadline:
        build = find_build(app_id, version, number)
        if build and build['attributes'].get('processingState') == 'VALID':
            break
        state = build['attributes'].get('processingState') if build else 'ещё не видна'
        print(f'· {version}+{number}: {state}, жду {POLL_SECONDS} с')
        time.sleep(POLL_SECONDS)
    if not build or build['attributes'].get('processingState') != 'VALID':
        print(f'::error title=TestFlight::сборка {version}+{number} так и не стала VALID за '
              f'{WAIT_SECONDS // 60} минут — раздать группе нечего')
        return 1

    bid = build['id']
    if build['attributes'].get('usesNonExemptEncryption') is None:
        # Тот же ответ, что у всех 2.54.x этого приложения: шифрование стандартное.
        call('PATCH', f'/builds/{bid}',
             {'data': {'type': 'builds', 'id': bid,
                       'attributes': {'usesNonExemptEncryption': False}}})
        print('· экспортная декларация проставлена (стандартное шифрование)')

    stamp_what_to_test(bid, os.environ.get('WHAT_TO_TEST', ''))

    groups = call('GET', f'/betaGroups?filter[app]={app_id}&limit=20')['data']
    target = next((g for g in groups if g['attributes'].get('name') == group_name), None)
    if target is None:
        names = [g['attributes'].get('name') for g in groups]
        print(f'::error title=TestFlight::группы «{group_name}» нет, есть: {names}')
        return 1
    if not target['attributes'].get('isInternalGroup'):
        print(f'::error title=TestFlight::«{group_name}» — ВНЕШНЯЯ группа, сама её не раздаю: '
              'это проверка Apple и письмо каждому тестировщику')
        return 1

    try:
        call('POST', f"/betaGroups/{target['id']}/relationships/builds",
             {'data': [{'type': 'builds', 'id': bid}]})
    except urllib.error.HTTPError as e:
        print(f'::error title=TestFlight::раздача не прошла ({e.code}): {e.read().decode()[:300]}')
        return 1
    print(f'✅ {version}+{number} отдана группе «{group_name}» — она видна на телефоне')
    return 0


if __name__ == '__main__':
    sys.exit(main())
