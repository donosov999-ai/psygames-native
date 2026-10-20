import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

import 'diary_entry_card_stability_test.dart' show pixels;

void main() {
  for (final size in [const Size(320, 640), const Size(640, 320)]) {
    testWidgets(
      'tap opens guarded contain viewer, zoom reset and close at $size',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final bytes = (await tester.runAsync(() => pixels(12, 24)))!;
        var reads = 0, guards = 0;
        final entry = DiaryEntry(
          id: 'test',
          kind: 'wake',
          title: 'Test',
          startedAtMs: 1,
          during: DiaryShotState.saved,
          duringFile: 'during.jpg',
          duringAtMs: 2,
        );
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: DiaryEntryCard(
                  entry: entry,
                  readPhoto: (_) async {
                    reads++;
                    return bytes;
                  },
                  onRate: (_) {},
                  onDelete: () {},
                  privacyWrapper: (child) => _Guard(
                    enter: () => guards++,
                    exit: () => guards--,
                    child: child,
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byType(Image));
        final provider = tester.widget<Image>(find.byType(Image)).image;
        await tester.tap(find.byType(Image));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('diary-photo-viewer')), findsOneWidget);
        expect(guards, 1);
        expect(reads, 1);
        final viewer = tester.widget<InteractiveViewer>(
          find.byKey(const Key('diary-photo-zoom')),
        );
        expect(viewer.maxScale, 6);
        expect(
          tester
              .widget<Image>(
                find.descendant(
                  of: find.byKey(const Key('diary-photo-viewer')),
                  matching: find.byType(Image),
                ),
              )
              .image,
          same(provider),
        );
        viewer.transformationController!.value = Matrix4.diagonal3Values(
          2,
          2,
          1,
        );
        await tester.tap(find.byKey(const Key('diary-photo-reset')));
        expect(viewer.transformationController!.value.getMaxScaleOnAxis(), 1);
        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
        await tester.pump();
        expect(find.byKey(const Key('diary-photo-hidden')), findsOneWidget);
        expect(guards, 1);
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        await tester.pump();
        await tester.tap(find.byKey(const Key('diary-photo-close')));
        await tester.pumpAndSettle();
        expect(guards, 0);
        expect(find.byKey(const Key('diary-photo-viewer')), findsNothing);
        expect(reads, 1);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('without host privacy wrapper viewer fails closed', (
    tester,
  ) async {
    final bytes = (await tester.runAsync(() => pixels(10, 10)))!;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: DiaryEntryCard(
              entry: DiaryEntry(
                id: 't',
                kind: 'wake',
                title: 't',
                startedAtMs: 1,
                before: DiaryShotState.saved,
                beforeFile: 'x',
              ),
              readPhoto: (_) async => bytes,
              onRate: (_) {},
              onDelete: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Image));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('diary-photo-viewer')), findsNothing);
  });
}

class _Guard extends StatefulWidget {
  const _Guard({required this.enter, required this.exit, required this.child});
  final VoidCallback enter, exit;
  final Widget child;
  @override
  State<_Guard> createState() => _GuardState();
}

class _GuardState extends State<_Guard> {
  @override
  void initState() {
    super.initState();
    widget.enter();
  }

  @override
  void dispose() {
    widget.exit();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
