/* psygames-tatham-bridge-play · VER 2 · 10.09.2026
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
/*
 * 🔴 БЛИТТЕР ОБЯЗАН БЫТЬ НЕ NULL, ХОТЯ И НЕ ХРАНИТ ПИКСЕЛЕЙ. Шесть головоломок канона
 * (galaxies, guess, inertia, map, pegs, signpost) заводят блиттер под фон движущейся
 * фигуры и ПРОВЕРЯЮТ его утверждением: `assert(ds->player_background)` в
 * `inertia.c:2132` уронил всю сборку, когда `blitter_new` отдавал NULL.
 * Пикселей мы не сохраняем и не обязаны: каждый снимок доски — полная перерисовка
 * (`midend_force_redraw`), поэтому «вернуть кусок фона» нечего восстанавливать, а
 * ложный NULL — единственное, чего движок не переживёт. Ручка настоящая, размеры
 * хранятся: если появится частичная отрисовка, тут будет что расширять.
 */
struct blitter { int w, h; };
static blitter *п_bl_new(drawing *dr, int w, int h) {
    blitter *b = snew(blitter); (void)dr; b->w = w; b->h = h; return b;
}
static void п_bl_free(drawing *dr, blitter *b) { (void)dr; sfree(b); }
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

/* ── партия ────────────────────────────────────────────────────────────── */
static midend *ПАРТИЯ = NULL;
static int ШИР = 0, ВЫС = 0;
/** Был ли ход с прошлой отрисовки — см. `доиграть()`: анимацию надо докрутить. */
static int ХОД_БЫЛ = 0;

/**
 * Пометить ход и вернуть ответ движка как есть. `PKR_SOME_EFFECT` — единственный
 * ответ, означающий «состояние изменилось» (`puzzles.h:324`); на `PKR_NO_EFFECT`
 * и `PKR_UNUSED` анимации нет и крутить нечего.
 */
static int ход(int ответ) { if (ответ == PKR_SOME_EFFECT) ХОД_БЫЛ = 1; return ответ; }

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
     * 🔴 ЗЕРНО ПОДАЁТСЯ ЧЕРЕЗ «параметры#зерно», А НЕ ГОТОВЫМ ОПИСАНИЕМ ДОСКИ.
     * `midend_set_random_seed` в его API НЕТ (проверено grep-ом по puzzles.h): зерно
     * midend берёт из `get_random_seed()` фронтенда, а у заглушки `nullfe.c` оно
     * постоянное. Зато `midend_game_id` понимает ДВА вида идентификатора
     * (`midend.c:1795` — ищет `#` и `:`), и вид с решёткой заставляет midend
     * сгенерировать доску САМОМУ по нашему зерну. Партия так же воспроизводится
     * по номеру, как и с описанием.
     *
     * 🔴 ПОЧЕМУ НЕ ОПИСАНИЕМ, КАК БЫЛО. Вместе с доской автор рождает `aux` —
     * подсказку решателю, и хранит её в `me->aux_info` (`midend.c:601`). Через
     * «параметры:описание» aux не передаётся: `midend_game_id` обнуляет его
     * (`midend.c:590`), потому что из описания доски его не восстановить. Мы
     * генерировали доску сами, получали aux в руки — и тут же выбрасывали.
     *
     * ЧЕМ ЭТО МЕРИЛОСЬ. `psy_solve` → `psy_draw` по всем сорока 10.09.2026:
     * у Untangle и Netslide рисунок после решения не менялся НИ НА ОДИН примитив,
     * `midend_solve` возвращал ошибку. Их `solve_game` начинается с `if (!aux)`
     * (`untangle.c:1001`, `netslide.c:894`) — без aux решения «не известно».
     * Денис 10.09.2026 прислал ровно Untangle: запутанный граф и его же решение.
     * Кнопка у нас показывалась и не делала ничего.
     *
     * ⚠️ Побочно меняется и флаг `interactive`: свой вызов передавал `false`,
     * midend передаёт `me->drawing != NULL`, а рисование у нас задано — значит
     * `true`. Это верное значение: доска именно интерактивная.
     */
    {
        char *ps = gamelist[i]->encode_params(p, true);
        size_t n = strlen(ps) + 16;
        char *id = snewn(n, char);
        snprintf(id, n, "%s#%d", ps, seed);
        midend_game_id(ПАРТИЯ, id);
        sfree(id); sfree(ps);
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
/*
 * 🔴 ХОД С АНИМАЦИЕЙ РИСУЕТСЯ В СОСТОЯНИИ «ДО», ПОКА АНИМАЦИЮ НЕ ДОИГРАТЬ.
 *
 * `midend_redraw` рисует ПРОМЕЖУТОЧНЫЙ кадр: старое состояние, новое и доля
 * `anim_pos / anim_time`. Пока время не сдвинули, доля равна нулю — то есть на
 * экране ровно то, что было до хода. Двигает время только `midend_timer`, а
 * таймеры у нас заглушены (`psy_fe.c`): перерисовываем целиком на каждое
 * действие, промежуточные кадры не нужны. Нужен ПОСЛЕДНИЙ.
 *
 * ЗАМЕР 10.09.2026, `psy_solve` → `psy_draw` по всем сорока: у Untangle рисунок
 * после решения не менялся ни на один примитив из 29, хотя статус становился
 * «победа». Его `game_anim_length` на ход-решение возвращает не ноль — узлы
 * должны переехать в правильные места за время анимации.
 *
 * Поэтому перед рисованием доигрываем: две секунды с запасом перекрывают любую
 * анимацию коллекции (самая длинная у автора — полсекунды).
 *
 * ⚠️ ЦЕНА. `midend_timer` заодно двигает `me->elapsed` у игр с часами (Mines и
 * прочие `is_timed`) — на те же две секунды за ход. Часы автора мы не читаем и
 * не показываем: его строку состояния (`T -1 -1 …`) наша сторона отбрасывает.
 * Если часы когда-нибудь понадобятся — здесь нужен будет точный остаток
 * анимации, а его midend наружу не отдаёт.
 */
static void доиграть(void)
{
    if (ХОД_БЫЛ) { midend_timer(ПАРТИЯ, 2.0f); ХОД_БЫЛ = 0; }
}

EMSCRIPTEN_KEEPALIVE char *psy_draw(void)
{
    if (!ПАРТИЯ) return NULL;
    доиграть();
    длина = 0; if (БУФ) БУФ[0] = '\0';
    midend_force_redraw(ПАРТИЯ);
    return dupstr(БУФ ? БУФ : "");
}

/** Нажатие по координатам его поля. Кнопка: 0 — левая, 1 — правая. */
EMSCRIPTEN_KEEPALIVE int psy_click(int x, int y, int right)
{
    if (!ПАРТИЯ) return 0;
    return ход(midend_process_key(ПАРТИЯ, x, y, right ? RIGHT_BUTTON : LEFT_BUTTON));
}

/*
 * 🔴 ПОЛНЫЙ ЖЕСТ, А НЕ ОДНО КАСАНИЕ. Замер 10.09.2026 по всем сорока: одиночного
 * нажатия хватает большинству, но пятерым — нет, и они молча ничего не делают.
 * Untangle тащит узел, Pegs переносит колышек, Rectangles растягивает прямоугольник,
 * Loopy и Slant позволяют вести линию протяжкой. Всем им нужны ТРИ события подряд:
 * нажал — ведёт — отпустил. Так устроены и все родные оболочки автора.
 *
 * `вид`: 0 нажал левой · 1 ведёт левой · 2 отпустил левой · 3..5 — то же правой.
 * Значения кнопок идут в enum подряд (`puzzles.h:32`), поэтому шаг считается, а не
 * перечисляется: LEFT_BUTTON+вид даёт ровно нужное событие. Порядок enum'а закреплён
 * проверками ниже — если автор его переставит, сборка встанет здесь, а не в игре.
 */
EMSCRIPTEN_KEEPALIVE int psy_pointer(int x, int y, int вид)
{
    static const int КНОПКА[6] = {
        LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE,
        RIGHT_BUTTON, RIGHT_DRAG, RIGHT_RELEASE,
    };
    if (!ПАРТИЯ || вид < 0 || вид > 5) return 0;
    return ход(midend_process_key(ПАРТИЯ, x, y, КНОПКА[вид]));
}

/*
 * СТРЕЛКА. Двум режимам из сорока (Cube и Inertia) нажимать по доске нечего: их
 * `interpret_move` читает только CURSOR_*. Коды берутся ЗДЕСЬ, из его же enum, а не
 * переписываются числами в TypeScript: переставит автор enum — поедет одно место.
 * `сторона`: 0 вверх · 1 вниз · 2 влево · 3 вправо.
 */
EMSCRIPTEN_KEEPALIVE int psy_cursor(int сторона)
{
    static const int КОД[4] = { CURSOR_UP, CURSOR_DOWN, CURSOR_LEFT, CURSOR_RIGHT };
    if (!ПАРТИЯ || сторона < 0 || сторона > 3) return 0;
    return ход(midend_process_key(ПАРТИЯ, -1, -1, КОД[сторона]));
}

/** Клавиша (цифры для судоку и кенкена, стрелки, пробел). */
EMSCRIPTEN_KEEPALIVE int psy_key(int code)
{ return ПАРТИЯ ? ход(midend_process_key(ПАРТИЯ, -1, -1, code)) : 0; }

/** +1 решено, -1 проиграно, 0 идёт. */
EMSCRIPTEN_KEEPALIVE int psy_status(void) { return ПАРТИЯ ? midend_status(ПАРТИЯ) : 0; }
EMSCRIPTEN_KEEPALIVE int psy_undo(void) { return ПАРТИЯ && midend_can_undo(ПАРТИЯ) ? ход(midend_process_key(ПАРТИЯ, -1, -1, 'u')) : 0; }
EMSCRIPTEN_KEEPALIVE int psy_redo(void) { return ПАРТИЯ && midend_can_redo(ПАРТИЯ) ? ход(midend_process_key(ПАРТИЯ, -1, -1, 'r')) : 0; }

/** Подсказка: его же решатель докладывает партию до конца. */
EMSCRIPTEN_KEEPALIVE int psy_solve(void)
{
    if (!ПАРТИЯ || midend_solve(ПАРТИЯ) != NULL) return 0;
    ХОД_БЫЛ = 1;                 /* решение почти везде приезжает с анимацией */
    return 1;
}
