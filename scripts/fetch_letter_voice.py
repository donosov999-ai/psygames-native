#!/usr/bin/env python3
"""ЖИВЫЕ ЗАПИСИ ИМЁН БУКВ ДЛЯ N-BACK.

🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ. Общий корпус (fetch_wiktionary_voice.py) собирается по
СЛОВАМ игр, а слуховой поток n-back — это десять английских согласных, и они в
корпус не попали дважды: сперва синтезирующая модель на однобуквенных стимулах в
половине случаев отвечала разговором вместо буквы (замер 04.09), потом живой
корпус собирался по словарям игр, где букв нет вовсе.

⚠️ ЛОВУШКА ЗДЕСЬ ДРУГАЯ, ЧЕМ В СЛОВАХ. У слова совпадение написания означает
совпадение смысла; у буквы — нет. На странице буквы `B` в Викисловаре лежат и
запись имени буквы, и записи слов, где она встречается. Поэтому берём файл со
страницы САМОЙ БУКВЫ, а не со страницы её имени: «bee» отдаёт `En-uk-a bee.ogg`
— «a bee», насекомое с артиклем.

⚠️ И НАОБОРОТ, `Q` отдаёт `en-au-queue.ogg`, и это ПРАВИЛЬНО: «cue» и «queue» в
английском омофоны, /kjuː/ — то самое, как называется буква. Отбрасывать по имени
файла здесь было бы ошибкой.
"""
import hashlib, json, os, re, subprocess, sys, urllib.parse, urllib.request

КОРЕНЬ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ВЫХОД = os.path.join(КОРЕНЬ, 'voice-wiktionary', 'letters')
UA = 'psygames/1.0 (pronunciation corpus; d.onosov999@gmail.com)'
ЗВУК = re.compile(r'\.(ogg|oga|wav|mp3|flac|opus)$', re.I)
БУКВЫ = ['B', 'D', 'F', 'H', 'K', 'L', 'M', 'Q', 'R', 'T']


def подходит(имя: str) -> bool:
    n = имя.split(':', 1)[-1].lower()
    return any(re.match(rf'{c}-', n) or f'({c})-' in n for c in ('en', 'eng', 'en-us', 'en-uk', 'en-gb', 'en-au'))


def достать(url: str, таймаут: int = 60) -> bytes:
    import time
    задержка = 2.0
    for _ in range(6):
        try:
            r = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(r, timeout=таймаут) as f:
                return f.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503):
                raise
            time.sleep(min(float(e.headers.get('Retry-After') or задержка), 60))
            задержка = min(задержка * 2, 60)
    raise RuntimeError('шесть попыток подряд упёрлись в 429/503')


def api(host: str, params: dict) -> dict:
    return json.loads(достать(f'https://{host}/w/api.php?' + urllib.parse.urlencode(params), 40))


def канон(имя: str) -> str:
    ns, _, имя = имя.partition(':')
    return f'{ns}:{имя[:1].upper()}{имя[1:]}'


def длительность(файл: str) -> float:
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=nw=1:nk=1', файл], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def main() -> int:
    os.makedirs(ВЫХОД, exist_ok=True)
    d = api('en.wiktionary.org', {'action': 'query', 'prop': 'images', 'imlimit': 'max',
                                  'titles': '|'.join(БУКВЫ), 'format': 'json', 'formatversion': '2'})
    кандидаты = {}
    for p in d.get('query', {}).get('pages', []):
        зв = [i['title'] for i in p.get('images', []) if ЗВУК.search(i['title']) and подходит(i['title'])]
        if зв:
            кандидаты[p['title']] = ['File:' + x.split(':', 1)[-1] for x in зв]
    нет = [b for b in БУКВЫ if b not in кандидаты]
    if нет:
        print(f'⚠️ без записи: {", ".join(нет)}', file=sys.stderr)

    инфо = {}
    файлы = sorted({f for сп in кандидаты.values() for f in сп})
    for k in range(0, len(файлы), 20):
        r = api('commons.wikimedia.org', {'action': 'query', 'prop': 'imageinfo',
                'iiprop': 'url|extmetadata', 'titles': '|'.join(файлы[k:k + 20]),
                'format': 'json', 'formatversion': '2'})
        for p in r.get('query', {}).get('pages', []):
            ii = (p.get('imageinfo') or [{}])[0]
            em = ii.get('extmetadata', {})
            лиц = em.get('LicenseShortName', {}).get('value')
            if not ii.get('url') or not лиц:
                continue
            автор = ' '.join(re.sub('<[^>]+>', '', em.get('Artist', {}).get('value', '')).split())[:80] or '—'
            инфо[канон(p['title'])] = (ii['url'], автор, лиц)

    указатель, права = {}, []
    for буква, список in sorted(кандидаты.items()):
        """
        🔴 ВЫБИРАЕМ САМОГО КОРОТКОГО, А НЕ ПЕРВОГО. Окно пробы n-back в двойном
        режиме — 1800 мс (показ 700 + пауза 1100). Запись длиннее этого играет
        поверх СЛЕДУЮЩЕГО стимула, и человек слышит две буквы разом: измерение
        ломается, а на экране всё выглядит исправным. Первый заход 04.09 взял для
        `Q` австралийское «queue» на 1,63 с — почти всё окно.
        """
        варианты = []
        for файл in список:
            свед = инфо.get(канон(файл))
            if not свед:
                continue
            url, автор, лиц = свед
            врем = os.path.join(ВЫХОД, f'.tmp-{abs(hash(файл))}.opus')
            сырьё = врем + '.src'
            try:
                open(сырьё, 'wb').write(достать(url))
            except Exception as e:
                print(f'  ⚠️ {буква} {файл}: {e}', file=sys.stderr)
                continue
            ок = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', сырьё,
                                 '-ac', '1', '-ar', '24000', '-b:a', '24k',
                                 '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,'
                                        'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,'
                                        'loudnorm=I=-16:TP=-1.5:LRA=11',
                                 '-c:a', 'libopus', врем], capture_output=True).returncode == 0
            os.remove(сырьё)
            if not ок:
                continue
            варианты.append((длительность(врем), врем, файл, автор, лиц))
        if not варианты:
            print(f'⚠️ {буква}: ни один вариант не взялся', file=sys.stderr)
            continue
        варианты.sort()
        сек, врем, файл, автор, лиц = варианты[0]
        имя = hashlib.sha1(f'letter:{буква}'.encode()).hexdigest()[:16] + '.opus'
        цель = os.path.join(ВЫХОД, имя)
        os.replace(врем, цель)
        for _, лишний, *_ in варианты[1:]:
            if os.path.exists(лишний):
                os.remove(лишний)
        пометка = ' ⚠️ длиннее окна пробы' if сек > 1.0 else ''
        указатель[буква] = имя
        права.append({'letter': буква, 'file': файл, 'author': автор, 'license': лиц, 'sec': round(сек, 2)})
        print(f'{буква}: {сек:.2f} с · из {len(варианты)} вариантов · {лиц}{пометка}')

    json.dump(указатель, open(os.path.join(ВЫХОД, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(права, open(os.path.join(ВЫХОД, 'credits.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'\nвзято {len(указатель)} из {len(БУКВЫ)} → {ВЫХОД}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
