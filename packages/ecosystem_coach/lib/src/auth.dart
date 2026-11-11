/// Вход в кабинет — общий для 4 приложений. Аккаунт один (ecosystem_account): Google или ссылка на почту.
/// Обратную ссылку `<scheme>://auth/callback?code=…` принимает приложение и отдаёт в [AccountCoachAuth.complete].
library;

import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter/foundation.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

abstract class CoachAuth implements Listenable {
  bool get signedIn;
  String? get email;

  /// 🔴 Решение Дениса 11.11.2026: Google — на всех платформах, включая iPhone. false — только если Google
  /// технически недоступен (например, веб без возврата в приложение), не ради правил магазина.
  bool get googleAvailable;
  Future<void> signInWithGoogle();

  /// Вход через Apple — на iPhone/iPad/Mac (App Store 4.8: рядом с Google нужен равноценный вход).
  bool get appleAvailable;
  Future<void> signInWithApple();
  Future<void> sendEmailLink(String email);
  Future<void> signOut();
}

class AccountCoachAuth extends ChangeNotifier implements CoachAuth {
  AccountCoachAuth(this.account, {required this.openUrl, this.googleAvailable = true, bool? appleAvailable, this.onSignedIn,
      this.onSignedOut})
      : appleAvailable = appleAvailable ??
            (!kIsWeb && (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS));

  final EcosystemAccount account;

  /// Открыть страницу входа во внешнем браузере. Возвращает false, если открыть не удалось.
  final Future<bool> Function(Uri url) openUrl;

  /// Приложение запоминает, что вход был (чтобы при следующем запуске поднять сессию без сети до этого).
  final Future<void> Function()? onSignedIn;
  final Future<void> Function()? onSignedOut;

  @override
  final bool googleAvailable;

  @override
  final bool appleAvailable;

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

  /// Системное окно Apple → id-токен → Supabase. В окно уходит SHA-256 одноразового кода, в Supabase — сам код.
  @override
  Future<void> signInWithApple() async {
    final random = Random.secure();
    final raw = base64Url.encode(List<int>.generate(32, (_) => random.nextInt(256))).replaceAll('=', '');
    final credential = await SignInWithApple.getAppleIDCredential(
      scopes: const [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
      nonce: sha256.convert(utf8.encode(raw)).toString(),
    );
    final token = credential.identityToken;
    if (token == null) throw StateError('coach_apple_no_token');
    await account.signInWithAppleIdToken(idToken: token, rawNonce: raw, consent: true);
    await onSignedIn?.call();
    notifyListeners();
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
