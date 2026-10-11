// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "photo_diary_kit",
    platforms: [.iOS("15.0")],
    products: [.library(name: "photo-diary-kit", targets: ["photo_diary_kit"])],
    dependencies: [.package(name: "FlutterFramework", path: "../FlutterFramework")],
    targets: [.target(name: "photo_diary_kit", dependencies: [
        .product(name: "FlutterFramework", package: "FlutterFramework")
    ])]
)
