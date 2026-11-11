/// Вход в кабинет — общий для 4 приложений. Аккаунт один (ecosystem_account): Google или ссылка на почту.
/// Обратную ссылку `<scheme>://auth/callback?code=…` принимает приложение и отдаёт в [AccountCoachAuth.complete].
library;

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter/foundation.dart';

abstract class CoachAuth implements Listenable {
  bool get signedIn;
  String? get email;

  /// Google доступен не везде: на iOS без входа через Apple его прятать (App Store 4.8).
  bool get googleAvailable;
  Future<void> signInWithGoogle();
  Future<void> sendEmailLink(String email);
  Future<void> signOut();
}

class AccountCoachAuth extends ChangeNotifier implements CoachAuth {
  AccountCoachAuth(this.account, {required this.openUrl, this.googleAvailable = true, this.onSignedIn, this.onSignedOut});

  final EcosystemAccount account;

  /// Открыть страницу входа во внешнем браузере. Возвращает false, если открыть не удалось.
  final Future<bool> Function(Uri url) openUrl;

  /// Приложение запоминает, что вход был (чтобы при следующем запуске поднять сессию без сети до этого).
  final Future<void> Function()? onSignedIn;
  final Future<void> Function()? onSignedOut;

  @override
  final bool googleAvailable;

  @override
  bool get signedIn => account.accountId != null;

  @override
  String? get email => account.email;

  /// Поднять сохранённую сессию (только если вход уже был — решает приложение).
  Future<bool> restore() async {
    try {
      final ok = await account.resume(consent: true);
      notifyListeners();
      return ok;
    } on Object {
      notifyListeners();
      return false;
    }
  }

  @override
  Future<void> signInWithGoogle() async {
    final url = await account.googleSignInUrl(consent: true);
    if (!await openUrl(url)) throw StateError('coach_browser_unavailable');
  }

  @override
  Future<void> sendEmailLink(String email) => account.requestLink(email, consent: true);

  /// Обратная ссылка после входа. Не наша — false.
  Future<bool> complete(Uri uri) async {
    if (!account.acceptsCallback(uri)) return false;
    if (!account.active) account.prepareCallback(consent: true);
    await account.completeLink(uri);
    await onSignedIn?.call();
    notifyListeners();
    return true;
  }

  /// Вход завершил кто-то другой на том же аккаунте (облачный пилот) — перечитать состояние.
  void refresh() => notifyListeners();

  @override
  Future<void> signOut() async {
    await account.signOut();
    await onSignedOut?.call();
    notifyListeners();
  }
}
