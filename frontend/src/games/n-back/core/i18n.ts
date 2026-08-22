/* psygames-n-back-i18n · VER 1 · 23.08.2026 */
/**
 * СВОЙ СЛОВАРЬ МОДУЛЯ — СРАЗУ НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ.
 *
 * ⚠️ ПОЧЕМУ НЕ В ОБЩИЙ СЛОВАРЬ ПРИЛОЖЕНИЯ. `src/contexts/translations/*` сейчас
 * правят параллельно другие заходы, и новый ключ там — это гарантированный
 * конфликт правок в файле, который держит все 70 игр. Подписи разбора одной
 * партии n-back нужны ровно одной игре, поэтому живут рядом с ней — тем же
 * приёмом, что `dots-connect/core/i18n.ts` и `fillwords/core/i18n.ts`.
 *
 * ⚠️ ДВЕНАДЦАТЬ, А НЕ ДВА. Модуль со словарём на `ru`/`en` выдаёт японцу,
 * корейцу и немцу английский текст посреди переведённого экрана — ровно та
 * дыра, ради которой заведён гейт `games-module-i18n`. Полнота, отличие от
 * английского и своя письменность у своей локали сверяются пробой
 * `src/__tests__/n-back-dprime.test.ts`.
 *
 * ⚠️ ПОРТУГАЛЬСКИЙ — БРАЗИЛЬСКИЙ, как и весь остальной словарь приложения.
 *
 * 🔴 ЧТО ЗДЕСЬ ЗАПРЕЩЕНО ГОВОРИТЬ. Ни одна из этих подписей не обещает роста
 * ума, памяти или IQ: d′ — мера того, насколько ответы В ЭТОЙ партии отличались
 * от угадывания, и ничего сверх этого сказать по ней нельзя.
 */

/** Список ровно как `type Language` приложения (LanguageContext). */
export type NBackLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяется словарь в пробе. */
export const N_BACK_LOCALES: readonly NBackLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];

export interface NBackStrings {
  /** Подпись доли верных ответов. Рядом стоит «NN%». */
  accuracy: string;
  /** Подпись d′. Само обозначение оставлено в строке: оно международное. */
  dPrime: string;
  /** Что такое d′ и как его читать. Первая строка пояснения под числами. */
  dPrimeHint: string;
  /** Почему одной точности мало. Вторая строка пояснения. */
  dPrimeWhy: string;
  /** Зрительный поток двойного режима — подсвеченная клетка сетки. */
  channelVisual: string;
  /** Слуховой поток двойного режима — названная буква. */
  channelAudio: string;
}

const STRINGS: Record<NBackLocale, NBackStrings> = {
  ru: {
    accuracy: 'Точность',
    dPrime: 'Различение d′',
    dPrimeHint: 'd′ показывает, насколько уверенно вы отличали повтор от нового: 0 — ответы наугад, выше 1 — различение уже заметное.',
    dPrimeWhy: 'Одна точность этого не показывает: высокий процент набирается и молчанием почти на всех пробах.',
    channelVisual: 'Клетки',
    channelAudio: 'Буквы',
  },
  en: {
    accuracy: 'Accuracy',
    dPrime: 'Discrimination d′',
    dPrimeHint: 'd′ shows how surely you told a repeat from a new one: 0 means guessing, above 1 the difference is real.',
    dPrimeWhy: 'Accuracy alone hides this: a high score also comes from staying silent on almost every trial.',
    channelVisual: 'Squares',
    channelAudio: 'Letters',
  },
  es: {
    accuracy: 'Precisión',
    dPrime: 'Discriminación d′',
    dPrimeHint: 'd′ muestra con qué seguridad distinguiste una repetición de algo nuevo: 0 es azar, por encima de 1 ya hay una diferencia real.',
    dPrimeWhy: 'La precisión sola lo esconde: también se logra un porcentaje alto callando en casi todas las pruebas.',
    channelVisual: 'Casillas',
    channelAudio: 'Letras',
  },
  de: {
    accuracy: 'Genauigkeit',
    dPrime: 'Unterscheidung d′',
    dPrimeHint: 'd′ zeigt, wie sicher du eine Wiederholung von etwas Neuem getrennt hast: 0 heißt geraten, über 1 ist der Unterschied echt.',
    dPrimeWhy: 'Die Genauigkeit allein verbirgt das: ein hoher Wert entsteht auch, wenn man fast überall schweigt.',
    channelVisual: 'Felder',
    channelAudio: 'Buchstaben',
  },
  zh: {
    accuracy: '准确率',
    dPrime: '辨别力 d′',
    dPrimeHint: 'd′ 表示你把重复和新出现区分开的把握：0 相当于瞎猜，超过 1 说明真的分得清。',
    dPrimeWhy: '光看准确率看不出来：几乎每次都不按，也照样能得到很高的百分比。',
    channelVisual: '方格',
    channelAudio: '字母',
  },
  hi: {
    accuracy: 'सटीकता',
    dPrime: 'विभेदन d′',
    dPrimeHint: 'd′ बताता है कि आपने दोहराव और नए को कितने भरोसे से अलग किया: 0 यानी अंदाज़ा, 1 से ऊपर यानी सचमुच का अंतर।',
    dPrimeWhy: 'अकेली सटीकता यह नहीं दिखाती: लगभग हर बार चुप रहकर भी ऊँचा प्रतिशत मिल जाता है।',
    channelVisual: 'खाने',
    channelAudio: 'अक्षर',
  },
  pt: {
    accuracy: 'Precisão',
    dPrime: 'Discriminação d′',
    dPrimeHint: 'd′ mostra com que segurança você separou a repetição do novo: 0 é chute, acima de 1 a diferença já é real.',
    dPrimeWhy: 'Só a precisão esconde isso: uma porcentagem alta também sai de ficar calado em quase todas as tentativas.',
    channelVisual: 'Casas',
    channelAudio: 'Letras',
  },
  fr: {
    accuracy: 'Précision',
    dPrime: 'Distinction d′',
    dPrimeHint: 'd′ montre avec quelle sûreté vous avez séparé une répétition d’un élément nouveau : 0, c’est du hasard ; au-dessus de 1, l’écart est réel.',
    dPrimeWhy: 'La précision seule le cache : un pourcentage élevé s’obtient aussi en se taisant presque partout.',
    channelVisual: 'Cases',
    channelAudio: 'Lettres',
  },
  it: {
    accuracy: 'Precisione',
    dPrime: 'Discriminazione d′',
    dPrimeHint: 'd′ mostra con quanta sicurezza hai distinto una ripetizione da qualcosa di nuovo: 0 è caso, sopra 1 la differenza è reale.',
    dPrimeWhy: 'La precisione da sola lo nasconde: una percentuale alta si ottiene anche restando in silenzio quasi ovunque.',
    channelVisual: 'Caselle',
    channelAudio: 'Lettere',
  },
  ja: {
    accuracy: '正答率',
    dPrime: '識別力 d′',
    dPrimeHint: 'd′ は「繰り返し」と「新しいもの」をどれだけ確実に見分けたかを表します。0 はあてずっぽう、1 を超えれば本当に見分けています。',
    dPrimeWhy: '正答率だけでは分かりません。ほとんど押さずにいても高い数字が出ます。',
    channelVisual: 'マス',
    channelAudio: '文字',
  },
  ko: {
    accuracy: '정확도',
    dPrime: '변별력 d′',
    dPrimeHint: 'd′는 반복과 새로운 것을 얼마나 확실하게 구분했는지 보여 줍니다. 0은 찍기와 같고, 1을 넘으면 실제로 구분한 것입니다.',
    dPrimeWhy: '정확도만으로는 알 수 없습니다. 거의 누르지 않아도 높은 수치가 나옵니다.',
    channelVisual: '칸',
    channelAudio: '글자',
  },
  ar: {
    accuracy: 'الدقة',
    dPrime: 'التمييز d′',
    dPrimeHint: 'd′ يبيّن مدى ثقتك في تمييز التكرار عن الجديد: 0 يعني التخمين، وفوق 1 يعني تمييزًا حقيقيًا.',
    dPrimeWhy: 'الدقة وحدها تخفي ذلك: النسبة العالية تأتي أيضًا من الصمت في معظم المحاولات.',
    channelVisual: 'المربعات',
    channelAudio: 'الحروف',
  },
};

/** Незнакомый язык — английский, а не пустой экран. Тип этого не допускает, но рантайм бывает шире типа. */
export function getNBackStrings(locale: NBackLocale): NBackStrings {
  return STRINGS[locale] ?? STRINGS.en;
}
