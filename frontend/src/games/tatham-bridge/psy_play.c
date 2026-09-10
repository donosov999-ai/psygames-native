/* psygames-tatham-play · VER 1 · 10.09.2026
 *
 * ИГРАБЕЛЬНЫЙ СЛОЙ: одна реализация — все сорок головоломок.
 *
 * 🔴 ПОЧЕМУ НЕ ЧЕРЕЗ text_format. Замер 10.09.2026: ровную сетку из 20 движков даёт
 * ОДИН (Unruly). Остальные печатают человекочитаемый дамп с рамками псевдографики и
 * разной шириной строк — Tents 19 строк ширины 1/19/17, Loopy 21 строка семи разных
 * ширин. Разбирать это значило бы писать по парсеру на головоломку.
 *
 * 🟢 ЧТО ВМЕСТО. Тэтхэм рисует ВСЁ через один слой `drawing_api` — семью примитивами:
 * прямоугольник, линия, толстая линия, круг, многоугольник, текст, обрезка. Мы даём ему
 * реализацию, которая не рисует, а ЗАПИСЫВАЕТ вызовы текстом. Получается вектор доски,
 * одинаковый по форме для всех сорока, включая Keen и Map, которые текстом себя не
 * показывают вовсе. Рисуем этот вектор своими компонентами — каркас, цвета и шрифты наши.
 *
 * Ввод — его же: `midend_process_key(me, x, y, LEFT_BUTTON)`. Нажатие уходит в движок
 * по координатам, он двигает партию и перерисовывает. Правила писать не нужно ни одни.
 *
 * Основано на Simon Tatham's Portable Puzzle Collection, MIT (файл LICENCE в каноне).
 * Copyright (c) 2004-2024 Simon Tatham и соавторы — полный список в README.
 */
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <stdlib.h>
#include <emscripten.h>
#include "puzzles.h"

/* ── растущий буфер записи ─────────────────────────────────────────────── */
static char *БУФ = NULL;
static size_t длина = 0, ёмкость = 0;

static void пиши(const char *fmt, ...)
{
    va_list ap; int n;
    char кусок[1024];
    va_start(ap, fmt);
    n = vsnprintf(кусок, sizeof кусок, fmt, ap);
    va_end(ap);
    if (n < 0) return;
    if (длина + (size_t)n + 2 > ёмкость) {
        ёмкость = (длина + (size_t)n + 2) * 2;
        БУФ = sresize(БУФ, ёмкость, char);
    }
    memcpy(БУФ + длина, кусок, (size_t)n);
    длина += (size_t)n;
    БУФ[длина++] = '\n';
    БУФ[длина] = '\0';
}

/* Текст экранируем: он уходит одной строкой, перевод строки внутри сломал бы разбор. */
static void пишиТекст(int x, int y, int size, int align, int colour, const char *s)
{
    char чисто[256]; size_t i = 0;
    for (; s && *s && i + 1 < sizeof чисто; s++) {
        if (*s == '\n' || *s == '\r') continue;
        чисто[i++] = *s;
    }
    чисто[i] = '\0';
    пиши("T %d %d %d %d %d %s", x, y, size, align, colour, чисто);
}

/* ── реализация рисования: не рисует, а записывает ─────────────────────── */
static void п_text(drawing *dr, int x, int y, int ft, int fs, int al, int c, const char *t)
{ (void)dr; (void)ft; пишиТекст(x, y, fs, al, c, t); }
static void п_rect(drawing *dr, int x, int y, int w, int h, int c)
{ (void)dr; пиши("R %d %d %d %d %d", x, y, w, h, c); }
static void п_line(drawing *dr, int x1, int y1, int x2, int y2, int c)
{ (void)dr; пиши("L %d %d %d %d %d", x1, y1, x2, y2, c); }
static void п_poly(drawing *dr, const int *co, int n, int fill, int outline)
{
    int i; char s[900]; size_t k = 0;
    (void)dr;
    for (i = 0; i < n && k + 16 < sizeof s; i++)
        k += (size_t)snprintf(s + k, sizeof s - k, "%s%d %d", i ? " " : "", co[2*i], co[2*i+1]);
    s[k] = '\0';
    пиши("P %d %d %d %s", fill, outline, n, s);
}
static void п_circle(drawing *dr, int cx, int cy, int r, int fill, int outline)
{ (void)dr; пиши("C %d %d %d %d %d", cx, cy, r, fill, outline); }
static void п_thick(drawing *dr, float th, float x1, float y1, float x2, float y2, int c)
{ (void)dr; пиши("W %d %d %d %d %d %d", (int)(th*100), (int)x1, (int)y1, (int)x2, (int)y2, c); }
static void п_clip(drawing *dr, int x, int y, int w, int h)
{ (void)dr; пиши("K %d %d %d %d", x, y, w, h); }
static void п_unclip(drawing *dr) { (void)dr; пиши("U"); }
static void п_update(drawing *dr, int x, int y, int w, int h)
{ (void)dr; (void)x; (void)y; (void)w; (void)h; }
static void п_start(drawing *dr) { (void)dr; }
static void п_end(drawing *dr) { (void)dr; }
static void п_status(drawing *dr, const char *t) { (void)dr; пишиТекст(-1, -1, 0, 0, -1, t); }
static void п_lw(drawing *dr, float w) { (void)dr; пиши("N %d", (int)(w*100)); }
static void п_dot(drawing *dr, bool d) { (void)dr; пиши("D %d", d ? 1 : 0); }

/* Блиттеры (сохранение куска экрана) головоломкам нужны только для анимации перетаскивания.
 * Мы перерисовываем целиком на каждое нажатие, поэтому они заглушены. */
static blitter *п_bl_new(drawing *dr, int w, int h) { (void)dr; (void)w; (void)h; return NULL; }
static void п_bl_free(drawing *dr, blitter *b) { (void)dr; (void)b; }
static void п_bl_save(drawing *dr, blitter *b, int x, int y) { (void)dr; (void)b; (void)x; (void)y; }
static void п_bl_load(drawing *dr, blitter *b, int x, int y) { (void)dr; (void)b; (void)x; (void)y; }

static const drawing_api ЗАПИСЬ = {
    1,
    п_text, п_rect, п_line, п_poly, п_circle, п_update, п_clip, п_unclip,
    п_start, п_end, п_status,
    п_bl_new, п_bl_free, п_bl_save, п_bl_load,
    NULL, NULL, NULL, NULL, NULL, NULL,     /* печать в документ не нужна */
    п_lw, п_dot, NULL, п_thick,
};

/** Описание доски по нашему зерну — отдельно, чтобы не дублировать в двух местах. */
static char *g_new_desc(const game *g, game_params *p, random_state *rs, char **aux)
{ return g->new_desc(p, rs, aux, false); }

/* ── партия ────────────────────────────────────────────────────────────── */
static midend *ПАРТИЯ = NULL;
static int ШИР = 0, ВЫС = 0;

/*
 * 🔴 РАЗМЕР ЗАДАЁТСЯ ДО ПЕРВОЙ ОТРИСОВКИ, И В НЕГО НАДО ПЕРЕДАТЬ ДОСТУПНОЕ МЕСТО.
 * `midend_size(me, &x, &y, ...)` читает x/y КАК ВХОД — сколько места есть, — и
 * переписывает их натуральным размером доски. Я сперва передал нули, и он честно
 * посчитал минимум: 9×9 «пикселей» вместо доски, а рисование вышло пустым.
 * Его собственный веб-фронтенд (emcc.c:240) передаёт INT_MAX. Делаем так же.
 */
static void размерить(void)
{
    ШИР = ВЫС = 1 << 20;
    if (ПАРТИЯ) midend_size(ПАРТИЯ, &ШИР, &ВЫС, false, 1.0);
}

/** Открыть головоломку: движок, строка параметров ступени, зерно. */
EMSCRIPTEN_KEEPALIVE int psy_open(int i, const char *params, int seed)
{
    game_params *p;
    if (i < 0 || i >= gamecount) return 0;
    if (ПАРТИЯ) { midend_free(ПАРТИЯ); ПАРТИЯ = NULL; }
    ПАРТИЯ = midend_new(NULL, gamelist[i], &ЗАПИСЬ, NULL);
    p = gamelist[i]->default_params();
    if (params && *params) gamelist[i]->decode_params(p, params);
    midend_set_params(ПАРТИЯ, p);

    /*
     * 🔴 ЗЕРНО ЗАДАЁТСЯ ОПИСАНИЕМ ДОСКИ, А НЕ НАСТРОЙКОЙ СЛУЧАЙНОСТИ.
     * `midend_set_random_seed` в его API НЕТ (проверено grep-ом по puzzles.h): зерно
     * midend берёт из `get_random_seed()` фронтенда, а у заглушки `nullfe.c` оно
     * постоянное. Поэтому доску генерируем сами по нашему зерну и подаём готовой
     * строкой «параметры:описание» через `midend_game_id` — тот самый формат, которым
     * он делится партией по ссылке. Так партия воспроизводится по номеру у всех.
     */
    {
        random_state *rs = random_new((const char *)&seed, sizeof(seed));
        char *aux = NULL, *desc = g_new_desc(gamelist[i], p, rs, &aux);
        char *ps = gamelist[i]->encode_params(p, true);
        size_t n = strlen(ps) + strlen(desc) + 2;
        char *id = snewn(n, char);
        snprintf(id, n, "%s:%s", ps, desc);
        random_free(rs);
        midend_game_id(ПАРТИЯ, id);
        sfree(id); sfree(ps); sfree(desc);
        if (aux) sfree(aux);
    }
    gamelist[i]->free_params(p);
    midend_new_game(ПАРТИЯ);
    размерить();
    return 1;
}

/** Размер поля в его координатах — по нему считаем масштаб на экране. */
EMSCRIPTEN_KEEPALIVE int psy_width(void)  { return ШИР; }
EMSCRIPTEN_KEEPALIVE int psy_height(void) { return ВЫС; }

/** Палитра автора: тройки RGB через пробел. Цвета его, применяем по своему усмотрению. */
EMSCRIPTEN_KEEPALIVE char *psy_colours(void)
{
    int n = 0, k; float *c; char *out; size_t k2 = 0, cap;
    if (!ПАРТИЯ) return NULL;
    c = midend_colours(ПАРТИЯ, &n);
    cap = (size_t)n * 14 + 8;
    out = snewn(cap, char);
    for (k = 0; k < n; k++)
        k2 += (size_t)snprintf(out + k2, cap - k2, "%s%d,%d,%d", k ? " " : "",
                               (int)(c[k*3]*255), (int)(c[k*3+1]*255), (int)(c[k*3+2]*255));
    return out;
}

/** Нарисовать партию: вернуть список примитивов строками. */
EMSCRIPTEN_KEEPALIVE char *psy_draw(void)
{
    if (!ПАРТИЯ) return NULL;
    длина = 0; if (БУФ) БУФ[0] = '\0';
    midend_force_redraw(ПАРТИЯ);
    return dupstr(БУФ ? БУФ : "");
}

/** Нажатие по координатам его поля. Кнопка: 0 — левая, 1 — правая. */
EMSCRIPTEN_KEEPALIVE int psy_click(int x, int y, int right)
{
    if (!ПАРТИЯ) return 0;
    return midend_process_key(ПАРТИЯ, x, y, right ? RIGHT_BUTTON : LEFT_BUTTON);
}

/** Клавиша (цифры для судоку и кенкена, стрелки, пробел). */
EMSCRIPTEN_KEEPALIVE int psy_key(int code)
{ return ПАРТИЯ ? midend_process_key(ПАРТИЯ, -1, -1, code) : 0; }

/** +1 решено, -1 проиграно, 0 идёт. */
EMSCRIPTEN_KEEPALIVE int psy_status(void) { return ПАРТИЯ ? midend_status(ПАРТИЯ) : 0; }
EMSCRIPTEN_KEEPALIVE int psy_undo(void) { return ПАРТИЯ && midend_can_undo(ПАРТИЯ) ? midend_process_key(ПАРТИЯ, -1, -1, 'u') : 0; }
EMSCRIPTEN_KEEPALIVE int psy_redo(void) { return ПАРТИЯ && midend_can_redo(ПАРТИЯ) ? midend_process_key(ПАРТИЯ, -1, -1, 'r') : 0; }

/** Подсказка: его же решатель докладывает партию до конца. */
EMSCRIPTEN_KEEPALIVE int psy_solve(void) { return ПАРТИЯ && midend_solve(ПАРТИЯ) == NULL ? 1 : 0; }
