import Foundation
@testable import CommandCenter

func isolatedBackend()->Backend {
    Backend(directory:FileManager.default.temporaryDirectory.appendingPathComponent("cc-native-isolated-"+UUID().uuidString))
}
