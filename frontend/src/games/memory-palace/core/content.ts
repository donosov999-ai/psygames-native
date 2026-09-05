/* psygames-memory-palace-content · VER 2 · 19.08.2026 */
/**
 * МАРШРУТ ИЗ 12 МЕСТ И БИБЛИОТЕКА ИЗ 16 ПРЕДМЕТОВ — НА ВСЕХ ДВЕНАДЦАТИ ЯЗЫКАХ.
 *
 * 🔴 ПОЧЕМУ ЭТО НЕ УКРАШЕНИЕ, А МАТЕРИАЛ УПРАЖНЕНИЯ. Приём мест работает так:
 * человек проговаривает себе связку («в фонтане плавает синяя книга»), а потом
 * достаёт её по месту. Английское «Fountain» и «Blue book» на японском экране
 * ломают не вид, а сам приём: связка перестаёт быть фразой на своём языке и
 * превращается в набор чужих значков, которые ещё надо расшифровать. Словарь
 * модуля (`i18n.ts`) уже переведён на двенадцать — подписи обязаны идти следом,
 * иначе переведённая рамка обрамляет непереведённое содержимое.
 *
 * ⚠️ ПОДПИСИ ОБЯЗАНЫ БЫТЬ ПОПАРНО РАЗНЫМИ ВНУТРИ СВОЕГО ЯЗЫКА. Два предмета с
 * одинаковой подписью — это не задача на память, а нерешаемая проба: у вопроса
 * «что лежало здесь» оказалось бы два верных ответа. Отсюда и способ различения:
 * ЦВЕТ + ПРЕДМЕТ, а не один только предмет. Сверяется гейтом games-module-i18n.
 *
 * ⚠️ ЦВЕТ В ПОДПИСИ ДОЛЖЕН СОВПАДАТЬ С ЦВЕТОМ НА ЭКРАНЕ (поле `color` рядом).
 * «Синяя книга» с зелёной картинкой — это не подсказка, а помеха, и на
 * нелатинских языках её уже не заметить глазами при беглой проверке.
 *
 * ⚠️ ПОРТУГАЛЬСКИЙ — БРАЗИЛЬСКИЙ: `xícara`, а не `chávena`.
 */
import type { MemoryPalaceLocale, PalaceItem, PalaceLocus } from './types';

export const FIXED_PALACE_ROUTE: readonly PalaceLocus[] = [
  {
    id: 'gate', order: 1, motif: 'arch', color: '#7356a8',
    label: {
      ru: 'Арка входа', en: 'Entrance arch', es: 'Arco de entrada', de: 'Eingangsbogen',
      zh: '入口拱门', hi: 'प्रवेश-मेहराब', pt: 'Arco de entrada', fr: 'Arche d’entrée',
      it: 'Arco d’ingresso', ja: '入口のアーチ', ko: '입구 아치', ar: 'قوس المدخل',
    },
  },
  {
    id: 'fountain', order: 2, motif: 'water', color: '#2c8db9',
    label: {
      ru: 'Фонтан', en: 'Fountain', es: 'Fuente', de: 'Brunnen',
      zh: '喷泉', hi: 'फ़व्वारा', pt: 'Fonte', fr: 'Fontaine',
      it: 'Fontana', ja: '噴水', ko: '분수', ar: 'النافورة',
    },
  },
  {
    id: 'gallery', order: 3, motif: 'frames', color: '#b05f6d',
    label: {
      ru: 'Галерея', en: 'Gallery', es: 'Galería', de: 'Galerie',
      zh: '画廊', hi: 'चित्रशाला', pt: 'Galeria', fr: 'Galerie',
      it: 'Galleria', ja: '画廊', ko: '화랑', ar: 'الرواق',
    },
  },
  {
    id: 'stairs', order: 4, motif: 'steps', color: '#9a784f',
    label: {
      ru: 'Лестница', en: 'Stairway', es: 'Escalera', de: 'Treppe',
      zh: '楼梯', hi: 'सीढ़ी', pt: 'Escada', fr: 'Escalier',
      it: 'Scala', ja: '階段', ko: '계단', ar: 'الدرج',
    },
  },
  {
    id: 'window', order: 5, motif: 'window', color: '#3e89a3',
    label: {
      ru: 'Высокое окно', en: 'Tall window', es: 'Ventanal', de: 'Hohes Fenster',
      zh: '高窗', hi: 'ऊँची खिड़की', pt: 'Janela alta', fr: 'Haute fenêtre',
      it: 'Finestra alta', ja: '高い窓', ko: '높은 창', ar: 'النافذة العالية',
    },
  },
  {
    id: 'library', order: 6, motif: 'shelves', color: '#895849',
    label: {
      ru: 'Библиотека', en: 'Library', es: 'Biblioteca', de: 'Bibliothek',
      zh: '书房', hi: 'पुस्तकालय', pt: 'Biblioteca', fr: 'Bibliothèque',
      it: 'Biblioteca', ja: '書庫', ko: '서재', ar: 'المكتبة',
    },
  },
  {
    id: 'balcony', order: 7, motif: 'rail', color: '#54718f',
    label: {
      ru: 'Балкон', en: 'Balcony', es: 'Balcón', de: 'Balkon',
      zh: '阳台', hi: 'बालकनी', pt: 'Varanda', fr: 'Balcon',
      it: 'Balcone', ja: 'バルコニー', ko: '발코니', ar: 'الشرفة',
    },
  },
  {
    id: 'garden', order: 8, motif: 'plant', color: '#4c8b64',
    label: {
      ru: 'Зимний сад', en: 'Winter garden', es: 'Jardín de invierno', de: 'Wintergarten',
      zh: '暖房', hi: 'शीत-उद्यान', pt: 'Jardim de inverno', fr: 'Jardin d’hiver',
      it: 'Giardino d’inverno', ja: '温室', ko: '온실', ar: 'الحديقة الشتوية',
    },
  },
  {
    id: 'workshop', order: 9, motif: 'tools', color: '#a6693d',
    label: {
      ru: 'Мастерская', en: 'Workshop', es: 'Taller', de: 'Werkstatt',
      zh: '工坊', hi: 'कारख़ाना', pt: 'Oficina', fr: 'Atelier',
      it: 'Officina', ja: '工房', ko: '작업실', ar: 'الورشة',
    },
  },
  {
    id: 'tower', order: 10, motif: 'spire', color: '#775f9a',
    label: {
      ru: 'Башня', en: 'Tower', es: 'Torre', de: 'Turm',
      zh: '塔楼', hi: 'मीनार', pt: 'Torre', fr: 'Tour',
      it: 'Torre', ja: '塔', ko: '탑', ar: 'البرج',
    },
  },
  {
    id: 'bridge', order: 11, motif: 'span', color: '#4c7894',
    label: {
      ru: 'Небесный мост', en: 'Sky bridge', es: 'Puente aéreo', de: 'Himmelsbrücke',
      zh: '天桥', hi: 'आकाश-पुल', pt: 'Ponte aérea', fr: 'Pont aérien',
      it: 'Ponte sospeso', ja: '空中回廊', ko: '하늘 다리', ar: 'الجسر المعلّق',
    },
  },
  {
    id: 'observatory', order: 12, motif: 'stars', color: '#4b568d',
    label: {
      ru: 'Обсерватория', en: 'Observatory', es: 'Observatorio', de: 'Sternwarte',
      zh: '观星台', hi: 'वेधशाला', pt: 'Observatório', fr: 'Observatoire',
      it: 'Osservatorio', ja: '天文台', ko: '천문대', ar: 'المرصد',
    },
  },
];

export const PALACE_ITEM_LIBRARY: readonly PalaceItem[] = [
  {
    id: 'apple', shape: 'round', color: '#d84f4b', accent: '#7f2827',
    label: {
      ru: 'Красное яблоко', en: 'Red apple', es: 'Manzana roja', de: 'Roter Apfel',
      zh: '红苹果', hi: 'लाल सेब', pt: 'Maçã vermelha', fr: 'Pomme rouge',
      it: 'Mela rossa', ja: '赤いりんご', ko: '빨간 사과', ar: 'تفاحة حمراء',
    },
  },
  {
    id: 'book', shape: 'square', color: '#446bc4', accent: '#253f83',
    label: {
      ru: 'Синяя книга', en: 'Blue book', es: 'Libro azul', de: 'Blaues Buch',
      zh: '蓝色的书', hi: 'नीली किताब', pt: 'Livro azul', fr: 'Livre bleu',
      it: 'Libro blu', ja: '青い本', ko: '파란 책', ar: 'كتاب أزرق',
    },
  },
  {
    id: 'key', shape: 'capsule', color: '#d6a32c', accent: '#7d5a12',
    label: {
      ru: 'Золотой ключ', en: 'Golden key', es: 'Llave dorada', de: 'Goldener Schlüssel',
      zh: '金钥匙', hi: 'सुनहरी चाबी', pt: 'Chave dourada', fr: 'Clé dorée',
      it: 'Chiave dorata', ja: '金の鍵', ko: '금빛 열쇠', ar: 'مفتاح ذهبي',
    },
  },
  {
    id: 'leaf', shape: 'diamond', color: '#4b9a5b', accent: '#24552e',
    label: {
      ru: 'Зелёный лист', en: 'Green leaf', es: 'Hoja verde', de: 'Grünes Blatt',
      zh: '绿叶子', hi: 'हरा पत्ता', pt: 'Folha verde', fr: 'Feuille verte',
      it: 'Foglia verde', ja: '緑の葉', ko: '초록 잎', ar: 'ورقة خضراء',
    },
  },
  {
    id: 'cup', shape: 'arch', color: '#36a5a0', accent: '#17605e',
    label: {
      ru: 'Бирюзовая чашка', en: 'Turquoise cup', es: 'Taza turquesa', de: 'Türkise Tasse',
      zh: '青绿杯子', hi: 'फ़िरोज़ी प्याला', pt: 'Xícara turquesa', fr: 'Tasse turquoise',
      it: 'Tazza turchese', ja: '青緑のカップ', ko: '청록 잔', ar: 'كوب فيروزي',
    },
  },
  {
    id: 'lamp', shape: 'triangle', color: '#e4863f', accent: '#87451c',
    label: {
      ru: 'Оранжевая лампа', en: 'Orange lamp', es: 'Lámpara naranja', de: 'Orange Lampe',
      zh: '橙色台灯', hi: 'नारंगी लैंप', pt: 'Luminária laranja', fr: 'Lampe orange',
      it: 'Lampada arancione', ja: 'だいだい色のランプ', ko: '주황 등', ar: 'مصباح برتقالي',
    },
  },
  {
    id: 'boat', shape: 'capsule', color: '#48a5d1', accent: '#236181',
    label: {
      ru: 'Голубая лодка', en: 'Blue boat', es: 'Barca celeste', de: 'Hellblaues Boot',
      zh: '浅蓝小船', hi: 'आसमानी नाव', pt: 'Barco azul-claro', fr: 'Barque bleu ciel',
      it: 'Barca azzurra', ja: '水色の舟', ko: '하늘색 배', ar: 'قارب سماوي',
    },
  },
  {
    id: 'bell', shape: 'arch', color: '#e5bd38', accent: '#846813',
    label: {
      ru: 'Жёлтый колокол', en: 'Yellow bell', es: 'Campana amarilla', de: 'Gelbe Glocke',
      zh: '黄铃铛', hi: 'पीली घंटी', pt: 'Sino amarelo', fr: 'Cloche jaune',
      it: 'Campana gialla', ja: '黄色い鐘', ko: '노란 종', ar: 'جرس أصفر',
    },
  },
  {
    id: 'kite', shape: 'diamond', color: '#9664c6', accent: '#563579',
    label: {
      ru: 'Фиолетовый змей', en: 'Violet kite', es: 'Cometa violeta', de: 'Violetter Drachen',
      zh: '紫风筝', hi: 'बैंगनी पतंग', pt: 'Pipa violeta', fr: 'Cerf-volant violet',
      it: 'Aquilone viola', ja: '紫のたこ', ko: '보라 연', ar: 'طائرة ورقية بنفسجية',
    },
  },
  {
    id: 'crown', shape: 'triangle', color: '#dd9630', accent: '#7f5012',
    label: {
      ru: 'Янтарная корона', en: 'Amber crown', es: 'Corona ámbar', de: 'Bernsteinkrone',
      zh: '琥珀王冠', hi: 'कहरुवा मुकुट', pt: 'Coroa âmbar', fr: 'Couronne ambrée',
      it: 'Corona d’ambra', ja: '琥珀の王冠', ko: '호박빛 왕관', ar: 'تاج كهرماني',
    },
  },
  {
    id: 'clock', shape: 'round', color: '#43506e', accent: '#202739',
    label: {
      ru: 'Тёмные часы', en: 'Dark clock', es: 'Reloj oscuro', de: 'Dunkle Uhr',
      zh: '深色时钟', hi: 'गहरे रंग की घड़ी', pt: 'Relógio escuro', fr: 'Horloge sombre',
      it: 'Orologio scuro', ja: '黒っぽい時計', ko: '어두운 시계', ar: 'ساعة داكنة',
    },
  },
  {
    id: 'camera', shape: 'square', color: '#55a58d', accent: '#285d4d',
    label: {
      ru: 'Мятная камера', en: 'Mint camera', es: 'Cámara menta', de: 'Mintfarbene Kamera',
      zh: '薄荷色相机', hi: 'पुदीना रंग का कैमरा', pt: 'Câmera menta', fr: 'Appareil photo menthe',
      // «Fotocamera», а не «Macchina fotografica»: обиходное итальянское слово и
      // единственная из 192 подписей, которой в плитке изучения не хватало двух
      // строк — 147 точек кеглем 10 против 92 доступных (замер 05.09.2026).
      it: 'Fotocamera menta', ja: 'ミント色のカメラ', ko: '민트색 사진기', ar: 'كاميرا نعناعية',
    },
  },
  {
    id: 'feather', shape: 'capsule', color: '#d77ba0', accent: '#7d3b58',
    label: {
      ru: 'Розовое перо', en: 'Pink feather', es: 'Pluma rosa', de: 'Rosa Feder',
      zh: '粉羽毛', hi: 'गुलाबी पंख', pt: 'Pena rosa', fr: 'Plume rose',
      it: 'Piuma rosa', ja: 'ピンクの羽', ko: '분홍 깃털', ar: 'ريشة وردية',
    },
  },
  {
    id: 'shell', shape: 'round', color: '#df775e', accent: '#83392d',
    label: {
      ru: 'Коралловая ракушка', en: 'Coral shell', es: 'Concha coral', de: 'Korallenmuschel',
      zh: '珊瑚色贝壳', hi: 'मूँगा रंग का सीप', pt: 'Concha coral', fr: 'Coquillage corail',
      it: 'Conchiglia corallo', ja: 'さんご色の貝', ko: '산호빛 조개', ar: 'صدفة مرجانية',
    },
  },
  {
    id: 'compass', shape: 'round', color: '#5d84a6', accent: '#2d4a63',
    label: {
      ru: 'Стальной компас', en: 'Steel compass', es: 'Brújula de acero', de: 'Stahlkompass',
      zh: '钢罗盘', hi: 'इस्पात का दिक्सूचक', pt: 'Bússola de aço', fr: 'Boussole d’acier',
      it: 'Bussola d’acciaio', ja: '鋼のコンパス', ko: '강철 나침반', ar: 'بوصلة فولاذية',
    },
  },
  {
    id: 'violin', shape: 'capsule', color: '#9b5d3c', accent: '#552f1d',
    label: {
      ru: 'Каштановая скрипка', en: 'Chestnut violin', es: 'Violín castaño', de: 'Kastanienbraune Geige',
      zh: '栗色小提琴', hi: 'कत्थई वायलिन', pt: 'Violino castanho', fr: 'Violon châtaigne',
      it: 'Violino castano', ja: '栗色のバイオリン', ko: '밤색 바이올린', ar: 'كمان كستنائي',
    },
  },
];

/** Незнакомый язык — английский, а не пустая подпись под местом. */
export function getLocusLabel(locus: PalaceLocus, locale: MemoryPalaceLocale): string {
  return locus.label[locale] ?? locus.label.en;
}

/** Незнакомый язык — английский, а не пустая подпись на карточке предмета. */
export function getItemLabel(item: PalaceItem, locale: MemoryPalaceLocale): string {
  return item.label[locale] ?? item.label.en;
}
