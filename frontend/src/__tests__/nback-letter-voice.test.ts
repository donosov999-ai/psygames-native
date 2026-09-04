/**
 * БУКВЫ N-BACK ЧИТАЕТ ЖИВОЙ ГОЛОС, И ОНИ УКЛАДЫВАЮТСЯ В ОКНО ПРОБЫ.
 *
 * 🔴 ЗАЧЕМ. Слуховой поток двойного n-back до 04.09.2026 читал системный голос:
 * он звучит по-разному на каждом устройстве, а на части телефонов английского
 * голоса нет вовсе — тогда второй поток просто молчит, и проба превращается в
 * одиночную, не сказав об этом.
 *
 * ⚠️ ГЛАВНОЕ ЗДЕСЬ — НЕ «ЕСТЬ ЛИ ФАЙЛ», А ДЛИТЕЛЬНОСТЬ. Окно пробы в двойном
 * режиме 1800 мс: показ 700 плюс пауза 1100. Запись длиннее играет поверх
 * СЛЕДУЮЩЕГО стимула, человек слышит две буквы разом, и d′ считается по
 * испорченным данным — при том, что экран выглядит исправным. Первый заход взял
 * для `Q` австралийское «queue» на 1,63 с, то есть почти всё окно; выбор по
 * длительности из четырёх вариантов дал 0,53 с.
 */
import { LETTER_VOICE, LETTER_VOICE_SEC, LETTER_VOICE_CREDITS } from '@/src/constants/letterVoice.generated';
import { letterVoiceUrl } from '@/src/services/voiceSamples';

declare function require(m: string): any;
declare const __dirname: string;

/** Те же десять согласных, что берёт игра. */
const БУКВЫ = ['B', 'D', 'F', 'H', 'K', 'L', 'M', 'Q', 'R', 'T'];
/** Окно пробы в двойном режиме: показ 700 + пауза 1100. */
const ОКНО_МС = 1800;

describe('n-back: живые буквы', () => {
  it('🔴 запись есть у каждой из десяти букв', () => {
    const нет = БУКВЫ.filter((b) => !LETTER_VOICE[b]);
    expect(нет).toEqual([]);
  });

  it('🔴 адрес ведёт на сайт, а не в бандл', () => {
    const url = letterVoiceUrl('B');
    expect(url).toMatch(/^https:\/\/psy-games\.pro\/voice-live\/letters\/[0-9a-f]{16}\.opus$/);
  });

  it('🔴 неизвестная буква не выдумывает адрес — падаем на синтез', () => {
    expect(letterVoiceUrl('Z')).toBeNull();
    expect(letterVoiceUrl('')).toBeNull();
  });

  it('🔴 каждая запись короче окна пробы, иначе буквы наложатся', () => {
    // ⚠️ длительности берём из УКАЗАТЕЛЯ, а не из credits.json рядом с файлами:
    // папка voice-wiktionary не коммитится, и такой гейт зеленел бы локально и
    // падал в CI — то есть проверял бы наличие файла на машине, а не свойство.
    const плохие = Object.entries(LETTER_VOICE_SEC)
      .filter(([, сек]) => сек * 1000 >= ОКНО_МС)
      .map(([б, сек]) => `${б} ${сек}с`);
    expect(плохие).toEqual([]);
    // и с запасом: имя буквы — доли секунды, не секунды
    const самая = Math.max(...Object.values(LETTER_VOICE_SEC));
    expect(`самая длинная буква ${самая}с короче секунды: ${самая < 1.0}`)
      .toBe(`самая длинная буква ${самая}с короче секунды: true`);
    // и у каждой буквы указателя есть замер, иначе проверка слепа
    expect(Object.keys(LETTER_VOICE).sort()).toEqual(Object.keys(LETTER_VOICE_SEC).sort());
  });

  it('🔴 авторы записей не пусты: лицензии требуют их назвать', () => {
    expect(LETTER_VOICE_CREDITS.length).toBeGreaterThan(0);
    expect(LETTER_VOICE_CREDITS.filter((к) => !к.author || !к.license)).toEqual([]);
  });

  it('🔴 игра зовёт живой вход, а не синтез напрямую', () => {
    const fs = require('fs');
    const path = require('path');
    const экран: string = fs.readFileSync(path.join(__dirname, '../../app/games/n-back.tsx'), 'utf8');
    expect(экран).toContain('speakLetterName');
    expect(экран).not.toMatch(/speak\(letter, 'en'/);
  });
});
