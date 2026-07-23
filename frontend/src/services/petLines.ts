/**
 * petLines — реплики питомца «Синапс»: 27 фраз × 12 языков, контекстные.
 *
 * Было 3 фразы с промо-сайта — за день примелькались. Теперь пул собирается
 * из контекста: время суток + стадия питомца + «вернулся после перерыва» +
 * «только что закончил сессию». Приоритетные события (comeback/fresh) берутся
 * с шансом 70%, чтобы реакция ощущалась осмысленной, но не заезженной.
 *
 * Диалоги: у реплики может быть `follow` — вторая фраза пузыря через пару
 * секунд (WalkingPet показывает цепочкой). Не злоупотребляем: follow только
 * там, где вторая фраза реально продолжает мысль.
 *
 * Переводы — транскреация (короткие живые фразы, не подстрочник). ja/ko без
 * нейтив-вычитки (решение 22.07: ждём реальных пользователей через фидбек).
 */
import type { PetStage } from '@/src/services/pet';

export interface PetLine {
  text: string;
  /** Вторая фраза диалога — WalkingPet покажет её следом в том же пузыре. */
  follow?: string;
}

type Ctx =
  | 'idle' | 'morning' | 'day' | 'evening' | 'night'
  | 'comeback' | 'fresh' | 'stage1' | 'stage2' | 'stage3';

type Pack = Record<Ctx, PetLine[]>;

const L: Record<string, Pack> = {
  ru: {
    idle: [
      { text: 'Я слежу за тобой 👀' },
      { text: 'Импульс пойман! ⚡' },
      { text: 'Этот жест щекочет ✨' },
      { text: 'Нейроны любят повторение 🔁' },
      { text: 'Я тут, если что 💜' },
    ],
    morning: [
      { text: 'Доброе утро! Мозг свежий — лови момент ☀️' },
      { text: 'Утренний раунд бодрит лучше кофе 🌅' },
      { text: 'Проснулся? И синапсы тоже!' },
    ],
    day: [
      { text: 'Небольшая пауза — отличное время для раунда 🎯' },
      { text: 'День в разгаре, а ты уже здесь. Уважаю!' },
    ],
    evening: [
      { text: 'Вечерний раунд — и день прожит не зря 🌙' },
      { text: 'Перед сном мозг запоминает лучше 🧠' },
      { text: 'Закат — время спокойных игр 🌇' },
    ],
    night: [
      { text: 'Не спится? Судоку успокаивает 🌌' },
      { text: 'Ночная сова? Я тоже 🦉' },
    ],
    comeback: [
      { text: 'Ты вернулся! Я скучал 💜', follow: 'Начнём с лёгкой разминки?' },
      { text: 'Давно не виделись! Синапсы застоялись' },
      { text: 'Возвращение — уже победа. Сыграем?' },
    ],
    fresh: [
      { text: 'Отличная сессия! Я это почувствовал ⚡', follow: 'Ещё одну?' },
      { text: '+1 к силе синапсов 💪' },
      { text: 'Видел-видел. Красиво сыграно 👏' },
    ],
    stage1: [
      { text: 'Я пока Искра, но расту с каждой твоей игрой ✨' },
      { text: '10 тренировок — и я стану Импульсом!' },
    ],
    stage2: [
      { text: 'Я уже Импульс! Чувствуешь скорость? ⚡' },
      { text: 'До Созвездия рукой подать 🌟' },
    ],
    stage3: [
      { text: 'Мы дошли до Созвездия! Это ты меня прокачал 🌌' },
      { text: 'Созвездие сияет, когда ты играешь ✨' },
    ],
  },
  en: {
    idle: [
      { text: 'I see you 👀' },
      { text: 'Impulse caught! ⚡' },
      { text: 'That gesture tickles ✨' },
      { text: 'Neurons love repetition 🔁' },
      { text: "I'm here if you need me 💜" },
    ],
    morning: [
      { text: 'Good morning! Fresh brain — seize it ☀️' },
      { text: 'A morning round beats coffee 🌅' },
      { text: 'Awake? So are your synapses!' },
    ],
    day: [
      { text: 'A short break — perfect time for a round 🎯' },
      { text: 'Midday and you showed up. Respect!' },
    ],
    evening: [
      { text: 'An evening round makes the day count 🌙' },
      { text: 'Before sleep, the brain remembers best 🧠' },
      { text: 'Sunset — time for calm games 🌇' },
    ],
    night: [
      { text: "Can't sleep? Sudoku soothes 🌌" },
      { text: 'Night owl? Me too 🦉' },
    ],
    comeback: [
      { text: "You're back! I missed you 💜", follow: 'Warm up with something easy?' },
      { text: 'Long time no see! My synapses got stiff' },
      { text: 'Coming back is already a win. Shall we play?' },
    ],
    fresh: [
      { text: 'Great session! I felt that ⚡', follow: 'One more?' },
      { text: '+1 to synapse power 💪' },
      { text: 'I saw that. Nicely played 👏' },
    ],
    stage1: [
      { text: "I'm just a Spark, but I grow with every game ✨" },
      { text: '10 workouts and I become an Impulse!' },
    ],
    stage2: [
      { text: "I'm an Impulse now! Feel the speed? ⚡" },
      { text: 'The Constellation is within reach 🌟' },
    ],
    stage3: [
      { text: 'We reached the Constellation! You built me 🌌' },
      { text: 'The Constellation shines when you play ✨' },
    ],
  },
  es: {
    idle: [
      { text: 'Te veo 👀' },
      { text: '¡Impulso capturado! ⚡' },
      { text: 'Ese gesto hace cosquillas ✨' },
      { text: 'A las neuronas les encanta repetir 🔁' },
      { text: 'Aquí estoy si me necesitas 💜' },
    ],
    morning: [
      { text: '¡Buenos días! Mente fresca — aprovéchala ☀️' },
      { text: 'Una ronda matutina despierta más que el café 🌅' },
      { text: '¿Despierto? ¡Tus sinapsis también!' },
    ],
    day: [
      { text: 'Una pausa breve — momento perfecto para una ronda 🎯' },
      { text: 'Pleno día y aquí estás. ¡Respeto!' },
    ],
    evening: [
      { text: 'Una ronda al atardecer y el día vale la pena 🌙' },
      { text: 'Antes de dormir, el cerebro memoriza mejor 🧠' },
      { text: 'Atardecer — hora de juegos tranquilos 🌇' },
    ],
    night: [
      { text: '¿Sin sueño? El sudoku calma 🌌' },
      { text: '¿Ave nocturna? Yo también 🦉' },
    ],
    comeback: [
      { text: '¡Volviste! Te extrañé 💜', follow: '¿Empezamos con algo fácil?' },
      { text: '¡Cuánto tiempo! Mis sinapsis se oxidaron' },
      { text: 'Volver ya es una victoria. ¿Jugamos?' },
    ],
    fresh: [
      { text: '¡Gran sesión! Lo sentí ⚡', follow: '¿Una más?' },
      { text: '+1 a la fuerza sináptica 💪' },
      { text: 'Lo vi todo. Bien jugado 👏' },
    ],
    stage1: [
      { text: 'Soy una Chispa, pero crezco con cada partida ✨' },
      { text: '¡10 entrenamientos y seré un Impulso!' },
    ],
    stage2: [
      { text: '¡Ya soy un Impulso! ¿Sientes la velocidad? ⚡' },
      { text: 'La Constelación está al alcance 🌟' },
    ],
    stage3: [
      { text: '¡Llegamos a la Constelación! Tú me construiste 🌌' },
      { text: 'La Constelación brilla cuando juegas ✨' },
    ],
  },
  pt: {
    idle: [
      { text: 'Estou vendo você 👀' },
      { text: 'Impulso capturado! ⚡' },
      { text: 'Esse gesto faz cócegas ✨' },
      { text: 'Neurônios adoram repetição 🔁' },
      { text: 'Estou aqui se precisar 💜' },
    ],
    morning: [
      { text: 'Bom dia! Mente fresca — aproveite ☀️' },
      { text: 'Uma rodada de manhã acorda mais que café 🌅' },
      { text: 'Acordou? Suas sinapses também!' },
    ],
    day: [
      { text: 'Uma pausa curta — hora perfeita para uma rodada 🎯' },
      { text: 'Meio do dia e você está aqui. Respeito!' },
    ],
    evening: [
      { text: 'Uma rodada à noite e o dia valeu a pena 🌙' },
      { text: 'Antes de dormir, o cérebro memoriza melhor 🧠' },
      { text: 'Pôr do sol — hora de jogos calmos 🌇' },
    ],
    night: [
      { text: 'Sem sono? Sudoku acalma 🌌' },
      { text: 'Coruja noturna? Eu também 🦉' },
    ],
    comeback: [
      { text: 'Você voltou! Senti sua falta 💜', follow: 'Começamos com algo leve?' },
      { text: 'Quanto tempo! Minhas sinapses enferrujaram' },
      { text: 'Voltar já é uma vitória. Vamos jogar?' },
    ],
    fresh: [
      { text: 'Ótima sessão! Eu senti ⚡', follow: 'Mais uma?' },
      { text: '+1 de força sináptica 💪' },
      { text: 'Eu vi tudo. Bem jogado 👏' },
    ],
    stage1: [
      { text: 'Sou uma Faísca, mas cresço a cada jogo ✨' },
      { text: '10 treinos e viro um Impulso!' },
    ],
    stage2: [
      { text: 'Já sou um Impulso! Sente a velocidade? ⚡' },
      { text: 'A Constelação está ao alcance 🌟' },
    ],
    stage3: [
      { text: 'Chegamos à Constelação! Você me construiu 🌌' },
      { text: 'A Constelação brilha quando você joga ✨' },
    ],
  },
  de: {
    idle: [
      { text: 'Ich sehe dich 👀' },
      { text: 'Impuls gefangen! ⚡' },
      { text: 'Diese Geste kitzelt ✨' },
      { text: 'Neuronen lieben Wiederholung 🔁' },
      { text: 'Ich bin da, falls du mich brauchst 💜' },
    ],
    morning: [
      { text: 'Guten Morgen! Frischer Kopf — nutze ihn ☀️' },
      { text: 'Eine Morgenrunde weckt besser als Kaffee 🌅' },
      { text: 'Wach? Deine Synapsen auch!' },
    ],
    day: [
      { text: 'Kurze Pause — perfekt für eine Runde 🎯' },
      { text: 'Mitten am Tag und du bist hier. Respekt!' },
    ],
    evening: [
      { text: 'Eine Abendrunde macht den Tag rund 🌙' },
      { text: 'Vor dem Schlaf merkt sich das Gehirn am besten 🧠' },
      { text: 'Sonnenuntergang — Zeit für ruhige Spiele 🌇' },
    ],
    night: [
      { text: 'Schlaflos? Sudoku beruhigt 🌌' },
      { text: 'Nachteule? Ich auch 🦉' },
    ],
    comeback: [
      { text: 'Du bist zurück! Ich habe dich vermisst 💜', follow: 'Erst mal leicht aufwärmen?' },
      { text: 'Lange nicht gesehen! Meine Synapsen sind eingerostet' },
      { text: 'Zurückkommen ist schon ein Sieg. Spielen wir?' },
    ],
    fresh: [
      { text: 'Starke Session! Das habe ich gespürt ⚡', follow: 'Noch eine?' },
      { text: '+1 Synapsenkraft 💪' },
      { text: 'Hab alles gesehen. Gut gespielt 👏' },
    ],
    stage1: [
      { text: 'Noch bin ich ein Funke, aber ich wachse mit jedem Spiel ✨' },
      { text: '10 Trainings und ich werde ein Impuls!' },
    ],
    stage2: [
      { text: 'Ich bin jetzt ein Impuls! Spürst du das Tempo? ⚡' },
      { text: 'Das Sternbild ist zum Greifen nah 🌟' },
    ],
    stage3: [
      { text: 'Wir haben das Sternbild erreicht! Dein Werk 🌌' },
      { text: 'Das Sternbild leuchtet, wenn du spielst ✨' },
    ],
  },
  fr: {
    idle: [
      { text: 'Je te vois 👀' },
      { text: 'Impulsion captée ! ⚡' },
      { text: 'Ce geste me chatouille ✨' },
      { text: 'Les neurones adorent la répétition 🔁' },
      { text: 'Je suis là si besoin 💜' },
    ],
    morning: [
      { text: 'Bonjour ! Cerveau frais — profites-en ☀️' },
      { text: 'Une partie le matin réveille mieux que le café 🌅' },
      { text: 'Réveillé ? Tes synapses aussi !' },
    ],
    day: [
      { text: 'Une petite pause — parfait pour une partie 🎯' },
      { text: 'En pleine journée et te voilà. Respect !' },
    ],
    evening: [
      { text: 'Une partie le soir et la journée compte 🌙' },
      { text: 'Avant de dormir, le cerveau retient mieux 🧠' },
      { text: 'Coucher de soleil — place aux jeux calmes 🌇' },
    ],
    night: [
      { text: 'Insomnie ? Le sudoku apaise 🌌' },
      { text: 'Oiseau de nuit ? Moi aussi 🦉' },
    ],
    comeback: [
      { text: 'Te revoilà ! Tu m’as manqué 💜', follow: 'On commence en douceur ?' },
      { text: 'Ça faisait longtemps ! Mes synapses ont rouillé' },
      { text: 'Revenir, c’est déjà gagner. On joue ?' },
    ],
    fresh: [
      { text: 'Belle session ! Je l’ai sentie ⚡', follow: 'Encore une ?' },
      { text: '+1 en puissance synaptique 💪' },
      { text: 'J’ai tout vu. Bien joué 👏' },
    ],
    stage1: [
      { text: 'Je ne suis qu’une Étincelle, mais je grandis à chaque partie ✨' },
      { text: '10 entraînements et je deviens une Impulsion !' },
    ],
    stage2: [
      { text: 'Je suis une Impulsion ! Tu sens la vitesse ? ⚡' },
      { text: 'La Constellation est à portée de main 🌟' },
    ],
    stage3: [
      { text: 'La Constellation est atteinte ! C’est grâce à toi 🌌' },
      { text: 'La Constellation brille quand tu joues ✨' },
    ],
  },
  it: {
    idle: [
      { text: 'Ti vedo 👀' },
      { text: 'Impulso catturato! ⚡' },
      { text: 'Quel gesto fa il solletico ✨' },
      { text: 'I neuroni amano la ripetizione 🔁' },
      { text: 'Sono qui se ti servo 💜' },
    ],
    morning: [
      { text: 'Buongiorno! Mente fresca — approfittane ☀️' },
      { text: 'Una partita al mattino sveglia più del caffè 🌅' },
      { text: 'Sveglio? Anche le tue sinapsi!' },
    ],
    day: [
      { text: 'Una breve pausa — perfetta per una partita 🎯' },
      { text: 'In pieno giorno e sei qui. Rispetto!' },
    ],
    evening: [
      { text: 'Una partita la sera e la giornata conta 🌙' },
      { text: 'Prima di dormire il cervello memorizza meglio 🧠' },
      { text: 'Tramonto — tempo di giochi tranquilli 🌇' },
    ],
    night: [
      { text: 'Niente sonno? Il sudoku rilassa 🌌' },
      { text: 'Gufo notturno? Anch’io 🦉' },
    ],
    comeback: [
      { text: 'Sei tornato! Mi sei mancato 💜', follow: 'Iniziamo con qualcosa di facile?' },
      { text: 'Quanto tempo! Le mie sinapsi si sono arrugginite' },
      { text: 'Tornare è già una vittoria. Giochiamo?' },
    ],
    fresh: [
      { text: 'Ottima sessione! L’ho sentita ⚡', follow: 'Un’altra?' },
      { text: '+1 alla forza sinaptica 💪' },
      { text: 'Ho visto tutto. Ben giocato 👏' },
    ],
    stage1: [
      { text: 'Sono una Scintilla, ma cresco a ogni partita ✨' },
      { text: '10 allenamenti e divento un Impulso!' },
    ],
    stage2: [
      { text: 'Sono un Impulso! Senti la velocità? ⚡' },
      { text: 'La Costellazione è a portata di mano 🌟' },
    ],
    stage3: [
      { text: 'Siamo arrivati alla Costellazione! Merito tuo 🌌' },
      { text: 'La Costellazione brilla quando giochi ✨' },
    ],
  },
  ja: {
    idle: [
      { text: '見えているよ 👀' },
      { text: 'インパルスをキャッチ！⚡' },
      { text: 'そのジェスチャー、くすぐったい ✨' },
      { text: 'ニューロンは繰り返しが大好き 🔁' },
      { text: 'ここにいるよ 💜' },
    ],
    morning: [
      { text: 'おはよう！頭が冴えてる今がチャンス ☀️' },
      { text: '朝の一プレイはコーヒーより効くよ 🌅' },
      { text: '起きた？シナプスも起きたよ！' },
    ],
    day: [
      { text: 'ちょっとした休憩に一プレイどう？ 🎯' },
      { text: '忙しい昼間に来てくれたんだ。えらい！' },
    ],
    evening: [
      { text: '夜の一プレイで今日も充実 🌙' },
      { text: '寝る前は脳が一番覚えやすいんだ 🧠' },
      { text: '夕暮れは落ち着いたゲームの時間 🌇' },
    ],
    night: [
      { text: '眠れない？数独は心を落ち着けるよ 🌌' },
      { text: '夜型さん？僕もだよ 🦉' },
    ],
    comeback: [
      { text: 'おかえり！寂しかったよ 💜', follow: 'まずは軽くウォームアップする？' },
      { text: '久しぶり！シナプスがなまっちゃった' },
      { text: '戻ってきただけで勝ちだよ。遊ぼう？' },
    ],
    fresh: [
      { text: 'いいセッションだった！伝わってきたよ ⚡', follow: 'もう一回どう？' },
      { text: 'シナプスパワー +1 💪' },
      { text: '見てたよ。ナイスプレイ 👏' },
    ],
    stage1: [
      { text: '今はスパークだけど、プレイのたびに成長するよ ✨' },
      { text: 'あと10回でインパルスになれる！' },
    ],
    stage2: [
      { text: 'インパルスになったよ！このスピード、感じる？ ⚡' },
      { text: 'コンステレーションまであと少し 🌟' },
    ],
    stage3: [
      { text: 'コンステレーションに到達！君のおかげだよ 🌌' },
      { text: '君が遊ぶと星座が輝くんだ ✨' },
    ],
  },
  ko: {
    idle: [
      { text: '보고 있어요 👀' },
      { text: '임펄스 포착! ⚡' },
      { text: '그 제스처는 간지러워요 ✨' },
      { text: '뉴런은 반복을 좋아해요 🔁' },
      { text: '필요하면 여기 있어요 💜' },
    ],
    morning: [
      { text: '좋은 아침! 맑은 머리로 시작해요 ☀️' },
      { text: '아침 한 판이 커피보다 잘 깨워줘요 🌅' },
      { text: '일어났어요? 시냅스도 깨어났어요!' },
    ],
    day: [
      { text: '짧은 휴식엔 한 판이 딱이에요 🎯' },
      { text: '바쁜 낮에도 와줬네요. 멋져요!' },
    ],
    evening: [
      { text: '저녁 한 판이면 오늘도 알찬 하루 🌙' },
      { text: '자기 전에 뇌가 가장 잘 기억해요 🧠' },
      { text: '노을 질 땐 차분한 게임이 좋아요 🌇' },
    ],
    night: [
      { text: '잠이 안 와요? 스도쿠가 마음을 가라앉혀요 🌌' },
      { text: '올빼미형이에요? 저도요 🦉' },
    ],
    comeback: [
      { text: '돌아왔군요! 보고 싶었어요 💜', follow: '가볍게 몸부터 풀까요?' },
      { text: '오랜만이에요! 시냅스가 굳었어요' },
      { text: '돌아온 것만으로도 승리예요. 한 판 할까요?' },
    ],
    fresh: [
      { text: '멋진 세션이었어요! 저도 느꼈어요 ⚡', follow: '한 판 더?' },
      { text: '시냅스 파워 +1 💪' },
      { text: '다 봤어요. 잘했어요 👏' },
    ],
    stage1: [
      { text: '아직 스파크지만 게임할 때마다 자라요 ✨' },
      { text: '10번 훈련하면 임펄스가 돼요!' },
    ],
    stage2: [
      { text: '이제 임펄스예요! 속도가 느껴져요? ⚡' },
      { text: '컨스텔레이션이 코앞이에요 🌟' },
    ],
    stage3: [
      { text: '컨스텔레이션에 도달했어요! 당신 덕분이에요 🌌' },
      { text: '당신이 플레이하면 별자리가 빛나요 ✨' },
    ],
  },
  zh: {
    idle: [
      { text: '我看到你了 👀' },
      { text: '捕捉到脉冲！⚡' },
      { text: '这个手势好痒 ✨' },
      { text: '神经元最爱重复练习 🔁' },
      { text: '需要我就在这里 💜' },
    ],
    morning: [
      { text: '早上好！大脑最清醒的时刻别浪费 ☀️' },
      { text: '晨练一局，比咖啡更提神 🌅' },
      { text: '醒了？你的突触也醒了！' },
    ],
    day: [
      { text: '小憩片刻——正好来一局 🎯' },
      { text: '大忙天还来锻炼，佩服！' },
    ],
    evening: [
      { text: '晚上来一局，这一天就没白过 🌙' },
      { text: '睡前大脑记得最牢 🧠' },
      { text: '日落时分，适合安静的游戏 🌇' },
    ],
    night: [
      { text: '睡不着？数独能静心 🌌' },
      { text: '夜猫子？我也是 🦉' },
    ],
    comeback: [
      { text: '你回来了！我好想你 💜', follow: '先来个简单的热热身？' },
      { text: '好久不见！我的突触都生锈了' },
      { text: '回来就是胜利。来一局？' },
    ],
    fresh: [
      { text: '打得漂亮！我感受到了 ⚡', follow: '再来一局？' },
      { text: '突触力量 +1 💪' },
      { text: '我都看到了，打得好 👏' },
    ],
    stage1: [
      { text: '我还是小火花，但每局都在成长 ✨' },
      { text: '再练10次，我就能变成脉冲！' },
    ],
    stage2: [
      { text: '我已经是脉冲了！感觉到速度了吗？⚡' },
      { text: '星座近在咫尺 🌟' },
    ],
    stage3: [
      { text: '我们到达星座了！是你造就了我 🌌' },
      { text: '你玩的时候，星座会发光 ✨' },
    ],
  },
  hi: {
    idle: [
      { text: 'मैं आपको देख रहा हूँ 👀' },
      { text: 'आवेग पकड़ लिया! ⚡' },
      { text: 'यह इशारा गुदगुदाता है ✨' },
      { text: 'न्यूरॉन्स को दोहराव पसंद है 🔁' },
      { text: 'ज़रूरत हो तो मैं यहीं हूँ 💜' },
    ],
    morning: [
      { text: 'सुप्रभात! ताज़ा दिमाग — मौका न गँवाएँ ☀️' },
      { text: 'सुबह का एक राउंड कॉफ़ी से बेहतर जगाता है 🌅' },
      { text: 'जाग गए? आपके सिनैप्स भी!' },
    ],
    day: [
      { text: 'छोटा ब्रेक — एक राउंड के लिए बढ़िया समय 🎯' },
      { text: 'दिन के बीच भी आप यहाँ हैं। सलाम!' },
    ],
    evening: [
      { text: 'शाम का एक राउंड और दिन सफल 🌙' },
      { text: 'सोने से पहले दिमाग सबसे अच्छा याद रखता है 🧠' },
      { text: 'सूर्यास्त — शांत खेलों का समय 🌇' },
    ],
    night: [
      { text: 'नींद नहीं आ रही? सुडोकु मन शांत करता है 🌌' },
      { text: 'रात के पंछी? मैं भी 🦉' },
    ],
    comeback: [
      { text: 'आप लौट आए! मुझे आपकी याद आई 💜', follow: 'कुछ आसान से शुरू करें?' },
      { text: 'बहुत दिन हो गए! मेरे सिनैप्स जम गए' },
      { text: 'लौटना ही जीत है। खेलें?' },
    ],
    fresh: [
      { text: 'शानदार सेशन! मैंने महसूस किया ⚡', follow: 'एक और?' },
      { text: 'सिनैप्स शक्ति +1 💪' },
      { text: 'मैंने सब देखा। खूब खेले 👏' },
    ],
    stage1: [
      { text: 'अभी मैं चिंगारी हूँ, पर हर खेल से बढ़ता हूँ ✨' },
      { text: '10 अभ्यास और मैं आवेग बन जाऊँगा!' },
    ],
    stage2: [
      { text: 'अब मैं आवेग हूँ! रफ़्तार महसूस हुई? ⚡' },
      { text: 'नक्षत्र बस हाथ भर दूर है 🌟' },
    ],
    stage3: [
      { text: 'हम नक्षत्र तक पहुँच गए! यह आपकी मेहनत है 🌌' },
      { text: 'आप खेलते हैं तो नक्षत्र चमकता है ✨' },
    ],
  },
  ar: {
    idle: [
      { text: 'أنا أراك 👀' },
      { text: 'التقطتُ النبضة! ⚡' },
      { text: 'هذه الإيماءة تدغدغني ✨' },
      { text: 'العصبونات تحب التكرار 🔁' },
      { text: 'أنا هنا إن احتجتني 💜' },
    ],
    morning: [
      { text: 'صباح الخير! ذهنك صافٍ — اغتنمه ☀️' },
      { text: 'جولة صباحية تنعش أكثر من القهوة 🌅' },
      { text: 'استيقظت؟ ومشابكك العصبية أيضًا!' },
    ],
    day: [
      { text: 'استراحة قصيرة — وقت مثالي لجولة 🎯' },
      { text: 'في عز النهار وأنت هنا. احترام!' },
    ],
    evening: [
      { text: 'جولة مسائية فيكتمل اليوم 🌙' },
      { text: 'قبل النوم يحفظ الدماغ أفضل 🧠' },
      { text: 'الغروب — وقت الألعاب الهادئة 🌇' },
    ],
    night: [
      { text: 'أرِق؟ السودوكو يهدّئ 🌌' },
      { text: 'من طيور الليل؟ وأنا كذلك 🦉' },
    ],
    comeback: [
      { text: 'عدتَ! اشتقت إليك 💜', follow: 'نبدأ بشيء خفيف؟' },
      { text: 'مرّ وقت طويل! تيبّست مشابكي' },
      { text: 'العودة بحد ذاتها انتصار. نلعب؟' },
    ],
    fresh: [
      { text: 'جلسة رائعة! شعرتُ بها ⚡', follow: 'جولة أخرى؟' },
      { text: '+1 لقوة المشابك 💪' },
      { text: 'رأيت كل شيء. أحسنت اللعب 👏' },
    ],
    stage1: [
      { text: 'ما زلتُ شرارة، لكنني أنمو مع كل لعبة ✨' },
      { text: '10 تدريبات وأصبح نبضة!' },
    ],
    stage2: [
      { text: 'صرتُ نبضة! أتشعر بالسرعة؟ ⚡' },
      { text: 'الكوكبة صارت قريبة 🌟' },
    ],
    stage3: [
      { text: 'وصلنا إلى الكوكبة! أنت من صنعني 🌌' },
      { text: 'الكوكبة تتلألأ حين تلعب ✨' },
    ],
  },
};

export interface PetLineCtx {
  /** Текущий час 0..23 (для времени суток). */
  hour: number;
  stage: PetStage;
  /** Минут с последней сессии; null — сессий ещё не было. */
  minutesSinceLastSession: number | null;
}

const FRESH_WINDOW_MIN = 12;          // «только что сыграл» — до 12 минут
const COMEBACK_HOURS = 48;            // «вернулся» — от 48 часов тишины
const PRIORITY_CHANCE = 0.7;          // шанс взять именно контекстную реплику

let lastShownText = '';               // не повторять одну фразу дважды подряд

function timeCtx(hour: number): Ctx {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 23) return 'evening';
  return 'night';
}

function pickFrom(pool: PetLine[]): PetLine {
  const filtered = pool.length > 1 ? pool.filter((l) => l.text !== lastShownText) : pool;
  const line = filtered[Math.floor(Math.random() * filtered.length)];
  lastShownText = line.text;
  return line;
}

/** Контекстная реплика: приоритет — «только что сыграл» / «вернулся после
 *  перерыва», дальше общий пул (болталка + время суток + стадия). */
export function pickPetLine(language: string, ctx: PetLineCtx): PetLine {
  const pack = L[language] || L.en;
  const m = ctx.minutesSinceLastSession;

  const priority: PetLine[] = [];
  if (m != null && m <= FRESH_WINDOW_MIN) priority.push(...pack.fresh);
  else if (m != null && m >= COMEBACK_HOURS * 60) priority.push(...pack.comeback);
  if (priority.length && Math.random() < PRIORITY_CHANCE) return pickFrom(priority);

  const pool = [
    ...pack.idle,
    ...pack[timeCtx(ctx.hour)],
    ...pack[`stage${ctx.stage}` as Ctx],
  ];
  return pickFrom(pool);
}

/** Простая случайная реплика без контекста (экран /pet, обратная
 *  совместимость со старым pickReaction). */
export function pickSimpleLine(language: string): string {
  const pack = L[language] || L.en;
  return pickFrom([...pack.idle, ...pack[`stage1` as Ctx]]).text;
}
