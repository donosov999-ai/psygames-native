/* psygames-stop-signal-i18n · VER 1 · 23.08.2026 */
/**
 * СЛОВАРЬ ЗАМЕРА ТОРМОЖЕНИЯ — СРАЗУ НА ВСЕ ДВЕНАДЦАТЬ ЯЗЫКОВ.
 *
 * ⚠️ ПОЧЕМУ НЕ В ОБЩИЙ СЛОВАРЬ ПРИЛОЖЕНИЯ. `src/contexts/LanguageContext.tsx` и
 * `src/contexts/translations/*` правят параллельно другие заходы, и новый ключ
 * там — гарантированный конфликт в файле, который держит все игры. Подписи
 * лестницы и SSRT нужны ровно одному экрану, поэтому живут рядом с ним — тем же
 * приёмом, что `n-back/core/i18n.ts` и `schulte/core/i18n.ts`.
 *
 * ⚠️ ДВЕНАДЦАТЬ, А НЕ ДВА. Словарь на `ru`/`en` выдаёт японцу, корейцу и немцу
 * английский текст посреди переведённого экрана — дыра, ради которой заведён
 * гейт `games-module-i18n`. Полнота, отличие от английского и своя письменность
 * у своей локали сверяются им же.
 *
 * ⚠️ ПОРТУГАЛЬСКИЙ — БРАЗИЛЬСКИЙ, как и весь остальной словарь приложения.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕЛЬЗЯ ОБЕЩАТЬ. Ни одна подпись не называет SSRT «оценкой
 * мозга», «силой воли» или «импульсивностью» и не сулит их роста. SSRT — это
 * время отмены уже начатого движения В ЭТИХ пробах, и ничего сверх того по нему
 * сказать нельзя. Отдельная подпись (`ssrtUnsure` и семейство `doubt*`)
 * существует ровно затем, чтобы вместо правдоподобного числа человек получал
 * причину, по которой числа нет.
 */

/** Список ровно как `type Language` приложения (LanguageContext). */
export type StopSignalLocale =
  | 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi'
  | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** Порядок неважен, важна полнота: по нему сверяется словарь в пробе. */
export const STOP_SIGNAL_LOCALES: readonly StopSignalLocale[] = [
  'ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar',
];

export interface StopSignalStrings {
  /** Заголовок карточки лестницы на экране настройки. */
  ladderTitle: string;
  /** Как работает лестница и почему её не ставят руками. */
  ladderHint: string;
  /** Подпись текущей ступени задержки. */
  ssdLabel: string;
  /** Подпись главного числа игры. */
  ssrtLabel: string;
  /** Что такое SSRT и в какую сторону он лучше. */
  ssrtHint: string;
  /** Как именно считается — метод назван прямо. */
  methodNote: string;
  /** Подпись доли удавшихся торможений. */
  inhibitionLabel: string;
  /** Подпись среднего времени реакции GO. */
  goRtLabel: string;
  /** По скольким пробам идёт замер. Подставляются {n} и {stop}. */
  poolLabel: string;
  /** Заголовок отказа выдать число. */
  ssrtUnsure: string;
  /** Причины отказа — по одной на каждое условие применимости. */
  doubtNoData: string;
  doubtFewStops: string;
  doubtOffTarget: string;
  doubtRaceViolated: string;
  doubtOmissions: string;
  /** Параметры уровня. Подставляются {n}, {p}, {w}, {f}. */
  lvlParams: string;
  /** Почему число задержки не висит на экране во время партии. */
  ssdHidden: string;
  /** Лестница сошлась — числу можно верить. */
  ladderStable: string;
  /** Смысл пробы одной фразой: гонка руки и торможения. */
  raceHint: string;
}

const STRINGS: Record<StopSignalLocale, StopSignalStrings> = {
  ru: {
    ladderTitle: 'Лестница задержки',
    ladderHint: 'Задержка подстраивается сама: удержался — стоп-сигнал придёт позже, сорвался — раньше. Руками её не ставят, иначе мерить будет нечего.',
    ssdLabel: 'Задержка стоп-сигнала',
    ssrtLabel: 'Время торможения (SSRT)',
    ssrtHint: 'Сколько миллисекунд уходит на отмену уже начатого движения. Меньше — тормозите быстрее. Это про накопленные пробы и ни про что сверх них.',
    methodNote: 'Метод интеграции: n-я по скорости реакция GO минус средняя задержка, где n = число ответов × доля сорванных торможений.',
    inhibitionLabel: 'Удавшихся торможений',
    goRtLabel: 'Среднее время реакции GO',
    poolLabel: 'Замер по {n} пробам, стоп-проб из них {stop}',
    ssrtUnsure: 'Числа здесь не будет: оно было бы выдумкой',
    doubtNoData: 'стоп-проб ещё не было',
    doubtFewStops: 'стоп-проб пока {have}, для замера нужно {need}',
    doubtOffTarget: 'лестница не сошлась: торможений {pct}% вместо 25–75%',
    doubtRaceViolated: 'на сорванных стоп-пробах реакция медленнее обычной — модель гонки нарушена',
    doubtOmissions: 'пропущено GO {pct}% — оценка уехала бы вниз',
    lvlParams: '{n} проб · стоп-проб {p}% · окно {w} с · пауза до GO {f} с',
    ssdHidden: 'Задержку во время партии не показываем: увидев число, тормозить начинают по нему, а не по сигналу.',
    ladderStable: 'Лестница сошлась: держится около половины удавшихся торможений',
    raceHint: 'Смысл пробы: рука и торможение бегут наперегонки. Кто успел первым, тот и решил исход.',
  },
  en: {
    ladderTitle: 'Stop-delay staircase',
    ladderHint: 'The delay tunes itself: hold back and the stop signal comes later, slip and it comes sooner. It is never set by hand — that would leave nothing to measure.',
    ssdLabel: 'Stop-signal delay',
    ssrtLabel: 'Stopping time (SSRT)',
    ssrtHint: 'How many milliseconds it takes to cancel a movement already under way. Lower means you stop faster. It describes these trials and nothing beyond them.',
    methodNote: 'Integration method: the nth fastest GO response minus the mean delay, where n = responses × share of failed stops.',
    inhibitionLabel: 'Successful stops',
    goRtLabel: 'Mean GO reaction time',
    poolLabel: 'Measured over {n} trials, {stop} of them stop trials',
    ssrtUnsure: 'No number here: it would be made up',
    doubtNoData: 'no stop trials yet',
    doubtFewStops: 'only {have} stop trials so far, {need} are needed',
    doubtOffTarget: 'the staircase has not settled: {pct}% stopped instead of 25–75%',
    doubtRaceViolated: 'responses on failed stops are slower than ordinary ones — the race model is broken',
    doubtOmissions: '{pct}% of GO trials missed — the estimate would drift downwards',
    lvlParams: '{n} trials · {p}% stop trials · {w} s window · {f} s pause before GO',
    ssdHidden: 'The delay is hidden during play: once you can see the number, you brake by the number instead of by the signal.',
    ladderStable: 'The staircase has settled: it holds near half the stops succeeding',
    raceHint: 'The point of a trial: your hand and your braking race each other. Whichever arrives first decides the outcome.',
  },
  es: {
    ladderTitle: 'Escalera del retardo',
    ladderHint: 'El retardo se ajusta solo: si te frenas, la señal de stop llega más tarde; si fallas, llega antes. Nunca se fija a mano: entonces no quedaría nada que medir.',
    ssdLabel: 'Retardo de la señal de stop',
    ssrtLabel: 'Tiempo de frenado (SSRT)',
    ssrtHint: 'Cuántos milisegundos cuesta cancelar un movimiento ya iniciado. Menos es frenar más rápido. Describe estos ensayos y nada más.',
    methodNote: 'Método de integración: la enésima respuesta GO más rápida menos el retardo medio, con n = respuestas × proporción de frenados fallidos.',
    inhibitionLabel: 'Frenados logrados',
    goRtLabel: 'Tiempo medio de reacción GO',
    poolLabel: 'Medido sobre {n} ensayos, {stop} de ellos con stop',
    ssrtUnsure: 'Aquí no hay número: sería inventado',
    doubtNoData: 'todavía no hubo ensayos de stop',
    doubtFewStops: 'de momento hay {have} ensayos de stop, hacen falta {need}',
    doubtOffTarget: 'la escalera aún no se estabilizó: {pct}% frenados en vez de 25–75%',
    doubtRaceViolated: 'en los frenados fallidos la reacción es más lenta que la habitual: el modelo de carrera se rompe',
    doubtOmissions: 'se perdió el {pct}% de los GO: la estimación se iría hacia abajo',
    lvlParams: '{n} ensayos · {p}% de stop · ventana {w} s · pausa antes de GO {f} s',
    ssdHidden: 'El retardo se oculta durante la partida: al ver el número, uno frena por el número y no por la señal.',
    ladderStable: 'La escalera se estabilizó: se mantiene cerca de la mitad de frenados logrados',
    raceHint: 'El sentido del ensayo: tu mano y tu freno compiten. Quien llega primero decide el resultado.',
  },
  de: {
    ladderTitle: 'Treppe der Verzögerung',
    ladderHint: 'Die Verzögerung stellt sich selbst ein: Hältst du an, kommt das Stoppsignal später; rutschst du durch, kommt es früher. Von Hand wird sie nie gesetzt — dann bliebe nichts zu messen.',
    ssdLabel: 'Verzögerung des Stoppsignals',
    ssrtLabel: 'Bremszeit (SSRT)',
    ssrtHint: 'Wie viele Millisekunden das Abbrechen einer bereits begonnenen Bewegung kostet. Weniger heißt schneller bremsen. Es gilt für diese Durchgänge und für nichts darüber hinaus.',
    methodNote: 'Integrationsmethode: die n-schnellste GO-Reaktion minus mittlere Verzögerung, mit n = Antworten × Anteil misslungener Stopps.',
    inhibitionLabel: 'Gelungene Stopps',
    goRtLabel: 'Mittlere GO-Reaktionszeit',
    poolLabel: 'Gemessen über {n} Durchgänge, davon {stop} Stopp-Durchgänge',
    ssrtUnsure: 'Hier steht keine Zahl: sie wäre erfunden',
    doubtNoData: 'noch keine Stopp-Durchgänge',
    doubtFewStops: 'bisher {have} Stopp-Durchgänge, nötig sind {need}',
    doubtOffTarget: 'die Treppe hat sich noch nicht eingependelt: {pct}% gestoppt statt 25–75%',
    doubtRaceViolated: 'bei misslungenen Stopps ist die Reaktion langsamer als sonst — das Wettlaufmodell ist verletzt',
    doubtOmissions: '{pct}% der GO-Durchgänge verpasst — die Schätzung würde nach unten wandern',
    lvlParams: '{n} Durchgänge · {p}% Stopp · Fenster {w} s · Pause vor GO {f} s',
    ssdHidden: 'Während der Partie bleibt die Verzögerung verborgen: Wer die Zahl sieht, bremst nach der Zahl statt nach dem Signal.',
    ladderStable: 'Die Treppe steht: sie hält sich nahe der Hälfte gelungener Stopps',
    raceHint: 'Der Sinn eines Durchgangs: deine Hand und deine Bremse laufen um die Wette. Wer zuerst ankommt, entscheidet.',
  },
  zh: {
    ladderTitle: '延迟阶梯',
    ladderHint: '延迟会自己调整：忍住了，停止信号下次来得更晚；没忍住，就来得更早。它从不手动设定——那样就没有可测的东西了。',
    ssdLabel: '停止信号延迟',
    ssrtLabel: '刹车耗时（SSRT）',
    ssrtHint: '取消一个已经开始的动作要花多少毫秒。数值越小，刹得越快。它只说明这些试次，不说明别的。',
    methodNote: '积分法：第 n 快的 GO 反应减去平均延迟，其中 n = 反应次数 × 停止失败的比例。',
    inhibitionLabel: '成功停住的次数',
    goRtLabel: 'GO 的平均反应时',
    poolLabel: '基于 {n} 个试次测算，其中停止试次 {stop} 个',
    ssrtUnsure: '这里不给数字：给了就是编的',
    doubtNoData: '还没有出现停止试次',
    doubtFewStops: '目前只有 {have} 个停止试次，测算需要 {need} 个',
    doubtOffTarget: '阶梯还没稳定：停住 {pct}%，而不是 25–75%',
    doubtRaceViolated: '停止失败时的反应比平时更慢——赛跑模型被破坏了',
    doubtOmissions: '有 {pct}% 的 GO 被漏掉——估计值会往下偏',
    lvlParams: '{n} 试次 · 停止试次 {p}% · 窗口 {w} 秒 · GO 前停顿 {f} 秒',
    ssdHidden: '游戏中不显示延迟：一旦看见这个数字，人就会照数字刹车，而不是照信号刹车。',
    ladderStable: '阶梯已稳定：成功停住的比例保持在一半左右',
    raceHint: '试次的意思：你的手和你的刹车在赛跑。谁先到，谁决定结果。',
  },
  hi: {
    ladderTitle: 'देरी की सीढ़ी',
    ladderHint: 'देरी खुद को समायोजित करती है: रुक गए तो अगला स्टॉप संकेत और देर से आएगा, दब गए तो और जल्दी। इसे हाथ से तय नहीं किया जाता — तब मापने को कुछ बचता ही नहीं।',
    ssdLabel: 'स्टॉप संकेत की देरी',
    ssrtLabel: 'रोकने का समय (SSRT)',
    ssrtHint: 'पहले से शुरू हो चुकी गति को रद्द करने में कितने मिलीसेकंड लगते हैं। कम यानी तेज़ी से रुकना। यह इन्हीं प्रयासों की बात है, इससे आगे कुछ नहीं।',
    methodNote: 'समाकलन विधि: n-वीं सबसे तेज़ GO प्रतिक्रिया में से औसत देरी घटाइए, जहाँ n = प्रतिक्रियाएँ × असफल रोक का अनुपात।',
    inhibitionLabel: 'सफल रोक',
    goRtLabel: 'GO पर औसत प्रतिक्रिया समय',
    poolLabel: '{n} प्रयासों पर माप, उनमें स्टॉप प्रयास {stop}',
    ssrtUnsure: 'यहाँ कोई संख्या नहीं: वह गढ़ी हुई होती',
    doubtNoData: 'अभी तक कोई स्टॉप प्रयास नहीं',
    doubtFewStops: 'अभी {have} स्टॉप प्रयास हैं, माप के लिए {need} चाहिए',
    doubtOffTarget: 'सीढ़ी अभी थमी नहीं: रोक {pct}% जबकि चाहिए 25–75%',
    doubtRaceViolated: 'असफल रोक पर प्रतिक्रिया सामान्य से धीमी है — दौड़ मॉडल टूट गया',
    doubtOmissions: 'GO के {pct}% छूट गए — अनुमान नीचे खिसक जाता',
    lvlParams: '{n} प्रयास · स्टॉप {p}% · खिड़की {w} से · GO से पहले ठहराव {f} से',
    ssdHidden: 'खेल के दौरान देरी नहीं दिखाई जाती: संख्या दिख जाए तो लोग संकेत के बजाय संख्या के हिसाब से रुकने लगते हैं।',
    ladderStable: 'सीढ़ी थम गई: सफल रोक आधे के आसपास बनी हुई है',
    raceHint: 'प्रयास का अर्थ: आपका हाथ और आपकी रोक आपस में दौड़ते हैं। जो पहले पहुँचे, वही नतीजा तय करता है।',
  },
  pt: {
    ladderTitle: 'Escada do atraso',
    ladderHint: 'O atraso se ajusta sozinho: se você segura, o sinal de parada vem mais tarde; se falha, vem mais cedo. Nunca é ajustado à mão — aí não sobraria nada para medir.',
    ssdLabel: 'Atraso do sinal de parada',
    ssrtLabel: 'Tempo de frenagem (SSRT)',
    ssrtHint: 'Quantos milissegundos custa cancelar um movimento já iniciado. Menos significa frear mais rápido. Vale para estas tentativas e nada além delas.',
    methodNote: 'Método de integração: a enésima resposta GO mais rápida menos o atraso médio, com n = respostas × parcela de frenagens falhas.',
    inhibitionLabel: 'Frenagens bem-sucedidas',
    goRtLabel: 'Tempo médio de reação no GO',
    poolLabel: 'Medido em {n} tentativas, {stop} delas de parada',
    ssrtUnsure: 'Aqui não vai número: ele seria inventado',
    doubtNoData: 'ainda não houve tentativas de parada',
    doubtFewStops: 'por enquanto há {have} tentativas de parada, são necessárias {need}',
    doubtOffTarget: 'a escada ainda não estabilizou: {pct}% de frenagens em vez de 25–75%',
    doubtRaceViolated: 'nas frenagens falhas a reação é mais lenta que a comum — o modelo de corrida quebrou',
    doubtOmissions: '{pct}% dos GO foram perdidos — a estimativa cairia para baixo',
    lvlParams: '{n} tentativas · {p}% de parada · janela {w} s · pausa antes do GO {f} s',
    ssdHidden: 'O atraso fica escondido durante a partida: ao ver o número, a pessoa freia pelo número e não pelo sinal.',
    ladderStable: 'A escada estabilizou: mantém-se perto de metade das frenagens bem-sucedidas',
    raceHint: 'O sentido da tentativa: a sua mão e a sua frenagem disputam uma corrida. Quem chega primeiro decide o resultado.',
  },
  fr: {
    ladderTitle: 'Escalier du délai',
    ladderHint: 'Le délai se règle tout seul : si tu retiens ton geste, le signal stop arrive plus tard ; si tu craques, il arrive plus tôt. On ne le fixe jamais à la main — il ne resterait rien à mesurer.',
    ssdLabel: 'Délai du signal stop',
    ssrtLabel: 'Temps de freinage (SSRT)',
    ssrtHint: 'Combien de millisecondes coûte l’annulation d’un mouvement déjà lancé. Moins, c’est freiner plus vite. Cela décrit ces essais et rien au-delà.',
    methodNote: 'Méthode d’intégration : la n-ième réponse GO la plus rapide moins le délai moyen, avec n = réponses × part des arrêts ratés.',
    inhibitionLabel: 'Arrêts réussis',
    goRtLabel: 'Temps de réaction moyen au GO',
    poolLabel: 'Mesuré sur {n} essais, dont {stop} essais stop',
    ssrtUnsure: 'Pas de chiffre ici : il serait inventé',
    doubtNoData: 'aucun essai stop pour l’instant',
    doubtFewStops: 'pour l’instant {have} essais stop, il en faut {need}',
    doubtOffTarget: 'l’escalier n’est pas stabilisé : {pct}% d’arrêts au lieu de 25–75%',
    doubtRaceViolated: 'sur les arrêts ratés la réaction est plus lente que d’habitude — le modèle de course est violé',
    doubtOmissions: '{pct}% des GO manqués — l’estimation glisserait vers le bas',
    lvlParams: '{n} essais · {p}% de stop · fenêtre {w} s · pause avant GO {f} s',
    ssdHidden: 'Le délai reste caché pendant la partie : dès qu’on voit le chiffre, on freine d’après le chiffre et non d’après le signal.',
    ladderStable: 'L’escalier est stabilisé : il tient près de la moitié d’arrêts réussis',
    raceHint: 'Le sens d’un essai : ta main et ton freinage font la course. Le premier arrivé décide.',
  },
  it: {
    ladderTitle: 'Scala del ritardo',
    ladderHint: 'Il ritardo si regola da solo: se trattieni la mano il segnale di stop arriva più tardi, se cedi arriva prima. Non si imposta a mano — non resterebbe nulla da misurare.',
    ssdLabel: 'Ritardo del segnale di stop',
    ssrtLabel: 'Tempo di frenata (SSRT)',
    ssrtHint: 'Quanti millisecondi costa annullare un movimento già avviato. Meno vuol dire frenare più in fretta. Riguarda queste prove e nulla oltre.',
    methodNote: 'Metodo di integrazione: l’n-esima risposta GO più rapida meno il ritardo medio, con n = risposte × quota di frenate fallite.',
    inhibitionLabel: 'Frenate riuscite',
    goRtLabel: 'Tempo di reazione medio al GO',
    poolLabel: 'Misurato su {n} prove, di cui {stop} prove stop',
    ssrtUnsure: 'Qui non c’è nessun numero: sarebbe inventato',
    doubtNoData: 'ancora nessuna prova stop',
    doubtFewStops: 'per ora {have} prove stop, ne servono {need}',
    doubtOffTarget: 'la scala non si è ancora assestata: {pct}% di frenate invece di 25–75%',
    doubtRaceViolated: 'nelle frenate fallite la reazione è più lenta del solito — il modello della corsa è violato',
    doubtOmissions: '{pct}% dei GO persi — la stima scivolerebbe verso il basso',
    lvlParams: '{n} prove · {p}% di stop · finestra {w} s · pausa prima del GO {f} s',
    ssdHidden: 'Durante la partita il ritardo resta nascosto: appena si vede il numero, si frena in base al numero e non al segnale.',
    ladderStable: 'La scala si è assestata: resta vicino a metà frenate riuscite',
    raceHint: 'Il senso della prova: la tua mano e la tua frenata fanno a gara. Chi arriva prima decide.',
  },
  ja: {
    ladderTitle: '遅延の階段',
    ladderHint: '遅延は自動で調整されます。止められたら停止信号は次はもっと遅く、押してしまったらもっと早く出ます。手で設定することはありません——それでは測るものがなくなります。',
    ssdLabel: '停止信号の遅延',
    ssrtLabel: '抑制にかかる時間（SSRT）',
    ssrtHint: 'すでに始めた動きを取り消すのに何ミリ秒かかるか。小さいほど速く止められます。これらの試行についてだけの数字です。',
    methodNote: '積分法：n 番目に速い GO 反応から平均遅延を引きます。n = 反応数 × 抑制に失敗した割合。',
    inhibitionLabel: '止められた回数',
    goRtLabel: 'GO の平均反応時間',
    poolLabel: '{n} 試行で測定、うち停止試行は {stop}',
    ssrtUnsure: 'ここに数字は出しません。出せば作り話になります',
    doubtNoData: '停止試行がまだありません',
    doubtFewStops: '停止試行は今 {have}、測定には {need} 必要です',
    doubtOffTarget: '階段がまだ落ち着いていません：抑制 {pct}%（25〜75% であるべき）',
    doubtRaceViolated: '抑制に失敗した試行の反応が普段より遅い——競合モデルが崩れています',
    doubtOmissions: 'GO の {pct}% を逃しました——推定値が下にずれます',
    lvlParams: '{n} 試行 · 停止試行 {p}% · 回答窓 {w} 秒 · GO 前の間 {f} 秒',
    ssdHidden: '対戦中は遅延を表示しません。数字が見えると、人は信号ではなく数字を見て止めようとするからです。',
    ladderStable: '階段は落ち着きました：止められた割合が半分あたりを保っています',
    raceHint: '試行の意味：手と抑制が競走します。先に着いたほうが結果を決めます。',
  },
  ko: {
    ladderTitle: '지연 계단',
    ladderHint: '지연은 스스로 맞춰집니다. 참아내면 정지 신호가 다음에 더 늦게, 눌러버리면 더 일찍 나옵니다. 손으로 정하지 않습니다 — 그러면 잴 것이 없어집니다.',
    ssdLabel: '정지 신호 지연',
    ssrtLabel: '멈추는 데 걸리는 시간 (SSRT)',
    ssrtHint: '이미 시작한 동작을 취소하는 데 몇 밀리초가 드는지. 작을수록 더 빨리 멈춥니다. 이 시행들에 대한 이야기일 뿐입니다.',
    methodNote: '적분법: n 번째로 빠른 GO 반응에서 평균 지연을 뺍니다. n = 반응 수 × 정지 실패 비율.',
    inhibitionLabel: '성공한 정지',
    goRtLabel: 'GO 평균 반응 시간',
    poolLabel: '{n}회 시행으로 측정, 그중 정지 시행 {stop}회',
    ssrtUnsure: '여기에 숫자는 없습니다: 있으면 지어낸 것입니다',
    doubtNoData: '아직 정지 시행이 없습니다',
    doubtFewStops: '지금 정지 시행 {have}회, 측정에는 {need}회가 필요합니다',
    doubtOffTarget: '계단이 아직 안정되지 않았습니다: 정지 {pct}% (25~75%여야 합니다)',
    doubtRaceViolated: '정지에 실패한 시행의 반응이 평소보다 느립니다 — 경주 모형이 깨졌습니다',
    doubtOmissions: 'GO의 {pct}%를 놓쳤습니다 — 추정값이 아래로 밀립니다',
    lvlParams: '{n}회 시행 · 정지 시행 {p}% · 응답 창 {w}초 · GO 전 멈춤 {f}초',
    ssdHidden: '플레이 중에는 지연을 보여주지 않습니다. 숫자가 보이면 신호가 아니라 숫자를 보고 멈추게 되기 때문입니다.',
    ladderStable: '계단이 안정되었습니다: 성공한 정지가 절반 근처를 유지합니다',
    raceHint: '시행의 뜻: 손과 제동이 달리기 경주를 합니다. 먼저 닿는 쪽이 결과를 정합니다.',
  },
  ar: {
    ladderTitle: 'سُلّم التأخير',
    ladderHint: 'التأخير يضبط نفسه: إن نجحت في الكبح جاءت إشارة التوقف لاحقًا، وإن ضغطت جاءت أبكر. لا يُضبط باليد — عندئذٍ لا يبقى شيء نقيسه.',
    ssdLabel: 'تأخير إشارة التوقف',
    ssrtLabel: 'زمن الكبح (SSRT)',
    ssrtHint: 'كم مللي ثانية يكلّف إلغاء حركة بدأت فعلًا. الأقل يعني كبحًا أسرع. هذا وصف لهذه المحاولات فقط ولا شيء وراءها.',
    methodNote: 'طريقة التكامل: الاستجابة رقم n الأسرع في GO ناقص متوسط التأخير، حيث n = عدد الاستجابات × نسبة الكبح الفاشل.',
    inhibitionLabel: 'حالات الكبح الناجحة',
    goRtLabel: 'متوسط زمن الاستجابة في GO',
    poolLabel: 'قياس على {n} محاولة، منها {stop} محاولة توقف',
    ssrtUnsure: 'لا رقم هنا: سيكون مُختلقًا',
    doubtNoData: 'لا توجد محاولات توقف بعد',
    doubtFewStops: 'لدينا الآن {have} محاولة توقف، والقياس يحتاج {need}',
    doubtOffTarget: 'السُلّم لم يستقر بعد: الكبح {pct}% بدل 25–75%',
    doubtRaceViolated: 'في حالات الكبح الفاشل تكون الاستجابة أبطأ من المعتاد — نموذج السباق منتهَك',
    doubtOmissions: 'فات {pct}% من محاولات GO — سينزلق التقدير إلى الأسفل',
    lvlParams: '{n} محاولة · توقف {p}% · نافذة {w} ث · توقف قبل GO {f} ث',
    ssdHidden: 'يبقى التأخير مخفيًا أثناء اللعب: بمجرد أن ترى الرقم تبدأ بالكبح وفق الرقم لا وفق الإشارة.',
    ladderStable: 'استقرّ السُلّم: يبقى قرب نصف حالات الكبح الناجحة',
    raceHint: 'معنى المحاولة: يدك وكبحك يتسابقان. من يصل أولًا يحسم النتيجة.',
  },
};

/** Незнакомый язык отдаёт английский, а не пустоту. */
export function getStopSignalStrings(locale: StopSignalLocale): StopSignalStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}
