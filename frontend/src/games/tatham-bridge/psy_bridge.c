/* psygames-tatham-bridge · VER 1 · 10.09.2026
 *
 * Мост к движкам Саймона Тэтхэма: наружу отдаются ТОЛЬКО генератор, решатель и
 * список ступеней сложности. Ни одной строки его интерфейса — рисуем своим.
 *
 * Основано на Simon Tatham's Portable Puzzle Collection, лицензия MIT
 * (файл LICENCE в каноне, по-британски через C).
 * Copyright (c) 2004-2024 Simon Tatham. Portions copyright Richard Boulton,
 * James Harvey, Mike Pinna, Jonas Kolker, Dariusz Olszewski, Michael Schierl,
 * Lambros Lambrou, Bernd Schmidt, Steffen Bauer, Lennard Sprong,
 * Rogier Goossens, Michael Quevillon, Asher Gordon, Didi Kohen, Ben Harris.
 *
 * ⚠️ Заглушка интерфейса взята его же: nullfe.c — тот самый файл, которым он
 * собирает свои консольные решатели. Своей писать не пришлось.
 */
#include <string.h>
#include <stdlib.h>
#include <emscripten.h>
#include "puzzles.h"

/* Сколько головоломок в этом модуле. */
EMSCRIPTEN_KEEPALIVE int psy_count(void) { return gamecount; }

/* Имя головоломки по номеру — чтобы сторона JS не гадала порядок. */
EMSCRIPTEN_KEEPALIVE const char *psy_name(int i)
{
    if (i < 0 || i >= gamecount) return "";
    return gamelist[i]->name;
}

/* Сколько ГОТОВЫХ ступеней сложности объявил автор (его пресеты). */
EMSCRIPTEN_KEEPALIVE int psy_presets(int i)
{
    const game *g; int n = 0; char *name; game_params *p;
    if (i < 0 || i >= gamecount) return 0;
    g = gamelist[i];
    if (!g->fetch_preset) return 0;
    while (g->fetch_preset(n, &name, &p)) { sfree(name); g->free_params(p); n++; }
    return n;
}

/*
 * Сгенерировать доску. Возвращает СТРОКУ-ОПИСАНИЕ в его же формате
 * "параметры:описание" — ровно то, что он сам кладёт в ссылку на партию.
 * Разбирать её будет наша сторона; формат документирован у него в puzzles.but.
 */
EMSCRIPTEN_KEEPALIVE char *psy_generate(int i, const char *params, int seed)
{
    const game *g;
    game_params *p;
    random_state *rs;
    char *desc, *aux = NULL, *out;
    const char *err;
    size_t n;

    if (i < 0 || i >= gamecount) return NULL;
    g = gamelist[i];

    p = g->default_params();
    if (params && *params) g->decode_params(p, params);
    err = g->validate_params(p, true);
    if (err) { g->free_params(p); return NULL; }

    rs = random_new((const char *)&seed, sizeof(seed));
    desc = g->new_desc(p, rs, &aux, false);
    random_free(rs);

    n = strlen(desc) + 64;
    out = snewn(n, char);
    { char *ps = g->encode_params(p, true);
      snprintf(out, n, "%s:%s", ps, desc); sfree(ps); }

    sfree(desc);
    if (aux) sfree(aux);
    g->free_params(p);
    return out;
}

/*
 * 🔴 ДОСКА ЕДИНЫМ ТЕКСТОМ — ключ ко всей коллекции.
 *
 * У каждой головоломки СВОЙ формат описания ("8x8dt:AEAddBAbjda..."), и разбирать
 * двадцать разных форматов на нашей стороне значило бы двадцать раз писать парсер.
 * Но у Тэтхэма есть общий вывод: `text_format` печатает доску простым ASCII.
 * Замер 10.09.2026: его реализуют 33 головоломки из 40. То есть ОДИН экспорт
 * закрывает почти всю коллекцию, и наша сторона рисует сетку, не зная про формат.
 *
 * Возвращает многострочный текст (у unruly — «0 1 . 1 …» построчно) либо NULL,
 * если головоломка текстом себя не показывает (`can_format_as_text_ever == false`).
 */
EMSCRIPTEN_KEEPALIVE char *psy_board(int i, const char *params, int seed)
{
    const game *g;
    game_params *p;
    random_state *rs;
    game_state *st;
    char *desc, *aux = NULL, *txt;
    const char *err;

    if (i < 0 || i >= gamecount) return NULL;
    g = gamelist[i];
    if (!g->can_format_as_text_ever || !g->text_format) return NULL;

    p = g->default_params();
    if (params && *params) g->decode_params(p, params);
    err = g->validate_params(p, true);
    if (err) { g->free_params(p); return NULL; }

    rs = random_new((const char *)&seed, sizeof(seed));
    desc = g->new_desc(p, rs, &aux, false);
    random_free(rs);

    st = g->new_game(NULL, p, desc);
    txt = g->text_format(st);

    g->free_game(st);
    sfree(desc);
    if (aux) sfree(aux);
    g->free_params(p);
    return txt;
}

/** Умеет ли головоломка показать себя текстом — чтобы наша сторона не гадала. */
EMSCRIPTEN_KEEPALIVE int psy_has_board(int i)
{
    if (i < 0 || i >= gamecount) return 0;
    return gamelist[i]->can_format_as_text_ever && gamelist[i]->text_format ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void psy_free(char *s) { if (s) sfree(s); }
