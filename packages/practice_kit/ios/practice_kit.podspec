Pod::Spec.new do |s|
  s.name             = 'practice_kit'
  s.version          = '0.1.0'
  s.summary          = 'Practice haptics shared by PsyGames and Smart Alarm.'
  s.description      = 'Core Haptics plus the system vibration motor for practice cues.'
  s.homepage         = 'https://psy-games.pro'
  s.license          = { :type => 'Proprietary' }
  s.author           = 'PsyGames'
  s.source           = { :path => '.' }
  s.source_files = 'practice_kit/Sources/practice_kit/**/*.swift'
  s.dependency 'Flutter'
  s.platform         = :ios, '15.0'
  s.frameworks       = 'CoreHaptics', 'AudioToolbox', 'AVFoundation'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386' }
  s.swift_version    = '5.0'
end
