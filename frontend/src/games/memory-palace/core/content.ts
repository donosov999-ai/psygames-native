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

  /* ------------------------------------------------------------------ *
   *  ЗАПАС 07.09.2026: сорок предметов, добавленных вместе с картинками.
   *
   *  📍 ЗАЧЕМ. До этого библиотека была 16 предметов, а на пятнадцатом уровне
   *  партия берёт 12 целевых плюс 4 лишних — то есть ВЕСЬ набор, и партии
   *  повторялись по составу. Теперь 56: на верхнем уровне выбирается 16 из 56.
   *
   *  Картинки лежат в assets/images/palace/<id>.webp, карта собрана
   *  scripts/build-palace-items.mjs. shape/color/accent оставлены для запасной
   *  фигуры: если картинка не загрузилась, предмет всё равно виден.
   * ------------------------------------------------------------------ */
  {
    id: 'pencil', shape: 'capsule', color: '#e0a63c', accent: '#8a5f14',
    label: {
      ru: 'Деревянный карандаш', en: 'Wooden pencil', es: 'Lápiz de madera', de: 'Holzstift',
      zh: '木铅笔', hi: 'लकड़ी की पेंसिल', pt: 'Lápis de madeira', fr: 'Crayon en bois',
      it: 'Matita di legno', ja: '木の鉛筆', ko: '나무 연필', ar: 'قلم خشبي',
    },
  },
  {
    id: 'hourglass', shape: 'arch', color: '#b5854a', accent: '#6b4a21',
    label: {
      ru: 'Песочные часы', en: 'Sand hourglass', es: 'Reloj de arena', de: 'Sanduhr',
      zh: '沙漏', hi: 'रेत घड़ी', pt: 'Ampulheta de areia', fr: 'Sablier de sable',
      it: 'Clessidra di sabbia', ja: '砂時計', ko: '모래시계', ar: 'ساعة رملية',
    },
  },
  {
    id: 'mushroom', shape: 'arch', color: '#d24b47', accent: '#7d2422',
    label: {
      ru: 'Красный мухомор', en: 'Red toadstool', es: 'Seta roja', de: 'Roter Fliegenpilz',
      zh: '红蘑菇', hi: 'लाल मशरूम', pt: 'Cogumelo vermelho', fr: 'Champignon rouge',
      it: 'Fungo rosso', ja: '赤いキノコ', ko: '빨간 버섯', ar: 'فطر أحمر',
    },
  },
  {
    id: 'boot', shape: 'square', color: '#8a5a34', accent: '#4d3018',
    label: {
      ru: 'Кожаный ботинок', en: 'Leather boot', es: 'Bota de cuero', de: 'Lederstiefel',
      zh: '皮靴', hi: 'चमड़े का जूता', pt: 'Bota de couro', fr: 'Botte en cuir',
      it: 'Stivale di pelle', ja: '革のブーツ', ko: '가죽 부츠', ar: 'حذاء جلدي',
    },
  },
  {
    id: 'candle', shape: 'capsule', color: '#efe3c4', accent: '#9a8b62',
    label: {
      ru: 'Белая свеча', en: 'White candle', es: 'Vela blanca', de: 'Weiße Kerze',
      zh: '白蜡烛', hi: 'सफ़ेद मोमबत्ती', pt: 'Vela branca', fr: 'Bougie blanche',
      it: 'Candela bianca', ja: '白いろうそく', ko: '하얀 양초', ar: 'شمعة بيضاء',
    },
  },
  {
    id: 'cactus', shape: 'triangle', color: '#4f9a4a', accent: '#25551f',
    label: {
      ru: 'Зелёный кактус', en: 'Green cactus', es: 'Cactus verde', de: 'Grüner Kaktus',
      zh: '绿仙人掌', hi: 'हरा कैक्टस', pt: 'Cato verde', fr: 'Cactus vert',
      it: 'Cactus verde', ja: '緑のサボテン', ko: '초록 선인장', ar: 'صبار أخضر',
    },
  },
  {
    id: 'ring', shape: 'round', color: '#e0b33c', accent: '#8a6714',
    label: {
      ru: 'Золотое кольцо', en: 'Gold ring', es: 'Anillo de oro', de: 'Goldring',
      zh: '金戒指', hi: 'सोने की अंगूठी', pt: 'Anel de ouro', fr: 'Bague en or',
      it: 'Anello d’oro', ja: '金の指輪', ko: '금반지', ar: 'خاتم ذهبي',
    },
  },
  {
    id: 'umbrella', shape: 'triangle', color: '#3b7fc4', accent: '#1b4372',
    label: {
      ru: 'Синий зонт', en: 'Blue umbrella', es: 'Paraguas azul', de: 'Blauer Schirm',
      zh: '蓝雨伞', hi: 'नीला छाता', pt: 'Guarda-chuva azul', fr: 'Parapluie bleu',
      it: 'Ombrello blu', ja: '青い傘', ko: '파란 우산', ar: 'مظلة زرقاء',
    },
  },
  {
    id: 'scissors', shape: 'diamond', color: '#c94a4a', accent: '#6f2222',
    label: {
      ru: 'Красные ножницы', en: 'Red scissors', es: 'Tijeras rojas', de: 'Rote Schere',
      zh: '红剪刀', hi: 'लाल कैंची', pt: 'Tesoura vermelha', fr: 'Ciseaux rouges',
      it: 'Forbici rosse', ja: '赤いはさみ', ko: '빨간 가위', ar: 'مقص أحمر',
    },
  },
  {
    id: 'fork', shape: 'capsule', color: '#a8b0b8', accent: '#5c646c',
    label: {
      ru: 'Стальная вилка', en: 'Steel fork', es: 'Tenedor de acero', de: 'Stahlgabel',
      zh: '钢叉', hi: 'स्टील का कांटा', pt: 'Garfo de aço', fr: 'Fourchette en acier',
      it: 'Forchetta d’acciaio', ja: '鋼のフォーク', ko: '강철 포크', ar: 'شوكة فولاذية',
    },
  },
  {
    id: 'teapot', shape: 'arch', color: '#dcc9a8', accent: '#8a7550',
    label: {
      ru: 'Керамический чайник', en: 'Ceramic teapot', es: 'Tetera de cerámica', de: 'Keramikkanne',
      zh: '陶瓷茶壶', hi: 'चीनी मिट्टी का चायदान', pt: 'Bule de cerâmica', fr: 'Théière en céramique',
      it: 'Teiera di ceramica', ja: '陶器のティーポット', ko: '도자기 주전자', ar: 'إبريق خزفي',
    },
  },
  {
    id: 'strawhat', shape: 'arch', color: '#d9b667', accent: '#8a6c25',
    label: {
      ru: 'Соломенная шляпа', en: 'Straw hat', es: 'Sombrero de paja', de: 'Strohhut',
      zh: '草帽', hi: 'पुआल की टोपी', pt: 'Chapéu de palha', fr: 'Chapeau de paille',
      it: 'Cappello di paglia', ja: '麦わら帽子', ko: '밀짚모자', ar: 'قبعة قش',
    },
  },
  {
    id: 'mirror', shape: 'round', color: '#bcd4e2', accent: '#5f7d8c',
    label: {
      ru: 'Круглое зеркало', en: 'Round mirror', es: 'Espejo redondo', de: 'Runder Spiegel',
      zh: '圆镜子', hi: 'गोल दर्पण', pt: 'Espelho redondo', fr: 'Miroir rond',
      it: 'Specchio rotondo', ja: '丸い鏡', ko: '둥근 거울', ar: 'مرآة مستديرة',
    },
  },
  {
    id: 'violet', shape: 'diamond', color: '#8a5ac4', accent: '#4a2a72',
    label: {
      ru: 'Фиолетовая фиалка', en: 'Purple violet', es: 'Violeta morada', de: 'Violettes Veilchen',
      zh: '紫罗兰', hi: 'बैंगनी फूल', pt: 'Violeta roxa', fr: 'Violette pourpre',
      it: 'Violetta viola', ja: '紫のスミレ', ko: '보라색 제비꽃', ar: 'بنفسج أرجواني',
    },
  },
  {
    id: 'lemon', shape: 'round', color: '#e8cf3c', accent: '#8a7a14',
    label: {
      ru: 'Жёлтый лимон', en: 'Yellow lemon', es: 'Limón amarillo', de: 'Gelbe Zitrone',
      zh: '黄柠檬', hi: 'पीला नींबू', pt: 'Limão amarelo', fr: 'Citron jaune',
      it: 'Limone giallo', ja: '黄色いレモン', ko: '노란 레몬', ar: 'ليمونة صفراء',
    },
  },
  {
    id: 'walnut', shape: 'round', color: '#a67a4a', accent: '#5e4021',
    label: {
      ru: 'Грецкий орех', en: 'Walnut kernel', es: 'Nuez de nogal', de: 'Walnuss',
      zh: '核桃', hi: 'अखरोट', pt: 'Noz', fr: 'Noix de Grenoble',
      it: 'Noce', ja: 'クルミ', ko: '호두', ar: 'جوزة',
    },
  },
  {
    id: 'spoon', shape: 'capsule', color: '#b4bcc4', accent: '#646c74',
    label: {
      ru: 'Серебряная ложка', en: 'Silver spoon', es: 'Cuchara de plata', de: 'Silberlöffel',
      zh: '银勺子', hi: 'चांदी का चम्मच', pt: 'Colher de prata', fr: 'Cuillère en argent',
      it: 'Cucchiaio d’argento', ja: '銀のスプーン', ko: '은수저', ar: 'ملعقة فضية',
    },
  },
  {
    id: 'ladder', shape: 'square', color: '#c49a5a', accent: '#7a5a25',
    label: {
      ru: 'Деревянная лестница', en: 'Wooden ladder', es: 'Escalera de madera', de: 'Holzleiter',
      zh: '木梯子', hi: 'लकड़ी की सीढ़ी', pt: 'Escada de madeira', fr: 'Échelle en bois',
      it: 'Scala di legno', ja: '木のはしご', ko: '나무 사다리', ar: 'سلم خشبي',
    },
  },
  {
    id: 'suitcase', shape: 'square', color: '#8a5f3c', accent: '#4d3320',
    label: {
      ru: 'Коричневый чемодан', en: 'Brown suitcase', es: 'Maleta marrón', de: 'Brauner Koffer',
      zh: '棕手提箱', hi: 'भूरा सूटकेस', pt: 'Mala castanha', fr: 'Valise brune',
      it: 'Valigia marrone', ja: '茶色のスーツケース', ko: '갈색 여행가방', ar: 'حقيبة بنية',
    },
  },
  {
    id: 'backpack', shape: 'square', color: '#3b6fc4', accent: '#1b3a72',
    label: {
      ru: 'Синий рюкзак', en: 'Blue backpack', es: 'Mochila azul', de: 'Blauer Rucksack',
      zh: '蓝背包', hi: 'नीला बैग', pt: 'Mochila azul', fr: 'Sac à dos bleu',
      it: 'Zaino blu', ja: '青いリュック', ko: '파란 배낭', ar: 'حقيبة ظهر زرقاء',
    },
  },
  {
    id: 'brick', shape: 'square', color: '#c46a45', accent: '#743622',
    label: {
      ru: 'Красный кирпич', en: 'Red brick', es: 'Ladrillo rojo', de: 'Roter Ziegel',
      zh: '红砖', hi: 'लाल ईंट', pt: 'Tijolo vermelho', fr: 'Brique rouge',
      it: 'Mattone rosso', ja: '赤いレンガ', ko: '빨간 벽돌', ar: 'طوبة حمراء',
    },
  },
  {
    id: 'honeyjar', shape: 'arch', color: '#e0a52c', accent: '#8a6314',
    label: {
      ru: 'Банка мёда', en: 'Jar of honey', es: 'Tarro de miel', de: 'Honigglas',
      zh: '蜂蜜罐', hi: 'शहद का जार', pt: 'Pote de mel', fr: 'Pot de miel',
      it: 'Vasetto di miele', ja: 'はちみつの瓶', ko: '꿀단지', ar: 'برطمان عسل',
    },
  },
  {
    id: 'anchor', shape: 'diamond', color: '#8c98a4', accent: '#4c545c',
    label: {
      ru: 'Железный якорь', en: 'Iron anchor', es: 'Ancla de hierro', de: 'Eisenanker',
      zh: '铁锚', hi: 'लोहे का लंगर', pt: 'Âncora de ferro', fr: 'Ancre en fer',
      it: 'Ancora di ferro', ja: '鉄の錨', ko: '철 닻', ar: 'مرساة حديدية',
    },
  },
  {
    id: 'envelope', shape: 'square', color: '#eae4dc', accent: '#948e86',
    label: {
      ru: 'Белый конверт', en: 'White envelope', es: 'Sobre blanco', de: 'Weißer Umschlag',
      zh: '白信封', hi: 'सफ़ेद लिफ़ाफ़ा', pt: 'Envelope branco', fr: 'Enveloppe blanche',
      it: 'Busta bianca', ja: '白い封筒', ko: '하얀 봉투', ar: 'ظرف أبيض',
    },
  },
  {
    id: 'chair', shape: 'square', color: '#a5713c', accent: '#5e3f20',
    label: {
      ru: 'Деревянный стул', en: 'Wooden chair', es: 'Silla de madera', de: 'Holzstuhl',
      zh: '木椅子', hi: 'लकड़ी की कुर्सी', pt: 'Cadeira de madeira', fr: 'Chaise en bois',
      it: 'Sedia di legno', ja: '木の椅子', ko: '나무 의자', ar: 'كرسي خشبي',
    },
  },
  {
    id: 'wateringcan', shape: 'arch', color: '#4faa4a', accent: '#25601f',
    label: {
      ru: 'Зелёная лейка', en: 'Green watering can', es: 'Regadera verde', de: 'Grüne Gießkanne',
      zh: '绿洒水壶', hi: 'हरा पानी का डिब्बा', pt: 'Regador verde', fr: 'Arrosoir vert',
      it: 'Annaffiatoio verde', ja: '緑のじょうろ', ko: '초록 물뿌리개', ar: 'مرشة خضراء',
    },
  },
  {
    id: 'rubberduck', shape: 'round', color: '#e8c62c', accent: '#8a7414',
    label: {
      ru: 'Жёлтый утёнок', en: 'Yellow rubber duck', es: 'Patito amarillo', de: 'Gelbe Gummiente',
      zh: '黄鸭子', hi: 'पीली बत्तख', pt: 'Patinho amarelo', fr: 'Canard jaune',
      it: 'Paperella gialla', ja: '黄色いアヒル', ko: '노란 오리', ar: 'بطة صفراء',
    },
  },
  {
    id: 'guitar', shape: 'capsule', color: '#c4442c', accent: '#722214',
    label: {
      ru: 'Красная гитара', en: 'Red guitar', es: 'Guitarra roja', de: 'Rote Gitarre',
      zh: '红吉他', hi: 'लाल गिटार', pt: 'Guitarra vermelha', fr: 'Guitare rouge',
      it: 'Chitarra rossa', ja: '赤いギター', ko: '빨간 기타', ar: 'جيتار أحمر',
    },
  },
  {
    id: 'thermos', shape: 'capsule', color: '#3b7ab4', accent: '#1b4166',
    label: {
      ru: 'Синий термос', en: 'Blue thermos', es: 'Termo azul', de: 'Blaue Thermoskanne',
      zh: '蓝保温瓶', hi: 'नीला थर्मस', pt: 'Garrafa térmica azul', fr: 'Thermos bleu',
      it: 'Thermos blu', ja: '青い水筒', ko: '파란 보온병', ar: 'ترمس أزرق',
    },
  },
  {
    id: 'spinningtop', shape: 'triangle', color: '#d9a45a', accent: '#8a6425',
    label: {
      ru: 'Деревянная юла', en: 'Wooden spinning top', es: 'Peonza de madera', de: 'Holzkreisel',
      zh: '木陀螺', hi: 'लकड़ी का लट्टू', pt: 'Pião de madeira', fr: 'Toupie en bois',
      it: 'Trottola di legno', ja: '木のこま', ko: '나무 팽이', ar: 'نحلة خشبية',
    },
  },
  {
    id: 'whistle', shape: 'capsule', color: '#b0b8c0', accent: '#606870',
    label: {
      ru: 'Стальной свисток', en: 'Steel whistle', es: 'Silbato de acero', de: 'Stahlpfeife',
      zh: '钢哨子', hi: 'स्टील की सीटी', pt: 'Apito de aço', fr: 'Sifflet en acier',
      it: 'Fischietto d’acciaio', ja: '鋼のホイッスル', ko: '강철 호루라기', ar: 'صافرة فولاذية',
    },
  },
  {
    id: 'pumpkin', shape: 'round', color: '#e08a2c', accent: '#8a5014',
    label: {
      ru: 'Оранжевая тыква', en: 'Orange pumpkin', es: 'Calabaza naranja', de: 'Orangefarbener Kürbis',
      zh: '橙南瓜', hi: 'नारंगी कद्दू', pt: 'Abóbora laranja', fr: 'Citrouille orange',
      it: 'Zucca arancione', ja: 'オレンジのカボチャ', ko: '주황 호박', ar: 'يقطينة برتقالية',
    },
  },
  {
    id: 'saucer', shape: 'round', color: '#eeeeee', accent: '#909090',
    label: {
      ru: 'Белое блюдце', en: 'White saucer', es: 'Platillo blanco', de: 'Weiße Untertasse',
      zh: '白碟子', hi: 'सफ़ेद तश्तरी', pt: 'Pires branco', fr: 'Soucoupe blanche',
      it: 'Piattino bianco', ja: '白い受け皿', ko: '하얀 받침접시', ar: 'صحن أبيض',
    },
  },
  {
    id: 'bottle', shape: 'capsule', color: '#3c7a3c', accent: '#1c451c',
    label: {
      ru: 'Зелёная бутылка', en: 'Green bottle', es: 'Botella verde', de: 'Grüne Flasche',
      zh: '绿瓶子', hi: 'हरी बोतल', pt: 'Garrafa verde', fr: 'Bouteille verte',
      it: 'Bottiglia verde', ja: '緑の瓶', ko: '초록 병', ar: 'زجاجة خضراء',
    },
  },
  {
    id: 'coin', shape: 'round', color: '#c48a4a', accent: '#744e21',
    label: {
      ru: 'Медная монета', en: 'Copper coin', es: 'Moneda de cobre', de: 'Kupfermünze',
      zh: '铜硬币', hi: 'तांबे का सिक्का', pt: 'Moeda de cobre', fr: 'Pièce de cuivre',
      it: 'Moneta di rame', ja: '銅貨', ko: '구리 동전', ar: 'عملة نحاسية',
    },
  },
  {
    id: 'mitten', shape: 'arch', color: '#3b6fb4', accent: '#1b3a66',
    label: {
      ru: 'Синяя варежка', en: 'Blue mitten', es: 'Manopla azul', de: 'Blauer Fäustling',
      zh: '蓝手套', hi: 'नीला दस्ताना', pt: 'Luva azul', fr: 'Moufle bleue',
      it: 'Muffola blu', ja: '青いミトン', ko: '파란 장갑', ar: 'قفاز أزرق',
    },
  },
  {
    id: 'acorn', shape: 'arch', color: '#a57444', accent: '#5e401f',
    label: {
      ru: 'Дубовый жёлудь', en: 'Oak acorn', es: 'Bellota de roble', de: 'Eichel',
      zh: '橡子', hi: 'बलूत का फल', pt: 'Bolota de carvalho', fr: 'Gland de chêne',
      it: 'Ghianda di quercia', ja: 'ドングリ', ko: '도토리', ar: 'بلوطة',
    },
  },
  {
    id: 'quill', shape: 'capsule', color: '#e8e8e8', accent: '#8c8c8c',
    label: {
      ru: 'Белое перо-ручка', en: 'White quill pen', es: 'Pluma blanca', de: 'Weiße Federkiel',
      zh: '白羽毛笔', hi: 'सफ़ेद पंख कलम', pt: 'Pena branca', fr: 'Plume blanche',
      it: 'Penna d’oca bianca', ja: '白い羽根ペン', ko: '하얀 깃펜', ar: 'ريشة بيضاء',
    },
  },
  {
    id: 'ribbon', shape: 'round', color: '#c4344c', accent: '#721e2c',
    label: {
      ru: 'Красная лента', en: 'Red ribbon', es: 'Cinta roja', de: 'Rotes Band',
      zh: '红丝带', hi: 'लाल रिबन', pt: 'Fita vermelha', fr: 'Ruban rouge',
      it: 'Nastro rosso', ja: '赤いリボン', ko: '빨간 리본', ar: 'شريط أحمر',
    },
  },
  {
    id: 'stone', shape: 'round', color: '#9aa0a4', accent: '#565c60',
    label: {
      ru: 'Серый камень', en: 'Grey stone', es: 'Piedra gris', de: 'Grauer Stein',
      zh: '灰石头', hi: 'धूसर पत्थर', pt: 'Pedra cinzenta', fr: 'Pierre grise',
      it: 'Pietra grigia', ja: '灰色の石', ko: '회색 돌', ar: 'حجر رمادي',
    },
  }
];

/** Незнакомый язык — английский, а не пустая подпись под местом. */
export function getLocusLabel(locus: PalaceLocus, locale: MemoryPalaceLocale): string {
  return locus.label[locale] ?? locus.label.en;
}

/** Незнакомый язык — английский, а не пустая подпись на карточке предмета. */
export function getItemLabel(item: PalaceItem, locale: MemoryPalaceLocale): string {
  return item.label[locale] ?? item.label.en;
}
