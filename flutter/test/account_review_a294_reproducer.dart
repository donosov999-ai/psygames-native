// Baseline reviewer reproducer. Original SHA256 989e6e78ef2459532e3b3708e23a7df942c00c9e5aab3d1efb5911812979374c.
// Only import path adapted to this host; deliberately not auto-discovered as *_test.dart.
import 'dart:convert';
import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'ecosystem_account_test.dart' show Vault;

Map<String,dynamic> session(String id,String issuer) {
  String part(Object x)=>base64Url.encode(utf8.encode(jsonEncode(x))).replaceAll('=','');
  final expires=DateTime.now().millisecondsSinceEpoch~/1000+3600;
  return {'access_token':'${part({'alg':'HS256'})}.${part({'exp':expires,'sub':id,'iss':issuer})}.synthetic',
    'refresh_token':'synthetic-$id','token_type':'bearer','expires_in':3600,
    'user':{'id':id,'email':'$id@example.invalid','aud':'authenticated'}};
}

void main(){
  const key='ecosystem.account.v1.smart-alarm.session';
  test('R1 retained query cannot dispatch after account A becomes B',() async {
    final vault=Vault()..values[key]=jsonEncode(session('A','https://example.supabase.co/auth/v1'));
    var requests=0;
    final paths=<String>[];
    final a=EcosystemAccount(appId:'smart-alarm',url:'https://example.supabase.co',publishableKey:'synthetic-public',
      callback:Uri.parse('com.odv999.smartAlarm://auth/callback'),vault:vault,
      transport:MockClient((request)async{requests++;paths.add(request.url.path);return http.Response('[]',200,headers:{'content-type':'application/json'});}));
    addTearDown(a.dispose);
    expect(await a.resume(consent:true),true);expect(a.accountId,'A');
    final retained=a.from('synthetic_results').select();
    vault.values[key]=jsonEncode(session('B','https://example.supabase.co/auth/v1'));
    expect(await a.resume(consent:true),true);expect(a.accountId,'B');
    // Account A's request must be retired, not replayed against account B.
    Object? rejected;
    try { await retained; } catch (e) { rejected=e; }
    // Paths and type only; no token, PKCE or credentials in evidence.
    // ignore: avoid_print -- immutable baseline diagnostic, synthetic counts/types only.
    print('R1 requests=$requests paths=$paths rejectionType=${rejected.runtimeType}');
    expect(requests,0);
    expect(rejected,isNotNull);
  });
  test('R2 foreign issuer cached session is rejected without forwarding its token',() async{
    final vault=Vault()..values[key]=jsonEncode(session('A','https://old-project.supabase.co/auth/v1'));
    var requests=0;
    final a=EcosystemAccount(appId:'smart-alarm',url:'https://new-project.supabase.co',publishableKey:'synthetic-public',
      callback:Uri.parse('com.odv999.smartAlarm://auth/callback'),vault:vault,
      transport:MockClient((_)async{requests++;return http.Response('[]',200,headers:{'content-type':'application/json'});}));
    addTearDown(a.dispose);
    // A new authority must not acknowledge another issuer's cached account.
    final restored=await a.resume(consent:true);
    expect(restored,false);
    expect(a.accountId,isNull);
    expect(requests,0);
  });
}

