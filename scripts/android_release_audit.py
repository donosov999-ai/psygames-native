#!/usr/bin/env python3
"""
android_release_audit.py — предрелизный аудит APK на блокеры Google Play.
Ловит то, что иначе всплывёт в Play Console постфактум. Гоняем на КАЖДОМ
релиз-APK до публикации в прод.

Usage:  python3 android_release_audit.py path/to/app.apk
Требует: pip install pyaxmlparser ; в PATH — objdump (или NDK llvm-objdump).

Проверяет:
  1. 16 КБ выравнивание LOAD-сегментов .so (Android 15+ hard-блокер прода)
  2. 16 КБ zip-выравнивание .so (при extractNativeLibs=false)
  3. 64-бит ABI присутствуют (arm64-v8a обязателен)
  4. debuggable / testOnly = false
  5. usesCleartextTraffic не true
  6. Опасные/чувствительные права (требуют декларации в консоли)
  7. Экспортируемые компоненты без permission (потенц. дыра)
  8. Deprecated оконные API в dex (предупреждение Play)
  9. Обработка инсетов при targetSdk 35+ — иначе контент под системными панелями
"""
import sys, subprocess, zipfile, struct, shutil, re

DANGEROUS = {
    'QUERY_ALL_PACKAGES', 'MANAGE_EXTERNAL_STORAGE', 'REQUEST_INSTALL_PACKAGES',
    'SYSTEM_ALERT_WINDOW', 'READ_SMS', 'SEND_SMS', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION',
    'ACCESS_BACKGROUND_LOCATION', 'CAMERA', 'RECORD_AUDIO', 'READ_MEDIA_IMAGES',
    'AD_ID', 'com.google.android.gms.permission.AD_ID', 'FOREGROUND_SERVICE',
}
DEPRECATED_WINDOW_APIS = [
    'setStatusBarColor', 'setNavigationBarColor', 'setSystemUiVisibility',
    'setDecorFitsSystemWindows', 'setStatusBarContrastEnforced',
    'setNavigationBarContrastEnforced', 'setNavigationBarDividerColor',
]

def find_objdump():
    for c in ('llvm-objdump', 'objdump'):
        if shutil.which(c):
            return shutil.which(c)
    return None

def seg_aligns(objdump, path):
    out = subprocess.run([objdump, '-p', path], capture_output=True, text=True).stdout
    return sorted(set(l.split()[-1] for l in out.splitlines() if 'LOAD' in l))

def main(apk):
    from pyaxmlparser import APK
    a = APK(apk)
    ns = '{http://schemas.android.com/apk/res/android}'
    m = a.get_android_manifest_xml(); app = m.find('application')
    fails, warns, oks = [], [], []

    # 1+2+3 — нативные .so
    objdump = find_objdump()
    z = zipfile.ZipFile(apk); sos = [n for n in z.namelist() if n.endswith('.so')]
    abis = set(n.split('/')[1] for n in sos)
    for a64 in ('arm64-v8a', 'x86_64'):
        (oks if a64 in abis else warns).append(f'64-бит {a64}: {"есть" if a64 in abis else "НЕТ"}')
    if 'arm64-v8a' not in abis:
        fails.append('arm64-v8a отсутствует — обязателен в Google Play')
    for n in sos:
        info = z.getinfo(n); z.fp.seek(info.header_offset); h = z.fp.read(30)
        nlen, elen = struct.unpack('<HH', h[26:30])
        off = info.header_offset + 30 + nlen + elen
        (oks if off % 16384 == 0 else fails).append(f'{n} zip-align 16К: {"ok" if off%16384==0 else "НЕТ (%d)"%off}')
        if objdump:
            import os, tempfile
            tmp = tempfile.mktemp(suffix='.so'); open(tmp,'wb').write(z.read(n))
            al = seg_aligns(objdump, tmp); os.unlink(tmp)
            ok16 = all(x == '2**14' for x in al) or all(x in ('0x4000','16384') for x in al)
            (oks if ok16 else fails).append(f'{n} LOAD-align: {" ".join(al)} {"(16К ok)" if ok16 else "← НУЖНО 2**14 (16К)"}')

    # 4+5 — флаги application
    for f, bad in (('debuggable','true'),('testOnly','true'),('usesCleartextTraffic','true')):
        v = app.get(ns+f)
        (fails if v == bad else oks).append(f'{f}={v if v is not None else "(default)"}')

    # 6 — права
    for p in a.get_permissions():
        short = p.split('.')[-1]
        if short in DANGEROUS or p in DANGEROUS:
            warns.append(f'чувствительное право: {p} (нужна декларация/обоснование в консоли)')
    oks.append(f'прав всего: {len(a.get_permissions())}')

    # 7 — exported без permission
    for tag in ('activity','service','receiver','provider'):
        for el in app.findall(tag):
            if el.get(ns+'exported') == 'true' and not el.get(ns+'permission'):
                nm = el.get(ns+'name'); is_launcher = any(
                    c.find('category') is not None for c in el.findall('intent-filter'))
                # лаунчер-activity exported=true — норма
                if not (tag=='activity' and 'MainActivity' in (nm or '')):
                    warns.append(f'exported {tag} без permission: {nm}')

    # 8 — deprecated оконные API в dex
    z2 = zipfile.ZipFile(apk); dex = b''.join(z2.read(n) for n in z2.namelist() if n.endswith('.dex'))
    hit = [x for x in DEPRECATED_WINDOW_APIS if x.encode() in dex]
    if hit:
        # Play Console показывает это как «используются неподдерживаемые API
        # отображения от края до края». Приходят из минифицированных androidx /
        # Material внутри wry и Play Core — своего кода за ними нет, удалить
        # нечего. Держим на виду, чтобы отслеживать при апгрейде зависимостей.
        warns.append(f'deprecated оконные API в dex: {", ".join(hit)} '
                     f'(из минифицированных androidx/Material — свой код их не зовёт; '
                     f'уходит только апгрейдом зависимостей)')

    # 9 — edge-to-edge: targetSdk 35+ рисует под системными панелями ВСЕГДА.
    # Chromium-WebView кладёт в env(safe-area-inset-*) только вырез экрана, поэтому
    # на телефоне без выреза шапка уезжает под статус-бар, а кнопки — под навигацию.
    # Без своей обработки инсетов это ломает интерфейс у части пользователей —
    # ровно то предупреждение, которое Play прислал на v1.157.0. Считаем блокером:
    # мы должны ловить это здесь, а не читать в Play Console после публикации.
    tsdk = a.get_target_sdk_version()
    if tsdk and int(tsdk) >= 35:
        has_listener = b'setOnApplyWindowInsetsListener' in dex
        has_bridge = b'__psyInsets' in dex
        if has_listener and has_bridge:
            oks.append('edge-to-edge: слушатель инсетов + мост в WebView на месте')
        else:
            miss = []
            if not has_listener: miss.append('нет setOnApplyWindowInsetsListener (низ уйдёт под навигацию)')
            if not has_bridge:   miss.append('нет моста __psyInsets (верх уйдёт под статус-бар)')
            fails.append('edge-to-edge при targetSdk %s: %s' % (tsdk, '; '.join(miss)))

    print(f'\n### АУДИТ {apk}  ({a.package} v{a.version_name} code {a.version_code}, target {a.get_target_sdk_version()})\n')
    print(f'🔴 БЛОКЕРЫ ({len(fails)}):');   [print('   ✗', x) for x in fails] or (not fails and print('   —'))
    print(f'\n🟡 ВНИМАНИЕ ({len(warns)}):'); [print('   ⚠', x) for x in warns] or (not warns and print('   —'))
    print(f'\n🟢 ОК ({len(oks)}):');         [print('   ✓', x) for x in oks]
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('usage: android_release_audit.py app.apk'); sys.exit(2)
    main(sys.argv[1])
