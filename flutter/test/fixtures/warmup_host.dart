import 'dart:convert';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;
import '../hybrid_overlay_route_repro_test.dart' show FakeWebViewPlatform, FakeController;

/// Transport fixture only. Provider ownership is exercised separately with real React/API tests.
class WarmupWebViewPlatform extends FakeWebViewPlatform {
  final nextUrls = <int, String>{};
  Future<Object> Function(String)? reply;
  @override
  wv.PlatformWebViewController createPlatformWebViewController(wv.PlatformWebViewControllerCreationParams p) {
    final c = WarmupController(p, nextUrls, () => reply); controllers.add(c); return c;
  }
}

class WarmupController extends FakeController {
  WarmupController(super.params, this.nextUrls, this.reply);
  final Map<int, String> nextUrls;
  final Future<Object> Function(String)? Function() reply;
  @override
  Future<Object> runJavaScriptReturningResult(String js) async {
    this.js.add(js);
    final custom = reply();
    if (custom != null) return custom(js);
    final match = RegExp(r'\.goTo\((\d+),').firstMatch(js);
    if (match == null) return 'null';
    final idx = int.parse(match.group(1)!);
    final ownerStart = js.indexOf('{', match.end);
    final ownerEnd = js.indexOf('}', ownerStart);
    final old = jsonDecode(js.substring(ownerStart, ownerEnd + 1)) as Map;
    final url = nextUrls[idx];
    if (url == null) return 'null';
    final owner = {'run_id': old['run_id'], 'step_idx': idx, 'attempt_id': 'step-$idx'};
    final uri = Uri.parse(url);
    final withOwner = uri.replace(queryParameters: {
      ...uri.queryParameters, 'wuRun': '${old['run_id']}', 'wuStep': '$idx', 'wuAttempt': 'step-$idx',
    });
    return jsonEncode({'active': true, 'idx': idx, 'total': 6, 'title': 'Next', 'evening': false,
      'owner': owner, 'url': withOwner.toString()});
  }
}
