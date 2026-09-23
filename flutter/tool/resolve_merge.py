#!/usr/bin/env python3
"""РАЗБОР ТРЁХ ОДНИХ И ТЕХ ЖЕ КОНФЛИКТОВ ПРИ ВЛИВАНИИ ВЕТКИ РАЗДЕЛА.

🔴 ЗАЧЕМ. Переезд идёт шестью разделами сразу, и каждая ветка дописывает в ТРИ
одних и тех же места: доску `FLUTTER_MIGRATION.md`, карту перехвата
`flutter/lib/shell/hybrid_app.dart` и пробу маршрутов
`flutter/test/hybrid_routes_test.dart`. Конфликт при вливании неизбежен и
одинаков, а разбирать его руками — это каждый раз шанс потерять чужую строку.

⚠️ И ОДНО МЕСТО, ГДЕ ОБЪЕДИНЯТЬ НЕЛЬЗЯ. Списки (строки доски, строки карты,
адреса) складываются — это верно. Но УТВЕРЖДЕНИЕ о полноте списка складывать
нельзя: механическое объединение дважды давало в пробе два `expect` подряд, и
каждый утверждал, что перенесённые игры исчерпываются ЕГО половиной. Такая проба
краснеет на любой следующей игре, кто бы её ни принёс. Поэтому ожидаемый набор
здесь СОБИРАЕТСЯ ЗАНОВО из карты перехвата, а не склеивается.

⚠️ И второе: игра, которую раздел только что перенёс, может остаться в списке
«остаётся в вебе» — списки начинают противоречить друг другу. Такие строки
вычищаются, а проба в репозитории дополнительно называет противоречие по имени.

Запуск из корня дерева, когда git уже сообщил о конфликтах:
    python3 flutter/tool/resolve_merge.py
Дальше: flutter analyze && flutter test, потом git add + git commit.
"""
import re
import sys

BLOCK = re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
BOARD = 'FLUTTER_MIGRATION.md'
MAP = 'flutter/lib/shell/hybrid_app.dart'
PROBE = 'flutter/test/hybrid_routes_test.dart'


def dedupe(lines, key):
    seen, out = set(), []
    for line in lines:
        k = key(line)
        if k is not None and k in seen:
            continue
        if k is not None:
            seen.add(k)
        out.append(line)
    return out


def union(path, key):
    try:
        src = open(path, encoding='utf-8').read()
    except FileNotFoundError:
        return 0
    new, n = BLOCK.subn(
        lambda m: '\n'.join(dedupe(m.group(1).splitlines() + m.group(2).splitlines(), key)) + '\n',
        src)
    if n:
        open(path, 'w', encoding='utf-8').write(new)
    return n


def routes_of(path):
    return sorted(set(re.findall(r"'(/games/[a-z0-9-]+)':", open(path, encoding='utf-8').read())))


def fix_probe(path, routes):
    src = open(path, encoding='utf-8').read()

    def one(m):
        ours, theirs = m.group(1), m.group(2)
        if 'native.keys.toSet()' in ours or 'native.keys.toSet()' in theirs:
            body = '\n'.join(f"      '{r}'," for r in routes)
            return ('    // ⚠️ ОДИН СПИСОК НА ВСЕХ, А НЕ ДВА expect ПОДРЯД: два набора рядом\n'
                    '    // означают, что кто-то проверяет устаревший, и проба краснеет на любой\n'
                    '    // следующей игре. Набор пересобирается из карты перехвата при вливании.\n'
                    '    expect(HybridApp.native.keys.toSet(), {\n' + body + '\n    });\n')
        return '\n'.join(dedupe(ours.splitlines() + theirs.splitlines(),
                                lambda line: line.strip() or None)) + '\n'

    src, n = BLOCK.subn(one, src)

    # Игра перенесена — её не может быть в списке «остаётся в вебе».
    #
    # 🔴 ГРАНИЦЫ СПИСКА БЕРУТСЯ ОТ ЛИТЕРАЛА, А НЕ ОТ ЗАГОЛОВКА ТЕСТА. Первая
    # версия включала фильтр по строке-заголовку и выключала по слову `isNull` —
    # и вырезала ПОЛОЖИТЕЛЬНЫЕ проверки (`expect(routeOf(...), '/games/...')`),
    # которые стоят выше. Поймано diff-ом до коммита: четыре проверки судоку
    # исчезли молча. Теперь список ограничен скобками `[` … `]` того теста,
    # который заканчивается `isNull`, и ничего вне них не трогается.
    lines = src.splitlines()
    isnull_at = [i for i, l in enumerate(lines) if 'isNull' in l and 'expect(' in l]
    kept, dropped = list(lines), []
    for end in isnull_at:
        start = next((i for i in range(end, -1, -1) if re.search(r'for \(final \w+ in \[', lines[i])), None)
        if start is None:
            continue
        close = next((i for i in range(start, end) if lines[i].strip().startswith(']')), end)
        for i in range(start + 1, close):
            m = re.search(r"\$origin(/games/[a-z0-9-]+)", lines[i])
            if m and m.group(1) in routes:
                dropped.append(m.group(1))
                kept[i] = None
    kept = [l for l in kept if l is not None]
    open(path, 'w', encoding='utf-8').write('\n'.join(kept) + '\n')
    return n, dropped



def dedupe_imports(path):
    """Убрать повторы импортов после объединения.

    ⚠️ Объединение двух сторон складывает и строки импортов: один и тот же
    `import '../games/stroop/screen.dart';` приходит от обеих веток, и анализатор
    даёт `duplicate_import` — предупреждение, а не ошибку, поэтому пробы зелёные,
    а грязь копится с каждым вливанием.
    """
    lines = open(path, encoding='utf-8').read().splitlines()
    seen, out = set(), []
    for line in lines:
        if line.startswith('import '):
            if line in seen:
                continue
            seen.add(line)
        out.append(line)
    open(path, 'w', encoding='utf-8').write('\n'.join(out) + '\n')


def main():
    game = lambda line: (re.search(r'`([a-z0-9-]+)`', line) or [None, None])[1] \
        if line.strip().startswith('|') else None
    line_key = lambda line: line.strip() or None

    board = union(BOARD, game)
    mapped = union(MAP, line_key)
    dedupe_imports(MAP)
    union('flutter/pubspec.yaml', line_key)
    routes = routes_of(MAP)
    probe, dropped = fix_probe(PROBE, routes)

    print(f'доска: {board} конфликтов · карта: {mapped} · проба: {probe}')
    print(f'маршрутов перехвата после вливания: {len(routes)}')
    if dropped:
        print('убрано из списка «остаётся в вебе» (игра уже перенесена): ' + ', '.join(dropped))
    left = [p for p in (BOARD, MAP, PROBE, 'flutter/pubspec.yaml')
            if '<<<<<<<' in open(p, encoding='utf-8').read()]
    if left:
        print('⚠️ остались конфликты, разбери руками: ' + ', '.join(left))
        sys.exit(1)
    print('Дальше: cd flutter && flutter analyze && flutter test')


if __name__ == '__main__':
    main()
