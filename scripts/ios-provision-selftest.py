#!/usr/bin/env python3
"""
🔴 САМОПРОВЕРКА ПОВТОРА ЗАПРОСОВ К APP STORE CONNECT.

📍 06.09.2026 ЧЕТЫРЕ выпуска подряд (2.42.0, 2.43.0, 2.44.0, 2.45.0) легли на
шаге «Сертификат и профиль» с одним и тем же ответом Apple: `UNEXPECTED_ERROR`,
«произошла ошибка на стороне сервера» — то есть 500. Каждый раз тот же прогон,
перезапущенный без единой правки, проходил. Повтор поставлен, и вот проба на
него: без неё она сгниёт молча — сетевого кода нет в наборе jest, и ошибиться в
нём можно ровно один раз, зато на выпуске.

⚠️ Проверяется ПОВЕДЕНИЕ, а не наличие строк: `urlopen` подменяется, попытки
считаются. Чтение исходника тут ничего не доказало бы.
"""
import importlib.util
import io
import os
import sys
import urllib.error
import urllib.request


def загрузить():
    путь = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ios-provision.py')
    spec = importlib.util.spec_from_file_location('prov', путь)
    m = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(m)
    except SystemExit:
        pass          # модуль требует переменных окружения на запуске — нам нужны только функции
    return m


def главное() -> int:
    m = загрузить()
    m.ПАУЗА_СЕК = 0
    беды: list[str] = []

    # 1. Какие коды вообще повторяются
    for код, ждём in [(500, True), (502, True), (503, True), (429, True),
                      (401, False), (403, False), (404, False), (409, False), (200, False)]:
        было = m.стоит_повторить(код)
        if было != ждём:
            беды.append(f'код {код}: повтор {было}, ожидалось {ждём}')

    счёт = {'n': 0}

    def всегда500(*a, **k):
        счёт['n'] += 1
        raise urllib.error.HTTPError('u', 500, 'server', {}, io.BytesIO(b'{"errors":[]}'))

    def сначала500(*a, **k):
        счёт['n'] += 1
        if счёт['n'] < 3:
            raise urllib.error.HTTPError('u', 500, 'server', {}, io.BytesIO(b'{}'))
        return type('О', (), {'read': lambda self: b'{"data":"ok"}'})()

    def всегда404(*a, **k):
        счёт['n'] += 1
        raise urllib.error.HTTPError('u', 404, 'nope', {}, io.BytesIO(b'{"errors":[]}'))

    # 2. Пятисотая повторяется до потолка и только потом валит
    m.urllib.request.urlopen = всегда500
    счёт['n'] = 0
    try:
        m.запрос('t', 'GET', '/x')
        беды.append('500 всегда: скрипт не упал, хотя должен')
    except SystemExit:
        pass
    if счёт['n'] != m.ПОПЫТОК:
        беды.append(f'500 всегда: попыток {счёт["n"]}, ожидалось {m.ПОПЫТОК}')

    # 3. Временная пятисотая переживается, и ответ доезжает
    m.urllib.request.urlopen = сначала500
    счёт['n'] = 0
    try:
        ответ = m.запрос('t', 'GET', '/x')
        if ответ != {'data': 'ok'}:
            беды.append(f'500 дважды: ответ {ответ}')
        if счёт['n'] != 3:
            беды.append(f'500 дважды: попыток {счёт["n"]}, ожидалось 3')
    except SystemExit as e:
        беды.append(f'500 дважды: упал вместо повтора — {e}')

    # 4. 🔴 Четырёхсотая НЕ повторяется: это настоящая ошибка, и прятать её за
    #    четырьмя минутами ожидания хуже, чем упасть сразу.
    m.urllib.request.urlopen = всегда404
    счёт['n'] = 0
    try:
        m.запрос('t', 'GET', '/x')
        беды.append('404: скрипт не упал')
    except SystemExit:
        pass
    if счёт['n'] != 1:
        беды.append(f'404: попыток {счёт["n"]}, ожидалась 1 — повторять не надо')

    if беды:
        print('🔴 самопроверка повтора не прошла:')
        for б in беды:
            print('  ' + б)
        return 1
    print('✓ повтор запросов к App Store Connect: серверные повторяются, клиентские нет')
    return 0


if __name__ == '__main__':
    sys.exit(главное())
