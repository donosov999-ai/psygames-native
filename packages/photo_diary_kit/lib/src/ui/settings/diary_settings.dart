import 'package:flutter/material.dart';

import '../../core/diary_preferences.dart';

/// Independent of AppState: caller persists preferences and owns camera setup.
class DiarySettings extends StatelessWidget {
  const DiarySettings({
    super.key,
    required this.value,
    required this.onChanged,
    required this.onPreview,
    required this.onDeleteAll,
    this.english = false,
  });
  final DiaryPreferences value;
  final ValueChanged<DiaryPreferences> onChanged;
  final VoidCallback onPreview, onDeleteAll;
  final bool english;
  String tr(String ru, String en) => english ? en : ru;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        tr('Фото-дневник', 'Photo diary'),
        style: Theme.of(context).textTheme.titleMedium,
      ),
      Text(
        tr(
          'Два снимка фронтальной камерой: перед занятием и после. Без вспышки и записи звука. Только на этом устройстве. Фото не определяют здоровье или бодрость.',
          'Two front-camera photos: before and after a session. No flash or audio recording. On this device only. Photos do not measure health or alertness.',
        ),
      ),
      SwitchListTile(
        key: const Key('diary-camera-consent'),
        title: Text(
          tr('Разрешаю съёмку до и после', 'I consent to before/after capture'),
        ),
        value: value.cameraConsent,
        onChanged: (v) => onChanged(value.change(cameraConsent: v)),
      ),
      SwitchListTile(
        key: const Key('diary-storage-consent'),
        title: Text(
          tr('Разрешаю сохранять снимки', 'I consent to storing photos'),
        ),
        subtitle: Text(
          tr(
            'Отдельное согласие. Выключено — фото не снимаются и не сохраняются; остаются факты занятия и ваша оценка.',
            'Separate consent. When off, no photos are taken or saved; session facts and your rating remain.',
          ),
        ),
        value: value.storageConsent,
        onChanged: value.cameraConsent
            ? (v) => onChanged(value.change(storageConsent: v))
            : null,
      ),
      SwitchListTile(
        key: const Key('diary-practices'),
        title: Text(
          tr('В добровольных практиках', 'During voluntary practices'),
        ),
        value: value.practices,
        onChanged: value.cameraConsent
            ? (v) => onChanged(value.change(practices: v))
            : null,
      ),
      SwitchListTile(
        key: const Key('diary-wake'),
        title: Text(tr('В заданиях будильника', 'During wake tasks')),
        subtitle: Text(
          tr(
            'Дополнительно включите в нужном будильнике. Съёмка начинается только после открытия задания.',
            'Also enable for the desired alarm. Capture starts only after opening the task.',
          ),
        ),
        value: value.wakeTasks,
        onChanged: value.cameraConsent
            ? (v) => onChanged(value.change(wakeTasks: v))
            : null,
      ),
      OutlinedButton.icon(
        key: const Key('diary-preview'),
        onPressed: value.cameraConsent ? onPreview : null,
        icon: const Icon(Icons.camera_front),
        label: Text(tr('Настроить камеру заранее', 'Set up camera beforehand')),
      ),
      Text(
        tr(
          'Камера недоступна — задание продолжается. Отзыв согласия не удаляет старые снимки: их можно удалить ниже.',
          'If the camera is unavailable, the task continues. Revoking consent does not delete old photos: use the control below.',
        ),
      ),
      TextButton.icon(
        onPressed: () async {
          final approved = await showDialog<bool>(
            context: context,
            builder: (c) => AlertDialog(
              title: Text(tr('Удалить фото-дневник?', 'Delete photo diary?')),
              content: Text(
                tr(
                  'Снимки и оценки дневника будут удалены. История упражнений останется.',
                  'Diary photos and ratings will be deleted. Exercise history is preserved.',
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
          if (approved == true) onDeleteAll();
        },
        icon: const Icon(Icons.delete_outline),
        label: Text(
          tr('Удалить весь фото-дневник', 'Delete entire photo diary'),
        ),
      ),
    ],
  );
}
