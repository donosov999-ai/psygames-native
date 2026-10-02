// swift-tools-version: 5.9
// Вибрация практик (Core Haptics + системный вибромотор) — для приложений на
// Swift Package Manager («Умный будильник»). CocoaPods-путь — practice_kit.podspec,
// исходник тот же.

import PackageDescription

let package = Package(
    name: "practice_kit",
    platforms: [
        .iOS("15.0")
    ],
    products: [
        .library(name: "practice-kit", targets: ["practice_kit"])
    ],
    dependencies: [
        .package(name: "FlutterFramework", path: "../FlutterFramework")
    ],
    targets: [
        .target(
            name: "practice_kit",
            dependencies: [
                .product(name: "FlutterFramework", package: "FlutterFramework")
            ],
            linkerSettings: [
                .linkedFramework("CoreHaptics"),
                .linkedFramework("AudioToolbox"),
                .linkedFramework("AVFoundation")
            ]
        )
    ]
)
