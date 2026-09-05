/* psygames-digit-span-i18n · VER 1 · 23.08.2026 */
/**
 * СЛОВАРЬ «ЦИФРОВОГО РЯДА» — ДВЕНАДЦАТЬ ЯЗЫКОВ, А НЕ ДВА.
 *
 * ⚠️ ПОЧЕМУ НОВЫЕ ПОДПИСИ ЖИВУТ ЗДЕСЬ, А НЕ В ОБЩЕМ СЛОВАРЕ. Базовые `ru`/`en`
 * лежат ИНЛАЙНОМ в `src/contexts/LanguageContext.tsx`, а `src/contexts/
 * translations/*.ts` — это только десять оверлеев поверх базы. Ключ, заведённый
 * в оверлеях без базы, для `ru` и `en` вернул бы САМО ИМЯ КЛЮЧА
 * («deliveryVoice» на экране) — ровно та мёртвая разметка, которую ловит
 * `dictionary-duplicates`. Общий словарь сейчас правят соседние заходы, поэтому
 * подписи заведены рядом с игрой и сразу на все двенадцать языков — так же, как
 * это сделано у «Соедини точки» (`src/games/dots-connect/core/i18n.ts`).
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Подписей ЧИСЕЛ В ШАПКЕ партии («Охват», «Личный
 * рекорд») здесь нет нарочно: гейт `hud-labels` засчитывает подпись у числа,
 * только если слово пришло из `t('…')`, и у соседних игр охвата (`corsi`,
 * `spatial-span`) в шапке стоит ровно `t('hud_span')`. Заводить второе слово о
 * том же значило бы разойтись с соседями и обмануть гейт заодно.
 *
 * ⚠️ НИ ОДНОЙ МЁРТВОЙ СТРОКИ. Строка, переведённая на двенадцать языков и не
 * выведенная ни разу, — не запас, а ложное «переведено». За этим следит
 * `digit-span-modes.test.ts`: каждый ключ обязан вызываться в коде игры.
 */

/** Языки собственного словаря модуля — список совпадает с `Language` приложения. */
export type DigitSpanLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

export interface DigitSpanStrings {
  /** Третий классический режим: ряд вводится отсортированным по возрастанию (BACS Digit Sequencing). */
  directionAscending: string;
  /** Строка «что делать» на поле ввода для режима по возрастанию. */
  typeAscending: string;
  /** Заголовок карточки выбора подачи стимула. */
  deliveryLabel: string;
  /** Подача: цифры видно на экране. */
  deliveryScreen: string;
  /** Подача: цифры звучат голосом системы. */
  deliveryVoice: string;
  /** Весь ряд разом — просьба тестировщицы 05.09.2026. */
  deliveryAll: string;
  /** Что написано на поле, пока цифры звучат (смотреть не на что). */
  listening: string;
  /**
   * Честная заглушка: голоса в системе нет. НЕ молчать беззвучно — сказать
   * причину и что будет вместо озвучки (требование шапки `src/services/tts.ts`).
   */
  voiceNoVoice: string;
  /** Честная заглушка: звук выключен самим человеком — лечится тумблером, а не голосом. */
  voiceSoundOff: string;
  /** Заголовок карточки темпа показа (только свободная партия). */
  paceLabel: string;
  paceSlow: string;
  paceNormal: string;
  paceFast: string;
  /** Почему темп даётся только здесь: в игре по уровням его задаёт уровень. */
  paceLevelNote: string;
}

const STRINGS: Record<DigitSpanLocale, DigitSpanStrings> = {
  ru: {
    directionAscending: 'По возрастанию',
    typeAscending: 'Введите цифры по возрастанию',
    deliveryLabel: 'Подача цифр',
    deliveryScreen: 'На экране',
    deliveryVoice: 'Голосом',
    deliveryAll: 'Все сразу',
    listening: 'Слушайте цифры',
    voiceNoVoice: 'Голоса нет в системе — цифры покажем на экране.',
    voiceSoundOff: 'Звук выключен — цифры покажем на экране. Включите звук в настройках.',
    paceLabel: 'Темп показа',
    paceSlow: 'Медленно',
    paceNormal: 'Обычный',
    paceFast: 'Быстро',
    paceLevelNote: 'Темп меняется только в свободной партии: в игре по уровням его задаёт уровень, иначе охваты несравнимы.',
  },
  en: {
    directionAscending: 'Ascending order',
    typeAscending: 'Type the digits in ascending order',
    deliveryLabel: 'How digits are presented',
    deliveryScreen: 'On screen',
    deliveryVoice: 'By voice',
    deliveryAll: 'All at once',
    listening: 'Listen to the digits',
    voiceNoVoice: 'No voice on this device — the digits will be shown on screen.',
    voiceSoundOff: 'Sound is off — the digits will be shown on screen. Turn sound on in settings.',
    paceLabel: 'Presentation pace',
    paceSlow: 'Slow',
    paceNormal: 'Normal',
    paceFast: 'Fast',
    paceLevelNote: 'Pace can be changed only in a free round: on the level ladder the level sets it, otherwise spans are not comparable.',
  },
  es: {
    directionAscending: 'Orden ascendente',
    typeAscending: 'Escribe las cifras de menor a mayor',
    deliveryLabel: 'Presentación de las cifras',
    deliveryScreen: 'En pantalla',
    deliveryVoice: 'Por voz',
    deliveryAll: 'Todos a la vez',
    listening: 'Escucha las cifras',
    voiceNoVoice: 'No hay voz en este dispositivo: las cifras aparecerán en pantalla.',
    voiceSoundOff: 'El sonido está apagado: las cifras aparecerán en pantalla. Actívalo en los ajustes.',
    paceLabel: 'Ritmo de presentación',
    paceSlow: 'Lento',
    paceNormal: 'Medio',
    paceFast: 'Rápido',
    paceLevelNote: 'El ritmo solo se cambia en la partida libre: en la escalera de niveles lo fija el nivel, o los resultados dejan de ser comparables.',
  },
  de: {
    directionAscending: 'Aufsteigend',
    typeAscending: 'Gib die Ziffern aufsteigend ein',
    deliveryLabel: 'Darbietung der Ziffern',
    deliveryScreen: 'Auf dem Bildschirm',
    deliveryVoice: 'Per Stimme',
    deliveryAll: 'Alle auf einmal',
    listening: 'Hör auf die Ziffern',
    voiceNoVoice: 'Auf diesem Gerät gibt es keine Stimme — die Ziffern erscheinen auf dem Bildschirm.',
    voiceSoundOff: 'Der Ton ist aus — die Ziffern erscheinen auf dem Bildschirm. Schalte den Ton in den Einstellungen ein.',
    paceLabel: 'Tempo der Darbietung',
    paceSlow: 'Langsam',
    paceNormal: 'Mittel',
    paceFast: 'Schnell',
    paceLevelNote: 'Das Tempo lässt sich nur in der freien Runde ändern: auf der Stufenleiter gibt es die Stufe vor, sonst sind die Ergebnisse nicht vergleichbar.',
  },
  zh: {
    directionAscending: '按升序',
    typeAscending: '按从小到大的顺序输入数字',
    deliveryLabel: '数字呈现方式',
    deliveryScreen: '在屏幕上',
    deliveryVoice: '用语音',
    deliveryAll: '一次全显示',
    listening: '请听数字',
    voiceNoVoice: '本设备没有语音，数字将显示在屏幕上。',
    voiceSoundOff: '声音已关闭，数字将显示在屏幕上。请在设置中打开声音。',
    paceLabel: '呈现速度',
    paceSlow: '慢速',
    paceNormal: '中等',
    paceFast: '快速',
    paceLevelNote: '只有自由练习才能调节速度：按关卡进行时由关卡决定，否则成绩无法比较。',
  },
  hi: {
    directionAscending: 'बढ़ते क्रम में',
    typeAscending: 'अंकों को छोटे से बड़े क्रम में लिखें',
    deliveryLabel: 'अंक कैसे दिखाए जाएँ',
    deliveryScreen: 'स्क्रीन पर',
    deliveryVoice: 'आवाज़ से',
    deliveryAll: 'सब एक साथ',
    listening: 'अंक सुनिए',
    voiceNoVoice: 'इस उपकरण में आवाज़ नहीं है — अंक स्क्रीन पर दिखाए जाएँगे।',
    voiceSoundOff: 'ध्वनि बंद है — अंक स्क्रीन पर दिखाए जाएँगे। सेटिंग्स में ध्वनि चालू करें।',
    paceLabel: 'दिखाने की गति',
    paceSlow: 'धीमा',
    paceNormal: 'सामान्य',
    paceFast: 'तेज़',
    paceLevelNote: 'गति केवल मुक्त दौर में बदली जा सकती है: स्तरों की सीढ़ी पर इसे स्तर तय करता है, वरना परिणाम तुलनीय नहीं रहते।',
  },
  pt: {
    directionAscending: 'Ordem crescente',
    typeAscending: 'Digite os algarismos do menor para o maior',
    deliveryLabel: 'Apresentação dos algarismos',
    deliveryScreen: 'Na tela',
    deliveryVoice: 'Por voz',
    deliveryAll: 'Todos de uma vez',
    listening: 'Ouça os algarismos',
    voiceNoVoice: 'Não há voz neste aparelho — os algarismos aparecerão na tela.',
    voiceSoundOff: 'O som está desligado — os algarismos aparecerão na tela. Ligue o som nos ajustes.',
    paceLabel: 'Ritmo de apresentação',
    paceSlow: 'Devagar',
    paceNormal: 'Médio',
    paceFast: 'Rápido',
    paceLevelNote: 'O ritmo só muda na partida livre: na escada de níveis quem o define é o nível, senão os resultados deixam de ser comparáveis.',
  },
  fr: {
    directionAscending: 'Ordre croissant',
    typeAscending: 'Saisissez les chiffres du plus petit au plus grand',
    deliveryLabel: 'Présentation des chiffres',
    deliveryScreen: 'À l’écran',
    deliveryVoice: 'À la voix',
    deliveryAll: 'Tous à la fois',
    listening: 'Écoutez les chiffres',
    voiceNoVoice: 'Aucune voix sur cet appareil — les chiffres seront affichés à l’écran.',
    voiceSoundOff: 'Le son est coupé — les chiffres seront affichés à l’écran. Activez le son dans les réglages.',
    paceLabel: 'Rythme de présentation',
    paceSlow: 'Lent',
    paceNormal: 'Moyen',
    paceFast: 'Rapide',
    paceLevelNote: 'Le rythme ne se règle que dans une partie libre : dans l’échelle des niveaux, c’est le niveau qui l’impose, sinon les résultats ne sont plus comparables.',
  },
  it: {
    directionAscending: 'Ordine crescente',
    typeAscending: 'Inserisci le cifre dalla più piccola alla più grande',
    deliveryLabel: 'Presentazione delle cifre',
    deliveryScreen: 'Sullo schermo',
    deliveryVoice: 'A voce',
    deliveryAll: 'Tutti insieme',
    listening: 'Ascolta le cifre',
    voiceNoVoice: 'Su questo dispositivo non c’è una voce — le cifre appariranno sullo schermo.',
    voiceSoundOff: 'L’audio è spento — le cifre appariranno sullo schermo. Attiva l’audio nelle impostazioni.',
    paceLabel: 'Ritmo di presentazione',
    paceSlow: 'Lento',
    paceNormal: 'Medio',
    paceFast: 'Veloce',
    paceLevelNote: 'Il ritmo si cambia solo nella partita libera: nella scala dei livelli lo imposta il livello, altrimenti i risultati non sono confrontabili.',
  },
  ja: {
    directionAscending: '昇順で',
    typeAscending: '数字を小さい順に入力してください',
    deliveryLabel: '数字の提示方法',
    deliveryScreen: '画面に表示',
    deliveryVoice: '音声で',
    deliveryAll: 'いっぺんに全部',
    listening: '数字を聞いてください',
    voiceNoVoice: 'この端末には音声がありません。数字は画面に表示します。',
    voiceSoundOff: '音が切れています。数字は画面に表示します。設定で音を入れてください。',
    paceLabel: '提示のテンポ',
    paceSlow: 'ゆっくり',
    paceNormal: 'ふつう',
    paceFast: 'はやい',
    paceLevelNote: 'テンポを変えられるのは自由なラウンドだけです。レベルの階段ではレベルが決めます。そうでないと記録を比べられません。',
  },
  ko: {
    directionAscending: '오름차순',
    typeAscending: '숫자를 작은 것부터 순서대로 입력하세요',
    deliveryLabel: '숫자 제시 방식',
    deliveryScreen: '화면에 표시',
    deliveryVoice: '음성으로',
    deliveryAll: '한꺼번에',
    listening: '숫자를 들으세요',
    voiceNoVoice: '이 기기에는 음성이 없습니다 — 숫자는 화면에 표시합니다.',
    voiceSoundOff: '소리가 꺼져 있습니다 — 숫자는 화면에 표시합니다. 설정에서 소리를 켜세요.',
    paceLabel: '제시 속도',
    paceSlow: '느리게',
    paceNormal: '보통',
    paceFast: '빠르게',
    paceLevelNote: '속도는 자유 라운드에서만 바꿀 수 있습니다. 레벨 사다리에서는 레벨이 정하며, 그렇지 않으면 기록을 비교할 수 없습니다.',
  },
  ar: {
    directionAscending: 'ترتيب تصاعدي',
    typeAscending: 'أدخل الأرقام من الأصغر إلى الأكبر',
    deliveryLabel: 'طريقة عرض الأرقام',
    deliveryScreen: 'على الشاشة',
    deliveryVoice: 'بالصوت',
    deliveryAll: 'كلها دفعة واحدة',
    listening: 'استمع إلى الأرقام',
    voiceNoVoice: 'لا يوجد صوت على هذا الجهاز — ستظهر الأرقام على الشاشة.',
    voiceSoundOff: 'الصوت مغلق — ستظهر الأرقام على الشاشة. شغّل الصوت من الإعدادات.',
    paceLabel: 'سرعة العرض',
    paceSlow: 'بطيء',
    paceNormal: 'متوسط',
    paceFast: 'سريع',
    paceLevelNote: 'لا يمكن تغيير السرعة إلا في الجولة الحرة: في سلّم المستويات يحدّدها المستوى، وإلا تعذّرت مقارنة النتائج.',
  },
};

/** Все языки, которые модуль знает по-настоящему. */
export const DIGIT_SPAN_LOCALES = Object.keys(STRINGS) as DigitSpanLocale[];

/** Подписи партии на языке интерфейса; незнакомый код языка — английский, а не пустота. */
export function getDigitSpanStrings(locale: string): DigitSpanStrings {
  return STRINGS[locale as DigitSpanLocale] ?? STRINGS.en;
}
