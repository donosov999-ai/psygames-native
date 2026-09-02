#!/usr/bin/env python3
"""
Заполняет тексты витрины App Store через App Store Connect API.

🔴 ЗАЧЕМ СКРИПТОМ, А НЕ РУКАМИ. Полей восемь, и каждое имеет лимит длины, который
видно только после отправки формы. Руками это правится по кругу; здесь длина
проверяется ДО отправки, а сами тексты живут в `APP_STORE_FILLS` — то есть в
репозитории, рядом с приложением, и не теряются между попытками.

⚠️ СЕКРЕТЫ ЗДЕСЬ НЕ ЖИВУТ. Ключ `.p8`, Key ID и Issuer ID читаются из
`~/.sdt_secrets/apple_appstore.json` — по канону хранилища секретов. В код,
в git и в вывод скрипта они не попадают.

⚠️ ЧТО API НЕ УМЕЕТ. App Privacy, Content Rights и часть Age Rating заполняются
только через веб-интерфейс — их список остаётся в `APP_STORE_FIELDS.md`.

Запуск:
    python3 scripts/appstore-fill.py            # показать, что будет отправлено
    python3 scripts/appstore-fill.py --apply    # отправить
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

try:
    import jwt  # pyjwt
except ImportError:
    sys.exit('нужен pyjwt: pip3 install --break-system-packages pyjwt cryptography')

СЕКРЕТ = os.path.expanduser('~/.sdt_secrets/apple_appstore.json')
BASE = 'https://api.appstoreconnect.apple.com/v1'
ЛОКАЛЬ = 'ru'

# Лимиты Apple — проверяем ДО отправки, иначе узнаём о них из ошибки 409.
ЛИМИТЫ = {
    'name': 30, 'subtitle': 30, 'promotionalText': 170,
    'keywords': 100, 'description': 4000,
    'supportUrl': 255, 'marketingUrl': 255,
}

# ⚠️ Поля разнесены по ДВУМ ресурсам, и Apple это различает жёстко:
#  · appStoreVersionLocalizations — описание, промо-текст, ключевые слова, ссылки
#    (меняются от версии к версии);
#  · appInfoLocalizations — имя и подзаголовок (принадлежат приложению, а не версии).
# Первая попытка 02.09.2026 отправила `subtitle` вместе с описанием и получила
# «'subtitle' is not an attribute on the resource 'appStoreVersionLocalizations'».
ПОДЗАГОЛОВКИ = {
    'ru': 'Упражнения для ума каждый день',
    'en-US': 'Memory, focus and logic daily',   # 29 из 30
}

ТЕКСТЫ_RU = {
    'promotionalText': (
        '74 упражнения на внимание, память и счёт. Сложность подстраивается под вас, '
        'а короткая зарядка на 5–15 минут собирается сама.'
    ),
    'keywords': 'память,внимание,мозг,тренажёр,судоку,логика,счёт,концентрация,головоломки,зарядка,реакция,ум',
    'supportUrl': 'https://psy-games.pro',
    'marketingUrl': 'https://psy-games.pro',
    'description': """74 упражнения на внимание, память, счёт и скорость реакции — в одном приложении, без рекламы и без подписки.

ЗАРЯДКА ЗА 5–15 МИНУТ
Приложение само собирает короткую программу под ваше время и цель: разогреться утром, собраться перед работой, разгрузиться вечером. Не нужно выбирать, с чего начать, — достаточно нажать «начать».

СЛОЖНОСТЬ ПОДСТРАИВАЕТСЯ
Каждое упражнение ведёт свою лестницу уровней и держится там, где вам ещё интересно, но уже не легко. Ошибки — часть работы: приложение не наказывает за них, а меняет уровень.

ЧТО ВНУТРИ
• Судоку: классическая и одиннадцать вариантов правил — диагонали, термометры, стрелки, киллер, самурай
• Память: матрица, блоки Корси, пары картинок, цифровой и пространственный размах, N-back
• Внимание: таблицы Шульте, поиск отличий, корректурная проба, проба Струпа, торможение реакции
• Счёт и логика: математический спринт, числовые связи, ханойская башня, головоломка SET, судоку-фрактал
• Слова: анаграммы, мнемоника, беглость речи, пары слов
• Сортировка товаров: головоломка на планирование ходов с растущей сложностью

ЧЕСТНО О ПОЛЬЗЕ
Это тренажёры, а не лечение. Мы не обещаем, что игры «улучшат мозг» — научных доказательств переноса таких упражнений на повседневную жизнь недостаточно. Мы делаем то, что можно проверить: показываем ваш прогресс по каждому упражнению, храним рекорды и не подкручиваем результаты.

СЕМЬЯ И ПРОФИЛИ
Несколько профилей в одном приложении — у каждого свои уровни, рекорды и программы.

БЕЗ ЛИШНЕГО
Без рекламы. Без обязательной регистрации. Без сбора личных данных: результаты хранятся на устройстве и в вашем профиле, а не привязываются к вашей личности.""",
}

# ⚠️ Английское описание УЖЕ БЫЛО заполнено — и устарело: «48 games», «7 languages»,
# «11 profiles». На 02.09.2026 в приложении 74 упражнения, 12 языков, 13 программ.
# Устаревшие числа на витрине — это не мелочь: ревьюер сверяет описание со сборкой.
# Раздел про науку сохранён почти дословно: он честно говорит про near/far transfer,
# и это сильнее, чем просто «мы ничего не обещаем».
ТЕКСТЫ_EN = {
    'promotionalText': (
        '74 exercises for memory, attention and speed. Difficulty adapts to you, '
        'and a 5–15 minute session builds itself.'
    ),
    'keywords': 'brain,memory,attention,focus,cognitive,logic,sudoku,reaction,n-back,stroop,puzzle,training',
    'supportUrl': 'https://psy-games.pro',
    'marketingUrl': 'https://psy-games.pro',
    'description': """PsyGames is 74 cognitive exercises built on established neuropsychological paradigms — N-back, Stroop, Corsi, Trail Making, SET, Tower of London and more.

A 5–15 MINUTE SESSION
The app assembles a short programme for the time you have and the goal you pick: wake up in the morning, focus before work, wind down in the evening. No need to choose where to start — just press start.

DIFFICULTY ADAPTS
Every exercise runs its own ladder of levels and keeps you where it is still interesting but no longer easy. Mistakes are part of the work: the app does not punish them, it changes the level.

WHAT'S INSIDE
• 74 exercises across memory, attention, logic and speed
• Sudoku: classic plus eleven rule variants — diagonals, thermometers, arrows, killer, samurai
• Morning warm-up and a calm before-sleep session that run with the right settings on their own
• 13 profiles for different goals: languages, kids, seniors, focus, reaction, entrepreneurs and more
• Progress tracking and a cognitive assessment that maps strengths and weaknesses on a radar
• 12 languages · works fully offline · no ads, no subscription

HONEST ABOUT THE SCIENCE
Training reliably improves your performance on these tasks and closely related skills (near transfer). We do not promise a higher IQ — research on far transfer is mixed. What we give you are valid instruments and a clear, measurable picture of your progress. That is the difference from brain-game toys.""",
}


def секрет() -> dict:
    if not os.path.exists(СЕКРЕТ):
        sys.exit(f'нет файла секрета: {СЕКРЕТ}')
    d = json.load(open(СЕКРЕТ, encoding='utf-8'))
    for поле in ('key_id', 'issuer_id', 'key_file'):
        v = str(d.get(поле, ''))
        if not v or v.startswith('ЗАПОЛНИТЬ'):
            sys.exit(f'в {СЕКРЕТ} не заполнено поле «{поле}»')
    return d


def токен(d: dict) -> str:
    """JWT живёт 20 минут — дольше Apple не принимает."""
    ключ = open(os.path.expanduser(d['key_file']), encoding='utf-8').read()
    now = int(time.time())
    return jwt.encode(
        {'iss': d['issuer_id'], 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'},
        ключ, algorithm='ES256', headers={'kid': d['key_id'], 'typ': 'JWT'},
    )


def запрос(метод: str, путь: str, тело=None, tok='') -> dict:
    url = путь if путь.startswith('http') else f'{BASE}{путь}'
    данные = json.dumps(тело).encode() if тело is not None else None
    req = urllib.request.Request(url, data=данные, method=метод)
    req.add_header('Authorization', f'Bearer {tok}')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            сырое = r.read()
            return json.loads(сырое) if сырое else {}
    except urllib.error.HTTPError as e:
        текст = e.read().decode('utf-8', 'replace')[:600]
        sys.exit(f'Apple ответила {e.code}: {текст}')


def главное(применять: bool) -> None:
    длинно = [f'{loc}/{k}: {len(v)} > {ЛИМИТЫ[k]}'
              for loc, набор in (('ru', ТЕКСТЫ_RU), ('en-US', ТЕКСТЫ_EN))
              for k, v in набор.items() if k in ЛИМИТЫ and len(v) > ЛИМИТЫ[k]]
    if длинно:
        sys.exit('поля длиннее лимита Apple:\n  ' + '\n  '.join(длинно))
    длинныеПодз = [f'{k}: {len(v)} > 30' for k, v in ПОДЗАГОЛОВКИ.items() if len(v) > 30]
    if длинныеПодз:
        sys.exit('подзаголовки длиннее 30 символов:\n  ' + '\n  '.join(длинныеПодз))
    print('длина всех полей в пределах лимитов ✅')

    if not применять:
        for k, v in {**ТЕКСТЫ_RU, **{f'en:{a}': b for a, b in ТЕКСТЫ_EN.items()}}.items():
            один = v.replace('\n', ' ')[:70]
            print(f'  {k:18} {len(v):>5} симв · {один}…')
        print('\nэто предпросмотр. Отправить: python3 scripts/appstore-fill.py --apply')
        return

    d = секрет()
    tok = токен(d)

    apps = запрос('GET', '/apps?limit=200', tok=tok)
    приложение = next((a for a in apps.get('data', [])
                       if a['attributes'].get('bundleId') == d['bundle_id']), None)
    if not приложение:
        sys.exit(f'приложение с bundleId {d["bundle_id"]} не найдено в аккаунте')
    print(f'приложение: {приложение["attributes"]["name"]} ({приложение["id"]})')

    версии = запрос('GET', f'/apps/{приложение["id"]}/appStoreVersions?limit=10', tok=tok)
    редактируемые = [v for v in версии.get('data', [])
                     if v['attributes']['appStoreState'] in
                     ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED')]
    if not редактируемые:
        sys.exit('нет версии в состоянии «готовится к отправке» — создайте её в App Store Connect')
    версия = редактируемые[0]
    print(f'версия: {версия["attributes"]["versionString"]} ({версия["attributes"]["appStoreState"]})')

    локали = запрос('GET', f'/appStoreVersions/{версия["id"]}/appStoreVersionLocalizations', tok=tok)
    for код, набор in (('ru', ТЕКСТЫ_RU), ('en-US', ТЕКСТЫ_EN)):
        есть = next((l for l in локали.get('data', []) if l['attributes']['locale'] == код), None)
        if есть:
            запрос('PATCH', f'/appStoreVersionLocalizations/{есть["id"]}',
                   {'data': {'type': 'appStoreVersionLocalizations', 'id': есть['id'],
                             'attributes': набор}}, tok)
            print(f'локаль {код}: тексты обновлены ✅')
        else:
            запрос('POST', '/appStoreVersionLocalizations',
                   {'data': {'type': 'appStoreVersionLocalizations',
                             'attributes': {**набор, 'locale': код},
                             'relationships': {'appStoreVersion': {
                                 'data': {'type': 'appStoreVersions', 'id': версия['id']}}}}}, tok)
            print(f'локаль {код} создана и заполнена ✅')

    # Подзаголовок живёт в другом ресурсе — у самого приложения.
    инфо = запрос('GET', f'/apps/{приложение["id"]}/appInfos?limit=10', tok=tok)
    редакт = [i for i in инфо.get('data', [])
              if i['attributes'].get('appStoreState') in
              ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED')]
    if редакт:
        локи = запрос('GET', f'/appInfos/{редакт[0]["id"]}/appInfoLocalizations', tok=tok)
        for код, текст in ПОДЗАГОЛОВКИ.items():
            есть = next((l for l in локи.get('data', []) if l['attributes']['locale'] == код), None)
            if есть:
                запрос('PATCH', f'/appInfoLocalizations/{есть["id"]}',
                       {'data': {'type': 'appInfoLocalizations', 'id': есть['id'],
                                 'attributes': {'subtitle': текст}}}, tok)
                print(f'подзаголовок {код} обновлён ✅')
            else:
                print(f'⚠️ локали {код} у карточки нет — подзаголовок руками')
    else:
        print('⚠️ карточка приложения не в редактируемом состоянии — подзаголовок руками')

    print('\n⚠️ Через API НЕ заполняются: App Privacy, Content Rights, Age Rating, '
          'Sign-In Required. Они в APP_STORE_FIELDS.md — руками в веб-интерфейсе.')


if __name__ == '__main__':
    главное('--apply' in sys.argv)
