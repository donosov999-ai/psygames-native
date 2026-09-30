/// ЧТЕНИЕ localStorage ANDROID-WEBVIEW НАПРЯМУЮ С ДИСКА.
///
/// 🔴 ЗАЧЕМ. Прогресс прежней линии PsyGames на Android лежит в localStorage
/// вебовой половины, а localStorage привязан к ORIGIN. Прежняя сборка (Tauri 2)
/// открывала страницу с `http://tauri.localhost`, гибрид раздаёт свою с
/// `http://127.0.0.1:<порт>`. Origin другой — корзина другая, и человек видит
/// пустой профиль, хотя данные никуда не делись: контейнер приложения ТОТ ЖЕ,
/// обновление из Google Play его сохраняет.
///
/// Android-WebView (Chromium) держит localStorage в базе LevelDB:
/// `<контейнер>/app_webview/Default/Local Storage/leveldb`. Этот файл её читает.
///
/// ⚠️ ПОЧЕМУ СВОЙ РАЗБОР, А НЕ ГОТОВАЯ БИБЛИОТЕКА. Искал 25.09.2026:
///   · pub.dev `leveldb` 7.0.0 — последний выпуск 2022, ограничение SDK
///     `<2.15.0`, с Dart 3 не ставится;
///   · pub.dev `flutter_leveldb` 1.0.1 — 2022, `<3.0.0`, туда же;
///   · pub.dev `leveldb_dart` 1.0.1 — свежий (06.2025), но одна звезда и НЕТ
///     каталога `android/`: нативную часть под ABI телефона он не собирает;
///   · GitHub по разбору Chromium Local Storage — только Python и Rust
///     (`NoCLin/localStorage-recovery` ★12), на Dart ни одного.
/// Все три пакета идут через FFI, то есть тянут сборку нативного LevelDB под
/// четыре ABI. И главное: LevelDB при открытии берёт МЕЖПРОЦЕССНЫЙ ЗАМОК, а эта
/// база занята нашим же WebView — открыть её движком, не закрыв WebView, нельзя.
/// Разбор файлов замка не берёт: мы только читаем байты.
///
/// ⚠️ ЧЕГО ЗДЕСЬ НЕТ НАМЕРЕННО. Это не движок LevelDB: ни записи, ни удаления,
/// ни компакции, ни проверки контрольных сумм. Задача одноразовая — прочитать
/// один раз при первом запуске гибрида. Порченый блок не «чинится», а
/// пропускается: половина прогресса лучше, чем падение на старте.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

/// Одна запись базы: пользовательский ключ, значение и номер в очереди записи.
class _Entry {
  _Entry(this.key, this.value, this.seq);

  /// Ключ как он лежит в базе (с префиксом origin).
  final Uint8List key;

  /// Значение; `null` означает удаление.
  final Uint8List? value;

  /// Номер записи. Чем больше — тем свежее; по нему и разрешается спор.
  final int seq;
}

/// Читает localStorage конкретного origin из каталога LevelDB.
class ChromiumLocalStorage {
  /// Возвращает пары «ключ → значение» для [origin] (например
  /// `http://tauri.localhost`), или пустую карту, если каталога нет.
  ///
  /// [dir] — каталог `Local Storage/leveldb`.
  static Map<String, String> read(Directory dir, {required String origin}) {
    if (!dir.existsSync()) return <String, String>{};

    final entries = <_Entry>[];
    final files = dir.listSync().whereType<File>().toList()
      ..sort((a, b) => a.path.compareTo(b.path));

    for (final f in files) {
      final name = f.path.split(Platform.pathSeparator).last;
      try {
        if (name.endsWith('.ldb') || name.endsWith('.sst')) {
          entries.addAll(_readTable(f.readAsBytesSync()));
        } else if (name.endsWith('.log')) {
          entries.addAll(_readJournal(f.readAsBytesSync()));
        }
      } catch (_) {
        // Битый или незнакомый файл пропускаем: см. «чего здесь нет намеренно».
      }
    }

    return _collect(entries, origin);
  }

  // ── схема Chromium Local Storage ──────────────────────────────────────────
  //
  // Ключ записи: `_` + origin + 0x00 + 0x01 + имя ключа (UTF-8).
  // Есть ещё служебные `META:<origin>` и `VERSION` — они нам не нужны.
  //
  // Значение: ПЕРВЫЙ БАЙТ — кодировка, остальное сама строка.
  //   0 → UTF-16LE (строка содержала что-то вне latin-1: кириллицу, эмодзи);
  //   1 → однобайтовая latin-1.
  // ⚠️ Пропустить этот байт и читать значение как UTF-8 — самая заметная ошибка
  // разбора: латиница почти уцелеет, а русские имена профилей превратятся в кашу.

  static Map<String, String> _collect(List<_Entry> entries, String origin) {
    final prefix = <int>[0x5f, ...utf8.encode(origin), 0x00, 0x01];
    final best = <String, _Entry>{};

    for (final e in entries) {
      if (e.key.length <= prefix.length) continue;
      var same = true;
      for (var i = 0; i < prefix.length; i++) {
        if (e.key[i] != prefix[i]) {
          same = false;
          break;
        }
      }
      if (!same) continue;

      final name = utf8.decode(e.key.sublist(prefix.length), allowMalformed: true);
      final prev = best[name];
      if (prev == null || e.seq >= prev.seq) best[name] = e;
    }

    final out = <String, String>{};
    best.forEach((name, e) {
      final v = e.value;
      if (v == null) return; // запись удалена — ключа нет
      out[name] = _decodeValue(v);
    });
    return out;
  }

  static String _decodeValue(Uint8List raw) {
    if (raw.isEmpty) return '';
    final body = raw.sublist(1);
    if (raw[0] == 0) {
      // UTF-16LE: пары байтов. Суррогаты собирает сам String.fromCharCodes,
      // если отдать ему кодовые единицы как есть.
      final units = <int>[];
      for (var i = 0; i + 1 < body.length; i += 2) {
        units.add(body[i] | (body[i + 1] << 8));
      }
      return String.fromCharCodes(units);
    }
    return latin1.decode(body, allowInvalid: true);
  }

  // ── журнал предзаписи (.log) ──────────────────────────────────────────────
  //
  // Файл нарезан на блоки по 32768 байт. Запись в блоке:
  //   контрольная сумма (4) · длина (2, LE) · вид (1) · данные
  // Вид: 1 целая, 2 первая часть, 3 средняя, 4 последняя — длинные записи
  // разрезаются границей блока и склеиваются обратно.

  static const int _blockSize = 32768;

  static List<_Entry> _readJournal(Uint8List bytes) {
    final out = <_Entry>[];
    final buf = <int>[];
    var pos = 0;

    while (pos + 7 <= bytes.length) {
      final inBlock = pos % _blockSize;
      if (_blockSize - inBlock < 7) {
        pos += _blockSize - inBlock; // хвост блока — заполнитель
        continue;
      }
      final len = bytes[pos + 4] | (bytes[pos + 5] << 8);
      final type = bytes[pos + 6];
      final start = pos + 7;
      if (start + len > bytes.length) break;
      final data = bytes.sublist(start, start + len);
      pos = start + len;

      if (type == 1) {
        _readBatch(Uint8List.fromList(data), out);
      } else if (type == 2) {
        buf
          ..clear()
          ..addAll(data);
      } else if (type == 3) {
        buf.addAll(data);
      } else if (type == 4) {
        buf.addAll(data);
        _readBatch(Uint8List.fromList(buf), out);
        buf.clear();
      } else {
        break; // неизвестный вид — дальше доверия нет
      }
    }
    return out;
  }

  /// Пачка записей: номер (8, LE) · сколько (4, LE) · сами записи.
  /// Запись: вид (1: 0 удаление, 1 значение) · ключ · [значение],
  /// каждая строка — длина переменной длины плюс байты.
  static void _readBatch(Uint8List b, List<_Entry> out) {
    if (b.length < 12) return;
    var seq = 0;
    for (var i = 7; i >= 0; i--) {
      seq = (seq << 8) | b[i];
    }
    final count = b[8] | (b[9] << 8) | (b[10] << 16) | (b[11] << 24);
    var p = 12;
    for (var i = 0; i < count && p < b.length; i++) {
      final type = b[p++];
      final k = _readSlice(b, p);
      if (k == null) return;
      p = k.next;
      if (type == 1) {
        final v = _readSlice(b, p);
        if (v == null) return;
        p = v.next;
        out.add(_Entry(k.bytes, v.bytes, seq + i));
      } else {
        out.add(_Entry(k.bytes, null, seq + i));
      }
    }
  }

  // ── сортированная таблица (.ldb) ──────────────────────────────────────────
  //
  // В конце файла подвал 48 байт: ссылка на служебный указатель, ссылка на
  // указатель блоков и восьмибайтовая подпись. Указатель блоков перечисляет
  // блоки данных; каждый блок — записи со СЖАТЫМ ОБЩИМ НАЧАЛОМ ключа плюс
  // таблица точек перезапуска в хвосте.

  static const int _footerLen = 48;

  static List<_Entry> _readTable(Uint8List bytes) {
    final out = <_Entry>[];
    if (bytes.length < _footerLen) return out;

    final footer = bytes.sublist(bytes.length - _footerLen);
    // Подпись `0xdb4775248b80fb57` лежит последними восемью байтами.
    var p = 0;
    final meta = _readHandle(footer, p);
    if (meta == null) return out;
    p = meta.next;
    final index = _readHandle(footer, p);
    if (index == null) return out;

    final indexBlock = _blockAt(bytes, index.offset, index.size);
    if (indexBlock == null) return out;

    // В указателе блоков значение каждой записи — ссылка на блок данных.
    for (final rec in _blockRecords(indexBlock)) {
      final h = _readHandle(rec.value, 0);
      if (h == null) continue;
      final data = _blockAt(bytes, h.offset, h.size);
      if (data == null) continue;
      for (final kv in _blockRecords(data)) {
        // В таблице ключ внутренний: пользовательский ключ плюс восемь байт,
        // где младший байт — вид записи, остальные семь — номер в очереди.
        if (kv.key.length < 8) continue;
        final n = kv.key.length - 8;
        var tag = 0;
        for (var i = 7; i >= 0; i--) {
          tag = (tag << 8) | kv.key[n + i];
        }
        final type = tag & 0xff;
        final seq = tag >> 8;
        out.add(_Entry(
          Uint8List.sublistView(kv.key, 0, n),
          type == 0 ? null : kv.value,
          seq,
        ));
      }
    }
    return out;
  }

  /// Достаёт блок по ссылке и при необходимости распаковывает.
  /// После данных блока идут байт способа сжатия и четыре байта суммы.
  static Uint8List? _blockAt(Uint8List file, int offset, int size) {
    if (offset < 0 || offset + size + 5 > file.length) return null;
    final raw = Uint8List.sublistView(file, offset, offset + size);
    final kind = file[offset + size];
    if (kind == 0) return raw;
    if (kind == 1) return _snappyDecode(raw);
    return null; // zstd и прочее в WebView не встречается
  }

  static Iterable<_Rec> _blockRecords(Uint8List block) sync* {
    if (block.length < 4) return;
    final n = block.length;
    final restarts = block[n - 4] |
        (block[n - 3] << 8) |
        (block[n - 2] << 16) |
        (block[n - 1] << 24);
    final end = n - 4 - restarts * 4;
    if (end < 0) return;

    var p = 0;
    var prev = Uint8List(0);
    while (p < end) {
      final shared = _readVarint(block, p);
      if (shared == null) return;
      final nonShared = _readVarint(block, shared.next);
      if (nonShared == null) return;
      final valLen = _readVarint(block, nonShared.next);
      if (valLen == null) return;
      var q = valLen.next;
      if (shared.value > prev.length) return;
      if (q + nonShared.value + valLen.value > block.length) return;

      final key = Uint8List(shared.value + nonShared.value);
      key.setRange(0, shared.value, prev);
      key.setRange(shared.value, key.length, block, q);
      q += nonShared.value;
      final value = Uint8List.sublistView(block, q, q + valLen.value);
      q += valLen.value;

      yield _Rec(key, value);
      prev = key;
      p = q;
    }
  }

  // ── snappy ────────────────────────────────────────────────────────────────
  //
  // Блоки таблицы Chromium сжимает snappy. Формат: длина распакованного числом
  // переменной длины, затем команды — «положить столько-то байт как есть» либо
  // «повторить столько-то байт, отступив назад на столько-то».

  static Uint8List? _snappyDecode(Uint8List src) {
    final total = _readVarint(src, 0);
    if (total == null) return null;
    final out = Uint8List(total.value);
    var p = total.next;
    var o = 0;

    while (p < src.length && o < out.length) {
      final tag = src[p++];
      final kind = tag & 0x03;

      if (kind == 0) {
        var len = tag >> 2;
        if (len >= 60) {
          final extra = len - 59;
          if (p + extra > src.length) return null;
          var v = 0;
          for (var i = extra - 1; i >= 0; i--) {
            v = (v << 8) | src[p + i];
          }
          p += extra;
          len = v;
        }
        len += 1;
        if (p + len > src.length || o + len > out.length) return null;
        out.setRange(o, o + len, src, p);
        p += len;
        o += len;
        continue;
      }

      int len;
      int offset;
      if (kind == 1) {
        if (p >= src.length) return null;
        len = 4 + ((tag >> 2) & 0x07);
        offset = ((tag >> 5) << 8) | src[p++];
      } else if (kind == 2) {
        if (p + 2 > src.length) return null;
        len = (tag >> 2) + 1;
        offset = src[p] | (src[p + 1] << 8);
        p += 2;
      } else {
        if (p + 4 > src.length) return null;
        len = (tag >> 2) + 1;
        offset = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24);
        p += 4;
      }

      if (offset <= 0 || offset > o) return null;
      if (o + len > out.length) len = out.length - o;
      // ⚠️ Копировать ТОЛЬКО побайтно: области могут перекрываться, и именно на
      // перекрытии строится повтор одного символа (балласт «xxxx…» — как раз он).
      for (var i = 0; i < len; i++) {
        out[o + i] = out[o - offset + i];
      }
      o += len;
    }
    return o == out.length ? out : null;
  }

  // ── мелочи разбора ────────────────────────────────────────────────────────

  static _Varint? _readVarint(Uint8List b, int p) {
    var result = 0;
    var shift = 0;
    var i = p;
    while (i < b.length && shift <= 63) {
      final byte = b[i++];
      result |= (byte & 0x7f) << shift;
      if (byte & 0x80 == 0) return _Varint(result, i);
      shift += 7;
    }
    return null;
  }

  static _Slice? _readSlice(Uint8List b, int p) {
    final len = _readVarint(b, p);
    if (len == null) return null;
    final end = len.next + len.value;
    if (end > b.length) return null;
    return _Slice(Uint8List.sublistView(b, len.next, end), end);
  }

  static _Handle? _readHandle(Uint8List b, int p) {
    final off = _readVarint(b, p);
    if (off == null) return null;
    final size = _readVarint(b, off.next);
    if (size == null) return null;
    return _Handle(off.value, size.value, size.next);
  }
}

class _Varint {
  _Varint(this.value, this.next);
  final int value;
  final int next;
}

class _Slice {
  _Slice(this.bytes, this.next);
  final Uint8List bytes;
  final int next;
}

class _Handle {
  _Handle(this.offset, this.size, this.next);
  final int offset;
  final int size;
  final int next;
}

class _Rec {
  _Rec(this.key, this.value);
  final Uint8List key;
  final Uint8List value;
}
