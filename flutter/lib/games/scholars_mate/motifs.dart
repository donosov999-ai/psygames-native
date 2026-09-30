/// ИМЕНА УЗОРОВ «ДЕТСКОГО МАТА» — КЛЮЧИ ВЕБ-СЛОВАРЯ.
///
/// Перенос `MOTIF_KEY` из `frontend/src/games/scholars-mate/core/deck.ts`. В вебе
/// карта лежит в ядре потому, что пул без имени однажды доехал до экрана сырым
/// ключом (`scholarsMotif_smotheredMate`) — гейт проходит по карте и по пулам
/// разом. У удушающего мата один ключ на лестницу и на список отработки: текст
/// один, второй ключ был бы дублем.
library;

const Map<String, String> motifKey = {
  // Узоры лестницы.
  'scholar': 'scholarsMate',
  'queenKnight': 'scholarsMotifQueenKnight',
  'bishopF7': 'scholarsMotifBishopF7',
  'queenAlone': 'scholarsMotifQueenAlone',
  'fool': 'scholarsMotifFool',
  'knightOpening': 'scholarsMotifKnight',
  'smothered': 'scholarsMotifSmothered',
  // Именованные узоры списка отработки.
  'smotheredMate': 'scholarsMotifSmothered',
  'backRankMate': 'scholarsMotif_backRankMate',
  'pillsburysMate': 'scholarsMotif_pillsburysMate',
  'operaMate': 'scholarsMotif_operaMate',
  'epauletteMate': 'scholarsMotif_epauletteMate',
  'cornerMate': 'scholarsMotif_cornerMate',
  'hookMate': 'scholarsMotif_hookMate',
  'swallowstailMate': 'scholarsMotif_swallowstailMate',
  'arabianMate': 'scholarsMotif_arabianMate',
  'anastasiaMate': 'scholarsMotif_anastasiaMate',
  'morphysMate': 'scholarsMotif_morphysMate',
  'bodenMate': 'scholarsMotif_bodenMate',
  'doubleBishopMate': 'scholarsMotif_doubleBishopMate',
  'dovetailMate': 'scholarsMotif_dovetailMate',
  'killBoxMate': 'scholarsMotif_killBoxMate',
  'vukovicMate': 'scholarsMotif_vukovicMate',
  'balestraMate': 'scholarsMotif_balestraMate',
  'triangleMate': 'scholarsMotif_triangleMate',
  'blindSwineMate': 'scholarsMotif_blindSwineMate',
};

/// Те же ключи списком — его читает `tools/embed-l10n.mjs`: ключ зовётся
/// переменной (`L.t(motifKey[m])`), и без списка в словарь он не попал бы.
const scholarsMotifKeys = <String>[
  'scholarsMate',
  'scholarsMotifQueenKnight',
  'scholarsMotifBishopF7',
  'scholarsMotifQueenAlone',
  'scholarsMotifFool',
  'scholarsMotifKnight',
  'scholarsMotifSmothered',
  'scholarsMotif_backRankMate',
  'scholarsMotif_pillsburysMate',
  'scholarsMotif_operaMate',
  'scholarsMotif_epauletteMate',
  'scholarsMotif_cornerMate',
  'scholarsMotif_hookMate',
  'scholarsMotif_swallowstailMate',
  'scholarsMotif_arabianMate',
  'scholarsMotif_anastasiaMate',
  'scholarsMotif_morphysMate',
  'scholarsMotif_bodenMate',
  'scholarsMotif_doubleBishopMate',
  'scholarsMotif_dovetailMate',
  'scholarsMotif_killBoxMate',
  'scholarsMotif_vukovicMate',
  'scholarsMotif_balestraMate',
  'scholarsMotif_triangleMate',
  'scholarsMotif_blindSwineMate',
];

/// Вопросы по видам заданий — тоже ключи, которые зовутся переменной.
const scholarsKindKeys = <String>[
  'scholarsMateAsk',
  'scholarsDefendAsk',
  'scholarsThreatAsk',
  'scholarsSacrificeAsk',
];
