/* psygames-profile-visibility · VER 1 · 20.08.2026 */
/**
 * ЗАВЕДЁННЫЙ ПРОФИЛЬ ОБЯЗАН БЫТЬ ВИДЕН — ИЛИ СПРЯТАН НАРОЧНО, С ПРИЧИНОЙ.
 *
 * 🔴 ЧТО БЫЛО. Профиль «Новинки» завели полностью: название, описание на двух
 * языках, состав, который сам считается по датам, запись в каталоге. И он не
 * показывался НИКОМУ: свитчер прятал его фильтром `tier !== 'owner'`, а `owner`
 * ему поставили, желая сказать «не продаётся». Слово значило другое.
 *
 * Молчаливое исчезновение — худший вид поломки: всё написано, всё переведено,
 * гейты зелены, а работы не видно. Поэтому здесь проверяется не разметка экрана,
 * а ПРАВИЛО, вынесенное из неё, и проверяется исполнением.
 */
import { PROFILES, isSwitchable, HIDDEN_FROM_SWITCHER, PROFILE_BY_ID } from '@/src/constants/profiles';
import { translateFor } from '@/src/contexts/LanguageContext';

describe('видимость профилей в выборе', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(PROFILES.length).toBeGreaterThan(8);
  });

  it('🔴 каждый профиль либо виден, либо спрятан нарочно и с причиной', () => {
    const silent = PROFILES
      .filter((p) => !isSwitchable(p) && !HIDDEN_FROM_SWITCHER[p.id])
      .map((p) => `${p.id}: не показывается и не объяснён — исчез молча`);
    expect(silent).toEqual([]);
  });

  it('каждая причина настоящая, а не отписка', () => {
    for (const [id, why] of Object.entries(HIDDEN_FROM_SWITCHER)) {
      expect(`${id} существует: ${!!PROFILE_BY_ID[id as never]}`).toBe(`${id} существует: true`);
      expect(why.length).toBeGreaterThan(30);
    }
  });

  it('в списке скрытых нет тех, кто на самом деле виден', () => {
    const stale = Object.keys(HIDDEN_FROM_SWITCHER)
      .filter((id) => { const p = PROFILE_BY_ID[id as never]; return p && isSwitchable(p); })
      .map((id) => `${id}: показывается, но числится скрытым`);
    expect(stale).toEqual([]);
  });

  /** Та самая витрина, ради которой всё и чинилось. */
  it('🔴 «Новинки» показываются в выборе', () => {
    const wn = PROFILE_BY_ID['whatsnew' as never];
    expect(`профиль есть: ${!!wn}`).toBe('профиль есть: true');
    expect(`виден: ${isSwitchable(wn)}`).toBe('виден: true');
  });

  /**
   * 🔴 У ВИДИМОГО ПРОФИЛЯ ОБЯЗАНЫ БЫТЬ ПОДПИСИ. Свитчер зовёт их как
   * `t('profileName_' + id)`, и отсутствующий ключ человек видит на карточке
   * сырым: «profileName_whatsnew». Ровно это и случилось, когда витрину
   * показали, — ключи никто не заводил, потому что раньше её никто не
   * запрашивал. Проверка нужна именно здесь: гейт словаря ловит битые вызовы
   * по коду, а этот вызов собирается из строки на лету и в код не попадает.
   */
  it('🔴 у каждого видимого профиля есть название и описание в словаре', () => {
    const missing: string[] = [];
    for (const p of PROFILES) {
      if (!isSwitchable(p)) continue;
      for (const key of [`profileName_${p.id}`, `profileDesc_${p.id}`]) {
        // Спрашиваем ровно то, что увидит человек: перевод, а не наличие ключа
        // в каком-то объекте. Вернулся сам ключ — значит на карточке будет он.
        const shown = translateFor('ru', key);
        if (!shown || shown === key) missing.push(`${p.id}: ${key} не переведён — человек увидит имя ключа`);
      }
    }
    expect(missing).toEqual([]);
  });

  /** Витрина не продаётся: у неё не может быть цены. */
  it('витрина не продаётся — цены у неё нет', () => {
    const showcase = PROFILES.filter((p) => p.tier === 'showcase');
    expect(showcase.length).toBeGreaterThan(0);
    for (const p of showcase) {
      expect(`${p.id} без цены: ${!(p as any).price && !(p as any).price_year}`).toBe(`${p.id} без цены: true`);
    }
  });
});
