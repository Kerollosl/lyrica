// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LyricaCore",
    platforms: [.iOS(.v18), .macOS(.v14)],
    products: [.library(name: "LyricaCore", targets: ["LyricaCore"])],
    targets: [
        .target(name: "LyricaCore"),
        .testTarget(name: "LyricaCoreTests", dependencies: ["LyricaCore"])
    ]
)
