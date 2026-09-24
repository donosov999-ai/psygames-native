import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/asset_server.dart';

/// 🔴 КАРТИНКИ ВЕБ-ЧАСТИ ОБЯЗАНЫ ОТДАВАТЬСЯ КАРТИНКАМИ.
///
/// 📍 Отчёт Дениса 24.09.2026 (71a0c36e): «верхний тулбар пострадал у всех
/// профилей, картинки пропали — логотипы, и плюс питомец в верхнем правом углу
/// тоже». Ошибок в журнале ноль, кодов 404 ноль.
///
/// 🔴 ПОЧЕМУ ТАКОЕ МОЛЧИТ. Раздача веб-части устроена как одностраничное
/// приложение: ЧЕГО НЕТ — отдаём главную страницу. Для адреса это верно, а для
/// картинки — нет: вместо `.webp` уходит HTML, браузер его не декодирует, и
/// место картинки остаётся пустым. Ни ошибки, ни кода 404 при этом не будет.
///
/// ⚠️ Поэтому проба мерит не «ответ 200», а ТИП и ПЕРВЫЕ БАЙТЫ: `<!DOCTYPE`
/// вместо `RIFF…WEBP` — это и есть пропавшая картинка.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AssetServer server;
  setUpAll(() async {
    // ⚠️ Каркас проб подменяет HttpClient заглушкой на 400 — с ней мерить нечего.
    // Снимаем подмену: стучимся по петле в СВОЙ же сервер, сети здесь нет.
    HttpOverrides.global = null;
    server = await AssetServer.start();
  });
  tearDownAll(() => server.stop());

  Future<({int code, String type, List<int> head})> get(String path) async {
    final client = HttpClient();
    final req = await client.getUrl(Uri.parse('${server.origin}$path'));
    final res = await req.close();
    final bytes = <int>[];
    await for (final chunk in res) {
      bytes.addAll(chunk);
      if (bytes.length > 64) break;
    }
    client.close(force: true);
    return (
      code: res.statusCode,
      type: res.headers.contentType?.mimeType ?? '',
      head: bytes,
    );
  }

  test('🔴 логотип и спрайт питомца приходят картинками, а не главной страницей', () async {
    // ⚠️ Спрашиваем СБОРКУ, а не диск: файлы могут лежать в папке, но не быть
    // перечислены в pubspec — тогда приложение их не увидит, и мерить нечего.
    // Веб-часть в git не кладётся (86 МБ), поэтому без неё проба пропускается.
    if (!await server.has('index.html')) {
      markTestSkipped('веб-часть не вложена (flutter/tools/embed-web.sh) — мерить нечего');
      return;
    }
    // Адреса берём с диска: имена в сборке хешированы и меняются каждым экспортом.
    final logos = Directory('assets/web/assets/assets/images/logos');
    final pets = Directory('assets/web/assets/assets/images/pet/cat');
    expect(logos.existsSync(), isTrue, reason: 'в сборке нет каталога логотипов');
    expect(pets.existsSync(), isTrue, reason: 'в сборке нет каталога спрайтов кота');

    final files = [
      ...logos.listSync().whereType<File>().take(3),
      ...pets.listSync().whereType<File>().take(3),
    ];
    expect(files.length, greaterThanOrEqualTo(4), reason: 'файлов для замера мало');

    final broken = <String>[];
    for (final f in files) {
      final url = f.path.replaceFirst('assets/web', '');
      final r = await get(url);
      final html = String.fromCharCodes(r.head.take(15)).toLowerCase().contains('<!doctype');
      if (r.code != 200 || html || !r.type.startsWith('image/')) {
        broken.add('$url → ${r.code} ${r.type}${html ? ' (пришла HTML-страница)' : ''}');
      }
    }
    expect(broken, isEmpty, reason: 'картинки не отдаются картинками:\n${broken.join('\n')}');
  });

  test('🔴 отпечаток сборки читается и постоянен', () async {
    if (!await server.has('index.html')) {
      markTestSkipped('веб-часть не вложена — отпечатка нет');
      return;
    }
    final a = await server.fingerprint();
    final b = await server.fingerprint();
    expect(a, isNotEmpty, reason: 'отпечаток пуст — смену сборки не заметить');
    expect(a, b, reason: 'отпечаток пляшет между вызовами — кэш сбрасывался бы каждый запуск');
  });

  test('🔴 пропавшая картинка НЕ прикидывается страницей', () async {
    final r = await get('/assets/assets/images/logos/такого-файла-нет.webp');
    // Подмена HTML вместо картинки — это и есть дефект отчёта 71a0c36e: пустое
    // место без ошибки. Для путей с расширением картинки честный ответ — 404.
    final html = String.fromCharCodes(r.head.take(15)).toLowerCase().contains('<!doctype');
    expect(html && r.code == 200, isFalse,
        reason: 'на месте отсутствующей картинки пришла главная страница с кодом 200');
  });
}
