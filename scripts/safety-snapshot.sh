#!/bin/bash
# psygames-safety-snapshot · VER 1 · 07.09.2026
#
# 🔴 ЗАЧЕМ. В одном дереве работают девять чатов. Незакоммиченная правка одного
# лежит рядом с правкой другого, и `git checkout -- <файл>`, `git restore`,
# `reset --hard` стирают её НАСОВСЕМ: незастейдженное не попадает ни в стеш, ни
# в объекты, `git fsck --lost-found` его не находит.
#
# 07.09.2026 так пропала починка чата «Сортировки» — стёр координатор, проверяя
# чужой файл. Восстановить не удалось.
#
# ⚠️ ПОЧЕМУ НЕ ХУКОМ CLAUDE CODE. Хук защищает только ту сессию, где он
# подхвачен, и только после перезапуска. Этот скрипт снимает снимок ПО
# РАСПИСАНИЮ и потому прикрывает всех: любую сессию, любой чат, и правку,
# сделанную руками.
#
# ⚠️ НИЧЕГО НЕ ТРОГАЕТ. `git stash create` делает объект-коммит, НЕ меняя ни
# рабочую копию, ни индекс. Работающий чат не заметит.
#
# Вернуть затёртое:
#   git for-each-ref refs/safety --sort=-creatordate
#   git show "${ref}:путь"                    # ⚠️ скобки обязательны (zsh)
#   git checkout <ref> -- путь
set -uo pipefail

REPO="${1:-/Users/denisonosov/dev/psygames}"
KEEP=48                       # снимков хранить (по одному в 5 минут ≈ 4 часа)

cd "$REPO" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Нечего сохранять — выходим молча.
git diff --quiet HEAD 2>/dev/null && exit 0

snap=$(git stash create 2>/dev/null)
[ -z "$snap" ] && exit 0

# ⚠️ Не плодим одинаковые: если содержимое совпало с последним снимком, пропускаем.
last=$(git for-each-ref refs/safety --sort=-creatordate --count=1 --format='%(objectname)')
if [ -n "$last" ] && [ "$(git rev-parse "${last}^{tree}" 2>/dev/null)" = "$(git rev-parse "${snap}^{tree}" 2>/dev/null)" ]; then
  exit 0
fi

git update-ref "refs/safety/$(date +%Y%m%d-%H%M%S)" "$snap" 2>/dev/null

# Старые убираем, иначе репозиторий пухнет.
git for-each-ref refs/safety --sort=-creatordate --format='%(refname)' \
  | tail -n +$((KEEP + 1)) \
  | while read -r ref; do git update-ref -d "$ref" 2>/dev/null; done

exit 0
