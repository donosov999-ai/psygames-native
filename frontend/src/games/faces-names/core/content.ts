/* psygames-faces-names-content · VER 1 · 19.08.2026 */
/**
 * БИБЛИОТЕКА ЛЮДЕЙ: 48 процедурных портретов, 48 имён, 48 нейтральных фактов.
 *
 * ГРАНИЦА СОДЕРЖИМОГО (её держит и validator.ts). Здесь нет и не может быть
 * фотографий, ссылок, контактов, идентификаторов реальных людей и обращений к
 * медиатеке: каждое «лицо» — это набор чисел и цветов, по которому SVG рисуется
 * на месте. Игра про лица, собранная из чужих фотографий, — юридическая и
 * этическая мина; собранная из процедурных портретов — просто игра.
 *
 * 🔴 ИМЯ ОДНО НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ, И ЭТО РЕШЕНИЕ, А НЕ НЕДОДЕЛКА.
 * Имя здесь — не подпись интерфейса, а САМ ПРЕДМЕТ ЗАПОМИНАНИЯ. На нём же
 * построена вся лестница сложности: ложные варианты в фазе «выбери имя»
 * подбираются по расстоянию Левенштейна между строками (nameDistance ниже), и
 * средняя похожесть имён уезжает в сохранённую партию как `mean_name_similarity`.
 * Свой набор имён на каждый язык означал бы: другая похожесть, другая
 * сложность, другой результат по тому же seed — то есть двенадцать разных игр
 * под одним названием.
 *
 * ЦЕНА ЭТОГО РЕШЕНИЯ, ЧЕСТНО. Шесть из двенадцати языков пишутся не латиницей
 * (ru/zh/ja/ko/ar/hi), и для их читателя латинское имя — чужой знак, который
 * запоминать тяжелее. Поэтому канонической строке придана ВТОРАЯ СТРОКА в
 * письменности интерфейса (`nameScript`): она показывается и на карточке
 * изучения, и на всех вариантах ответа — то есть подсказкой не является, а
 * читать имя даёт. Ответом по-прежнему остаётся канон: ядро, валидатор и
 * метрики его не видят изменившимся.
 */
import type {
  FaceShape,
  FacesNamesLocale,
  HairStyle,
  SyntheticFaceSpec,
  SyntheticPerson,
} from './types';

/** Имя: канон (он же ответ и ключ похожести) + запись в нелатинских письменностях. */
interface NameSpec {
  base: string;
  ru: string;
  zh: string;
  ja: string;
  ko: string;
  ar: string;
  hi: string;
}

/**
 * ⚠️ Записи в чужих письменностях обязаны оставаться ПОПАРНО РАЗНЫМИ внутри
 * своего языка: два разных человека с одинаковой подписью — это не задача на
 * память, а нерешаемая проба. Сверяется гейтом faces-names-integration.
 */
const NAMES: readonly NameSpec[] = [
  { base: 'Amina',  ru: 'Амина',   zh: '阿米娜',   ja: 'アミナ',     ko: '아미나',   ar: 'أمينة',  hi: 'अमीना' },
  { base: 'Leo',    ru: 'Лео',     zh: '里奥',     ja: 'レオ',       ko: '레오',     ar: 'ليو',    hi: 'लियो' },
  { base: 'Mei',    ru: 'Мэй',     zh: '梅',       ja: 'メイ',       ko: '메이',     ar: 'ماي',    hi: 'मेई' },
  { base: 'Omar',   ru: 'Омар',    zh: '奥马尔',   ja: 'オマル',     ko: '오마르',   ar: 'عمر',    hi: 'ओमर' },
  { base: 'Sofia',  ru: 'София',   zh: '索菲亚',   ja: 'ソフィア',   ko: '소피아',   ar: 'صوفيا',  hi: 'सोफ़िया' },
  { base: 'Ravi',   ru: 'Рави',    zh: '拉维',     ja: 'ラヴィ',     ko: '라비',     ar: 'رافي',   hi: 'रवि' },
  { base: 'Lina',   ru: 'Лина',    zh: '莉娜',     ja: 'リナ',       ko: '리나',     ar: 'لينا',   hi: 'लीना' },
  { base: 'Noah',   ru: 'Ноа',     zh: '诺亚',     ja: 'ノア',       ko: '노아',     ar: 'نوح',    hi: 'नोआ' },
  { base: 'Hana',   ru: 'Хана',    zh: '哈娜',     ja: 'ハナ',       ko: '하나',     ar: 'هناء',   hi: 'हाना' },
  { base: 'Mateo',  ru: 'Матео',   zh: '马特奥',   ja: 'マテオ',     ko: '마테오',   ar: 'ماتيو',  hi: 'माटेओ' },
  { base: 'Zuri',   ru: 'Зури',    zh: '祖里',     ja: 'ズリ',       ko: '주리',     ar: 'زوري',   hi: 'ज़ुरी' },
  { base: 'Elias',  ru: 'Элиас',   zh: '埃利亚斯', ja: 'エリアス',   ko: '엘리아스', ar: 'إلياس',  hi: 'एलियास' },
  { base: 'Yuna',   ru: 'Юна',     zh: '尤娜',     ja: 'ユナ',       ko: '유나',     ar: 'يونا',   hi: 'युना' },
  { base: 'Amir',   ru: 'Амир',    zh: '阿米尔',   ja: 'アミル',     ko: '아미르',   ar: 'أمير',   hi: 'अमीर' },
  { base: 'Nora',   ru: 'Нора',    zh: '诺拉',     ja: 'ノラ',       ko: '노라',     ar: 'نورا',   hi: 'नोरा' },
  { base: 'Kenji',  ru: 'Кэндзи',  zh: '健二',     ja: 'ケンジ',     ko: '켄지',     ar: 'كينجي',  hi: 'केंजी' },
  { base: 'Leila',  ru: 'Лейла',   zh: '蕾拉',     ja: 'レイラ',     ko: '레일라',   ar: 'ليلى',   hi: 'लैला' },
  { base: 'Luca',   ru: 'Лука',    zh: '卢卡',     ja: 'ルカ',       ko: '루카',     ar: 'لوكا',   hi: 'लूका' },
  { base: 'Ada',    ru: 'Ада',     zh: '阿达',     ja: 'アダ',       ko: '아다',     ar: 'آدا',    hi: 'आदा' },
  { base: 'Samir',  ru: 'Самир',   zh: '萨米尔',   ja: 'サミル',     ko: '사미르',   ar: 'سمير',   hi: 'समीर' },
  { base: 'Imani',  ru: 'Имани',   zh: '伊玛尼',   ja: 'イマニ',     ko: '이마니',   ar: 'إيماني', hi: 'इमानी' },
  { base: 'Theo',   ru: 'Тео',     zh: '西奥',     ja: 'テオ',       ko: '테오',     ar: 'ثيو',    hi: 'थियो' },
  { base: 'Mina',   ru: 'Мина',    zh: '米娜',     ja: 'ミナ',       ko: '미나',     ar: 'مينا',   hi: 'मीना' },
  { base: 'Daniel', ru: 'Даниэль', zh: '丹尼尔',   ja: 'ダニエル',   ko: '다니엘',   ar: 'دانيال', hi: 'डैनियल' },
  { base: 'Alma',   ru: 'Альма',   zh: '阿尔玛',   ja: 'アルマ',     ko: '알마',     ar: 'ألما',   hi: 'आल्मा' },
  { base: 'Idris',  ru: 'Идрис',   zh: '伊德里斯', ja: 'イドリス',   ko: '이드리스', ar: 'إدريس',  hi: 'इदरीस' },
  { base: 'Eva',    ru: 'Ева',     zh: '伊娃',     ja: 'エヴァ',     ko: '에바',     ar: 'إيفا',   hi: 'ईवा' },
  { base: 'Nikita', ru: 'Никита',  zh: '尼基塔',   ja: 'ニキータ',   ko: '니키타',   ar: 'نيكيتا', hi: 'निकिता' },
  { base: 'Sara',   ru: 'Сара',    zh: '萨拉',     ja: 'サラ',       ko: '사라',     ar: 'سارة',   hi: 'सारा' },
  { base: 'Joel',   ru: 'Джоэл',   zh: '乔尔',     ja: 'ジョエル',   ko: '조엘',     ar: 'جويل',   hi: 'जोएल' },
  { base: 'Priya',  ru: 'Прия',    zh: '普里娅',   ja: 'プリヤ',     ko: '프리야',   ar: 'بريا',   hi: 'प्रिया' },
  { base: 'Emil',   ru: 'Эмиль',   zh: '埃米尔',   ja: 'エミル',     ko: '에밀',     ar: 'إميل',   hi: 'एमिल' },
  { base: 'Ayla',   ru: 'Айла',    zh: '艾拉',     ja: 'アイラ',     ko: '아일라',   ar: 'أيلا',   hi: 'आयला' },
  { base: 'Bruno',  ru: 'Бруно',   zh: '布鲁诺',   ja: 'ブルーノ',   ko: '브루노',   ar: 'برونو',  hi: 'ब्रूनो' },
  { base: 'Nia',    ru: 'Ниа',     zh: '妮娅',     ja: 'ニア',       ko: '니아',     ar: 'نيا',    hi: 'निया' },
  { base: 'Timur',  ru: 'Тимур',   zh: '帖木儿',   ja: 'ティムル',   ko: '티무르',   ar: 'تيمور',  hi: 'तिमूर' },
  { base: 'Mira',   ru: 'Мира',    zh: '米拉',     ja: 'ミラ',       ko: '미라',     ar: 'ميرا',   hi: 'मीरा' },
  { base: 'Jonas',  ru: 'Йонас',   zh: '约纳斯',   ja: 'ヨナス',     ko: '요나스',   ar: 'يوناس',  hi: 'योनास' },
  { base: 'Layla',  ru: 'Лайла',   zh: '莱拉',     ja: 'ライラ',     ko: '라일라',   ar: 'لايلا',  hi: 'लायला' },
  { base: 'Arun',   ru: 'Арун',    zh: '阿伦',     ja: 'アルン',     ko: '아룬',     ar: 'أرون',   hi: 'अरुण' },
  { base: 'Elina',  ru: 'Элина',   zh: '埃莉娜',   ja: 'エリナ',     ko: '엘리나',   ar: 'إلينا',  hi: 'एलिना' },
  { base: 'David',  ru: 'Давид',   zh: '大卫',     ja: 'ダビド',     ko: '다비드',   ar: 'دافيد',  hi: 'डेविड' },
  { base: 'Salma',  ru: 'Сальма',  zh: '萨尔玛',   ja: 'サルマ',     ko: '살마',     ar: 'سلمى',   hi: 'सलमा' },
  { base: 'Ren',    ru: 'Рен',     zh: '伦',       ja: 'レン',       ko: '렌',       ar: 'رين',    hi: 'रेन' },
  { base: 'Maya',   ru: 'Майя',    zh: '玛雅',     ja: 'マヤ',       ko: '마야',     ar: 'مايا',   hi: 'माया' },
  { base: 'Karim',  ru: 'Карим',   zh: '卡里姆',   ja: 'カリム',     ko: '카림',     ar: 'كريم',   hi: 'करीम' },
  { base: 'Talia',  ru: 'Талия',   zh: '塔莉娅',   ja: 'タリア',     ko: '탈리아',   ar: 'تاليا',  hi: 'तालिया' },
  { base: 'Luis',   ru: 'Луис',    zh: '路易斯',   ja: 'ルイス',     ko: '루이스',   ar: 'لويس',   hi: 'लुइस' },
];

/** Языки, у которых письменность отличается от латиницы, — только им нужна вторая строка. */
const SCRIPT_LOCALES = ['ru', 'zh', 'ja', 'ko', 'ar', 'hi'] as const;
type ScriptLocale = (typeof SCRIPT_LOCALES)[number];

const NAME_SCRIPTS = new Map<string, Record<ScriptLocale, string>>(
  NAMES.map((entry) => [entry.base, {
    ru: entry.ru, zh: entry.zh, ja: entry.ja, ko: entry.ko, ar: entry.ar, hi: entry.hi,
  }]),
);

/**
 * Как имя пишется в письменности интерфейса. Для латинских языков — `null`:
 * вторая строка там повторяла бы первую, а лишняя подпись под каждой кнопкой
 * это шум, а не помощь.
 */
export function nameScript(locale: FacesNamesLocale, name: string): string | null {
  if (!(SCRIPT_LOCALES as readonly string[]).includes(locale)) return null;
  return NAME_SCRIPTS.get(name)?.[locale as ScriptLocale] ?? null;
}

/**
 * ФАКТ — ТОЖЕ МАТЕРИАЛ, А НЕ ПОДПИСЬ, И ПОЭТОМУ ПЕРЕВЕДЁН ЦЕЛИКОМ.
 *
 * Имя оставлено каноном, потому что это опорная строка сложности. Факт такой
 * роли не несёт: близость фактов считается по `category`, а не по буквам, —
 * значит перевод сложность не сдвигает. А вот НЕ переводить его нельзя:
 * запомнить «collects postcards» немцу труднее, чем «sammelt Postkarten», и это
 * была бы разная игра на разных языках уже по-настоящему.
 */
export interface NeutralFact {
  id: string;
  category: 'creative' | 'nature' | 'learning' | 'movement' | 'making' | 'collecting';
  text: Record<FacesNamesLocale, string>;
}

const fact = (
  id: string,
  category: NeutralFact['category'],
  text: Record<FacesNamesLocale, string>,
): NeutralFact => ({ id, category, text });

export const FACT_LIBRARY: readonly NeutralFact[] = [
  fact('fact-01', 'collecting', { ru: 'собирает открытки', en: 'collects postcards', es: 'colecciona postales', de: 'sammelt Postkarten', pt: 'coleciona postais', fr: 'collectionne les cartes postales', it: 'colleziona cartoline', zh: '收集明信片', ja: '絵はがきを集める', ko: '엽서를 모은다', hi: 'पोस्टकार्ड जमा करता है', ar: 'يجمع البطاقات البريدية' }),
  fact('fact-02', 'nature', { ru: 'выращивает базилик', en: 'grows basil', es: 'cultiva albahaca', de: 'zieht Basilikum', pt: 'cultiva manjericão', fr: 'fait pousser du basilic', it: 'coltiva basilico', zh: '种罗勒', ja: 'バジルを育てる', ko: '바질을 기른다', hi: 'तुलसी उगाता है', ar: 'يزرع الريحان' }),
  fact('fact-03', 'creative', { ru: 'фотографирует облака', en: 'photographs clouds', es: 'fotografía nubes', de: 'fotografiert Wolken', pt: 'fotografa nuvens', fr: 'photographie les nuages', it: 'fotografa le nuvole', zh: '拍摄云朵', ja: '雲を撮影する', ko: '구름을 찍는다', hi: 'बादलों की तस्वीरें लेता है', ar: 'يصور الغيوم' }),
  fact('fact-04', 'learning', { ru: 'решает кроссворды', en: 'solves crosswords', es: 'resuelve crucigramas', de: 'löst Kreuzworträtsel', pt: 'resolve palavras cruzadas', fr: 'fait des mots croisés', it: 'risolve cruciverba', zh: '玩填字游戏', ja: 'クロスワードを解く', ko: '십자말풀이를 한다', hi: 'वर्ग पहेली हल करता है', ar: 'يحل الكلمات المتقاطعة' }),
  fact('fact-05', 'making', { ru: 'печёт овсяное печенье', en: 'bakes oat cookies', es: 'hornea galletas de avena', de: 'backt Haferkekse', pt: 'faz biscoitos de aveia', fr: 'prépare des biscuits à l’avoine', it: 'prepara biscotti d’avena', zh: '烤燕麦饼干', ja: 'オートミールクッキーを焼く', ko: '귀리 쿠키를 굽는다', hi: 'ओट बिस्किट बनाता है', ar: 'يخبز بسكويت الشوفان' }),
  fact('fact-06', 'creative', { ru: 'слушает джаз', en: 'listens to jazz', es: 'escucha jazz', de: 'hört Jazz', pt: 'ouve jazz', fr: 'écoute du jazz', it: 'ascolta jazz', zh: '听爵士乐', ja: 'ジャズを聴く', ko: '재즈를 듣는다', hi: 'जैज़ सुनता है', ar: 'يستمع إلى الجاز' }),
  fact('fact-07', 'making', { ru: 'чинит велосипеды', en: 'repairs bicycles', es: 'repara bicicletas', de: 'repariert Fahrräder', pt: 'conserta bicicletas', fr: 'répare des vélos', it: 'ripara biciclette', zh: '修自行车', ja: '自転車を修理する', ko: '자전거를 고친다', hi: 'साइकिल ठीक करता है', ar: 'يصلح الدراجات' }),
  fact('fact-08', 'nature', { ru: 'наблюдает за птицами', en: 'watches birds', es: 'observa aves', de: 'beobachtet Vögel', pt: 'observa pássaros', fr: 'observe les oiseaux', it: 'osserva gli uccelli', zh: '观鸟', ja: '野鳥を観察する', ko: '새를 관찰한다', hi: 'पक्षियों को देखता है', ar: 'يراقب الطيور' }),
  fact('fact-09', 'creative', { ru: 'рисует миниатюры', en: 'paints miniatures', es: 'pinta miniaturas', de: 'malt Miniaturen', pt: 'pinta miniaturas', fr: 'peint des miniatures', it: 'dipinge miniature', zh: '画微缩画', ja: 'ミニチュアを塗る', ko: '미니어처를 칠한다', hi: 'लघुचित्र बनाता है', ar: 'يرسم المنمنمات' }),
  fact('fact-10', 'learning', { ru: 'изучает созвездия', en: 'learns constellations', es: 'estudia constelaciones', de: 'lernt Sternbilder', pt: 'estuda constelações', fr: 'apprend les constellations', it: 'studia le costellazioni', zh: '学星座', ja: '星座を覚える', ko: '별자리를 익힌다', hi: 'तारामंडल सीखता है', ar: 'يتعلم الأبراج النجمية' }),
  fact('fact-11', 'making', { ru: 'делает бумажные модели', en: 'makes paper models', es: 'arma modelos de papel', de: 'baut Papiermodelle', pt: 'monta modelos de papel', fr: 'assemble des maquettes en papier', it: 'costruisce modelli di carta', zh: '做纸模型', ja: 'ペーパーモデルを作る', ko: '종이 모형을 만든다', hi: 'कागज़ के मॉडल बनाता है', ar: 'يصنع مجسمات ورقية' }),
  fact('fact-12', 'creative', { ru: 'ведёт путевой скетчбук', en: 'keeps travel sketches', es: 'lleva un cuaderno de viaje', de: 'führt ein Reiseskizzenbuch', pt: 'mantém um caderno de viagem', fr: 'tient un carnet de voyage', it: 'tiene un taccuino di viaggio', zh: '画旅行速写', ja: '旅のスケッチを描く', ko: '여행 스케치를 한다', hi: 'यात्रा स्केच बनाता है', ar: 'يرسم مذكرات السفر' }),
  fact('fact-13', 'movement', { ru: 'играет в настольный теннис', en: 'plays table tennis', es: 'juega al tenis de mesa', de: 'spielt Tischtennis', pt: 'joga tênis de mesa', fr: 'joue au tennis de table', it: 'gioca a ping pong', zh: '打乒乓球', ja: '卓球をする', ko: '탁구를 친다', hi: 'टेबल टेनिस खेलता है', ar: 'يلعب تنس الطاولة' }),
  fact('fact-14', 'learning', { ru: 'читает биографии', en: 'reads biographies', es: 'lee biografías', de: 'liest Biografien', pt: 'lê biografias', fr: 'lit des biographies', it: 'legge biografie', zh: '读人物传记', ja: '伝記を読む', ko: '전기를 읽는다', hi: 'जीवनियाँ पढ़ता है', ar: 'يقرأ السير الذاتية' }),
  fact('fact-15', 'collecting', { ru: 'собирает красивые камешки', en: 'collects pebbles', es: 'colecciona piedritas', de: 'sammelt Kieselsteine', pt: 'coleciona seixos', fr: 'collectionne les galets', it: 'raccoglie sassolini', zh: '收集小石子', ja: '小石を集める', ko: '조약돌을 모은다', hi: 'कंकड़ जमा करता है', ar: 'يجمع الحصى الملون' }),
  fact('fact-16', 'creative', { ru: 'пишет короткие рассказы', en: 'writes short stories', es: 'escribe cuentos', de: 'schreibt Kurzgeschichten', pt: 'escreve contos', fr: 'écrit des nouvelles', it: 'scrive racconti', zh: '写短篇小说', ja: '短編を書く', ko: '단편을 쓴다', hi: 'लघु कहानियाँ लिखता है', ar: 'يكتب قصصاً قصيرة' }),
  fact('fact-17', 'nature', { ru: 'поливает цветы на балконе', en: 'waters balcony flowers', es: 'riega las plantas del balcón', de: 'gießt Balkonblumen', pt: 'rega as flores da varanda', fr: 'arrose les fleurs du balcon', it: 'annaffia i fiori del balcone', zh: '给阳台的花浇水', ja: 'ベランダの花に水をやる', ko: '베란다 꽃에 물을 준다', hi: 'बालकनी के फूल सींचता है', ar: 'يسقي زهور الشرفة' }),
  fact('fact-18', 'learning', { ru: 'изучает карты', en: 'studies maps', es: 'estudia mapas', de: 'studiert Landkarten', pt: 'estuda mapas', fr: 'étudie les cartes', it: 'studia le mappe', zh: '研究地图', ja: '地図を調べる', ko: '지도를 살펴본다', hi: 'नक्शे पढ़ता है', ar: 'يدرس الخرائط' }),
  fact('fact-19', 'making', { ru: 'вяжет шарфы', en: 'knits scarves', es: 'teje bufandas', de: 'strickt Schals', pt: 'tricota cachecóis', fr: 'tricote des écharpes', it: 'lavora a maglia sciarpe', zh: '织围巾', ja: 'マフラーを編む', ko: '목도리를 뜬다', hi: 'स्कार्फ़ बुनता है', ar: 'يحيك الأوشحة' }),
  fact('fact-20', 'learning', { ru: 'играет в шахматы', en: 'plays chess', es: 'juega al ajedrez', de: 'spielt Schach', pt: 'joga xadrez', fr: 'joue aux échecs', it: 'gioca a scacchi', zh: '下国际象棋', ja: 'チェスを指す', ko: '체스를 둔다', hi: 'शतरंज खेलता है', ar: 'يلعب الشطرنج' }),
  fact('fact-21', 'making', { ru: 'заваривает фруктовый чай', en: 'makes fruit tea', es: 'prepara té de frutas', de: 'brüht Früchtetee', pt: 'prepara chá de frutas', fr: 'prépare des infusions aux fruits', it: 'prepara tè alla frutta', zh: '泡水果茶', ja: 'フルーツティーを淹れる', ko: '과일차를 우린다', hi: 'फलों की चाय बनाता है', ar: 'يحضّر شاي الفواكه' }),
  fact('fact-22', 'learning', { ru: 'посещает музеи', en: 'visits museums', es: 'visita museos', de: 'besucht Museen', pt: 'visita museus', fr: 'visite les musées', it: 'visita i musei', zh: '逛博物馆', ja: '美術館をめぐる', ko: '박물관에 다닌다', hi: 'संग्रहालय घूमता है', ar: 'يزور المتاحف' }),
  fact('fact-23', 'making', { ru: 'собирает пазлы', en: 'assembles puzzles', es: 'arma rompecabezas', de: 'legt Puzzles', pt: 'monta quebra-cabeças', fr: 'assemble des puzzles', it: 'compone puzzle', zh: '拼拼图', ja: 'ジグソーパズルを組む', ko: '퍼즐을 맞춘다', hi: 'पहेली-चित्र जोड़ता है', ar: 'يركّب الأحجيات' }),
  fact('fact-24', 'movement', { ru: 'ходит по коротким маршрутам', en: 'hikes short trails', es: 'hace rutas cortas', de: 'wandert kurze Strecken', pt: 'faz trilhas curtas', fr: 'fait de courtes randonnées', it: 'fa brevi escursioni', zh: '走短途步道', ja: '短いトレイルを歩く', ko: '짧은 산책로를 걷는다', hi: 'छोटी पगडंडियों पर चलता है', ar: 'يمشي في مسارات قصيرة' }),
  fact('fact-25', 'creative', { ru: 'рисует здания', en: 'draws buildings', es: 'dibuja edificios', de: 'zeichnet Gebäude', pt: 'desenha edifícios', fr: 'dessine des bâtiments', it: 'disegna edifici', zh: '画建筑', ja: '建物を描く', ko: '건물을 그린다', hi: 'इमारतें बनाता है', ar: 'يرسم المباني' }),
  fact('fact-26', 'learning', { ru: 'изучает жестовый язык', en: 'learns sign language', es: 'aprende lengua de señas', de: 'lernt Gebärdensprache', pt: 'aprende língua de sinais', fr: 'apprend la langue des signes', it: 'impara la lingua dei segni', zh: '学手语', ja: '手話を学ぶ', ko: '수어를 배운다', hi: 'सांकेतिक भाषा सीखता है', ar: 'يتعلم لغة الإشارة' }),
  fact('fact-27', 'making', { ru: 'готовит супы', en: 'cooks soups', es: 'cocina sopas', de: 'kocht Suppen', pt: 'faz sopas', fr: 'cuisine des soupes', it: 'cucina zuppe', zh: '煮汤', ja: 'スープを作る', ko: '수프를 끓인다', hi: 'सूप पकाता है', ar: 'يطبخ الحساء' }),
  fact('fact-28', 'collecting', { ru: 'собирает марки', en: 'collects stamps', es: 'colecciona sellos', de: 'sammelt Briefmarken', pt: 'coleciona selos', fr: 'collectionne les timbres', it: 'colleziona francobolli', zh: '集邮', ja: '切手を集める', ko: '우표를 모은다', hi: 'डाक टिकट जमा करता है', ar: 'يجمع الطوابع' }),
  fact('fact-29', 'creative', { ru: 'играет на укулеле', en: 'plays ukulele', es: 'toca el ukelele', de: 'spielt Ukulele', pt: 'toca ukulele', fr: 'joue du ukulélé', it: 'suona l’ukulele', zh: '弹尤克里里', ja: 'ウクレレを弾く', ko: '우쿨렐레를 친다', hi: 'यूकुलेले बजाता है', ar: 'يعزف الأوكوليلي' }),
  fact('fact-30', 'learning', { ru: 'планирует поездки на поезде', en: 'plans train trips', es: 'planea viajes en tren', de: 'plant Bahnreisen', pt: 'planeja viagens de trem', fr: 'planifie des voyages en train', it: 'pianifica viaggi in treno', zh: '规划火车旅行', ja: '鉄道旅行を計画する', ko: '기차 여행을 계획한다', hi: 'रेल यात्राएँ बनाता है', ar: 'يخطط لرحلات القطار' }),
  fact('fact-31', 'making', { ru: 'складывает оригами', en: 'folds origami', es: 'hace origami', de: 'faltet Origami', pt: 'faz origami', fr: 'plie des origamis', it: 'piega origami', zh: '折纸', ja: '折り紙を折る', ko: '종이접기를 한다', hi: 'ओरिगेमी मोड़ता है', ar: 'يطوي الأوريغامي' }),
  fact('fact-32', 'movement', { ru: 'плавает по утрам', en: 'swims in the morning', es: 'nada por la mañana', de: 'schwimmt morgens', pt: 'nada de manhã', fr: 'nage le matin', it: 'nuota la mattina', zh: '早上游泳', ja: '朝に泳ぐ', ko: '아침에 수영한다', hi: 'सुबह तैरता है', ar: 'يسبح في الصباح' }),
  fact('fact-33', 'nature', { ru: 'ведёт дневник погоды', en: 'keeps a weather log', es: 'lleva un diario del clima', de: 'führt ein Wettertagebuch', pt: 'mantém um diário do tempo', fr: 'tient un journal météo', it: 'tiene un diario del tempo', zh: '记天气日志', ja: '天気の記録をつける', ko: '날씨 일지를 쓴다', hi: 'मौसम की डायरी रखता है', ar: 'يدوّن سجل الطقس' }),
  fact('fact-34', 'learning', { ru: 'изучает старые мосты', en: 'studies old bridges', es: 'estudia puentes antiguos', de: 'erforscht alte Brücken', pt: 'estuda pontes antigas', fr: 'étudie les vieux ponts', it: 'studia i ponti antichi', zh: '研究古桥', ja: '古い橋を調べる', ko: '오래된 다리를 연구한다', hi: 'पुराने पुल पढ़ता है', ar: 'يدرس الجسور القديمة' }),
  fact('fact-35', 'making', { ru: 'делает глиняные чашки', en: 'makes clay cups', es: 'hace tazas de barro', de: 'töpfert Tonbecher', pt: 'faz xícaras de barro', fr: 'façonne des tasses en argile', it: 'modella tazze di argilla', zh: '做陶土杯', ja: '陶器のカップを作る', ko: '도자기 컵을 만든다', hi: 'मिट्टी के कप बनाता है', ar: 'يصنع أكواب الطين' }),
  fact('fact-36', 'creative', { ru: 'записывает звуки города', en: 'records city sounds', es: 'graba sonidos de la ciudad', de: 'nimmt Stadtgeräusche auf', pt: 'grava sons da cidade', fr: 'enregistre les sons de la ville', it: 'registra i suoni della città', zh: '录城市的声音', ja: '街の音を録る', ko: '도시의 소리를 녹음한다', hi: 'शहर की आवाज़ें रिकॉर्ड करता है', ar: 'يسجّل أصوات المدينة' }),
  fact('fact-37', 'nature', { ru: 'ухаживает за суккулентами', en: 'tends succulents', es: 'cuida suculentas', de: 'pflegt Sukkulenten', pt: 'cuida de suculentas', fr: 'entretient des plantes grasses', it: 'cura le piante grasse', zh: '养多肉植物', ja: '多肉植物を育てる', ko: '다육식물을 키운다', hi: 'रसीले पौधे संभालता है', ar: 'يعتني بالنباتات العصارية' }),
  fact('fact-38', 'learning', { ru: 'читает научные журналы', en: 'reads science magazines', es: 'lee revistas de ciencia', de: 'liest Wissenschaftsmagazine', pt: 'lê revistas de ciência', fr: 'lit des revues scientifiques', it: 'legge riviste scientifiche', zh: '读科学杂志', ja: '科学雑誌を読む', ko: '과학 잡지를 읽는다', hi: 'विज्ञान पत्रिकाएँ पढ़ता है', ar: 'يقرأ المجلات العلمية' }),
  fact('fact-39', 'making', { ru: 'восстанавливает блокноты', en: 'restores notebooks', es: 'restaura cuadernos', de: 'restauriert Notizbücher', pt: 'restaura cadernos', fr: 'restaure des carnets', it: 'restaura quaderni', zh: '修复旧笔记本', ja: 'ノートを修復する', ko: '노트를 복원한다', hi: 'पुरानी कॉपियाँ सुधारता है', ar: 'يرمّم الدفاتر' }),
  fact('fact-40', 'nature', { ru: 'учит голоса птиц', en: 'learns bird calls', es: 'aprende cantos de aves', de: 'lernt Vogelstimmen', pt: 'aprende cantos de pássaros', fr: 'apprend les chants d’oiseaux', it: 'impara i canti degli uccelli', zh: '辨认鸟鸣', ja: '鳥の声を覚える', ko: '새소리를 익힌다', hi: 'पक्षियों की बोली सीखता है', ar: 'يتعلم أصوات الطيور' }),
  fact('fact-41', 'creative', { ru: 'составляет фотоальбомы', en: 'makes photo albums', es: 'arma álbumes de fotos', de: 'gestaltet Fotoalben', pt: 'monta álbuns de fotos', fr: 'compose des albums photo', it: 'compone album fotografici', zh: '做相册', ja: 'アルバムを作る', ko: '사진첩을 만든다', hi: 'फोटो एलबम बनाता है', ar: 'يعدّ ألبومات الصور' }),
  fact('fact-42', 'movement', { ru: 'играет в бадминтон', en: 'plays badminton', es: 'juega al bádminton', de: 'spielt Badminton', pt: 'joga badminton', fr: 'joue au badminton', it: 'gioca a badminton', zh: '打羽毛球', ja: 'バドミントンをする', ko: '배드민턴을 친다', hi: 'बैडमिंटन खेलता है', ar: 'يلعب الريشة الطائرة' }),
  fact('fact-43', 'creative', { ru: 'делает зарисовки деревьев', en: 'sketches trees', es: 'dibuja árboles', de: 'skizziert Bäume', pt: 'esboça árvores', fr: 'croque des arbres', it: 'schizza alberi', zh: '速写树木', ja: '木をスケッチする', ko: '나무를 스케치한다', hi: 'पेड़ों के रेखाचित्र बनाता है', ar: 'يخطّط رسوم الأشجار' }),
  fact('fact-44', 'learning', { ru: 'решает числовые головоломки', en: 'solves number puzzles', es: 'resuelve juegos numéricos', de: 'löst Zahlenrätsel', pt: 'resolve enigmas numéricos', fr: 'résout des énigmes de chiffres', it: 'risolve enigmi numerici', zh: '解数字谜题', ja: '数字パズルを解く', ko: '숫자 퍼즐을 푼다', hi: 'संख्या पहेलियाँ हल करता है', ar: 'يحل ألغاز الأرقام' }),
  fact('fact-45', 'making', { ru: 'готовит домашнюю пасту', en: 'makes homemade pasta', es: 'hace pasta casera', de: 'macht Pasta selbst', pt: 'faz massa caseira', fr: 'fait des pâtes maison', it: 'fa la pasta in casa', zh: '做手工意面', ja: '手打ちパスタを作る', ko: '수제 파스타를 만든다', hi: 'घर पर पास्ता बनाता है', ar: 'يعدّ المعكرونة المنزلية' }),
  fact('fact-46', 'learning', { ru: 'посещает библиотеки', en: 'visits libraries', es: 'frecuenta bibliotecas', de: 'geht in Bibliotheken', pt: 'frequenta bibliotecas', fr: 'fréquente les bibliothèques', it: 'frequenta le biblioteche', zh: '常去图书馆', ja: '図書館に通う', ko: '도서관에 다닌다', hi: 'पुस्तकालय जाता है', ar: 'يرتاد المكتبات' }),
  fact('fact-47', 'making', { ru: 'строит воздушных змеев', en: 'builds kites', es: 'construye cometas', de: 'baut Drachen', pt: 'constrói pipas', fr: 'fabrique des cerfs-volants', it: 'costruisce aquiloni', zh: '扎风筝', ja: '凧を作る', ko: '연을 만든다', hi: 'पतंग बनाता है', ar: 'يصنع الطائرات الورقية' }),
  fact('fact-48', 'creative', { ru: 'пишет бумажные письма', en: 'writes paper letters', es: 'escribe cartas en papel', de: 'schreibt Briefe auf Papier', pt: 'escreve cartas em papel', fr: 'écrit des lettres papier', it: 'scrive lettere di carta', zh: '写纸质书信', ja: '手紙を書く', ko: '손편지를 쓴다', hi: 'कागज़ी चिट्ठियाँ लिखता है', ar: 'يكتب رسائل ورقية' }),
];

const BACKGROUNDS = ['#dbeafe', '#fce7f3', '#dcfce7', '#fef3c7', '#ede9fe', '#cffafe', '#fee2e2', '#e0e7ff'] as const;
const FACE_TONES = ['#f5d0b5', '#e7b98f', '#c98f68', '#9d6548', '#7a4b36', '#d7a47c', '#b97955', '#efd1b1'] as const;
const HAIR_COLORS = ['#2f2838', '#4b342a', '#6b442f', '#1f2937', '#7c513a', '#3f352f'] as const;
const ACCENTS = ['#2563eb', '#be185d', '#0f766e', '#b45309', '#6d28d9', '#0369a1'] as const;
const FACE_SHAPES: readonly FaceShape[] = ['oval', 'round', 'long', 'angular'];
const HAIR_STYLES: readonly HairStyle[] = ['crop', 'wave', 'curve', 'parted'];

/**
 * Портрет собирается из индекса, а не из случайности: один и тот же человек
 * выглядит одинаково в любой партии, на любом устройстве и в любой сборке.
 * «Семья» (index % 6) задаёт близких по облику — на них и строится рост
 * похожести дистракторов с уровнем.
 */
function createFace(index: number): SyntheticFaceSpec {
  const family = index % 6;
  const variant = Math.floor(index / 6);
  const faceShape = FACE_SHAPES[(family + Math.floor(variant / 2)) % FACE_SHAPES.length] as FaceShape;
  const hairStyle = HAIR_STYLES[(family + variant) % HAIR_STYLES.length] as HairStyle;
  const backgroundColor = BACKGROUNDS[(family * 3 + variant) % BACKGROUNDS.length] as string;
  const faceTone = FACE_TONES[(variant * 3 + family) % FACE_TONES.length] as string;
  const hairColor = HAIR_COLORS[(family + variant * 2) % HAIR_COLORS.length] as string;
  const accentColor = ACCENTS[(family * 2 + variant) % ACCENTS.length] as string;
  const eyeSpacing = 13 + ((family * 2 + variant) % 5);
  const glasses = (family + variant * 3) % 4 === 0;
  const mouthCurve = -2 + ((family + variant) % 5);
  const assetId = `procedural-face-${String(index + 1).padStart(2, '0')}`;
  return {
    assetId,
    source: 'procedural-synthetic',
    family,
    variant,
    backgroundColor,
    faceTone,
    hairColor,
    accentColor,
    faceShape,
    hairStyle,
    eyeSpacing,
    glasses,
    mouthCurve,
    fingerprint: [
      assetId,
      family,
      variant,
      faceShape,
      hairStyle,
      backgroundColor,
      faceTone,
      hairColor,
      eyeSpacing,
      glasses ? 1 : 0,
      mouthCurve,
    ].join('|'),
  };
}

export const SYNTHETIC_PERSON_LIBRARY: readonly SyntheticPerson[] = NAMES.map((entry, index) => ({
  id: `synthetic-person-${String(index + 1).padStart(2, '0')}`,
  face: createFace(index),
  name: entry.base,
  factId: FACT_LIBRARY[index]?.id ?? `fact-${String(index + 1).padStart(2, '0')}`,
}));

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitution = (previous[rightIndex] as number)
        + (left[leftIndex] === right[rightIndex] ? 0 : 1);
      current.push(Math.min(
        (current[rightIndex] as number) + 1,
        (previous[rightIndex + 1] as number) + 1,
        substitution,
      ));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] as number;
}

export function faceDistance(left: SyntheticPerson, right: SyntheticPerson): number {
  const a = left.face;
  const b = right.face;
  let distance = a.family === b.family ? 0.08 : 0.58;
  if (a.faceShape !== b.faceShape) distance += 0.1;
  if (a.hairStyle !== b.hairStyle) distance += 0.08;
  if (a.hairColor !== b.hairColor) distance += 0.05;
  if (a.glasses !== b.glasses) distance += 0.08;
  distance += Math.min(0.06, Math.abs(a.eyeSpacing - b.eyeSpacing) * 0.015);
  distance += Math.min(0.05, Math.abs(a.mouthCurve - b.mouthCurve) * 0.0125);
  return Math.min(1, distance);
}

/**
 * Считается по КАНОНИЧЕСКОЙ строке — той, что видит ядро. Поэтому подпись в
 * другой письменности на подбор ложных вариантов не влияет: у всех языков
 * лестница сложности одна.
 */
export function nameDistance(left: SyntheticPerson, right: SyntheticPerson): number {
  const a = left.name.toLocaleLowerCase('en');
  const b = right.name.toLocaleLowerCase('en');
  const edit = levenshtein(a, b) / Math.max(a.length, b.length, 1);
  const initialPenalty = a[0] === b[0] ? 0 : 0.25;
  const lengthPenalty = Math.min(0.2, Math.abs(a.length - b.length) * 0.05);
  return Math.min(1, edit * 0.55 + initialPenalty + lengthPenalty);
}

export function combinedPersonDistance(left: SyntheticPerson, right: SyntheticPerson): number {
  return faceDistance(left, right) * 0.68 + nameDistance(left, right) * 0.32;
}

export function factById(id: string): NeutralFact | null {
  return FACT_LIBRARY.find((item) => item.id === id) ?? null;
}

export function factDistance(leftId: string, rightId: string): number {
  const left = factById(leftId);
  const right = factById(rightId);
  if (!left || !right) return 1;
  return left.category === right.category ? 0.2 : 0.9;
}
