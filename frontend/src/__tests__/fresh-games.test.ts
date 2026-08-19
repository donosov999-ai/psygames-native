/**
 * ВИТРИНА «НОВИНКИ» НЕ ПРОТУХАЕТ И НЕ БЫВАЕТ ПУСТОЙ.
 *
 * 🔴 ЗАЧЕМ. Заказ Дениса: «сделать профиль (новое) и вгонять всё, что обновлено
 * существенно и сделаны новые упражнения». В каталоге 64 игры, и свежая работа
 * в нём тонет — человек её не находит и играет то же, что вчера.
 *
 * Главная опасность такого списка — протухание. Список, собранный руками один
 * раз, через три месяца показывает полугодовой давности работу и врёт своим же
 * названием. Поэтому здесь проверяется не «список непустой», а то, что отбор
 * идёт ПО ДАТАМ и что записи ссылаются на существующие игры.
 */
import { FRESH, FRESH_DAYS, FRESH_MIN, freshEntries, freshGameIds, todayISO } from '@/src/constants/freshGames';
import { GAMES } from '@/src/constants/games';
import { PROFILE_BY_ID } from '@/src/constants/profiles';

const IDS = new Set(GAMES.map((g) => g.id));

describe('реестр свежего', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FRESH.length).toBeGreaterThanOrEqual(FRESH_MIN);
    expect(GAMES.length).toBeGreaterThan(50);
  });

  /** Запись на несуществующую игру — это профиль, который её не покажет, и молча. */
  it('каждая запись ссылается на игру из каталога', () => {
    const bad = FRESH.filter((e) => !IDS.has(e.id)).map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('даты в правильном виде и не из будущего', () => {
    const today = todayISO();
    const bad: string[] = [];
    for (const e of FRESH) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.since)) bad.push(`${e.id}: дата «${e.since}» не в виде ГГГГ-ММ-ДД`);
      else if (e.since > today) bad.push(`${e.id}: дата ${e.since} из будущего`);
    }
    expect(bad).toEqual([]);
  });

  it('у каждой записи сказано, ради чего заходить — на двух языках', () => {
    const bad: string[] = [];
    for (const e of FRESH) {
      if (e.ru.trim().length < 25) bad.push(`${e.id}: русское описание слишком короткое`);
      if (e.en.trim().length < 25) bad.push(`${e.id}: английского описания нет или оно куцее`);
      if (e.ru === e.en) bad.push(`${e.id}: описание не переведено`);
    }
    expect(bad).toEqual([]);
  });

  it('одна игра не занимает витрину дважды', () => {
    const seen = new Set<string>();
    const dup = FRESH.filter((e) => (seen.has(e.id) ? true : (seen.add(e.id), false))).map((e) => e.id);
    expect(dup).toEqual([]);
  });

  describe('отбор по свежести', () => {
    /** 🔴 Ради этого всё и затевалось: старое обязано уходить само. */
    it('запись старше срока выпадает из витрины', () => {
      // ⚠️ Отсчитываем от САМОЙ НОВОЙ записи, а не от самой старой. Первая
      // редакция брала старую + срок, но к тому дню записи, сделанные на два
      // дня позже, ещё оставались свежими — тест краснел на исправном коде.
      const newest = [...FRESH].sort((a, b) => (a.since < b.since ? 1 : -1))[0];
      const [y, m, d] = newest.since.split('-').map(Number);
      const allStale = todayISO(new Date(Date.UTC(y, m - 1, d + FRESH_DAYS + 1)));
      // Ничего свежего не осталось — витрина держится только «минимумом».
      expect(freshGameIds(allStale).length).toBe(Math.min(FRESH_MIN, FRESH.length));

      // А за день до этого самая новая запись ещё в витрине.
      const justInTime = todayISO(new Date(Date.UTC(y, m - 1, d + FRESH_DAYS)));
      expect(freshGameIds(justInTime)).toContain(newest.id);
    });

    it('в день записи она в витрине', () => {
      for (const e of FRESH) expect(freshGameIds(e.since)).toContain(e.id);
    });

    /**
     * 🔴 ЧЕРЕЗ ГОДЫ ЗАТИШЬЯ ОСТАЁТСЯ РОВНО МИНИМУМ — НИ БОЛЬШЕ, НИ МЕНЬШЕ.
     *
     * Меньше — пустая витрина: карточка обещает игры, а по кнопке пусто.
     * Больше — «новинки» многолетней давности, то есть витрина врёт названием.
     *
     * ⚠️ Дата здесь АБСОЛЮТНАЯ и намеренно. Первая редакция отсчитывала от
     * `FRESH_DAYS`, и проверка выходила круговой: мутация «срок вечный»
     * (FRESH_DAYS = 99999) проходила мимо гейта, потому что вместе со сроком
     * уезжал и день замера.
     */
    it('через годы затишья в витрине остаётся ровно минимум', () => {
      expect(freshGameIds('2099-01-01').length).toBe(Math.min(FRESH_MIN, FRESH.length));
    });

    /** Окно в разумных пределах: месяц — слишком дёргано, полгода — уже не «новинки». */
    it('срок свежести — от месяца до полугода', () => {
      expect(FRESH_DAYS).toBeGreaterThanOrEqual(30);
      expect(FRESH_DAYS).toBeLessThanOrEqual(180);
    });

    it('порядок — от новых к старым', () => {
      const dates = freshEntries('2026-08-19').map((e) => e.since);
      expect([...dates].sort().reverse()).toEqual(dates);
    });
  });

  describe('профиль «Новинки»', () => {
    const p = PROFILE_BY_ID['whatsnew'];

    it('существует и не продаётся', () => {
      expect(p).toBeTruthy();
      expect(p.tier).toBe('owner');
      expect(p.price_year).toBeUndefined();   // витрина меняется каждый релиз — продавать её нечестно
    });

    it('состав берётся из реестра, а не зашит рядом', () => {
      expect(p.allowed_games).not.toBe('all');
      const ids = p.allowed_games as string[];
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(IDS.has(id)).toBe(true);
    });

    /** Зарядка тянет 33 игры; без фильтра по профилю она стала бы чёрным ходом. */
    it('зарядка включена — значит фильтр по профилю обязан её удержать', () => {
      expect(p.warmup_enabled).toBe(true);
      expect(Array.isArray(p.allowed_games)).toBe(true);
    });
  });
});
