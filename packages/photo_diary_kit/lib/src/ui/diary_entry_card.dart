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
    this.privacyWrapper,
  });
  final DiaryEntry entry;
  final Future<Uint8List?> Function(String basename) readPhoto;
  final ValueChanged<int?> onRate;
  final VoidCallback onDelete;
  final bool english;

  /// Viewer is disabled without a host guard against feedback screenshots.
  final Widget Function(Widget)? privacyWrapper;
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

  Widget _shot(DiaryShotSlot slot) {
    final before = slot == DiaryShotSlot.before;
    final during = slot == DiaryShotSlot.during;
    final file = during
        ? entry.duringFile
        : before
        ? entry.beforeFile
        : entry.afterFile;
    final state = entry.shotState(slot);
    final time = during
        ? entry.duringAtMs
        : before
        ? entry.beforeAtMs
        : entry.afterAtMs;
    final error = during
        ? entry.duringError
        : before
        ? entry.beforeError
        : entry.afterError;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          during
              ? tr('Во время задания', 'During the task')
              : before
              ? tr('До', 'Before')
              : tr('После', 'After'),
        ),
        const SizedBox(height: 4),
        AspectRatio(
          aspectRatio: 1,
          child: file != null && state == DiaryShotState.saved
              ? _DiaryPhoto(
                  // Snapshot mutable entry fields into the key. A different
                  // entry/shot must not inherit bytes or a pending old read.
                  key: ValueKey((entry.id, slot, file, state, time)),
                  file: file,
                  privacyWrapper: privacyWrapper,
                  closeLabel: tr('Закрыть фото', 'Close photo'),
                  resetLabel: tr('Сбросить увеличение', 'Reset zoom'),
                  readPhoto: readPhoto,
                  absentLabel: tr('Нет снимка', 'No photo'),
                  semanticLabel: during
                      ? tr(
                          'Ваш снимок во время задания',
                          'Your photo during the task',
                        )
                      : before
                      ? tr(
                          'Ваш снимок до занятия',
                          'Your photo before the session',
                        )
                      : tr(
                          'Ваш снимок после занятия',
                          'Your photo after the session',
                        ),
                )
              : _absent(error),
        ),
        if (time != null) Text(_date(time)),
      ],
    );
  }

  Widget _absent(String? error) => Center(
    child: Text(switch (error) {
      'timeout' => tr('Камера не успела сделать снимок', 'Camera timed out'),
      'permission_denied' => tr(
        'Нет разрешения камеры',
        'Camera permission denied',
      ),
      'camera_unavailable' => tr(
        'Фронтальная камера недоступна',
        'Front camera unavailable',
      ),
      'camera_busy' => tr('Камера занята', 'Camera busy'),
      'storage_error' => tr(
        'Не удалось сохранить снимок',
        'Could not save the photo',
      ),
      'interrupted' => tr('Съёмка прервана', 'Capture interrupted'),
      'capture_error' => tr(
        'Не удалось сделать снимок',
        'Could not take the photo',
      ),
      _ => tr('Нет снимка', 'No photo'),
    }, textAlign: TextAlign.center),
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
              Expanded(child: _shot(DiaryShotSlot.before)),
              const SizedBox(width: 12),
              Expanded(child: _shot(DiaryShotSlot.after)),
            ],
          ),
          if (entry.during != DiaryShotState.absent) ...[
            const SizedBox(height: 12),
            _shot(DiaryShotSlot.during),
          ],
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
    required this.closeLabel,
    required this.resetLabel,
    required this.privacyWrapper,
  });
  final String file, absentLabel, semanticLabel;
  final String closeLabel, resetLabel;
  final Widget Function(Widget)? privacyWrapper;
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
      return GestureDetector(
        onTap: widget.privacyWrapper == null
            ? null
            : () => showDialog<void>(
                context: context,
                useRootNavigator: false,
                barrierDismissible: false,
                builder: (_) => widget.privacyWrapper!(
                  _DiaryPhotoViewer(
                    image: snapshot.data!,
                    label: widget.semanticLabel,
                    absentLabel: widget.absentLabel,
                    closeLabel: widget.closeLabel,
                    resetLabel: widget.resetLabel,
                  ),
                ),
              ),
        child: RepaintBoundary(
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
        ),
      );
    },
  );
}

class _DiaryPhotoViewer extends StatefulWidget {
  const _DiaryPhotoViewer({
    required this.image,
    required this.label,
    required this.absentLabel,
    required this.closeLabel,
    required this.resetLabel,
  });
  final MemoryImage image;
  final String label, absentLabel, closeLabel, resetLabel;
  @override
  State<_DiaryPhotoViewer> createState() => _DiaryPhotoViewerState();
}

class _DiaryPhotoViewerState extends State<_DiaryPhotoViewer>
    with WidgetsBindingObserver {
  final transform = TransformationController();
  bool foreground = true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    setState(() => foreground = state == AppLifecycleState.resumed);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    transform.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Dialog.fullscreen(
    key: const Key('diary-photo-viewer'),
    child: Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        leading: IconButton(
          key: const Key('diary-photo-close'),
          tooltip: widget.closeLabel,
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(widget.label, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            key: const Key('diary-photo-reset'),
            tooltip: widget.resetLabel,
            icon: const Icon(Icons.zoom_out_map),
            onPressed: () => transform.value = Matrix4.identity(),
          ),
        ],
      ),
      body: foreground
          ? LayoutBuilder(
              builder: (context, constraints) => InteractiveViewer(
                key: const Key('diary-photo-zoom'),
                transformationController: transform,
                minScale: 1,
                maxScale: 6,
                child: SizedBox(
                  width: constraints.maxWidth,
                  height: constraints.maxHeight,
                  child: Image(
                    image: widget.image,
                    fit: BoxFit.contain,
                    semanticLabel: widget.label,
                    errorBuilder: (_, _, _) => Center(
                      child: Text(
                        widget.absentLabel,
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : const SizedBox.expand(key: Key('diary-photo-hidden')),
    ),
  );
}
