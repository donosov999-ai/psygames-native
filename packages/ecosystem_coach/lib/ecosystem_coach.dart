/// Кабинет преподавателя — общий пакет для PsyGames, Chess & Go, Smart Alarm и TypeFree
/// (contract `ecosystem.coach/2`, эпик TeamOps 892cd2c3). Приложение даёт только данные: свой `appId`,
/// рамку экрана ([CoachFrame]) и подписи ([CoachStrings]); вид и логика кабинета — здесь, одни на всех.
library;

export 'src/auth.dart';
export 'src/client.dart';
export 'src/invite_link.dart';
export 'src/model.dart';
export 'src/screens.dart';
export 'src/skin.dart';
export 'src/strings.dart';
export 'src/v2_client.dart';
export 'src/v2_flow.dart';
export 'src/v2_model.dart';
export 'src/v2_screens.dart';
export 'src/v2_strings.dart';
