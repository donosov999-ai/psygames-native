// Общая высокочастотная лексика на всех 7 языках приложения (~180 слов).
// Режим «Перевод» игры «Пары слов»: word1 = entry[baseLang], word2 = entry[targetLang].
// Базовый язык = язык интерфейса, целевой — выбор юзера.
//
// ⚠️ Машинно-выверенные базовые слова — годятся для тренировки, но перед стор-листингами
//    нативная вычитка (особенно hi/zh). Региональные варианты под крупные рынки
//    (pt-BR cachorro, es coche). Глаголы — в словарной форме.
//
// ⚠️ ВНУТРИ одного языка переводы не должны дублироваться (логика матчинга сверяет по word2).
//    Поэтому разведены/убраны омонимы: hi еда=भोजन ≠ есть=खाना; de road=Weg ≠ street=Straße;
//    ru стопа≠нога; убраны gold(hi सोना=спать), ice(hi बर्फ़=снег), short(hi छोटा=маленький),
//    tomorrow/yesterday (hi कल — оба), arm (ru рука=hand).
//
// Ключи = коды языков из LANGUAGES (LanguageContext): en es pt hi zh de ru.
//
// v1.29.0: поле `cat` — семантическая категория (по секциям ниже). Используют
// «Сортировка слов» (semantic-sort) и подбор дистракторов Cloze. `cat` НЕ код языка —
// игровая логика обращается к entry[langCode], где langCode ∈ LANGUAGES, конфликтов нет.
// Ключи категорий → переводы catVocab_<cat> в LanguageContext/оверлеях.

export const TRANSLATION_VOCAB: Record<string, string>[] = [
  // ── Базовые предметы / понятия ──
  { en: 'house',  ru: 'дом',        es: 'casa',     pt: 'casa',     de: 'Haus',    zh: '房子',  hi: 'घर', cat: 'concepts' },
  { en: 'water',  ru: 'вода',       es: 'agua',     pt: 'água',     de: 'Wasser',  zh: '水',    hi: 'पानी', cat: 'concepts' },
  { en: 'fire',   ru: 'огонь',      es: 'fuego',    pt: 'fogo',     de: 'Feuer',   zh: '火',    hi: 'आग', cat: 'concepts' },
  { en: 'book',   ru: 'книга',      es: 'libro',    pt: 'livro',    de: 'Buch',    zh: '书',    hi: 'किताब', cat: 'concepts' },
  { en: 'time',   ru: 'время',      es: 'tiempo',   pt: 'tempo',    de: 'Zeit',    zh: '时间',  hi: 'समय', cat: 'concepts' },
  { en: 'money',  ru: 'деньги',     es: 'dinero',   pt: 'dinheiro', de: 'Geld',    zh: '钱',    hi: 'पैसा', cat: 'concepts' },
  { en: 'work',   ru: 'работа',     es: 'trabajo',  pt: 'trabalho', de: 'Arbeit',  zh: '工作',  hi: 'काम', cat: 'concepts' },
  { en: 'name',   ru: 'имя',        es: 'nombre',   pt: 'nome',     de: 'Name',    zh: '名字',  hi: 'नाम', cat: 'concepts' },
  { en: 'word',   ru: 'слово',      es: 'palabra',  pt: 'palavra',  de: 'Wort',    zh: '词',    hi: 'शब्द', cat: 'concepts' },
  { en: 'love',   ru: 'любовь',     es: 'amor',     pt: 'amor',     de: 'Liebe',   zh: '爱',    hi: 'प्यार', cat: 'concepts' },
  { en: 'friend', ru: 'друг',       es: 'amigo',    pt: 'amigo',    de: 'Freund',  zh: '朋友',  hi: 'दोस्त', cat: 'concepts' },
  { en: 'music',  ru: 'музыка',     es: 'música',   pt: 'música',   de: 'Musik',   zh: '音乐',  hi: 'संगीत', cat: 'concepts' },
  { en: 'game',   ru: 'игра',       es: 'juego',    pt: 'jogo',     de: 'Spiel',   zh: '游戏',  hi: 'खेल', cat: 'concepts' },
  { en: 'language',ru:'язык',       es: 'idioma',   pt: 'idioma',   de: 'Sprache', zh: '语言',  hi: 'भाषा', cat: 'concepts' },
  { en: 'number', ru: 'число',      es: 'número',   pt: 'número',   de: 'Zahl',    zh: '数字',  hi: 'संख्या', cat: 'concepts' },
  { en: 'world',  ru: 'мир',        es: 'mundo',    pt: 'mundo',    de: 'Welt',    zh: '世界',  hi: 'दुनिया', cat: 'concepts' },
  { en: 'country',ru: 'страна',     es: 'país',     pt: 'país',     de: 'Land',    zh: '国家',  hi: 'देश', cat: 'concepts' },

  // ── Числа ──
  { en: 'one',    ru: 'один',       es: 'uno',      pt: 'um',       de: 'eins',    zh: '一',    hi: 'एक', cat: 'numbers' },
  { en: 'two',    ru: 'два',        es: 'dos',      pt: 'dois',     de: 'zwei',    zh: '二',    hi: 'दो', cat: 'numbers' },
  { en: 'three',  ru: 'три',        es: 'tres',     pt: 'três',     de: 'drei',    zh: '三',    hi: 'तीन', cat: 'numbers' },
  { en: 'four',   ru: 'четыре',     es: 'cuatro',   pt: 'quatro',   de: 'vier',    zh: '四',    hi: 'चार', cat: 'numbers' },
  { en: 'five',   ru: 'пять',       es: 'cinco',    pt: 'cinco',    de: 'fünf',    zh: '五',    hi: 'पाँच', cat: 'numbers' },
  { en: 'six',    ru: 'шесть',      es: 'seis',     pt: 'seis',     de: 'sechs',   zh: '六',    hi: 'छह', cat: 'numbers' },
  { en: 'seven',  ru: 'семь',       es: 'siete',    pt: 'sete',     de: 'sieben',  zh: '七',    hi: 'सात', cat: 'numbers' },
  { en: 'eight',  ru: 'восемь',     es: 'ocho',     pt: 'oito',     de: 'acht',    zh: '八',    hi: 'आठ', cat: 'numbers' },
  { en: 'nine',   ru: 'девять',     es: 'nueve',    pt: 'nove',     de: 'neun',    zh: '九',    hi: 'नौ', cat: 'numbers' },
  { en: 'ten',    ru: 'десять',     es: 'diez',     pt: 'dez',      de: 'zehn',    zh: '十',    hi: 'दस', cat: 'numbers' },

  // ── Семья / люди ──
  { en: 'mother', ru: 'мать',       es: 'madre',    pt: 'mãe',      de: 'Mutter',  zh: '妈妈',  hi: 'माँ', cat: 'people' },
  { en: 'father', ru: 'отец',       es: 'padre',    pt: 'pai',      de: 'Vater',   zh: '爸爸',  hi: 'पिता', cat: 'people' },
  { en: 'son',    ru: 'сын',        es: 'hijo',     pt: 'filho',    de: 'Sohn',    zh: '儿子',  hi: 'बेटा', cat: 'people' },
  { en: 'daughter',ru:'дочь',       es: 'hija',     pt: 'filha',    de: 'Tochter', zh: '女儿',  hi: 'बेटी', cat: 'people' },
  { en: 'brother',ru: 'брат',       es: 'hermano',  pt: 'irmão',    de: 'Bruder',  zh: '哥哥',  hi: 'भाई', cat: 'people' },
  { en: 'sister', ru: 'сестра',     es: 'hermana',  pt: 'irmã',     de: 'Schwester',zh: '姐姐', hi: 'बहन', cat: 'people' },
  { en: 'grandmother',ru:'бабушка', es: 'abuela',   pt: 'avó',      de: 'Großmutter',zh:'奶奶', hi: 'दादी', cat: 'people' },
  { en: 'grandfather',ru:'дедушка', es: 'abuelo',   pt: 'avô',      de: 'Großvater', zh:'爷爷', hi: 'दादा', cat: 'people' },
  { en: 'wife',   ru: 'жена',       es: 'esposa',   pt: 'esposa',   de: 'Ehefrau', zh: '妻子',  hi: 'पत्नी', cat: 'people' },
  { en: 'husband',ru: 'муж',        es: 'marido',   pt: 'marido',   de: 'Ehemann', zh: '丈夫',  hi: 'पति', cat: 'people' },
  { en: 'man',    ru: 'мужчина',    es: 'hombre',   pt: 'homem',    de: 'Mann',    zh: '男人',  hi: 'आदमी', cat: 'people' },
  { en: 'woman',  ru: 'женщина',    es: 'mujer',    pt: 'mulher',   de: 'Frau',    zh: '女人',  hi: 'औरत', cat: 'people' },
  { en: 'child',  ru: 'ребёнок',    es: 'niño',     pt: 'criança',  de: 'Kind',    zh: '孩子',  hi: 'बच्चा', cat: 'people' },
  { en: 'family', ru: 'семья',      es: 'familia',  pt: 'família',  de: 'Familie', zh: '家庭',  hi: 'परिवार', cat: 'people' },

  // ── Тело ──
  { en: 'head',   ru: 'голова',     es: 'cabeza',   pt: 'cabeça',   de: 'Kopf',    zh: '头',    hi: 'सिर', cat: 'body' },
  { en: 'face',   ru: 'лицо',       es: 'cara',     pt: 'rosto',    de: 'Gesicht', zh: '脸',    hi: 'चेहरा', cat: 'body' },
  { en: 'eye',    ru: 'глаз',       es: 'ojo',      pt: 'olho',     de: 'Auge',    zh: '眼睛',  hi: 'आँख', cat: 'body' },
  { en: 'ear',    ru: 'ухо',        es: 'oreja',    pt: 'orelha',   de: 'Ohr',     zh: '耳朵',  hi: 'कान', cat: 'body' },
  { en: 'nose',   ru: 'нос',        es: 'nariz',    pt: 'nariz',    de: 'Nase',    zh: '鼻子',  hi: 'नाक', cat: 'body' },
  { en: 'mouth',  ru: 'рот',        es: 'boca',     pt: 'boca',     de: 'Mund',    zh: '嘴',    hi: 'मुँह', cat: 'body' },
  { en: 'tooth',  ru: 'зуб',        es: 'diente',   pt: 'dente',    de: 'Zahn',    zh: '牙齿',  hi: 'दाँत', cat: 'body' },
  { en: 'hair',   ru: 'волосы',     es: 'pelo',     pt: 'cabelo',   de: 'Haar',    zh: '头发',  hi: 'बाल', cat: 'body' },
  { en: 'hand',   ru: 'рука',       es: 'mano',     pt: 'mão',      de: 'Hand',    zh: '手',    hi: 'हाथ', cat: 'body' },
  { en: 'finger', ru: 'палец',      es: 'dedo',     pt: 'dedo',     de: 'Finger',  zh: '手指',  hi: 'उँगली', cat: 'body' },
  { en: 'leg',    ru: 'нога',       es: 'pierna',   pt: 'perna',    de: 'Bein',    zh: '腿',    hi: 'टाँग', cat: 'body' },
  { en: 'foot',   ru: 'ступня',     es: 'pie',      pt: 'pé',       de: 'Fuß',     zh: '脚',    hi: 'पैर', cat: 'body' },
  { en: 'heart',  ru: 'сердце',     es: 'corazón',  pt: 'coração',  de: 'Herz',    zh: '心',    hi: 'दिल', cat: 'body' },
  { en: 'blood',  ru: 'кровь',      es: 'sangre',   pt: 'sangue',   de: 'Blut',    zh: '血',    hi: 'खून', cat: 'body' },

  // ── Еда / напитки ──
  { en: 'food',   ru: 'еда',        es: 'comida',   pt: 'comida',   de: 'Essen',   zh: '食物',  hi: 'भोजन', cat: 'food' },
  { en: 'bread',  ru: 'хлеб',       es: 'pan',      pt: 'pão',      de: 'Brot',    zh: '面包',  hi: 'रोटी', cat: 'food' },
  { en: 'milk',   ru: 'молоко',     es: 'leche',    pt: 'leite',    de: 'Milch',   zh: '牛奶',  hi: 'दूध', cat: 'food' },
  { en: 'meat',   ru: 'мясо',       es: 'carne',    pt: 'carne',    de: 'Fleisch', zh: '肉',    hi: 'मांस', cat: 'food' },
  { en: 'egg',    ru: 'яйцо',       es: 'huevo',    pt: 'ovo',      de: 'Ei',      zh: '鸡蛋',  hi: 'अंडा', cat: 'food' },
  { en: 'apple',  ru: 'яблоко',     es: 'manzana',  pt: 'maçã',     de: 'Apfel',   zh: '苹果',  hi: 'सेब', cat: 'food' },
  { en: 'rice',   ru: 'рис',        es: 'arroz',    pt: 'arroz',    de: 'Reis',    zh: '米饭',  hi: 'चावल', cat: 'food' },
  { en: 'fruit',  ru: 'фрукт',      es: 'fruta',    pt: 'fruta',    de: 'Obst',    zh: '水果',  hi: 'फल', cat: 'food' },
  { en: 'vegetable',ru:'овощ',      es: 'verdura',  pt: 'legume',   de: 'Gemüse',  zh: '蔬菜',  hi: 'सब्ज़ी', cat: 'food' },
  { en: 'cheese', ru: 'сыр',        es: 'queso',    pt: 'queijo',   de: 'Käse',    zh: '奶酪',  hi: 'पनीर', cat: 'food' },
  { en: 'soup',   ru: 'суп',        es: 'sopa',     pt: 'sopa',     de: 'Suppe',   zh: '汤',    hi: 'सूप', cat: 'food' },
  { en: 'sugar',  ru: 'сахар',      es: 'azúcar',   pt: 'açúcar',   de: 'Zucker',  zh: '糖',    hi: 'चीनी', cat: 'food' },
  { en: 'salt',   ru: 'соль',       es: 'sal',      pt: 'sal',      de: 'Salz',    zh: '盐',    hi: 'नमक', cat: 'food' },
  { en: 'oil',    ru: 'масло',      es: 'aceite',   pt: 'óleo',     de: 'Öl',      zh: '油',    hi: 'तेल', cat: 'food' },
  { en: 'tea',    ru: 'чай',        es: 'té',       pt: 'chá',      de: 'Tee',     zh: '茶',    hi: 'चाय', cat: 'food' },
  { en: 'coffee', ru: 'кофе',       es: 'café',     pt: 'café',     de: 'Kaffee',  zh: '咖啡',  hi: 'कॉफ़ी', cat: 'food' },
  { en: 'wine',   ru: 'вино',       es: 'vino',     pt: 'vinho',    de: 'Wein',    zh: '葡萄酒',hi: 'शराब', cat: 'food' },

  // ── Животные ──
  { en: 'dog',    ru: 'собака',     es: 'perro',    pt: 'cachorro', de: 'Hund',    zh: '狗',    hi: 'कुत्ता', cat: 'animals' },
  { en: 'cat',    ru: 'кошка',      es: 'gato',     pt: 'gato',     de: 'Katze',   zh: '猫',    hi: 'बिल्ली', cat: 'animals' },
  { en: 'horse',  ru: 'лошадь',     es: 'caballo',  pt: 'cavalo',   de: 'Pferd',   zh: '马',    hi: 'घोड़ा', cat: 'animals' },
  { en: 'cow',    ru: 'корова',     es: 'vaca',     pt: 'vaca',     de: 'Kuh',     zh: '牛',    hi: 'गाय', cat: 'animals' },
  { en: 'pig',    ru: 'свинья',     es: 'cerdo',    pt: 'porco',    de: 'Schwein', zh: '猪',    hi: 'सूअर', cat: 'animals' },
  { en: 'sheep',  ru: 'овца',       es: 'oveja',    pt: 'ovelha',   de: 'Schaf',   zh: '羊',    hi: 'भेड़', cat: 'animals' },
  { en: 'chicken',ru: 'курица',     es: 'gallina',  pt: 'galinha',  de: 'Huhn',    zh: '鸡',    hi: 'मुर्गी', cat: 'animals' },
  { en: 'bird',   ru: 'птица',      es: 'pájaro',   pt: 'pássaro',  de: 'Vogel',   zh: '鸟',    hi: 'पक्षी', cat: 'animals' },
  { en: 'fish',   ru: 'рыба',       es: 'pez',      pt: 'peixe',    de: 'Fisch',   zh: '鱼',    hi: 'मछली', cat: 'animals' },
  { en: 'mouse',  ru: 'мышь',       es: 'ratón',    pt: 'rato',     de: 'Maus',    zh: '老鼠',  hi: 'चूहा', cat: 'animals' },
  { en: 'bear',   ru: 'медведь',    es: 'oso',      pt: 'urso',     de: 'Bär',     zh: '熊',    hi: 'भालू', cat: 'animals' },
  { en: 'elephant',ru:'слон',       es: 'elefante', pt: 'elefante', de: 'Elefant', zh: '大象',  hi: 'हाथी', cat: 'animals' },
  { en: 'lion',   ru: 'лев',        es: 'león',     pt: 'leão',     de: 'Löwe',    zh: '狮子',  hi: 'शेर', cat: 'animals' },
  { en: 'snake',  ru: 'змея',       es: 'serpiente',pt: 'cobra',    de: 'Schlange',zh: '蛇',    hi: 'साँप', cat: 'animals' },

  // ── Природа ──
  { en: 'sun',    ru: 'солнце',     es: 'sol',      pt: 'sol',      de: 'Sonne',   zh: '太阳',  hi: 'सूरज', cat: 'nature' },
  { en: 'moon',   ru: 'луна',       es: 'luna',     pt: 'lua',      de: 'Mond',    zh: '月亮',  hi: 'चाँद', cat: 'nature' },
  { en: 'star',   ru: 'звезда',     es: 'estrella', pt: 'estrela',  de: 'Stern',   zh: '星星',  hi: 'तारा', cat: 'nature' },
  { en: 'sky',    ru: 'небо',       es: 'cielo',    pt: 'céu',      de: 'Himmel',  zh: '天空',  hi: 'आसमान', cat: 'nature' },
  { en: 'cloud',  ru: 'облако',     es: 'nube',     pt: 'nuvem',    de: 'Wolke',   zh: '云',    hi: 'बादल', cat: 'nature' },
  { en: 'wind',   ru: 'ветер',      es: 'viento',   pt: 'vento',    de: 'Wind',    zh: '风',    hi: 'हवा', cat: 'nature' },
  { en: 'rain',   ru: 'дождь',      es: 'lluvia',   pt: 'chuva',    de: 'Regen',   zh: '雨',    hi: 'बारिश', cat: 'nature' },
  { en: 'snow',   ru: 'снег',       es: 'nieve',    pt: 'neve',     de: 'Schnee',  zh: '雪',    hi: 'बर्फ़', cat: 'nature' },
  { en: 'tree',   ru: 'дерево',     es: 'árbol',    pt: 'árvore',   de: 'Baum',    zh: '树',    hi: 'पेड़', cat: 'nature' },
  { en: 'flower', ru: 'цветок',     es: 'flor',     pt: 'flor',     de: 'Blume',   zh: '花',    hi: 'फूल', cat: 'nature' },
  { en: 'grass',  ru: 'трава',      es: 'hierba',   pt: 'grama',    de: 'Gras',    zh: '草',    hi: 'घास', cat: 'nature' },
  { en: 'forest', ru: 'лес',        es: 'bosque',   pt: 'floresta', de: 'Wald',    zh: '森林',  hi: 'जंगल', cat: 'nature' },
  { en: 'mountain',ru:'гора',       es: 'montaña',  pt: 'montanha', de: 'Berg',    zh: '山',    hi: 'पहाड़', cat: 'nature' },
  { en: 'river',  ru: 'река',       es: 'río',      pt: 'rio',      de: 'Fluss',   zh: '河',    hi: 'नदी', cat: 'nature' },
  { en: 'sea',    ru: 'море',       es: 'mar',      pt: 'mar',      de: 'Meer',    zh: '海',    hi: 'समुद्र', cat: 'nature' },
  { en: 'stone',  ru: 'камень',     es: 'piedra',   pt: 'pedra',    de: 'Stein',   zh: '石头',  hi: 'पत्थर', cat: 'nature' },

  // ── Цвета ──
  { en: 'red',    ru: 'красный',    es: 'rojo',     pt: 'vermelho', de: 'rot',     zh: '红色',  hi: 'लाल', cat: 'colors' },
  { en: 'white',  ru: 'белый',      es: 'blanco',   pt: 'branco',   de: 'weiß',    zh: '白色',  hi: 'सफ़ेद', cat: 'colors' },
  { en: 'black',  ru: 'чёрный',     es: 'negro',    pt: 'preto',    de: 'schwarz', zh: '黑色',  hi: 'काला', cat: 'colors' },
  { en: 'blue',   ru: 'синий',      es: 'azul',     pt: 'azul',     de: 'blau',    zh: '蓝色',  hi: 'नीला', cat: 'colors' },
  { en: 'green',  ru: 'зелёный',    es: 'verde',    pt: 'verde',    de: 'grün',    zh: '绿色',  hi: 'हरा', cat: 'colors' },
  { en: 'yellow', ru: 'жёлтый',     es: 'amarillo', pt: 'amarelo',  de: 'gelb',    zh: '黄色',  hi: 'पीला', cat: 'colors' },

  // ── Дом / предметы ──
  { en: 'door',   ru: 'дверь',      es: 'puerta',   pt: 'porta',    de: 'Tür',     zh: '门',    hi: 'दरवाज़ा', cat: 'home' },
  { en: 'window', ru: 'окно',       es: 'ventana',  pt: 'janela',   de: 'Fenster', zh: '窗户',  hi: 'खिड़की', cat: 'home' },
  { en: 'wall',   ru: 'стена',      es: 'pared',    pt: 'parede',   de: 'Wand',    zh: '墙',    hi: 'दीवार', cat: 'home' },
  { en: 'room',   ru: 'комната',    es: 'cuarto',   pt: 'quarto',   de: 'Zimmer',  zh: '房间',  hi: 'कमरा', cat: 'home' },
  { en: 'table',  ru: 'стол',       es: 'mesa',     pt: 'mesa',     de: 'Tisch',   zh: '桌子',  hi: 'मेज़', cat: 'home' },
  { en: 'chair',  ru: 'стул',       es: 'silla',    pt: 'cadeira',  de: 'Stuhl',   zh: '椅子',  hi: 'कुर्सी', cat: 'home' },
  { en: 'bed',    ru: 'кровать',    es: 'cama',     pt: 'cama',     de: 'Bett',    zh: '床',    hi: 'बिस्तर', cat: 'home' },
  { en: 'key',    ru: 'ключ',       es: 'llave',    pt: 'chave',    de: 'Schlüssel',zh: '钥匙', hi: 'चाबी', cat: 'home' },
  { en: 'clock',  ru: 'часы',       es: 'reloj',    pt: 'relógio',  de: 'Uhr',     zh: '钟',    hi: 'घड़ी', cat: 'home' },
  { en: 'phone',  ru: 'телефон',    es: 'teléfono', pt: 'telefone', de: 'Telefon', zh: '电话',  hi: 'फ़ोन', cat: 'home' },
  { en: 'paper',  ru: 'бумага',     es: 'papel',    pt: 'papel',    de: 'Papier',  zh: '纸',    hi: 'कागज़', cat: 'home' },
  { en: 'knife',  ru: 'нож',        es: 'cuchillo', pt: 'faca',     de: 'Messer',  zh: '刀',    hi: 'चाकू', cat: 'home' },
  { en: 'bag',    ru: 'сумка',      es: 'bolsa',    pt: 'bolsa',    de: 'Tasche',  zh: '包',    hi: 'थैला', cat: 'home' },
  { en: 'car',    ru: 'машина',     es: 'coche',    pt: 'carro',    de: 'Auto',    zh: '汽车',  hi: 'गाड़ी', cat: 'home' },

  // ── Места ──
  { en: 'city',   ru: 'город',      es: 'ciudad',   pt: 'cidade',   de: 'Stadt',   zh: '城市',  hi: 'शहर', cat: 'places' },
  { en: 'village',ru: 'деревня',    es: 'pueblo',   pt: 'aldeia',   de: 'Dorf',    zh: '村庄',  hi: 'गाँव', cat: 'places' },
  { en: 'street', ru: 'улица',      es: 'calle',    pt: 'rua',      de: 'Straße',  zh: '街',    hi: 'सड़क', cat: 'places' },
  { en: 'road',   ru: 'дорога',     es: 'camino',   pt: 'estrada',  de: 'Weg',     zh: '路',    hi: 'रास्ता', cat: 'places' },
  { en: 'school', ru: 'школа',      es: 'escuela',  pt: 'escola',   de: 'Schule',  zh: '学校',  hi: 'स्कूल', cat: 'places' },
  { en: 'shop',   ru: 'магазин',    es: 'tienda',   pt: 'loja',     de: 'Geschäft',zh: '商店',  hi: 'दुकान', cat: 'places' },
  { en: 'market', ru: 'рынок',      es: 'mercado',  pt: 'mercado',  de: 'Markt',   zh: '市场',  hi: 'बाज़ार', cat: 'places' },
  { en: 'hospital',ru:'больница',   es: 'hospital', pt: 'hospital', de: 'Krankenhaus',zh:'医院',hi: 'अस्पताल', cat: 'places' },
  { en: 'bank',   ru: 'банк',       es: 'banco',    pt: 'banco',    de: 'Bank',    zh: '银行',  hi: 'बैंक', cat: 'places' },
  { en: 'park',   ru: 'парк',       es: 'parque',   pt: 'parque',   de: 'Park',    zh: '公园',  hi: 'पार्क', cat: 'places' },
  { en: 'station',ru: 'вокзал',     es: 'estación', pt: 'estação',  de: 'Bahnhof', zh: '车站',  hi: 'स्टेशन', cat: 'places' },
  { en: 'airport',ru: 'аэропорт',   es: 'aeropuerto',pt:'aeroporto',de: 'Flughafen',zh:'机场',  hi: 'हवाई अड्डा', cat: 'places' },
  { en: 'office', ru: 'офис',       es: 'oficina',  pt: 'escritório',de:'Büro',    zh: '办公室',hi: 'दफ़्तर', cat: 'places' },

  // ── Время ──
  { en: 'day',    ru: 'день',       es: 'día',      pt: 'dia',      de: 'Tag',     zh: '天',    hi: 'दिन', cat: 'time' },
  { en: 'night',  ru: 'ночь',       es: 'noche',    pt: 'noite',    de: 'Nacht',   zh: '夜晚',  hi: 'रात', cat: 'time' },
  { en: 'morning',ru: 'утро',       es: 'mañana',   pt: 'manhã',    de: 'Morgen',  zh: '早上',  hi: 'सुबह', cat: 'time' },
  { en: 'today',  ru: 'сегодня',    es: 'hoy',      pt: 'hoje',     de: 'heute',   zh: '今天',  hi: 'आज', cat: 'time' },
  { en: 'week',   ru: 'неделя',     es: 'semana',   pt: 'semana',   de: 'Woche',   zh: '星期',  hi: 'हफ़्ता', cat: 'time' },
  { en: 'month',  ru: 'месяц',      es: 'mes',      pt: 'mês',      de: 'Monat',   zh: '月',    hi: 'महीना', cat: 'time' },
  { en: 'year',   ru: 'год',        es: 'año',      pt: 'ano',      de: 'Jahr',    zh: '年',    hi: 'साल', cat: 'time' },
  { en: 'hour',   ru: 'час',        es: 'hora',     pt: 'hora',     de: 'Stunde',  zh: '小时',  hi: 'घंटा', cat: 'time' },
  { en: 'minute', ru: 'минута',     es: 'minuto',   pt: 'minuto',   de: 'Minute',  zh: '分钟',  hi: 'मिनट', cat: 'time' },

  // ── Глаголы (словарная форма) ──
  { en: 'to go',  ru: 'идти',       es: 'ir',       pt: 'ir',       de: 'gehen',   zh: '去',    hi: 'जाना', cat: 'verbs' },
  { en: 'to come',ru: 'приходить',  es: 'venir',    pt: 'vir',      de: 'kommen',  zh: '来',    hi: 'आना', cat: 'verbs' },
  { en: 'to eat', ru: 'есть',       es: 'comer',    pt: 'comer',    de: 'essen',   zh: '吃',    hi: 'खाना', cat: 'verbs' },
  { en: 'to drink',ru:'пить',       es: 'beber',    pt: 'beber',    de: 'trinken', zh: '喝',    hi: 'पीना', cat: 'verbs' },
  { en: 'to see', ru: 'видеть',     es: 'ver',      pt: 'ver',      de: 'sehen',   zh: '看',    hi: 'देखना', cat: 'verbs' },
  { en: 'to know',ru: 'знать',      es: 'saber',    pt: 'saber',    de: 'wissen',  zh: '知道',  hi: 'जानना', cat: 'verbs' },
  { en: 'to want',ru: 'хотеть',     es: 'querer',   pt: 'querer',   de: 'wollen',  zh: '想要',  hi: 'चाहना', cat: 'verbs' },
  { en: 'to speak',ru:'говорить',   es: 'hablar',   pt: 'falar',    de: 'sprechen',zh: '说',    hi: 'बोलना', cat: 'verbs' },
  { en: 'to read',ru: 'читать',     es: 'leer',     pt: 'ler',      de: 'lesen',   zh: '读',    hi: 'पढ़ना', cat: 'verbs' },
  { en: 'to write',ru:'писать',     es: 'escribir', pt: 'escrever', de: 'schreiben',zh: '写',   hi: 'लिखना', cat: 'verbs' },
  { en: 'to sleep',ru:'спать',      es: 'dormir',   pt: 'dormir',   de: 'schlafen',zh: '睡觉',  hi: 'सोना', cat: 'verbs' },
  { en: 'to give',ru: 'давать',     es: 'dar',      pt: 'dar',      de: 'geben',   zh: '给',    hi: 'देना', cat: 'verbs' },
  { en: 'to take',ru: 'брать',      es: 'tomar',    pt: 'pegar',    de: 'nehmen',  zh: '拿',    hi: 'लेना', cat: 'verbs' },
  { en: 'to make',ru: 'делать',     es: 'hacer',    pt: 'fazer',    de: 'machen',  zh: '做',    hi: 'करना', cat: 'verbs' },
  { en: 'to live',ru: 'жить',       es: 'vivir',    pt: 'viver',    de: 'leben',   zh: '住',    hi: 'रहना', cat: 'verbs' },
  { en: 'to buy', ru: 'покупать',   es: 'comprar',  pt: 'comprar',  de: 'kaufen',  zh: '买',    hi: 'खरीदना', cat: 'verbs' },
  { en: 'to open',ru: 'открывать',  es: 'abrir',    pt: 'abrir',    de: 'öffnen',  zh: '开',    hi: 'खोलना', cat: 'verbs' },

  // ── Прилагательные (цвета — выше) ──
  { en: 'big',    ru: 'большой',    es: 'grande',   pt: 'grande',   de: 'groß',    zh: '大',    hi: 'बड़ा', cat: 'adjectives' },
  { en: 'small',  ru: 'маленький',  es: 'pequeño',  pt: 'pequeno',  de: 'klein',   zh: '小',    hi: 'छोटा', cat: 'adjectives' },
  { en: 'good',   ru: 'хороший',    es: 'bueno',    pt: 'bom',      de: 'gut',     zh: '好',    hi: 'अच्छा', cat: 'adjectives' },
  { en: 'bad',    ru: 'плохой',     es: 'malo',     pt: 'ruim',     de: 'schlecht',zh: '坏',    hi: 'बुरा', cat: 'adjectives' },
  { en: 'new',    ru: 'новый',      es: 'nuevo',    pt: 'novo',     de: 'neu',     zh: '新',    hi: 'नया', cat: 'adjectives' },
  { en: 'old',    ru: 'старый',     es: 'viejo',    pt: 'velho',    de: 'alt',     zh: '老',    hi: 'पुराना', cat: 'adjectives' },
  { en: 'young',  ru: 'молодой',    es: 'joven',    pt: 'jovem',    de: 'jung',    zh: '年轻',  hi: 'जवान', cat: 'adjectives' },
  { en: 'long',   ru: 'длинный',    es: 'largo',    pt: 'longo',    de: 'lang',    zh: '长',    hi: 'लंबा', cat: 'adjectives' },
  { en: 'tall',   ru: 'высокий',    es: 'alto',     pt: 'alto',     de: 'hoch',    zh: '高',    hi: 'ऊँचा', cat: 'adjectives' },
  { en: 'hot',    ru: 'горячий',    es: 'caliente', pt: 'quente',   de: 'heiß',    zh: '热',    hi: 'गरम', cat: 'adjectives' },
  { en: 'cold',   ru: 'холодный',   es: 'frío',     pt: 'frio',     de: 'kalt',    zh: '冷',    hi: 'ठंडा', cat: 'adjectives' },
  { en: 'fast',   ru: 'быстрый',    es: 'rápido',   pt: 'rápido',   de: 'schnell', zh: '快',    hi: 'तेज़', cat: 'adjectives' },
  { en: 'slow',   ru: 'медленный',  es: 'lento',    pt: 'lento',    de: 'langsam', zh: '慢',    hi: 'धीमा', cat: 'adjectives' },
  { en: 'strong', ru: 'сильный',    es: 'fuerte',   pt: 'forte',    de: 'stark',   zh: '强',    hi: 'मज़बूत', cat: 'adjectives' },
  { en: 'beautiful',ru:'красивый',  es: 'hermoso',  pt: 'bonito',   de: 'schön',   zh: '美丽',  hi: 'सुंदर', cat: 'adjectives' },
  { en: 'happy',  ru: 'счастливый', es: 'feliz',    pt: 'feliz',    de: 'glücklich',zh: '快乐', hi: 'खुश', cat: 'adjectives' },
  { en: 'easy',   ru: 'лёгкий',     es: 'fácil',    pt: 'fácil',    de: 'leicht',  zh: '容易',  hi: 'आसान', cat: 'adjectives' },
  { en: 'difficult',ru:'трудный',   es: 'difícil',  pt: 'difícil',  de: 'schwer',  zh: '难',    hi: 'मुश्किल', cat: 'adjectives' },
  { en: 'clean',  ru: 'чистый',     es: 'limpio',   pt: 'limpo',    de: 'sauber',  zh: '干净',  hi: 'साफ़', cat: 'adjectives' },
  { en: 'expensive',ru:'дорогой',   es: 'caro',     pt: 'caro',     de: 'teuer',   zh: '贵',    hi: 'महँगा', cat: 'adjectives' },

  // ── Базовые слова / вежливость ──
  { en: 'yes',    ru: 'да',         es: 'sí',       pt: 'sim',      de: 'ja',      zh: '是',    hi: 'हाँ', cat: 'basics' },
  { en: 'no',     ru: 'нет',        es: 'no',       pt: 'não',      de: 'nein',    zh: '不',    hi: 'नहीं', cat: 'basics' },
  { en: 'hello',  ru: 'привет',     es: 'hola',     pt: 'olá',      de: 'hallo',   zh: '你好',  hi: 'नमस्ते', cat: 'basics' },
  { en: 'thank you',ru:'спасибо',   es: 'gracias',  pt: 'obrigado', de: 'danke',   zh: '谢谢',  hi: 'धन्यवाद', cat: 'basics' },
  { en: 'please', ru: 'пожалуйста', es: 'por favor',pt: 'por favor',de: 'bitte',   zh: '请',    hi: 'कृपया', cat: 'basics' },
  { en: 'now',    ru: 'сейчас',     es: 'ahora',    pt: 'agora',    de: 'jetzt',   zh: '现在',  hi: 'अभी', cat: 'basics' },
  { en: 'here',   ru: 'здесь',      es: 'aquí',     pt: 'aqui',     de: 'hier',    zh: '这里',  hi: 'यहाँ', cat: 'basics' },
  { en: 'there',  ru: 'там',        es: 'allí',     pt: 'lá',       de: 'dort',    zh: '那里',  hi: 'वहाँ', cat: 'basics' },
];
