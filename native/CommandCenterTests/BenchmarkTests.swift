import XCTest
import WebKit
@testable import CommandCenter
@MainActor final class BenchmarkTests: XCTestCase {
    func waitFor(_ condition:@escaping()->Bool) async throws {
        let limit=Date().addingTimeInterval(10)
        while !condition(){if Date()>limit{throw NSError(domain:"Benchmark timeout",code:1)};try await Task.sleep(nanoseconds:10_000_000)}
    }
    // REQ-SH-006/011, REQ-FF-006: raw samples, foreground native render flush and ownership.
    func testWarmLaunchSamplesAndRepeatedDisposal() async throws {
        let shell=Shell(backend:isolatedBackend());defer{shell.cancel();shell.collector.flush();try? FileManager.default.removeItem(at:shell.backend.directory);shell.window.orderOut(nil)}
        var released=0,escapeSamples=[Double]()
        for index in 0..<30 {
            shell.command.stringValue="SLOW \(index==0 ? 30 : 0)";shell.execute()
            try await waitFor({shell.active?.phase == .interactive})
            if index % 10 == 0 { _ = try await shell.web!.evaluateJavaScript("globalThis.__conformanceBlob = new Uint8Array(32 * 1024 * 1024); globalThis.__conformanceBlob.fill(1); true") }
            shell.message(["kind":"viewReady","entryId":"root"],generation:shell.active!.id)
            weak var retiredWeb=shell.web;weak var retiredInstance=shell.active
            let start=ProcessInfo.processInfo.systemUptime;shell.focusCommand();shell.escape();shell.window.displayIfNeeded();escapeSamples.append((ProcessInfo.processInfo.systemUptime-start)*1000)
            XCTAssertNil(shell.active);XCTAssertEqual(shell.content.subviews.filter{$0 is WKWebView}.count,0)
            try await waitFor({retiredWeb==nil&&retiredInstance==nil});released+=1
        }
        let samples=shell.samples,visual=samples.map{$0["visualMs"] as! Double};XCTAssertEqual(visual.count,30);XCTAssertTrue(visual.allSatisfy{$0<=500})
        let report:[String:Any]=["profile":["os":ProcessInfo.processInfo.operatingSystemVersionString,"architecture":"arm64","processors":ProcessInfo.processInfo.processorCount,"physicalMemoryBytes":ProcessInfo.processInfo.physicalMemory,"appVersion":"0.1.0","appActiveAtReport":NSApp.isActive,"windowVisible":shell.window.isVisible,"measurement":"Command admission through NSWindow.displayIfNeeded native loading frame; compositor presentation is not directly instrumented","coldAppStartup":"not measured","readiness":"Framework checkpoint; not exact compositor presentation; input activation is measured separately","backend":"SLOW has no backend dependency"],"rawLaunches":samples,"rawFocusAndCancelMs":escapeSamples,"visualMisses":visual.filter{$0>500},"maximumVisualMs":visual.max()!,"largeBlobCycles":3,"blobBytesPerCycle":32*1024*1024,"releasedWebViews":released,"releasedInvocationObjects":released,"retainedActive":0,"allocatorRSSClaim":"none"]
        let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:root.appendingPathComponent("verification/native-benchmark.json"))
    }
}
