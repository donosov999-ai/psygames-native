import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import '../core/photo_diary.dart';

/// Root must come from the native no-backup directory, never Documents/Photos.
class FileDiaryRepository extends DiaryRepository {
  FileDiaryRepository(this.root);
  final Directory root;
  static final _name = RegExp(r'^frame-[a-f0-9]{32}\.jpg$');
  File _frame(String name) {
    if (!_name.hasMatch(name)) throw ArgumentError('Invalid diary basename');
    return File('${root.path}/$name');
  }

  File get _index => File('${root.path}/index.json');

  Future<Uint8List?> readFrame(String basename) async {
    final file = _frame(basename);
    if (!await file.exists()) return null;
    return file.readAsBytes();
  }

  /// Startup only, before any capture. A valid index is required before cleanup.
  /// Removes only our own unindexed files left by a killed write/delete.
  Future<List<DiaryEntry>> recover() async {
    final entries = await read();
    final referenced = <String>{
      for (final e in entries)
        ...[e.beforeFile, e.duringFile, e.afterFile].whereType<String>(),
    };
    await for (final item in root.list(followLinks: false)) {
      final name = item.path.split(Platform.pathSeparator).last;
      if (item is File && _name.hasMatch(name) && !referenced.contains(name)) {
        await item.delete();
      }
    }
    return entries;
  }

  @override
  Future<List<DiaryEntry>> read() async {
    await root.create(recursive: true);
    if (!await _index.exists()) return [];
    final json = jsonDecode(await _index.readAsString());
    if (json is! List) throw const FormatException('Invalid diary index');
    final entries = json
        .map((e) => DiaryEntry.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
    for (final e in entries) {
      if (e.beforeFile != null) _frame(e.beforeFile!);
      if (e.duringFile != null) _frame(e.duringFile!);
      if (e.afterFile != null) _frame(e.afterFile!);
    }
    return entries;
  }

  @override
  Future<void> write(List<DiaryEntry> entries) async {
    await root.create(recursive: true);
    final temporary = File('${root.path}/index.pending');
    await temporary.writeAsString(
      jsonEncode(entries.map((e) => e.toJson()).toList()),
      flush: true,
    );
    await temporary.rename(_index.path);
  }

  @override
  Future<String> saveFrame(DiaryFrame frame) async {
    if (frame.bytes.isEmpty) throw ArgumentError('Empty photograph');
    await root.create(recursive: true);
    final random = Random.secure();
    final token = List.generate(
      16,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    final name = 'frame-$token.jpg';
    final file = _frame(name);
    try {
      await file.writeAsBytes(frame.bytes, flush: true);
      return name;
    } catch (_) {
      if (await file.exists()) await file.delete();
      rethrow;
    }
  }

  @override
  Future<void> deleteFrame(String basename) async {
    final file = _frame(basename);
    if (await file.exists()) await file.delete();
  }
}
