import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/photo_diary.dart';

/// Caller reads only validated private basenames and persists explicit actions.
class DiaryEntryCard extends StatelessWidget {
  const DiaryEntryCard({
    super.key,
    required this.entry,
    required this.readPhoto,
    required this.onRate,
    required this.onDelete,
    this.english = false,
  });
  final DiaryEntry entry;
  final Future<Uint8List?> Function(String basename) readPhoto;
  final ValueChanged<int?> onRate;
  final VoidCallback onDelete;
  final bool english;
  String tr(String ru, String en) => english ? en : ru;

  String get outcome => switch (entry.outcome) {
    'completed' => tr('Задание завершено', 'Task completed'),
    'running' => tr(
      'Начато; завершение не записано',
      'Started; no completion recorded',
    ),
    'snoozed' => tr('Отложено', 'Snoozed'),
    'skipped' => tr('Пропущено', 'Skipped'),
    _ => tr('Занятие прервано', 'Session interrupted'),
  };

  Widget _shot(bool before) {
    final file = before ? entry.beforeFile : entry.afterFile;
    final state = before ? entry.before : entry.after;
    final time = before ? entry.beforeAtMs : entry.afterAtMs;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(before ? tr('До', 'Before') : tr('После', 'After')),
        const SizedBox(height: 4),
        AspectRatio(
          aspectRatio: 1,
          child: file != null && state == DiaryShotState.saved
              ? _DiaryPhoto(
                  // Snapshot mutable entry fields into the key. A different
                  // entry/shot must not inherit bytes or a pending old read.
                  key: ValueKey((entry.id, before, file, state, time)),
                  file: file,
                  readPhoto: readPhoto,
                  absentLabel: tr('Нет снимка', 'No photo'),
                  semanticLabel: before
                      ? tr(
                          'Ваш снимок до занятия',
                          'Your photo before the session',
                        )
                      : tr(
                          'Ваш снимок после занятия',
                          'Your photo after the session',
                        ),
                )
              : _absent(),
        ),
        if (time != null) Text(_date(time)),
      ],
    );
  }

  Widget _absent() => Center(
    child: Text(tr('Нет снимка', 'No photo'), textAlign: TextAlign.center),
  );
  String _date(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    String two(int v) => v.toString().padLeft(2, '0');
    return '${two(d.day)}.${two(d.month)}.${d.year} ${two(d.hour)}:${two(d.minute)}';
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(entry.title, style: Theme.of(context).textTheme.titleMedium),
          Text(
            '${entry.kind == 'wake' ? tr('Будильник', 'Alarm') : tr('Практика', 'Practice')} · ${_date(entry.startedAtMs)}',
          ),
          Text(outcome),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _shot(true)),
              const SizedBox(width: 12),
              Expanded(child: _shot(false)),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            tr(
              'Как вы сами оцениваете бодрость? Необязательно.',
              'How alert do you feel? Optional.',
            ),
          ),
          Wrap(
            spacing: 8,
            children: [
              for (var n = 1; n <= 5; n++)
                ChoiceChip(
                  label: Text('$n'),
                  selected: entry.brightness == n,
                  tooltip: tr(
                    '$n из 5 — ваша оценка',
                    '$n of 5 — your own rating',
                  ),
                  onSelected: (selected) => onRate(selected ? n : null),
                ),
            ],
          ),
          Text(
            tr(
              'Фото не подтверждают выполнение движения или состояние здоровья.',
              'Photos do not confirm physical exercise completion or health status.',
            ),
          ),
          TextButton.icon(
            onPressed: () async {
              final approved = await showDialog<bool>(
                context: context,
                builder: (c) => AlertDialog(
                  title: Text(tr('Удалить эту запись?', 'Delete this entry?')),
                  content: Text(
                    tr(
                      'Фото и оценка будут удалены. История упражнений останется.',
                      'Photos and rating will be deleted. Exercise history is preserved.',
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: Text(tr('Отмена', 'Cancel')),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: Text(tr('Удалить', 'Delete')),
                    ),
                  ],
                ),
              );
              if (approved == true) onDelete();
            },
            icon: const Icon(Icons.delete_outline),
            label: Text(tr('Удалить запись', 'Delete entry')),
          ),
        ],
      ),
    ),
  );
}

/// Own the read and provider for the lifetime of this immutable shot identity,
/// not a reader closure recreated by AppState ticks or rating updates.
class _DiaryPhoto extends StatefulWidget {
  const _DiaryPhoto({
    super.key,
    required this.file,
    required this.readPhoto,
    required this.absentLabel,
    required this.semanticLabel,
  });
  final String file, absentLabel, semanticLabel;
  final Future<Uint8List?> Function(String) readPhoto;

  @override
  State<_DiaryPhoto> createState() => _DiaryPhotoState();
}

class _DiaryPhotoState extends State<_DiaryPhoto> {
  late final Future<MemoryImage?> _image;

  @override
  void initState() {
    super.initState();
    _image = Future<Uint8List?>.sync(
      () => widget.readPhoto(widget.file),
    ).then((bytes) => bytes == null ? null : MemoryImage(bytes));
  }

  Widget _absent() =>
      Center(child: Text(widget.absentLabel, textAlign: TextAlign.center));

  @override
  Widget build(BuildContext context) => FutureBuilder<MemoryImage?>(
    future: _image,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(child: CircularProgressIndicator());
      }
      if (snapshot.hasError || snapshot.data == null) return _absent();
      return RepaintBoundary(
        child: Image(
          image: snapshot.data!,
          // Show the whole face in portrait and landscape; no forced rotation
          // or mirroring. The image codec applies the saved JPEG orientation.
          fit: BoxFit.contain,
          alignment: Alignment.center,
          // Never keep pixels from a previous entry while a new shot loads.
          gaplessPlayback: false,
          semanticLabel: widget.semanticLabel,
          errorBuilder: (context, error, stack) => _absent(),
        ),
      );
    },
  );
}
