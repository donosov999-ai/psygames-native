Pod::Spec.new do |s|
  s.name = 'photo_diary_kit'
  s.version = '0.1.1'
  s.summary = 'Private local photo diary.'
  s.description = 'Opt-in no-backup photo diary storage shared across apps.'
  s.homepage = 'https://psy-games.pro'
  s.license = { :type => 'Proprietary' }
  s.author = 'PsyGames'
  s.source = { :path => '.' }
  s.source_files = 'photo_diary_kit/Sources/photo_diary_kit/**/*.swift'
  s.dependency 'Flutter'
  s.platform = :ios, '15.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386' }
  s.swift_version = '5.0'
end
