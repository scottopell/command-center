import XCTest
import AppKit

// Rendering conformance must use real foreground frames, never a test-only readiness fallback.
@MainActor func requireForegroundWebKit(_ window:NSWindow) throws {
    NSApp.activate(ignoringOtherApps:true);window.makeKeyAndOrderFront(nil)
    let deadline=Date().addingTimeInterval(1)
    while !(NSApp.isActive && window.occlusionState.contains(.visible)),Date()<deadline {
        RunLoop.current.run(until:Date().addingTimeInterval(0.01))
    }
    guard NSApp.isActive && window.occlusionState.contains(.visible) else {
        throw XCTSkip("Foreground WebKit rendering requires an unlocked desktop with the test window visible")
    }
}
