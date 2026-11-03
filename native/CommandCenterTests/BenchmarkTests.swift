import XCTest
import WebKit
@testable import CommandCenter

private final class BundleReadyBridge:NSObject,WKScriptMessageHandler {
    var readyAt:Double?
    var message=[String:Any]()
    var failure:String?
    func userContentController(_ controller:WKUserContentController,didReceive event:WKScriptMessage) {
        guard event.frameInfo.isMainFrame,let body=event.body as? [String:Any] else{return}
        if body["kind"] as? String == "viewReady",readyAt == nil {readyAt=ProcessInfo.processInfo.systemUptime;message=body}
        if body["kind"] as? String == "error" {failure=body["message"] as? String ?? "Framework startup failed"}
        if body["kind"] as? String == "rpc" {failure="SLOW 0 benchmark unexpectedly requested a backend operation"}
    }
}

@MainActor final class BenchmarkTests: XCTestCase {
    func waitFor(_ condition:@escaping()->Bool) async throws {
        let limit=Date().addingTimeInterval(10)
        while !condition(){if Date()>limit{throw NSError(domain:"Benchmark timeout",code:1)};try await Task.sleep(nanoseconds:10_000_000)}
    }
    // REQ-SH-006/011, REQ-FF-006: raw samples, foreground native render flush and ownership.
    func testWarmLaunchSamplesAndRepeatedDisposal() async throws {
        let shell=Shell(backend:isolatedBackend());defer{shell.cancel();shell.collector.flush();try? FileManager.default.removeItem(at:shell.backend.directory);shell.window.orderOut(nil)}
        try requireForegroundWebKit(shell.window)
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

    // Opt-in experiment. The script provides paired builds and consumes a one-shot request.
    // Timing includes real assets, WebKit module parsing/evaluation and the actual SDK checkpoint.
    func testBundleMinificationComparison() async throws {
        let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent(".work/bundle-benchmark")
        let request=root.appendingPathComponent("request.json")
        guard FileManager.default.fileExists(atPath:request.path) else{throw XCTSkip("Run npm run benchmark:bundles for the opt-in comparison")}
        try FileManager.default.removeItem(at:request)
        let window=NSWindow(contentRect:NSRect(x:0,y:0,width:1200,height:720),styleMask:[.titled,.closable],backing:.buffered,defer:false)
        window.title="CommandCenter · Bundle load comparison";window.center();window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
        defer{window.orderOut(nil)}
        try requireForegroundWebKit(window)
        var warmups=[[String:Any]](),samples=[[String:Any]](),sequence=0
        func launch(_ variant:String) async throws -> [String:Any] {
            guard NSApp.isActive && window.occlusionState.contains(.visible) else{throw XCTSkip("Bundle comparison interrupted: test window lost foreground visibility")}
            sequence+=1
            // Unique script URLs avoid reusing the same URL's compiled module between samples.
            let directory=root.appendingPathComponent("launch-\(sequence)")
            try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
            let original=root.appendingPathComponent(variant)
            for file in try FileManager.default.contentsOfDirectory(atPath:original.path) {
                try FileManager.default.linkItem(at:original.appendingPathComponent(file),to:directory.appendingPathComponent(file))
            }
            defer{try? FileManager.default.removeItem(at:directory)}
            let bridge=BundleReadyBridge(),start=ProcessInfo.processInfo.systemUptime
            let config=WKWebViewConfiguration();config.setURLSchemeHandler(Assets(directory:root),forURLScheme:"commandcenter")
            config.userContentController.add(bridge,name:"commandCenter")
            let web=FunctionWebView(frame:window.contentView!.bounds,configuration:config)
            web.autoresizingMask=[.width,.height];window.contentView!.addSubview(web)
            defer{web.stopLoading();config.userContentController.removeScriptMessageHandler(forName:"commandCenter");web.removeFromSuperview()}
            web.load(URLRequest(url:URL(string:"commandcenter://app/launch-\(sequence)/index.html?function=SLOW&tail=0")!))
            let deadline=start+15
            while bridge.readyAt == nil {
                guard NSApp.isActive && window.occlusionState.contains(.visible) else{throw XCTSkip("Bundle comparison interrupted: test window lost foreground visibility")}
                if let failure=bridge.failure {throw NSError(domain:failure,code:1)}
                if ProcessInfo.processInfo.systemUptime>deadline {throw NSError(domain:"Bundle benchmark timed out",code:1)}
                try await Task.sleep(nanoseconds:1_000_000)
            }
            guard bridge.message["renderOpportunity"] as? String == "frame",bridge.message["visibility"] as? String == "visible" else{throw XCTSkip("Bundle comparison requires a visible frame checkpoint")}
            return ["variant":variant,"readyMs":(bridge.readyAt!-start)*1000,"renderOpportunity":bridge.message["renderOpportunity"] as? String ?? "unknown","documentVisibility":bridge.message["visibility"] as? String ?? "unknown","pagePhases":bridge.message["phases"] as? [String:Any] ?? [:],"appActive":NSApp.isActive,"windowOcclusionVisible":window.occlusionState.contains(.visible),"thermalState":ProcessInfo.processInfo.thermalState.rawValue]
        }
        for _ in 0..<2 {for variant in ["unminified","minified"] {warmups.append(try await launch(variant))}}
        for pair in 0..<30 {
            for variant in (pair%2==0 ? ["unminified","minified"] : ["minified","unminified"]) {samples.append(try await launch(variant))}
        }
        let report:[String:Any]=["profile":["os":ProcessInfo.processInfo.operatingSystemVersionString,"processors":ProcessInfo.processInfo.processorCount,"physicalMemoryBytes":ProcessInfo.processInfo.physicalMemory,"webView":"Fresh WKWebView per sample; default website data store, matching the app; WebKit-managed process reuse","assets":"Unique per-launch URLs, hard-linked prebuilt local files; warm filesystem"],"warmups":warmups,"samples":samples]
        try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:root.appendingPathComponent("result.json"))
        XCTAssertEqual(samples.count,60)
    }
}
