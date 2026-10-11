import 'package:flutter/material.dart';

import '../diary_controller.dart';

/// Session choice is never persisted or inferred from the global preference.
class DiaryOptIn extends StatelessWidget {
  const DiaryOptIn({
    super.key,
    required this.diary,
    required this.value,
    required this.onChanged,
    this.wake = false,
    this.english = false,
  });
  final DiaryController diary;
  final bool value, wake, english;
  final ValueChanged<bool> onChanged;
  String tr(String ru, String en) => english ? en : ru;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: diary,
    builder: (context, _) {
      final p = diary.preferences;
      final allowed = wake ? p.wakeCapture : p.practiceCapture;
      return Material(
        type: MaterialType.transparency,
        child: SwitchListTile(
          key: Key(wake ? 'alarm-photo-diary' : 'practice-photo-diary'),
          contentPadding: EdgeInsets.zero,
          title: Text(
            p.savePhotos
                ? tr('Фото до и после', 'Before/after photos')
                : tr(
                    'Дневник занятия без фото',
                    'Session diary without photos',
                  ),
          ),
          subtitle: Text(
            allowed && !p.savePhotos
                ? tr(
                    'Только факты занятия и ваша оценка. Камера не снимает.',
                    'Session facts and your rating only. No photos are taken.',
                  )
                : allowed
                ? tr(
                    'Только на устройстве. Необязательно.',
                    'On this device only. Optional.',
                  )
                : tr(
                    'Сначала включите этот тип занятий в Настройках → Фото-дневник.',
                    'First enable this session type in Settings → Photo diary.',
                  ),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
          value: value && allowed,
          onChanged: allowed || value
              ? (next) => onChanged(allowed && next)
              : null,
        ),
      );
    },
  );
}
