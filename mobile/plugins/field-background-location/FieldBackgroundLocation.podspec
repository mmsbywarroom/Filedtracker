Pod::Spec.new do |s|
  s.name = 'FieldBackgroundLocation'
  s.version = '1.0.0'
  s.summary = 'Background GPS for Field Tracking'
  s.license = 'MIT'
  s.homepage = 'https://filed.videh.co.in'
  s.author = 'Field Tracking'
  s.source = { :git => 'https://github.com/mmsbywarroom/Filedtracker.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
