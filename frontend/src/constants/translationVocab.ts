// Общая высокочастотная лексика на ВСЕХ 12 языках приложения (189 слов).
//
// 🔴 09.09.2026: добавлены fr, it, ja, ko, ar. ПОВОД — замер живьём по всем двенадцати
//    интерфейсам: на этих пяти языковой раздел НЕ ОТКРЫВАЛСЯ вовсе, экран сразу говорил
//    «Всё на сегодня сделано». Причина: якорь партии — язык интерфейса (vocab-srs.tsx,
//    `base_lang: language`), нет своего языка в корпусе — пул пуст. `vocabLangsOf` ниже
//    требует колонку во ВСЕХ записях, поэтому язык либо есть целиком, либо его нет.
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
// Ключи = коды языков из LANGUAGES (LanguageContext): en es pt hi zh de ru fr it ja ko ar.
//
// ⚠️ ОМОНИМЫ, РАЗВЕДЁННЫЕ 09.09.2026 (проверка на дубли внутри языка их поймала):
//    fr neuf = «девять» И «новый» → new = nouveau;
//    ko 눈 = «глаз» И «снег» → snow = «흰 눈» (белый снег), eye остался 눈.
//    Без этого логика матчинга сверяет по переводу и засчитала бы верный ответ ошибкой.
//
// v1.29.0: поле `cat` — семантическая категория (по секциям ниже). Используют
// «Сортировка слов» (semantic-sort) и подбор дистракторов Cloze. `cat` НЕ код языка —
// игровая логика обращается к entry[langCode], где langCode ∈ LANGUAGES, конфликтов нет.
// Ключи категорий → переводы catVocab_<cat> в LanguageContext/оверлеях.

export const TRANSLATION_VOCAB: Record<string, string>[] = [
  // ── Базовые предметы / понятия ──
  { en: 'house',  ru: 'дом',        es: 'casa',     pt: 'casa',     de: 'Haus',    zh: '房子',  hi: 'घर', fr: 'maison', it: 'casa', ja: '家', ko: '집', ar: 'بيت', cat: 'concepts' },
  { en: 'water',  ru: 'вода',       es: 'agua',     pt: 'água',     de: 'Wasser',  zh: '水',    hi: 'पानी', fr: 'eau', it: 'acqua', ja: '水', ko: '물', ar: 'ماء', cat: 'concepts' },
  { en: 'fire',   ru: 'огонь',      es: 'fuego',    pt: 'fogo',     de: 'Feuer',   zh: '火',    hi: 'आग', fr: 'feu', it: 'fuoco', ja: '火', ko: '불', ar: 'نار', cat: 'concepts' },
  { en: 'book',   ru: 'книга',      es: 'libro',    pt: 'livro',    de: 'Buch',    zh: '书',    hi: 'किताब', fr: 'livre', it: 'libro', ja: '本', ko: '책', ar: 'كتاب', cat: 'concepts' },
  { en: 'time',   ru: 'время',      es: 'tiempo',   pt: 'tempo',    de: 'Zeit',    zh: '时间',  hi: 'समय', fr: 'temps', it: 'tempo', ja: '時間', ko: '시간', ar: 'وقت', cat: 'concepts' },
  { en: 'money',  ru: 'деньги',     es: 'dinero',   pt: 'dinheiro', de: 'Geld',    zh: '钱',    hi: 'पैसा', fr: 'argent', it: 'denaro', ja: 'お金', ko: '돈', ar: 'مال', cat: 'concepts' },
  { en: 'work',   ru: 'работа',     es: 'trabajo',  pt: 'trabalho', de: 'Arbeit',  zh: '工作',  hi: 'काम', fr: 'travail', it: 'lavoro', ja: '仕事', ko: '일', ar: 'عمل', cat: 'concepts' },
  { en: 'name',   ru: 'имя',        es: 'nombre',   pt: 'nome',     de: 'Name',    zh: '名字',  hi: 'नाम', fr: 'nom', it: 'nome', ja: '名前', ko: '이름', ar: 'اسم', cat: 'concepts' },
  { en: 'word',   ru: 'слово',      es: 'palabra',  pt: 'palavra',  de: 'Wort',    zh: '词',    hi: 'शब्द', fr: 'mot', it: 'parola', ja: '単語', ko: '단어', ar: 'كلمة', cat: 'concepts' },
  { en: 'love',   ru: 'любовь',     es: 'amor',     pt: 'amor',     de: 'Liebe',   zh: '爱',    hi: 'प्यार', fr: 'amour', it: 'amore', ja: '愛', ko: '사랑', ar: 'حب', cat: 'concepts' },
  { en: 'friend', ru: 'друг',       es: 'amigo',    pt: 'amigo',    de: 'Freund',  zh: '朋友',  hi: 'दोस्त', fr: 'ami', it: 'amico', ja: '友達', ko: '친구', ar: 'صديق', cat: 'concepts' },
  { en: 'music',  ru: 'музыка',     es: 'música',   pt: 'música',   de: 'Musik',   zh: '音乐',  hi: 'संगीत', fr: 'musique', it: 'musica', ja: '音楽', ko: '음악', ar: 'موسيقى', cat: 'concepts' },
  { en: 'game',   ru: 'игра',       es: 'juego',    pt: 'jogo',     de: 'Spiel',   zh: '游戏',  hi: 'खेल', fr: 'jeu', it: 'gioco', ja: 'ゲーム', ko: '게임', ar: 'لعبة', cat: 'concepts' },
  { en: 'language',ru:'язык',       es: 'idioma',   pt: 'idioma',   de: 'Sprache', zh: '语言',  hi: 'भाषा', fr: 'langue', it: 'lingua', ja: '言語', ko: '언어', ar: 'لغة', cat: 'concepts' },
  { en: 'number', ru: 'число',      es: 'número',   pt: 'número',   de: 'Zahl',    zh: '数字',  hi: 'संख्या', fr: 'nombre', it: 'numero', ja: '数', ko: '숫자', ar: 'رقم', cat: 'concepts' },
  { en: 'world',  ru: 'мир',        es: 'mundo',    pt: 'mundo',    de: 'Welt',    zh: '世界',  hi: 'दुनिया', fr: 'monde', it: 'mondo', ja: '世界', ko: '세계', ar: 'عالم', cat: 'concepts' },
  { en: 'country',ru: 'страна',     es: 'país',     pt: 'país',     de: 'Land',    zh: '国家',  hi: 'देश', fr: 'pays', it: 'paese', ja: '国', ko: '나라', ar: 'بلد', cat: 'concepts' },
  { en: 'joy', ru: 'радость', es: 'alegría', pt: 'alegria', de: 'Freude', zh: '喜悦', hi: 'ख़ुशी', fr: 'joie', it: 'gioia', ja: '喜び', ko: '기쁨', ar: 'فرح', cat: 'concepts' },
  { en: 'fear', ru: 'страх', es: 'miedo', pt: 'medo', de: 'Angst', zh: '害怕', hi: 'डर', fr: 'peur', it: 'paura', ja: '恐れ', ko: '두려움', ar: 'خوف', cat: 'concepts' },
  { en: 'hope', ru: 'надежда', es: 'esperanza', pt: 'esperança', de: 'Hoffnung', zh: '希望', hi: 'आशा', fr: 'espoir', it: 'speranza', ja: '望み', ko: '희망', ar: 'أمل', cat: 'concepts' },
  { en: 'truth', ru: 'правда', es: 'verdad', pt: 'verdade', de: 'Wahrheit', zh: '真相', hi: 'सच', fr: 'vérité', it: 'verità', ja: '真実', ko: '진실', ar: 'حقيقة', cat: 'concepts' },
  { en: 'question', ru: 'вопрос', es: 'pregunta', pt: 'pergunta', de: 'Frage', zh: '问题', hi: 'सवाल', fr: 'question', it: 'domanda', ja: '質問', ko: '질문', ar: 'سؤال', cat: 'concepts' },
  { en: 'answer', ru: 'ответ', es: 'respuesta', pt: 'resposta', de: 'Antwort', zh: '回答', hi: 'जवाब', fr: 'réponse', it: 'risposta', ja: '答え', ko: '대답', ar: 'جواب', cat: 'concepts' },
  { en: 'story', ru: 'история', es: 'historia', pt: 'história', de: 'Geschichte', zh: '故事', hi: 'कहानी', fr: 'histoire', it: 'storia', ja: '物語', ko: '이야기', ar: 'قصة', cat: 'concepts' },
  { en: 'picture', ru: 'картина', es: 'cuadro', pt: 'quadro', de: 'Bild', zh: '图画', hi: 'चित्र', fr: 'tableau', it: 'quadro', ja: '絵', ko: '그림', ar: 'صورة', cat: 'concepts' },
  { en: 'letter', ru: 'письмо', es: 'carta', pt: 'carta', de: 'Brief', zh: '信', hi: 'चिट्ठी', fr: 'lettre', it: 'lettera', ja: '手紙', ko: '편지', ar: 'رسالة', cat: 'concepts' },
  { en: 'price', ru: 'цена', es: 'precio', pt: 'preço', de: 'Preis', zh: '价格', hi: 'दाम', fr: 'prix', it: 'prezzo', ja: '値段', ko: '가격', ar: 'سعر', cat: 'concepts' },

  // ── Числа ──
  { en: 'one',    ru: 'один',       es: 'uno',      pt: 'um',       de: 'eins',    zh: '一',    hi: 'एक', fr: 'un', it: 'uno', ja: '一', ko: '하나', ar: 'واحد', cat: 'numbers' },
  { en: 'two',    ru: 'два',        es: 'dos',      pt: 'dois',     de: 'zwei',    zh: '二',    hi: 'दो', fr: 'deux', it: 'due', ja: '二', ko: '둘', ar: 'اثنان', cat: 'numbers' },
  { en: 'three',  ru: 'три',        es: 'tres',     pt: 'três',     de: 'drei',    zh: '三',    hi: 'तीन', fr: 'trois', it: 'tre', ja: '三', ko: '셋', ar: 'ثلاثة', cat: 'numbers' },
  { en: 'four',   ru: 'четыре',     es: 'cuatro',   pt: 'quatro',   de: 'vier',    zh: '四',    hi: 'चार', fr: 'quatre', it: 'quattro', ja: '四', ko: '넷', ar: 'أربعة', cat: 'numbers' },
  { en: 'five',   ru: 'пять',       es: 'cinco',    pt: 'cinco',    de: 'fünf',    zh: '五',    hi: 'पाँच', fr: 'cinq', it: 'cinque', ja: '五', ko: '다섯', ar: 'خمسة', cat: 'numbers' },
  { en: 'six',    ru: 'шесть',      es: 'seis',     pt: 'seis',     de: 'sechs',   zh: '六',    hi: 'छह', fr: 'six', it: 'sei', ja: '六', ko: '여섯', ar: 'ستة', cat: 'numbers' },
  { en: 'seven',  ru: 'семь',       es: 'siete',    pt: 'sete',     de: 'sieben',  zh: '七',    hi: 'सात', fr: 'sept', it: 'sette', ja: '七', ko: '일곱', ar: 'سبعة', cat: 'numbers' },
  { en: 'eight',  ru: 'восемь',     es: 'ocho',     pt: 'oito',     de: 'acht',    zh: '八',    hi: 'आठ', fr: 'huit', it: 'otto', ja: '八', ko: '여덟', ar: 'ثمانية', cat: 'numbers' },
  { en: 'nine',   ru: 'девять',     es: 'nueve',    pt: 'nove',     de: 'neun',    zh: '九',    hi: 'नौ', fr: 'neuf', it: 'nove', ja: '九', ko: '아홉', ar: 'تسعة', cat: 'numbers' },
  { en: 'ten',    ru: 'десять',     es: 'diez',     pt: 'dez',      de: 'zehn',    zh: '十',    hi: 'दस', fr: 'dix', it: 'dieci', ja: '十', ko: '열', ar: 'عشرة', cat: 'numbers' },

  // ── Семья / люди ──
  { en: 'mother', ru: 'мать',       es: 'madre',    pt: 'mãe',      de: 'Mutter',  zh: '妈妈',  hi: 'माँ', fr: 'mère', it: 'madre', ja: '母', ko: '어머니', ar: 'أم', cat: 'people' },
  { en: 'father', ru: 'отец',       es: 'padre',    pt: 'pai',      de: 'Vater',   zh: '爸爸',  hi: 'पिता', fr: 'père', it: 'padre', ja: '父', ko: '아버지', ar: 'أب', cat: 'people' },
  { en: 'son',    ru: 'сын',        es: 'hijo',     pt: 'filho',    de: 'Sohn',    zh: '儿子',  hi: 'बेटा', fr: 'fils', it: 'figlio', ja: '息子', ko: '아들', ar: 'ابن', cat: 'people' },
  { en: 'daughter',ru:'дочь',       es: 'hija',     pt: 'filha',    de: 'Tochter', zh: '女儿',  hi: 'बेटी', fr: 'fille', it: 'figlia', ja: '娘', ko: '딸', ar: 'ابنة', cat: 'people' },
  { en: 'brother',ru: 'брат',       es: 'hermano',  pt: 'irmão',    de: 'Bruder',  zh: '哥哥',  hi: 'भाई', fr: 'frère', it: 'fratello', ja: '兄', ko: '형', ar: 'أخ', cat: 'people' },
  { en: 'sister', ru: 'сестра',     es: 'hermana',  pt: 'irmã',     de: 'Schwester',zh: '姐姐', hi: 'बहन', fr: 'sœur', it: 'sorella', ja: '姉', ko: '누나', ar: 'أخت', cat: 'people' },
  { en: 'grandmother',ru:'бабушка', es: 'abuela',   pt: 'avó',      de: 'Großmutter',zh:'奶奶', hi: 'दादी', fr: 'grand-mère', it: 'nonna', ja: '祖母', ko: '할머니', ar: 'جدة', cat: 'people' },
  { en: 'grandfather',ru:'дедушка', es: 'abuelo',   pt: 'avô',      de: 'Großvater', zh:'爷爷', hi: 'दादा', fr: 'grand-père', it: 'nonno', ja: '祖父', ko: '할아버지', ar: 'جد', cat: 'people' },
  { en: 'wife',   ru: 'жена',       es: 'esposa',   pt: 'esposa',   de: 'Ehefrau', zh: '妻子',  hi: 'पत्नी', fr: 'épouse', it: 'moglie', ja: '妻', ko: '아내', ar: 'زوجة', cat: 'people' },
  { en: 'husband',ru: 'муж',        es: 'marido',   pt: 'marido',   de: 'Ehemann', zh: '丈夫',  hi: 'पति', fr: 'mari', it: 'marito', ja: '夫', ko: '남편', ar: 'زوج', cat: 'people' },
  { en: 'man',    ru: 'мужчина',    es: 'hombre',   pt: 'homem',    de: 'Mann',    zh: '男人',  hi: 'आदमी', fr: 'homme', it: 'uomo', ja: '男', ko: '남자', ar: 'رجل', cat: 'people' },
  { en: 'woman',  ru: 'женщина',    es: 'mujer',    pt: 'mulher',   de: 'Frau',    zh: '女人',  hi: 'औरत', fr: 'femme', it: 'donna', ja: '女', ko: '여자', ar: 'امرأة', cat: 'people' },
  { en: 'child',  ru: 'ребёнок',    es: 'niño',     pt: 'criança',  de: 'Kind',    zh: '孩子',  hi: 'बच्चा', fr: 'enfant', it: 'bambino', ja: '子供', ko: '아이', ar: 'طفل', cat: 'people' },
  { en: 'family', ru: 'семья',      es: 'familia',  pt: 'família',  de: 'Familie', zh: '家庭',  hi: 'परिवार', fr: 'famille', it: 'famiglia', ja: '家族', ko: '가족', ar: 'عائلة', cat: 'people' },
  { en: 'uncle', ru: 'дядя', es: 'tío', pt: 'tio', de: 'Onkel', zh: '叔叔', hi: 'चाचा', fr: 'oncle', it: 'zio', ja: 'おじ', ko: '삼촌', ar: 'عم', cat: 'people' },
  { en: 'aunt', ru: 'тётя', es: 'tía', pt: 'tia', de: 'Tante', zh: '阿姨', hi: 'चाची', fr: 'tante', it: 'zia', ja: 'おば', ko: '이모', ar: 'عمة', cat: 'people' },
  { en: 'doctor', ru: 'врач', es: 'médico', pt: 'médico', de: 'Arzt', zh: '医生', hi: 'डॉक्टर', fr: 'médecin', it: 'medico', ja: '医者', ko: '의사', ar: 'طبيب', cat: 'people' },
  { en: 'teacher', ru: 'учитель', es: 'maestro', pt: 'professor', de: 'Lehrer', zh: '老师', hi: 'शिक्षक', fr: 'professeur', it: 'insegnante', ja: '先生', ko: '선생님', ar: 'معلم', cat: 'people' },
  { en: 'driver', ru: 'водитель', es: 'conductor', pt: 'motorista', de: 'Fahrer', zh: '司机', hi: 'चालक', fr: 'chauffeur', it: 'autista', ja: '運転手', ko: '운전사', ar: 'سائق', cat: 'people' },
  { en: 'cook', ru: 'повар', es: 'cocinero', pt: 'cozinheiro', de: 'Koch', zh: '厨师', hi: 'रसोइया', fr: 'cuisinier', it: 'cuoco', ja: '料理人', ko: '요리사', ar: 'طباخ', cat: 'people' },
  { en: 'farmer', ru: 'фермер', es: 'granjero', pt: 'agricultor', de: 'Bauer', zh: '农民', hi: 'किसान', fr: 'fermier', it: 'contadino', ja: '農家', ko: '농부', ar: 'مزارع', cat: 'people' },
  { en: 'neighbour', ru: 'сосед', es: 'vecino', pt: 'vizinho', de: 'Nachbar', zh: '邻居', hi: 'पड़ोसी', fr: 'voisin', it: 'vicino di casa', ja: '隣人', ko: '이웃', ar: 'جار', cat: 'people' },

  // ── Тело ──
  { en: 'head',   ru: 'голова',     es: 'cabeza',   pt: 'cabeça',   de: 'Kopf',    zh: '头',    hi: 'सिर', fr: 'tête', it: 'testa', ja: '頭', ko: '머리', ar: 'رأس', cat: 'body' },
  { en: 'face',   ru: 'лицо',       es: 'cara',     pt: 'rosto',    de: 'Gesicht', zh: '脸',    hi: 'चेहरा', fr: 'visage', it: 'viso', ja: '顔', ko: '얼굴', ar: 'وجه', cat: 'body' },
  { en: 'eye',    ru: 'глаз',       es: 'ojo',      pt: 'olho',     de: 'Auge',    zh: '眼睛',  hi: 'आँख', fr: 'œil', it: 'occhio', ja: '目', ko: '눈', ar: 'عين', cat: 'body' },
  { en: 'ear',    ru: 'ухо',        es: 'oreja',    pt: 'orelha',   de: 'Ohr',     zh: '耳朵',  hi: 'कान', fr: 'oreille', it: 'orecchio', ja: '耳', ko: '귀', ar: 'أذن', cat: 'body' },
  { en: 'nose',   ru: 'нос',        es: 'nariz',    pt: 'nariz',    de: 'Nase',    zh: '鼻子',  hi: 'नाक', fr: 'nez', it: 'naso', ja: '鼻', ko: '코', ar: 'أنف', cat: 'body' },
  { en: 'mouth',  ru: 'рот',        es: 'boca',     pt: 'boca',     de: 'Mund',    zh: '嘴',    hi: 'मुँह', fr: 'bouche', it: 'bocca', ja: '口', ko: '입', ar: 'فم', cat: 'body' },
  { en: 'tooth',  ru: 'зуб',        es: 'diente',   pt: 'dente',    de: 'Zahn',    zh: '牙齿',  hi: 'दाँत', fr: 'dent', it: 'dente', ja: '歯', ko: '이', ar: 'سن', cat: 'body' },
  { en: 'hair',   ru: 'волосы',     es: 'pelo',     pt: 'cabelo',   de: 'Haar',    zh: '头发',  hi: 'बाल', fr: 'cheveux', it: 'capelli', ja: '髪', ko: '머리카락', ar: 'شعر', cat: 'body' },
  { en: 'hand',   ru: 'рука',       es: 'mano',     pt: 'mão',      de: 'Hand',    zh: '手',    hi: 'हाथ', fr: 'main', it: 'mano', ja: '手', ko: '손', ar: 'يد', cat: 'body' },
  { en: 'finger', ru: 'палец',      es: 'dedo',     pt: 'dedo',     de: 'Finger',  zh: '手指',  hi: 'उँगली', fr: 'doigt', it: 'dito', ja: '指', ko: '손가락', ar: 'إصبع', cat: 'body' },
  { en: 'leg',    ru: 'нога',       es: 'pierna',   pt: 'perna',    de: 'Bein',    zh: '腿',    hi: 'टाँग', fr: 'jambe', it: 'gamba', ja: '脚', ko: '다리', ar: 'ساق', cat: 'body' },
  { en: 'foot',   ru: 'ступня',     es: 'pie',      pt: 'pé',       de: 'Fuß',     zh: '脚',    hi: 'पैर', fr: 'pied', it: 'piede', ja: '足', ko: '발', ar: 'قدم', cat: 'body' },
  { en: 'heart',  ru: 'сердце',     es: 'corazón',  pt: 'coração',  de: 'Herz',    zh: '心',    hi: 'दिल', fr: 'cœur', it: 'cuore', ja: '心臓', ko: '심장', ar: 'قلب', cat: 'body' },
  { en: 'blood',  ru: 'кровь',      es: 'sangre',   pt: 'sangue',   de: 'Blut',    zh: '血',    hi: 'खून', fr: 'sang', it: 'sangue', ja: '血', ko: '피', ar: 'دم', cat: 'body' },
  { en: 'back', ru: 'спина', es: 'espalda', pt: 'costas', de: 'Rücken', zh: '背', hi: 'पीठ', fr: 'dos', it: 'schiena', ja: '背中', ko: '등', ar: 'ظهر', cat: 'body' },
  { en: 'neck', ru: 'шея', es: 'cuello', pt: 'pescoço', de: 'Hals', zh: '脖子', hi: 'गर्दन', fr: 'cou', it: 'collo', ja: '首', ko: '목', ar: 'رقبة', cat: 'body' },
  { en: 'knee', ru: 'колено', es: 'rodilla', pt: 'joelho', de: 'Knie', zh: '膝盖', hi: 'घुटना', fr: 'genou', it: 'ginocchio', ja: '膝', ko: '무릎', ar: 'ركبة', cat: 'body' },
  { en: 'skin', ru: 'кожа', es: 'piel', pt: 'pele', de: 'Haut', zh: '皮肤', hi: 'त्वचा', fr: 'peau', it: 'pelle', ja: '皮膚', ko: '피부', ar: 'جلد', cat: 'body' },
  { en: 'bone', ru: 'кость', es: 'hueso', pt: 'osso', de: 'Knochen', zh: '骨头', hi: 'हड्डी', fr: 'os', it: 'osso', ja: '骨', ko: '뼈', ar: 'عظم', cat: 'body' },
  { en: 'shoulder', ru: 'плечо', es: 'hombro', pt: 'ombro', de: 'Schulter', zh: '肩', hi: 'कंधा', fr: 'épaule', it: 'spalla', ja: '肩', ko: '어깨', ar: 'كتف', cat: 'body' },

  // ── Еда / напитки ──
  { en: 'food',   ru: 'еда',        es: 'comida',   pt: 'comida',   de: 'Essen',   zh: '食物',  hi: 'भोजन', fr: 'nourriture', it: 'cibo', ja: '食べ物', ko: '음식', ar: 'طعام', cat: 'food' },
  { en: 'bread',  ru: 'хлеб',       es: 'pan',      pt: 'pão',      de: 'Brot',    zh: '面包',  hi: 'रोटी', fr: 'pain', it: 'pane', ja: 'パン', ko: '빵', ar: 'خبز', cat: 'food' },
  { en: 'milk',   ru: 'молоко',     es: 'leche',    pt: 'leite',    de: 'Milch',   zh: '牛奶',  hi: 'दूध', fr: 'lait', it: 'latte', ja: '牛乳', ko: '우유', ar: 'حليب', cat: 'food' },
  { en: 'meat',   ru: 'мясо',       es: 'carne',    pt: 'carne',    de: 'Fleisch', zh: '肉',    hi: 'मांस', fr: 'viande', it: 'carne', ja: '肉', ko: '고기', ar: 'لحم', cat: 'food' },
  { en: 'egg',    ru: 'яйцо',       es: 'huevo',    pt: 'ovo',      de: 'Ei',      zh: '鸡蛋',  hi: 'अंडा', fr: 'œuf', it: 'uovo', ja: '卵', ko: '계란', ar: 'بيضة', cat: 'food' },
  { en: 'apple',  ru: 'яблоко',     es: 'manzana',  pt: 'maçã',     de: 'Apfel',   zh: '苹果',  hi: 'सेब', fr: 'pomme', it: 'mela', ja: 'りんご', ko: '사과', ar: 'تفاحة', cat: 'food' },
  { en: 'rice',   ru: 'рис',        es: 'arroz',    pt: 'arroz',    de: 'Reis',    zh: '米饭',  hi: 'चावल', fr: 'riz', it: 'riso', ja: 'ご飯', ko: '밥', ar: 'أرز', cat: 'food' },
  { en: 'fruit',  ru: 'фрукт',      es: 'fruta',    pt: 'fruta',    de: 'Obst',    zh: '水果',  hi: 'फल', fr: 'fruit', it: 'frutta', ja: '果物', ko: '과일', ar: 'فاكهة', cat: 'food' },
  { en: 'vegetable',ru:'овощ',      es: 'verdura',  pt: 'legume',   de: 'Gemüse',  zh: '蔬菜',  hi: 'सब्ज़ी', fr: 'légume', it: 'verdura', ja: '野菜', ko: '채소', ar: 'خضار', cat: 'food' },
  { en: 'cheese', ru: 'сыр',        es: 'queso',    pt: 'queijo',   de: 'Käse',    zh: '奶酪',  hi: 'पनीर', fr: 'fromage', it: 'formaggio', ja: 'チーズ', ko: '치즈', ar: 'جبن', cat: 'food' },
  { en: 'soup',   ru: 'суп',        es: 'sopa',     pt: 'sopa',     de: 'Suppe',   zh: '汤',    hi: 'सूप', fr: 'soupe', it: 'zuppa', ja: 'スープ', ko: '수프', ar: 'حساء', cat: 'food' },
  { en: 'sugar',  ru: 'сахар',      es: 'azúcar',   pt: 'açúcar',   de: 'Zucker',  zh: '糖',    hi: 'चीनी', fr: 'sucre', it: 'zucchero', ja: '砂糖', ko: '설탕', ar: 'سكر', cat: 'food' },
  { en: 'salt',   ru: 'соль',       es: 'sal',      pt: 'sal',      de: 'Salz',    zh: '盐',    hi: 'नमक', fr: 'sel', it: 'sale', ja: '塩', ko: '소금', ar: 'ملح', cat: 'food' },
  { en: 'oil',    ru: 'масло',      es: 'aceite',   pt: 'óleo',     de: 'Öl',      zh: '油',    hi: 'तेल', fr: 'huile', it: 'olio', ja: '油', ko: '기름', ar: 'زيت', cat: 'food' },
  { en: 'tea',    ru: 'чай',        es: 'té',       pt: 'chá',      de: 'Tee',     zh: '茶',    hi: 'चाय', fr: 'thé', it: 'tè', ja: 'お茶', ko: '차', ar: 'شاي', cat: 'food' },
  { en: 'coffee', ru: 'кофе',       es: 'café',     pt: 'café',     de: 'Kaffee',  zh: '咖啡',  hi: 'कॉफ़ी', fr: 'café', it: 'caffè', ja: 'コーヒー', ko: '커피', ar: 'قهوة', cat: 'food' },
  { en: 'wine',   ru: 'вино',       es: 'vino',     pt: 'vinho',    de: 'Wein',    zh: '葡萄酒',hi: 'शराब', fr: 'vin', it: 'vino', ja: 'ワイン', ko: '와인', ar: 'نبيذ', cat: 'food' },
  { en: 'grape', ru: 'виноград', es: 'uva', pt: 'uva', de: 'Traube', zh: '葡萄', hi: 'अंगूर', fr: 'raisin', it: 'uva', ja: 'ぶどう', ko: '포도', ar: 'عنب', cat: 'food' },
  { en: 'butter', ru: 'сливочное масло', es: 'mantequilla', pt: 'manteiga', de: 'Butter', zh: '黄油', hi: 'मक्खन', fr: 'beurre', it: 'burro', ja: 'バター', ko: '버터', ar: 'زبدة', cat: 'food' },
  { en: 'honey', ru: 'мёд', es: 'miel', pt: 'mel', de: 'Honig', zh: '蜂蜜', hi: 'शहद', fr: 'miel', it: 'miele', ja: '蜂蜜', ko: '꿀', ar: 'عسل', cat: 'food' },
  { en: 'potato', ru: 'картофель', es: 'patata', pt: 'batata', de: 'Kartoffel', zh: '土豆', hi: 'आलू', fr: 'pomme de terre', it: 'patata', ja: 'じゃがいも', ko: '감자', ar: 'بطاطس', cat: 'food' },
  { en: 'onion', ru: 'лук', es: 'cebolla', pt: 'cebola', de: 'Zwiebel', zh: '洋葱', hi: 'प्याज़', fr: 'oignon', it: 'cipolla', ja: '玉ねぎ', ko: '양파', ar: 'بصل', cat: 'food' },
  { en: 'cake', ru: 'торт', es: 'pastel', pt: 'bolo', de: 'Kuchen', zh: '蛋糕', hi: 'केक', fr: 'gâteau', it: 'torta', ja: 'ケーキ', ko: '케이크', ar: 'كعكة', cat: 'food' },
  { en: 'juice', ru: 'сок', es: 'zumo', pt: 'suco', de: 'Saft', zh: '果汁', hi: 'रस', fr: 'jus', it: 'succo', ja: 'ジュース', ko: '주스', ar: 'عصير', cat: 'food' },

  // ── Животные ──
  { en: 'dog',    ru: 'собака',     es: 'perro',    pt: 'cachorro', de: 'Hund',    zh: '狗',    hi: 'कुत्ता', fr: 'chien', it: 'cane', ja: '犬', ko: '개', ar: 'كلب', cat: 'animals' },
  { en: 'cat',    ru: 'кошка',      es: 'gato',     pt: 'gato',     de: 'Katze',   zh: '猫',    hi: 'बिल्ली', fr: 'chat', it: 'gatto', ja: '猫', ko: '고양이', ar: 'قط', cat: 'animals' },
  { en: 'horse',  ru: 'лошадь',     es: 'caballo',  pt: 'cavalo',   de: 'Pferd',   zh: '马',    hi: 'घोड़ा', fr: 'cheval', it: 'cavallo', ja: '馬', ko: '말', ar: 'حصان', cat: 'animals' },
  { en: 'cow',    ru: 'корова',     es: 'vaca',     pt: 'vaca',     de: 'Kuh',     zh: '牛',    hi: 'गाय', fr: 'vache', it: 'mucca', ja: '牛', ko: '소', ar: 'بقرة', cat: 'animals' },
  { en: 'pig',    ru: 'свинья',     es: 'cerdo',    pt: 'porco',    de: 'Schwein', zh: '猪',    hi: 'सूअर', fr: 'cochon', it: 'maiale', ja: '豚', ko: '돼지', ar: 'خنزير', cat: 'animals' },
  { en: 'sheep',  ru: 'овца',       es: 'oveja',    pt: 'ovelha',   de: 'Schaf',   zh: '羊',    hi: 'भेड़', fr: 'mouton', it: 'pecora', ja: '羊', ko: '양', ar: 'خروف', cat: 'animals' },
  { en: 'chicken',ru: 'курица',     es: 'gallina',  pt: 'galinha',  de: 'Huhn',    zh: '鸡',    hi: 'मुर्गी', fr: 'poulet', it: 'pollo', ja: '鶏', ko: '닭', ar: 'دجاجة', cat: 'animals' },
  { en: 'bird',   ru: 'птица',      es: 'pájaro',   pt: 'pássaro',  de: 'Vogel',   zh: '鸟',    hi: 'पक्षी', fr: 'oiseau', it: 'uccello', ja: '鳥', ko: '새', ar: 'طائر', cat: 'animals' },
  { en: 'fish',   ru: 'рыба',       es: 'pez',      pt: 'peixe',    de: 'Fisch',   zh: '鱼',    hi: 'मछली', fr: 'poisson', it: 'pesce', ja: '魚', ko: '물고기', ar: 'سمكة', cat: 'animals' },
  { en: 'mouse',  ru: 'мышь',       es: 'ratón',    pt: 'rato',     de: 'Maus',    zh: '老鼠',  hi: 'चूहा', fr: 'souris', it: 'topo', ja: 'ねずみ', ko: '쥐', ar: 'فأر', cat: 'animals' },
  { en: 'bear',   ru: 'медведь',    es: 'oso',      pt: 'urso',     de: 'Bär',     zh: '熊',    hi: 'भालू', fr: 'ours', it: 'orso', ja: '熊', ko: '곰', ar: 'دب', cat: 'animals' },
  { en: 'elephant',ru:'слон',       es: 'elefante', pt: 'elefante', de: 'Elefant', zh: '大象',  hi: 'हाथी', fr: 'éléphant', it: 'elefante', ja: '象', ko: '코끼리', ar: 'فيل', cat: 'animals' },
  { en: 'lion',   ru: 'лев',        es: 'león',     pt: 'leão',     de: 'Löwe',    zh: '狮子',  hi: 'शेर', fr: 'lion', it: 'leone', ja: 'ライオン', ko: '사자', ar: 'أسد', cat: 'animals' },
  { en: 'snake',  ru: 'змея',       es: 'serpiente',pt: 'cobra',    de: 'Schlange',zh: '蛇',    hi: 'साँप', fr: 'serpent', it: 'serpente', ja: '蛇', ko: '뱀', ar: 'ثعبان', cat: 'animals' },
  { en: 'bee', ru: 'пчела', es: 'abeja', pt: 'abelha', de: 'Biene', zh: '蜜蜂', hi: 'मधुमक्खी', fr: 'abeille', it: 'ape', ja: 'ハチ', ko: '벌', ar: 'نحلة', cat: 'animals' },
  { en: 'duck', ru: 'утка', es: 'pato', pt: 'pato', de: 'Ente', zh: '鸭子', hi: 'बत्तख', fr: 'canard', it: 'anatra', ja: 'アヒル', ko: '오리', ar: 'بطة', cat: 'animals' },
  { en: 'goat', ru: 'коза', es: 'cabra', pt: 'cabra', de: 'Ziege', zh: '山羊', hi: 'बकरी', fr: 'chèvre', it: 'capra', ja: 'ヤギ', ko: '염소', ar: 'ماعز', cat: 'animals' },
  { en: 'wolf', ru: 'волк', es: 'lobo', pt: 'lobo', de: 'Wolf', zh: '狼', hi: 'भेड़िया', fr: 'loup', it: 'lupo', ja: 'オオカミ', ko: '늑대', ar: 'ذئب', cat: 'animals' },
  { en: 'frog', ru: 'лягушка', es: 'rana', pt: 'sapo', de: 'Frosch', zh: '青蛙', hi: 'मेंढक', fr: 'grenouille', it: 'rana', ja: 'カエル', ko: '개구리', ar: 'ضفدع', cat: 'animals' },

  // ── Природа ──
  { en: 'sun',    ru: 'солнце',     es: 'sol',      pt: 'sol',      de: 'Sonne',   zh: '太阳',  hi: 'सूरज', fr: 'soleil', it: 'sole', ja: '太陽', ko: '태양', ar: 'شمس', cat: 'nature' },
  { en: 'moon',   ru: 'луна',       es: 'luna',     pt: 'lua',      de: 'Mond',    zh: '月亮',  hi: 'चाँद', fr: 'lune', it: 'luna', ja: '月', ko: '달', ar: 'قمر', cat: 'nature' },
  { en: 'star',   ru: 'звезда',     es: 'estrella', pt: 'estrela',  de: 'Stern',   zh: '星星',  hi: 'तारा', fr: 'étoile', it: 'stella', ja: '星', ko: '별', ar: 'نجمة', cat: 'nature' },
  { en: 'sky',    ru: 'небо',       es: 'cielo',    pt: 'céu',      de: 'Himmel',  zh: '天空',  hi: 'आसमान', fr: 'ciel', it: 'cielo', ja: '空', ko: '하늘', ar: 'سماء', cat: 'nature' },
  { en: 'cloud',  ru: 'облако',     es: 'nube',     pt: 'nuvem',    de: 'Wolke',   zh: '云',    hi: 'बादल', fr: 'nuage', it: 'nuvola', ja: '雲', ko: '구름', ar: 'سحابة', cat: 'nature' },
  { en: 'wind',   ru: 'ветер',      es: 'viento',   pt: 'vento',    de: 'Wind',    zh: '风',    hi: 'हवा', fr: 'vent', it: 'vento', ja: '風', ko: '바람', ar: 'ريح', cat: 'nature' },
  { en: 'rain',   ru: 'дождь',      es: 'lluvia',   pt: 'chuva',    de: 'Regen',   zh: '雨',    hi: 'बारिश', fr: 'pluie', it: 'pioggia', ja: '雨', ko: '비', ar: 'مطر', cat: 'nature' },
  { en: 'snow',   ru: 'снег',       es: 'nieve',    pt: 'neve',     de: 'Schnee',  zh: '雪',    hi: 'बर्फ़', fr: 'neige', it: 'neve', ja: '雪', ko: '흰 눈', ar: 'ثلج', cat: 'nature' },
  { en: 'tree',   ru: 'дерево',     es: 'árbol',    pt: 'árvore',   de: 'Baum',    zh: '树',    hi: 'पेड़', fr: 'arbre', it: 'albero', ja: '木', ko: '나무', ar: 'شجرة', cat: 'nature' },
  { en: 'flower', ru: 'цветок',     es: 'flor',     pt: 'flor',     de: 'Blume',   zh: '花',    hi: 'फूल', fr: 'fleur', it: 'fiore', ja: '花', ko: '꽃', ar: 'زهرة', cat: 'nature' },
  { en: 'grass',  ru: 'трава',      es: 'hierba',   pt: 'grama',    de: 'Gras',    zh: '草',    hi: 'घास', fr: 'herbe', it: 'erba', ja: '草', ko: '풀', ar: 'عشب', cat: 'nature' },
  { en: 'forest', ru: 'лес',        es: 'bosque',   pt: 'floresta', de: 'Wald',    zh: '森林',  hi: 'जंगल', fr: 'forêt', it: 'foresta', ja: '森', ko: '숲', ar: 'غابة', cat: 'nature' },
  { en: 'mountain',ru:'гора',       es: 'montaña',  pt: 'montanha', de: 'Berg',    zh: '山',    hi: 'पहाड़', fr: 'montagne', it: 'montagna', ja: '山', ko: '산', ar: 'جبل', cat: 'nature' },
  { en: 'river',  ru: 'река',       es: 'río',      pt: 'rio',      de: 'Fluss',   zh: '河',    hi: 'नदी', fr: 'rivière', it: 'fiume', ja: '川', ko: '강', ar: 'نهر', cat: 'nature' },
  { en: 'sea',    ru: 'море',       es: 'mar',      pt: 'mar',      de: 'Meer',    zh: '海',    hi: 'समुद्र', fr: 'mer', it: 'mare', ja: '海', ko: '바다', ar: 'بحر', cat: 'nature' },
  { en: 'stone',  ru: 'камень',     es: 'piedra',   pt: 'pedra',    de: 'Stein',   zh: '石头',  hi: 'पत्थर', fr: 'pierre', it: 'pietra', ja: '石', ko: '돌', ar: 'حجر', cat: 'nature' },
  { en: 'south', ru: 'юг', es: 'sur', pt: 'sul', de: 'Süden', zh: '南', hi: 'दक्षिण', fr: 'sud', it: 'sud', ja: '南', ko: '남쪽', ar: 'جنوب', cat: 'nature' },
  { en: 'east', ru: 'восток', es: 'este', pt: 'leste', de: 'Osten', zh: '东', hi: 'पूर्व', fr: 'est', it: 'est', ja: '東', ko: '동쪽', ar: 'شرق', cat: 'nature' },
  { en: 'island', ru: 'остров', es: 'isla', pt: 'ilha', de: 'Insel', zh: '岛', hi: 'द्वीप', fr: 'île', it: 'isola', ja: '島', ko: '섬', ar: 'جزيرة', cat: 'nature' },
  { en: 'lake', ru: 'озеро', es: 'lago', pt: 'lago', de: 'See', zh: '湖', hi: 'झील', fr: 'lac', it: 'lago', ja: '湖', ko: '호수', ar: 'بحيرة', cat: 'nature' },
  { en: 'sand', ru: 'песок', es: 'arena', pt: 'areia', de: 'Sand', zh: '沙子', hi: 'रेत', fr: 'sable', it: 'sabbia', ja: '砂', ko: '모래', ar: 'رمل', cat: 'nature' },
  { en: 'leaf', ru: 'лист', es: 'hoja', pt: 'folha', de: 'Blatt', zh: '叶子', hi: 'पत्ता', fr: 'feuille', it: 'foglia', ja: '葉', ko: '잎', ar: 'ورقة', cat: 'nature' },
  { en: 'root', ru: 'корень', es: 'raíz', pt: 'raiz', de: 'Wurzel', zh: '根', hi: 'जड़', fr: 'racine', it: 'radice', ja: '根', ko: '뿌리', ar: 'جذر', cat: 'nature' },
  { en: 'ice', ru: 'лёд', es: 'hielo', pt: 'gelo', de: 'Eis', zh: '冰', hi: 'हिम', fr: 'glace', it: 'ghiaccio', ja: '氷', ko: '얼음', ar: 'جليد', cat: 'nature' },
  { en: 'fog', ru: 'туман', es: 'niebla', pt: 'nevoeiro', de: 'Nebel', zh: '雾', hi: 'कोहरा', fr: 'brouillard', it: 'nebbia', ja: '霧', ko: '안개', ar: 'ضباب', cat: 'nature' },
  { en: 'storm', ru: 'буря', es: 'tormenta', pt: 'tempestade', de: 'Sturm', zh: '风暴', hi: 'तूफ़ान', fr: 'tempête', it: 'tempesta', ja: '嵐', ko: '폭풍', ar: 'عاصفة', cat: 'nature' },

  // ── Цвета ──
  { en: 'red',    ru: 'красный',    es: 'rojo',     pt: 'vermelho', de: 'rot',     zh: '红色',  hi: 'लाल', fr: 'rouge', it: 'rosso', ja: '赤', ko: '빨강', ar: 'أحمر', cat: 'colors' },
  { en: 'white',  ru: 'белый',      es: 'blanco',   pt: 'branco',   de: 'weiß',    zh: '白色',  hi: 'सफ़ेद', fr: 'blanc', it: 'bianco', ja: '白', ko: '하양', ar: 'أبيض', cat: 'colors' },
  { en: 'black',  ru: 'чёрный',     es: 'negro',    pt: 'preto',    de: 'schwarz', zh: '黑色',  hi: 'काला', fr: 'noir', it: 'nero', ja: '黒', ko: '검정', ar: 'أسود', cat: 'colors' },
  { en: 'blue',   ru: 'синий',      es: 'azul',     pt: 'azul',     de: 'blau',    zh: '蓝色',  hi: 'नीला', fr: 'bleu', it: 'blu', ja: '青', ko: '파랑', ar: 'أزرق', cat: 'colors' },
  { en: 'green',  ru: 'зелёный',    es: 'verde',    pt: 'verde',    de: 'grün',    zh: '绿色',  hi: 'हरा', fr: 'vert', it: 'verde', ja: '緑', ko: '초록', ar: 'أخضر', cat: 'colors' },
  { en: 'yellow', ru: 'жёлтый',     es: 'amarillo', pt: 'amarelo',  de: 'gelb',    zh: '黄色',  hi: 'पीला', fr: 'jaune', it: 'giallo', ja: '黄色', ko: '노랑', ar: 'أصفر', cat: 'colors' },

  // ── Дом / предметы ──
  { en: 'door',   ru: 'дверь',      es: 'puerta',   pt: 'porta',    de: 'Tür',     zh: '门',    hi: 'दरवाज़ा', fr: 'porte', it: 'porta', ja: 'ドア', ko: '문', ar: 'باب', cat: 'home' },
  { en: 'window', ru: 'окно',       es: 'ventana',  pt: 'janela',   de: 'Fenster', zh: '窗户',  hi: 'खिड़की', fr: 'fenêtre', it: 'finestra', ja: '窓', ko: '창문', ar: 'نافذة', cat: 'home' },
  { en: 'wall',   ru: 'стена',      es: 'pared',    pt: 'parede',   de: 'Wand',    zh: '墙',    hi: 'दीवार', fr: 'mur', it: 'muro', ja: '壁', ko: '벽', ar: 'جدار', cat: 'home' },
  { en: 'room',   ru: 'комната',    es: 'cuarto',   pt: 'quarto',   de: 'Zimmer',  zh: '房间',  hi: 'कमरा', fr: 'chambre', it: 'stanza', ja: '部屋', ko: '방', ar: 'غرفة', cat: 'home' },
  { en: 'table',  ru: 'стол',       es: 'mesa',     pt: 'mesa',     de: 'Tisch',   zh: '桌子',  hi: 'मेज़', fr: 'table', it: 'tavolo', ja: 'テーブル', ko: '탁자', ar: 'طاولة', cat: 'home' },
  { en: 'chair',  ru: 'стул',       es: 'silla',    pt: 'cadeira',  de: 'Stuhl',   zh: '椅子',  hi: 'कुर्सी', fr: 'chaise', it: 'sedia', ja: '椅子', ko: '의자', ar: 'كرسي', cat: 'home' },
  { en: 'bed',    ru: 'кровать',    es: 'cama',     pt: 'cama',     de: 'Bett',    zh: '床',    hi: 'बिस्तर', fr: 'lit', it: 'letto', ja: 'ベッド', ko: '침대', ar: 'سرير', cat: 'home' },
  { en: 'key',    ru: 'ключ',       es: 'llave',    pt: 'chave',    de: 'Schlüssel',zh: '钥匙', hi: 'चाबी', fr: 'clé', it: 'chiave', ja: '鍵', ko: '열쇠', ar: 'مفتاح', cat: 'home' },
  { en: 'clock',  ru: 'часы',       es: 'reloj',    pt: 'relógio',  de: 'Uhr',     zh: '钟',    hi: 'घड़ी', fr: 'horloge', it: 'orologio', ja: '時計', ko: '시계', ar: 'ساعة حائط', cat: 'home' },
  { en: 'phone',  ru: 'телефон',    es: 'teléfono', pt: 'telefone', de: 'Telefon', zh: '电话',  hi: 'फ़ोन', fr: 'téléphone', it: 'telefono', ja: '電話', ko: '전화', ar: 'هاتف', cat: 'home' },
  { en: 'paper',  ru: 'бумага',     es: 'papel',    pt: 'papel',    de: 'Papier',  zh: '纸',    hi: 'कागज़', fr: 'papier', it: 'carta', ja: '紙', ko: '종이', ar: 'ورق', cat: 'home' },
  { en: 'knife',  ru: 'нож',        es: 'cuchillo', pt: 'faca',     de: 'Messer',  zh: '刀',    hi: 'चाकू', fr: 'couteau', it: 'coltello', ja: 'ナイフ', ko: '칼', ar: 'سكين', cat: 'home' },
  { en: 'bag',    ru: 'сумка',      es: 'bolsa',    pt: 'bolsa',    de: 'Tasche',  zh: '包',    hi: 'थैला', fr: 'sac', it: 'borsa', ja: 'かばん', ko: '가방', ar: 'حقيبة', cat: 'home' },
  { en: 'car',    ru: 'машина',     es: 'coche',    pt: 'carro',    de: 'Auto',    zh: '汽车',  hi: 'गाड़ी', fr: 'voiture', it: 'macchina', ja: '車', ko: '자동차', ar: 'سيارة', cat: 'home' },
  { en: 'bus', ru: 'автобус', es: 'autobús', pt: 'ônibus', de: 'Bus', zh: '公交车', hi: 'बस', fr: 'bus', it: 'bus', ja: 'バス', ko: '버스', ar: 'حافلة', cat: 'home' },
  { en: 'floor', ru: 'пол', es: 'suelo', pt: 'chão', de: 'Boden', zh: '地板', hi: 'फ़र्श', fr: 'sol', it: 'pavimento', ja: '床', ko: '바닥', ar: 'أرضية', cat: 'home' },
  { en: 'roof', ru: 'крыша', es: 'techo', pt: 'telhado', de: 'Dach', zh: '屋顶', hi: 'छत', fr: 'toit', it: 'tetto', ja: '屋根', ko: '지붕', ar: 'سقف', cat: 'home' },
  { en: 'stairs', ru: 'лестница', es: 'escalera', pt: 'escada', de: 'Treppe', zh: '楼梯', hi: 'सीढ़ी', fr: 'escalier', it: 'scala', ja: '階段', ko: '계단', ar: 'درج', cat: 'home' },
  { en: 'garden', ru: 'сад', es: 'jardín', pt: 'jardim', de: 'Garten', zh: '花园', hi: 'बग़ीचा', fr: 'jardin', it: 'giardino', ja: '庭', ko: '정원', ar: 'بستان', cat: 'home' },
  { en: 'kitchen', ru: 'кухня', es: 'cocina', pt: 'cozinha', de: 'Küche', zh: '厨房', hi: 'रसोई', fr: 'cuisine', it: 'cucina', ja: '台所', ko: '부엌', ar: 'مطبخ', cat: 'home' },
  { en: 'mirror', ru: 'зеркало', es: 'espejo', pt: 'espelho', de: 'Spiegel', zh: '镜子', hi: 'आईना', fr: 'miroir', it: 'specchio', ja: '鏡', ko: '거울', ar: 'مرآة', cat: 'home' },
  { en: 'lamp', ru: 'лампа', es: 'lámpara', pt: 'lâmpada', de: 'Lampe', zh: '灯', hi: 'दीपक', fr: 'lampe', it: 'lampada', ja: 'ランプ', ko: '램프', ar: 'مصباح', cat: 'home' },
  { en: 'towel', ru: 'полотенце', es: 'toalla', pt: 'toalha', de: 'Handtuch', zh: '毛巾', hi: 'तौलिया', fr: 'serviette', it: 'asciugamano', ja: 'タオル', ko: '수건', ar: 'منشفة', cat: 'home' },
  { en: 'soap', ru: 'мыло', es: 'jabón', pt: 'sabão', de: 'Seife', zh: '肥皂', hi: 'साबुन', fr: 'savon', it: 'sapone', ja: '石鹸', ko: '비누', ar: 'صابون', cat: 'home' },

  // ── Места ──
  { en: 'city',   ru: 'город',      es: 'ciudad',   pt: 'cidade',   de: 'Stadt',   zh: '城市',  hi: 'शहर', fr: 'ville', it: 'città', ja: '都市', ko: '도시', ar: 'مدينة', cat: 'places' },
  { en: 'village',ru: 'деревня',    es: 'pueblo',   pt: 'aldeia',   de: 'Dorf',    zh: '村庄',  hi: 'गाँव', fr: 'village', it: 'villaggio', ja: '村', ko: '마을', ar: 'قرية', cat: 'places' },
  { en: 'street', ru: 'улица',      es: 'calle',    pt: 'rua',      de: 'Straße',  zh: '街',    hi: 'सड़क', fr: 'rue', it: 'via', ja: '通り', ko: '거리', ar: 'شارع', cat: 'places' },
  { en: 'road',   ru: 'дорога',     es: 'camino',   pt: 'estrada',  de: 'Weg',     zh: '路',    hi: 'रास्ता', fr: 'route', it: 'strada', ja: '道', ko: '길', ar: 'طريق', cat: 'places' },
  { en: 'school', ru: 'школа',      es: 'escuela',  pt: 'escola',   de: 'Schule',  zh: '学校',  hi: 'स्कूल', fr: 'école', it: 'scuola', ja: '学校', ko: '학교', ar: 'مدرسة', cat: 'places' },
  { en: 'shop',   ru: 'магазин',    es: 'tienda',   pt: 'loja',     de: 'Geschäft',zh: '商店',  hi: 'दुकान', fr: 'magasin', it: 'negozio', ja: '店', ko: '가게', ar: 'متجر', cat: 'places' },
  { en: 'market', ru: 'рынок',      es: 'mercado',  pt: 'mercado',  de: 'Markt',   zh: '市场',  hi: 'बाज़ार', fr: 'marché', it: 'mercato', ja: '市場', ko: '시장', ar: 'سوق', cat: 'places' },
  { en: 'hospital',ru:'больница',   es: 'hospital', pt: 'hospital', de: 'Krankenhaus',zh:'医院',hi: 'अस्पताल', fr: 'hôpital', it: 'ospedale', ja: '病院', ko: '병원', ar: 'مستشفى', cat: 'places' },
  { en: 'bank',   ru: 'банк',       es: 'banco',    pt: 'banco',    de: 'Bank',    zh: '银行',  hi: 'बैंक', fr: 'banque', it: 'banca', ja: '銀行', ko: '은행', ar: 'بنك', cat: 'places' },
  { en: 'park',   ru: 'парк',       es: 'parque',   pt: 'parque',   de: 'Park',    zh: '公园',  hi: 'पार्क', fr: 'parc', it: 'parco', ja: '公園', ko: '공원', ar: 'حديقة', cat: 'places' },
  { en: 'station',ru: 'вокзал',     es: 'estación', pt: 'estação',  de: 'Bahnhof', zh: '车站',  hi: 'स्टेशन', fr: 'gare', it: 'stazione', ja: '駅', ko: '역', ar: 'محطة', cat: 'places' },
  { en: 'airport',ru: 'аэропорт',   es: 'aeropuerto',pt:'aeroporto',de: 'Flughafen',zh:'机场',  hi: 'हवाई अड्डा', fr: 'aéroport', it: 'aeroporto', ja: '空港', ko: '공항', ar: 'مطار', cat: 'places' },
  { en: 'office', ru: 'офис',       es: 'oficina',  pt: 'escritório',de:'Büro',    zh: '办公室',hi: 'दफ़्तर', fr: 'bureau', it: 'ufficio', ja: '事務所', ko: '사무실', ar: 'مكتب', cat: 'places' },
  { en: 'library', ru: 'библиотека', es: 'biblioteca', pt: 'biblioteca', de: 'Bibliothek', zh: '图书馆', hi: 'पुस्तकालय', fr: 'bibliothèque', it: 'biblioteca', ja: '図書館', ko: '도서관', ar: 'مكتبة', cat: 'places' },
  { en: 'museum', ru: 'музей', es: 'museo', pt: 'museu', de: 'Museum', zh: '博物馆', hi: 'संग्रहालय', fr: 'musée', it: 'museo', ja: '博物館', ko: '박물관', ar: 'متحف', cat: 'places' },
  { en: 'beach', ru: 'пляж', es: 'playa', pt: 'praia', de: 'Strand', zh: '海滩', hi: 'समुद्रतट', fr: 'plage', it: 'spiaggia', ja: '浜', ko: '해변', ar: 'شاطئ', cat: 'places' },
  { en: 'bridge', ru: 'мост', es: 'puente', pt: 'ponte', de: 'Brücke', zh: '桥', hi: 'पुल', fr: 'pont', it: 'ponte', ja: '橋', ko: '교량', ar: 'جسر', cat: 'places' },
  { en: 'farm', ru: 'ферма', es: 'granja', pt: 'fazenda', de: 'Bauernhof', zh: '农场', hi: 'खेत', fr: 'ferme', it: 'fattoria', ja: '農場', ko: '농장', ar: 'مزرعة', cat: 'places' },

  // ── Время ──
  { en: 'day',    ru: 'день',       es: 'día',      pt: 'dia',      de: 'Tag',     zh: '天',    hi: 'दिन', fr: 'jour', it: 'giorno', ja: '日', ko: '날', ar: 'يوم', cat: 'time' },
  { en: 'night',  ru: 'ночь',       es: 'noche',    pt: 'noite',    de: 'Nacht',   zh: '夜晚',  hi: 'रात', fr: 'nuit', it: 'notte', ja: '夜', ko: '밤', ar: 'ليل', cat: 'time' },
  { en: 'morning',ru: 'утро',       es: 'mañana',   pt: 'manhã',    de: 'Morgen',  zh: '早上',  hi: 'सुबह', fr: 'matin', it: 'mattina', ja: '朝', ko: '아침', ar: 'صباح', cat: 'time' },
  { en: 'today',  ru: 'сегодня',    es: 'hoy',      pt: 'hoje',     de: 'heute',   zh: '今天',  hi: 'आज', fr: 'aujourd\'hui', it: 'oggi', ja: '今日', ko: '오늘', ar: 'اليوم', cat: 'time' },
  { en: 'week',   ru: 'неделя',     es: 'semana',   pt: 'semana',   de: 'Woche',   zh: '星期',  hi: 'हफ़्ता', fr: 'semaine', it: 'settimana', ja: '週', ko: '주', ar: 'أسبوع', cat: 'time' },
  { en: 'month',  ru: 'месяц',      es: 'mes',      pt: 'mês',      de: 'Monat',   zh: '月',    hi: 'महीना', fr: 'mois', it: 'mese', ja: 'ひと月', ko: '월', ar: 'شهر', cat: 'time' },
  { en: 'year',   ru: 'год',        es: 'año',      pt: 'ano',      de: 'Jahr',    zh: '年',    hi: 'साल', fr: 'année', it: 'anno', ja: '年', ko: '년', ar: 'سنة', cat: 'time' },
  { en: 'hour',   ru: 'час',        es: 'hora',     pt: 'hora',     de: 'Stunde',  zh: '小时',  hi: 'घंटा', fr: 'heure', it: 'ora', ja: '一時間', ko: '한 시간', ar: 'ساعة', cat: 'time' },
  { en: 'minute', ru: 'минута',     es: 'minuto',   pt: 'minuto',   de: 'Minute',  zh: '分钟',  hi: 'मिनट', fr: 'minute', it: 'minuto', ja: '分', ko: '분', ar: 'دقيقة', cat: 'time' },
  { en: 'second', ru: 'секунда', es: 'segundo', pt: 'segundo', de: 'Sekunde', zh: '秒', hi: 'सेकंड', fr: 'seconde', it: 'secondo', ja: '秒', ko: '초', ar: 'ثانية', cat: 'time' },
  { en: 'spring', ru: 'весна', es: 'primavera', pt: 'primavera', de: 'Frühling', zh: '春天', hi: 'वसंत', fr: 'printemps', it: 'primavera', ja: '春', ko: '봄', ar: 'ربيع', cat: 'time' },
  { en: 'summer', ru: 'лето', es: 'verano', pt: 'verão', de: 'Sommer', zh: '夏天', hi: 'गर्मी', fr: 'été', it: 'estate', ja: '夏', ko: '여름', ar: 'صيف', cat: 'time' },
  { en: 'autumn', ru: 'осень', es: 'otoño', pt: 'outono', de: 'Herbst', zh: '秋天', hi: 'शरद', fr: 'automne', it: 'autunno', ja: '秋', ko: '가을', ar: 'خريف', cat: 'time' },
  { en: 'winter', ru: 'зима', es: 'invierno', pt: 'inverno', de: 'Winter', zh: '冬天', hi: 'सर्दी', fr: 'hiver', it: 'inverno', ja: '冬', ko: '겨울', ar: 'شتاء', cat: 'time' },

  // ── Глаголы (словарная форма) ──
  { en: 'to go',  ru: 'идти',       es: 'ir',       pt: 'ir',       de: 'gehen',   zh: '去',    hi: 'जाना', fr: 'aller', it: 'andare', ja: '行く', ko: '가다', ar: 'ذهب', cat: 'verbs' },
  { en: 'to come',ru: 'приходить',  es: 'venir',    pt: 'vir',      de: 'kommen',  zh: '来',    hi: 'आना', fr: 'venir', it: 'venire', ja: '来る', ko: '오다', ar: 'أتى', cat: 'verbs' },
  { en: 'to eat', ru: 'есть',       es: 'comer',    pt: 'comer',    de: 'essen',   zh: '吃',    hi: 'खाना', fr: 'manger', it: 'mangiare', ja: '食べる', ko: '먹다', ar: 'أكل', cat: 'verbs' },
  { en: 'to drink',ru:'пить',       es: 'beber',    pt: 'beber',    de: 'trinken', zh: '喝',    hi: 'पीना', fr: 'boire', it: 'bere', ja: '飲む', ko: '마시다', ar: 'شرب', cat: 'verbs' },
  { en: 'to see', ru: 'видеть',     es: 'ver',      pt: 'ver',      de: 'sehen',   zh: '看',    hi: 'देखना', fr: 'voir', it: 'vedere', ja: '見る', ko: '보다', ar: 'رأى', cat: 'verbs' },
  { en: 'to know',ru: 'знать',      es: 'saber',    pt: 'saber',    de: 'wissen',  zh: '知道',  hi: 'जानना', fr: 'savoir', it: 'sapere', ja: '知る', ko: '알다', ar: 'عرف', cat: 'verbs' },
  { en: 'to want',ru: 'хотеть',     es: 'querer',   pt: 'querer',   de: 'wollen',  zh: '想要',  hi: 'चाहना', fr: 'vouloir', it: 'volere', ja: '欲しい', ko: '원하다', ar: 'أراد', cat: 'verbs' },
  { en: 'to speak',ru:'говорить',   es: 'hablar',   pt: 'falar',    de: 'sprechen',zh: '说',    hi: 'बोलना', fr: 'parler', it: 'parlare', ja: '話す', ko: '말하다', ar: 'تكلم', cat: 'verbs' },
  { en: 'to read',ru: 'читать',     es: 'leer',     pt: 'ler',      de: 'lesen',   zh: '读',    hi: 'पढ़ना', fr: 'lire', it: 'leggere', ja: '読む', ko: '읽다', ar: 'قرأ', cat: 'verbs' },
  { en: 'to write',ru:'писать',     es: 'escribir', pt: 'escrever', de: 'schreiben',zh: '写',   hi: 'लिखना', fr: 'écrire', it: 'scrivere', ja: '書く', ko: '쓰다', ar: 'كتب', cat: 'verbs' },
  { en: 'to sleep',ru:'спать',      es: 'dormir',   pt: 'dormir',   de: 'schlafen',zh: '睡觉',  hi: 'सोना', fr: 'dormir', it: 'dormire', ja: '寝る', ko: '자다', ar: 'نام', cat: 'verbs' },
  { en: 'to give',ru: 'давать',     es: 'dar',      pt: 'dar',      de: 'geben',   zh: '给',    hi: 'देना', fr: 'donner', it: 'dare', ja: 'あげる', ko: '주다', ar: 'أعطى', cat: 'verbs' },
  { en: 'to take',ru: 'брать',      es: 'tomar',    pt: 'pegar',    de: 'nehmen',  zh: '拿',    hi: 'लेना', fr: 'prendre', it: 'prendere', ja: '取る', ko: '가지다', ar: 'أخذ', cat: 'verbs' },
  { en: 'to make',ru: 'делать',     es: 'hacer',    pt: 'fazer',    de: 'machen',  zh: '做',    hi: 'करना', fr: 'faire', it: 'fare', ja: '作る', ko: '만들다', ar: 'صنع', cat: 'verbs' },
  { en: 'to live',ru: 'жить',       es: 'vivir',    pt: 'viver',    de: 'leben',   zh: '住',    hi: 'रहना', fr: 'vivre', it: 'vivere', ja: '住む', ko: '살다', ar: 'عاش', cat: 'verbs' },
  { en: 'to buy', ru: 'покупать',   es: 'comprar',  pt: 'comprar',  de: 'kaufen',  zh: '买',    hi: 'खरीदना', fr: 'acheter', it: 'comprare', ja: '買う', ko: '사다', ar: 'اشترى', cat: 'verbs' },
  { en: 'to open',ru: 'открывать',  es: 'abrir',    pt: 'abrir',    de: 'öffnen',  zh: '开',    hi: 'खोलना', fr: 'ouvrir', it: 'aprire', ja: '開ける', ko: '열다', ar: 'فتح', cat: 'verbs' },
  { en: 'to run', ru: 'бежать', es: 'correr', pt: 'correr', de: 'laufen', zh: '跑', hi: 'दौड़ना', fr: 'courir', it: 'correre', ja: '走る', ko: '달리다', ar: 'ركض', cat: 'verbs' },
  { en: 'to sit', ru: 'сидеть', es: 'sentarse', pt: 'sentar', de: 'sitzen', zh: '坐', hi: 'बैठना', fr: 'asseoir', it: 'sedere', ja: '座る', ko: '앉다', ar: 'جلس', cat: 'verbs' },
  { en: 'to stand', ru: 'стоять', es: 'estar de pie', pt: 'ficar de pé', de: 'stehen', zh: '站', hi: 'खड़ा होना', fr: 'se tenir', it: 'stare in piedi', ja: '立つ', ko: '서다', ar: 'وقف', cat: 'verbs' },
  { en: 'to play', ru: 'играть', es: 'jugar', pt: 'jogar', de: 'spielen', zh: '玩儿', hi: 'खेलना', fr: 'jouer', it: 'giocare', ja: '遊ぶ', ko: '놀다', ar: 'لعب', cat: 'verbs' },
  { en: 'to sing', ru: 'петь', es: 'cantar', pt: 'cantar', de: 'singen', zh: '唱', hi: 'गाना', fr: 'chanter', it: 'cantare', ja: '歌う', ko: '노래하다', ar: 'غنى', cat: 'verbs' },
  { en: 'to wash', ru: 'мыть', es: 'lavar', pt: 'lavar', de: 'waschen', zh: '洗', hi: 'धोना', fr: 'laver', it: 'lavare', ja: '洗う', ko: '씻다', ar: 'غسل', cat: 'verbs' },
  { en: 'to help', ru: 'помогать', es: 'ayudar', pt: 'ajudar', de: 'helfen', zh: '帮助', hi: 'मदद करना', fr: 'aider', it: 'aiutare', ja: '助ける', ko: '돕다', ar: 'ساعد', cat: 'verbs' },
  { en: 'to wait', ru: 'ждать', es: 'esperar', pt: 'esperar', de: 'warten', zh: '等', hi: 'इंतज़ार करना', fr: 'attendre', it: 'aspettare', ja: '待つ', ko: '기다리다', ar: 'انتظر', cat: 'verbs' },
  { en: 'to find', ru: 'находить', es: 'encontrar', pt: 'encontrar', de: 'finden', zh: '找到', hi: 'ढूँढ़ना', fr: 'trouver', it: 'trovare', ja: '見つける', ko: '찾다', ar: 'وجد', cat: 'verbs' },
  { en: 'to close', ru: 'закрывать', es: 'cerrar', pt: 'fechar', de: 'schließen', zh: '关', hi: 'बंद करना', fr: 'fermer', it: 'chiudere', ja: '閉める', ko: '닫다', ar: 'أغلق', cat: 'verbs' },
  { en: 'to ask', ru: 'спрашивать', es: 'preguntar', pt: 'perguntar', de: 'fragen', zh: '问', hi: 'पूछना', fr: 'demander', it: 'chiedere', ja: '聞く', ko: '묻다', ar: 'سأل', cat: 'verbs' },
  { en: 'to learn', ru: 'учиться', es: 'aprender', pt: 'aprender', de: 'lernen', zh: '学', hi: 'सीखना', fr: 'apprendre', it: 'imparare', ja: '学ぶ', ko: '배우다', ar: 'تعلم', cat: 'verbs' },
  { en: 'to remember', ru: 'помнить', es: 'recordar', pt: 'lembrar', de: 'erinnern', zh: '记得', hi: 'याद रखना', fr: 'se souvenir', it: 'ricordare', ja: '覚える', ko: '기억하다', ar: 'تذكر', cat: 'verbs' },
  { en: 'to forget', ru: 'забывать', es: 'olvidar', pt: 'esquecer', de: 'vergessen', zh: '忘记', hi: 'भूलना', fr: 'oublier', it: 'dimenticare', ja: '忘れる', ko: '잊다', ar: 'نسي', cat: 'verbs' },

  // ── Прилагательные (цвета — выше) ──
  { en: 'big',    ru: 'большой',    es: 'grande',   pt: 'grande',   de: 'groß',    zh: '大',    hi: 'बड़ा', fr: 'grand', it: 'grande', ja: '大きい', ko: '크다', ar: 'كبير', cat: 'adjectives' },
  { en: 'small',  ru: 'маленький',  es: 'pequeño',  pt: 'pequeno',  de: 'klein',   zh: '小',    hi: 'छोटा', fr: 'petit', it: 'piccolo', ja: '小さい', ko: '작다', ar: 'صغير', cat: 'adjectives' },
  { en: 'good',   ru: 'хороший',    es: 'bueno',    pt: 'bom',      de: 'gut',     zh: '好',    hi: 'अच्छा', fr: 'bon', it: 'buono', ja: '良い', ko: '좋다', ar: 'جيد', cat: 'adjectives' },
  { en: 'bad',    ru: 'плохой',     es: 'malo',     pt: 'ruim',     de: 'schlecht',zh: '坏',    hi: 'बुरा', fr: 'mauvais', it: 'cattivo', ja: '悪い', ko: '나쁘다', ar: 'سيء', cat: 'adjectives' },
  { en: 'new',    ru: 'новый',      es: 'nuevo',    pt: 'novo',     de: 'neu',     zh: '新',    hi: 'नया', fr: 'nouveau', it: 'nuovo', ja: '新しい', ko: '새롭다', ar: 'جديد', cat: 'adjectives' },
  { en: 'old',    ru: 'старый',     es: 'viejo',    pt: 'velho',    de: 'alt',     zh: '老',    hi: 'पुराना', fr: 'vieux', it: 'vecchio', ja: '古い', ko: '낡다', ar: 'قديم', cat: 'adjectives' },
  { en: 'young',  ru: 'молодой',    es: 'joven',    pt: 'jovem',    de: 'jung',    zh: '年轻',  hi: 'जवान', fr: 'jeune', it: 'giovane', ja: '若い', ko: '젊다', ar: 'شاب', cat: 'adjectives' },
  { en: 'long',   ru: 'длинный',    es: 'largo',    pt: 'longo',    de: 'lang',    zh: '长',    hi: 'लंबा', fr: 'long', it: 'lungo', ja: '長い', ko: '길다', ar: 'طويل', cat: 'adjectives' },
  { en: 'tall',   ru: 'высокий',    es: 'alto',     pt: 'alto',     de: 'hoch',    zh: '高',    hi: 'ऊँचा', fr: 'haut', it: 'alto', ja: '高い', ko: '높다', ar: 'عالٍ', cat: 'adjectives' },
  { en: 'hot',    ru: 'горячий',    es: 'caliente', pt: 'quente',   de: 'heiß',    zh: '热',    hi: 'गरम', fr: 'chaud', it: 'caldo', ja: '暑い', ko: '덥다', ar: 'حار', cat: 'adjectives' },
  { en: 'cold',   ru: 'холодный',   es: 'frío',     pt: 'frio',     de: 'kalt',    zh: '冷',    hi: 'ठंडा', fr: 'froid', it: 'freddo', ja: '寒い', ko: '춥다', ar: 'بارد', cat: 'adjectives' },
  { en: 'fast',   ru: 'быстрый',    es: 'rápido',   pt: 'rápido',   de: 'schnell', zh: '快',    hi: 'तेज़', fr: 'rapide', it: 'veloce', ja: '速い', ko: '빠르다', ar: 'سريع', cat: 'adjectives' },
  { en: 'slow',   ru: 'медленный',  es: 'lento',    pt: 'lento',    de: 'langsam', zh: '慢',    hi: 'धीमा', fr: 'lent', it: 'lento', ja: '遅い', ko: '느리다', ar: 'بطيء', cat: 'adjectives' },
  { en: 'strong', ru: 'сильный',    es: 'fuerte',   pt: 'forte',    de: 'stark',   zh: '强',    hi: 'मज़बूत', fr: 'fort', it: 'forte', ja: '強い', ko: '강하다', ar: 'قوي', cat: 'adjectives' },
  { en: 'beautiful',ru:'красивый',  es: 'hermoso',  pt: 'bonito',   de: 'schön',   zh: '美丽',  hi: 'सुंदर', fr: 'beau', it: 'bello', ja: '美しい', ko: '아름답다', ar: 'جميل', cat: 'adjectives' },
  { en: 'happy',  ru: 'счастливый', es: 'feliz',    pt: 'feliz',    de: 'glücklich',zh: '快乐', hi: 'खुश', fr: 'heureux', it: 'felice', ja: '幸せ', ko: '행복하다', ar: 'سعيد', cat: 'adjectives' },
  { en: 'easy',   ru: 'лёгкий',     es: 'fácil',    pt: 'fácil',    de: 'leicht',  zh: '容易',  hi: 'आसान', fr: 'facile', it: 'facile', ja: '簡単', ko: '쉽다', ar: 'سهل', cat: 'adjectives' },
  { en: 'difficult',ru:'трудный',   es: 'difícil',  pt: 'difícil',  de: 'schwierig',  zh: '难',    hi: 'मुश्किल', fr: 'difficile', it: 'difficile', ja: '難しい', ko: '어렵다', ar: 'صعب', cat: 'adjectives' },
  { en: 'clean',  ru: 'чистый',     es: 'limpio',   pt: 'limpo',    de: 'sauber',  zh: '干净',  hi: 'साफ़', fr: 'propre', it: 'pulito', ja: 'きれい', ko: '깨끗하다', ar: 'نظيف', cat: 'adjectives' },
  { en: 'expensive',ru:'дорогой',   es: 'caro',     pt: 'caro',     de: 'teuer',   zh: '贵',    hi: 'महँगा', fr: 'cher', it: 'caro', ja: '高価', ko: '비싸다', ar: 'غالي', cat: 'adjectives' },
  { en: 'heavy', ru: 'тяжёлый', es: 'pesado', pt: 'pesado', de: 'schwer', zh: '重', hi: 'भारी', fr: 'lourd', it: 'pesante', ja: '重い', ko: '무겁다', ar: 'ثقيل', cat: 'adjectives' },
  { en: 'wide', ru: 'широкий', es: 'ancho', pt: 'largo', de: 'breit', zh: '宽', hi: 'चौड़ा', fr: 'large', it: 'largo', ja: '広い', ko: '넓다', ar: 'عريض', cat: 'adjectives' },
  { en: 'narrow', ru: 'узкий', es: 'estrecho', pt: 'estreito', de: 'schmal', zh: '窄', hi: 'सँकरा', fr: 'étroit', it: 'stretto', ja: '狭い', ko: '좁다', ar: 'ضيق', cat: 'adjectives' },
  { en: 'deep', ru: 'глубокий', es: 'profundo', pt: 'profundo', de: 'tief', zh: '深', hi: 'गहरा', fr: 'profond', it: 'profondo', ja: '深い', ko: '깊다', ar: 'عميق', cat: 'adjectives' },
  { en: 'soft', ru: 'мягкий', es: 'blando', pt: 'macio', de: 'weich', zh: '软', hi: 'मुलायम', fr: 'doux', it: 'morbido', ja: '柔らかい', ko: '부드럽다', ar: 'ناعم', cat: 'adjectives' },
  { en: 'sweet', ru: 'сладкий', es: 'dulce', pt: 'doce', de: 'süß', zh: '甜', hi: 'मीठा', fr: 'sucré', it: 'dolce', ja: '甘い', ko: '달다', ar: 'حلو', cat: 'adjectives' },
  { en: 'dry', ru: 'сухой', es: 'seco', pt: 'seco', de: 'trocken', zh: '干', hi: 'सूखा', fr: 'sec', it: 'asciutto', ja: '乾いた', ko: '마르다', ar: 'جاف', cat: 'adjectives' },
  { en: 'wet', ru: 'мокрый', es: 'mojado', pt: 'molhado', de: 'nass', zh: '湿', hi: 'गीला', fr: 'mouillé', it: 'bagnato', ja: '濡れた', ko: '젖다', ar: 'مبلل', cat: 'adjectives' },
  { en: 'full', ru: 'полный', es: 'lleno', pt: 'cheio', de: 'voll', zh: '满', hi: 'भरा', fr: 'plein', it: 'pieno', ja: 'いっぱい', ko: '가득하다', ar: 'ممتلئ', cat: 'adjectives' },
  { en: 'empty', ru: 'пустой', es: 'vacío', pt: 'vazio', de: 'leer', zh: '空', hi: 'खाली', fr: 'vide', it: 'vuoto', ja: '空っぽ', ko: '비다', ar: 'فارغ', cat: 'adjectives' },
  { en: 'quiet', ru: 'тихий', es: 'silencioso', pt: 'silencioso', de: 'leise', zh: '安静', hi: 'शांत', fr: 'calme', it: 'silenzioso', ja: '静か', ko: '조용하다', ar: 'هادئ', cat: 'adjectives' },
  { en: 'loud', ru: 'громкий', es: 'ruidoso', pt: 'barulhento', de: 'laut', zh: '吵', hi: 'ज़ोरदार', fr: 'bruyant', it: 'rumoroso', ja: 'うるさい', ko: '시끄럽다', ar: 'صاخب', cat: 'adjectives' },
  { en: 'near', ru: 'близкий', es: 'cercano', pt: 'perto', de: 'nah', zh: '近', hi: 'पास', fr: 'proche', it: 'vicino', ja: '近い', ko: '가깝다', ar: 'قريب', cat: 'adjectives' },
  { en: 'far', ru: 'далёкий', es: 'lejano', pt: 'longe', de: 'fern', zh: '远', hi: 'दूर', fr: 'loin', it: 'lontano', ja: '遠い', ko: '멀다', ar: 'بعيد', cat: 'adjectives' },

  // ── Базовые слова / вежливость ──
  { en: 'yes',    ru: 'да',         es: 'sí',       pt: 'sim',      de: 'ja',      zh: '是',    hi: 'हाँ', fr: 'oui', it: 'sì', ja: 'はい', ko: '네', ar: 'نعم', cat: 'basics' },
  { en: 'no',     ru: 'нет',        es: 'no',       pt: 'não',      de: 'nein',    zh: '不',    hi: 'नहीं', fr: 'non', it: 'no', ja: 'いいえ', ko: '아니요', ar: 'لا', cat: 'basics' },
  { en: 'hello',  ru: 'привет',     es: 'hola',     pt: 'olá',      de: 'hallo',   zh: '你好',  hi: 'नमस्ते', fr: 'bonjour', it: 'ciao', ja: 'こんにちは', ko: '안녕하세요', ar: 'مرحبا', cat: 'basics' },
  { en: 'thank you',ru:'спасибо',   es: 'gracias',  pt: 'obrigado', de: 'danke',   zh: '谢谢',  hi: 'धन्यवाद', fr: 'merci', it: 'grazie', ja: 'ありがとう', ko: '감사합니다', ar: 'شكرا', cat: 'basics' },
  { en: 'please', ru: 'пожалуйста', es: 'por favor',pt: 'por favor',de: 'bitte',   zh: '请',    hi: 'कृपया', fr: 's\'il vous plaît', it: 'per favore', ja: 'お願いします', ko: '부탁합니다', ar: 'من فضلك', cat: 'basics' },
  { en: 'now',    ru: 'сейчас',     es: 'ahora',    pt: 'agora',    de: 'jetzt',   zh: '现在',  hi: 'अभी', fr: 'maintenant', it: 'adesso', ja: '今', ko: '지금', ar: 'الآن', cat: 'basics' },
  { en: 'here',   ru: 'здесь',      es: 'aquí',     pt: 'aqui',     de: 'hier',    zh: '这里',  hi: 'यहाँ', fr: 'ici', it: 'qui', ja: 'ここ', ko: '여기', ar: 'هنا', cat: 'basics' },
  { en: 'there',  ru: 'там',        es: 'allí',     pt: 'lá',       de: 'dort',    zh: '那里',  hi: 'वहाँ', fr: 'là', it: 'lì', ja: 'そこ', ko: '거기', ar: 'هناك', cat: 'basics' },
];

/**
 * ЯЗЫКИ, НА КОТОРЫХ СЛОВАРЬ РЕАЛЬНО ЕСТЬ — ВЫВОДЯТСЯ ИЗ НЕГО САМОГО.
 *
 * 🔴 ЧТО БЫЛО. Экраны словесных игр предлагали выбрать любой из двенадцати
 * языков приложения (`LANGUAGES`), а словарь покрывает семь. Для французского,
 * итальянского, японского, корейского и арабского слов НЕТ — игра запускалась и
 * оказывалась пустой: «выбери 1-е из 0», а в зарядке экран оставался мёртвым
 * навсегда, без шапки и без «назад».
 *
 * ⚠️ ПОЧЕМУ СПИСОК ВЫЧИСЛЯЕТСЯ, А НЕ ВПИСАН РУКАМИ. Вписанный разъедется с
 * первым же добавленным языком, и заметит это опять игрок. Здесь список — это
 * ПОСЛЕДСТВИЕ содержимого словаря: добавили колонку во все записи — язык
 * появился в выборе сам; забыли в половине — не появился, и никто не пострадал.
 */
export function vocabLangsOf(entries: readonly Record<string, string>[]): string[] {
  const first = entries[0];
  if (!first) return [];
  const candidates = Object.keys(first).filter((k) => k !== 'cat');
  return candidates.filter((lang) =>
    entries.every((entry) => typeof entry[lang] === 'string' && entry[lang].length > 0));
}

export const VOCAB_LANGS: readonly string[] = vocabLangsOf(TRANSLATION_VOCAB);

/** Есть ли на этом языке словарь. */
export function hasVocab(lang: string): boolean {
  return VOCAB_LANGS.includes(lang);
}
