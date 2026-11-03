import XCTest
import WebKit
@testable import CommandCenter

private final class ReadinessMessages:NSObject,WKScriptMessageHandler {
    var ready:[String:Any]?
    func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage){
        if let body=message.body as? [String:Any],body["kind"] as? String == "viewReady"{ready=body}
    }
}

@MainActor final class StragglerTests:XCTestCase {
    // REQ-ST-001/002/003: deterministic policy checks, independent of machine speed.
    func testDeadlineRecordsOnceAndCompletionUpdatesSameRecord() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("cc-diagnostics-"+UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:directory)}
        let collector=DiagnosticsCollector(directory:directory);var now=10.0,notices=0
        let trace=TransitionMeasurement(mnemonic:"SLOW",command:"SLOW 600",kind:"launch",token:"root",packId:"cc.system",functionId:"slow",revision:"fixture",collector:collector,foreground:{true},clock:{now},scheduleDeadline:false)
        trace.onStraggler={notices+=1}
        now=10.49;trace.checkBudget();XCTAssertFalse(trace.straggler)
        now=10.6;trace.checkBudget();trace.checkBudget();XCTAssertEqual(notices,1);XCTAssertFalse(trace.finished)
        now=10.8;trace.finish("ready",phases:["nativeReadyMs":800]);trace.finish("canceled");collector.flush()
        let files=try FileManager.default.contentsOfDirectory(at:collector.directory,includingPropertiesForKeys:nil);XCTAssertEqual(files.count,1)
        let value=try JSONSerialization.jsonObject(with:Data(contentsOf:files[0])) as! [String:Any]
        XCTAssertEqual(value["outcome"] as? String,"ready");XCTAssertEqual(value["straggler"] as? Bool,true);XCTAssertEqual(value["elapsedMs"] as! Double,800,accuracy:0.001)
        XCTAssertNil(value["bufferedInput"]);XCTAssertNil(value["payload"])
    }
    func testCanceledFastTransitionIsNotAStraggler() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("cc-diagnostics-"+UUID().uuidString);defer{try? FileManager.default.removeItem(at:directory)}
        let collector=DiagnosticsCollector(directory:directory);var now=0.0
        let trace=TransitionMeasurement(mnemonic:"SLOW",command:"SLOW",kind:"back",token:"transition-1",packId:"cc.system",functionId:"slow",revision:"fixture",collector:collector,foreground:{true},clock:{now},scheduleDeadline:false)
        now=0.1;trace.finish("canceled");now=5;trace.checkBudget();XCTAssertFalse(trace.straggler);collector.flush()
    }

    // REQ-ST-002/004: visibility eligibility is permanent; raw timing never pauses.
    func testBackgroundStartAndBriefForegroundLossStayExcluded() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("cc-diagnostics-"+UUID().uuidString);defer{try? FileManager.default.removeItem(at:directory)}
        let collector=DiagnosticsCollector(directory:directory)
        for initiallyForeground in [false,true] {
            var now=0.0,foreground=initiallyForeground,notices=0
            let trace=TransitionMeasurement(mnemonic:"SLOW",command:"SLOW",kind:"push",token:"child",packId:"cc.system",functionId:"slow",revision:"fixture",collector:collector,foreground:{foreground},clock:{now},scheduleDeadline:false)
            trace.onStraggler={notices+=1}
            now=0.1;foreground=false;trace.observeVisibility()
            now=0.2;foreground=true;trace.observeVisibility()
            now=3;trace.checkBudget();trace.finish("ready")
            XCTAssertFalse(trace.sloEligible);XCTAssertFalse(trace.straggler);XCTAssertEqual(notices,0)
            XCTAssertEqual(trace.snapshot["elapsedMs"] as! Double,3000,accuracy:0.001)
            collector.flush()
            let saved=try JSONSerialization.jsonObject(with:Data(contentsOf:collector.directory.appendingPathComponent(trace.id+".json"))) as! [String:Any]
            XCTAssertEqual(saved["sloEligible"] as? Bool,false);XCTAssertEqual(saved["outcome"] as? String,"ready")
        }
    }

    func testVisibilityIsRecheckedAtDeadlineAndCompletion() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("cc-diagnostics-"+UUID().uuidString);defer{try? FileManager.default.removeItem(at:directory)}
        let collector=DiagnosticsCollector(directory:directory)
        for complete in [false,true] {
            var now=0.0,foreground=true
            let trace=TransitionMeasurement(mnemonic:"SLOW",command:"SLOW",kind:"back",token:"root",packId:"cc.system",functionId:"slow",revision:"fixture",collector:collector,foreground:{foreground},clock:{now},scheduleDeadline:false)
            now=1;foreground=false // Notification delivery can lag; sampling still catches it.
            if complete{trace.finish("ready")}else{trace.checkBudget();foreground=true;trace.finish("canceled")}
            XCTAssertFalse(trace.sloEligible);XCTAssertFalse(trace.straggler)
        }
        collector.flush()
    }

    func testDetectedStragglerSurvivesSwitchAwayAndDoesNotRepeatNotice() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("cc-diagnostics-"+UUID().uuidString);defer{try? FileManager.default.removeItem(at:directory)}
        let collector=DiagnosticsCollector(directory:directory);var now=0.0,foreground=true,notices=0
        let trace=TransitionMeasurement(mnemonic:"SLOW",command:"SLOW",kind:"replace",token:"root",packId:"cc.system",functionId:"slow",revision:"fixture",collector:collector,foreground:{foreground},clock:{now},scheduleDeadline:false)
        trace.onStraggler={notices+=1};now=0.6;trace.checkBudget()
        foreground=false;trace.observeVisibility();now=5;trace.checkBudget();trace.finish("ready");collector.flush()
        XCTAssertTrue(trace.straggler);XCTAssertTrue(trace.sloEligible);XCTAssertEqual(notices,1)
        XCTAssertEqual(trace.snapshot["sloEligible"] as? Bool,true)
    }

    func testShellForwardsApplicationAndWindowVisibilityEvents() throws {
        let shell=Shell(backend:isolatedBackend());defer{shell.cancel();shell.collector.flush();shell.window.orderOut(nil);SDKRuntimeCache.queue.sync{};try? FileManager.default.removeItem(at:shell.backend.directory)}
        let invocation=Invocation("SLOW","",commandText:"SLOW");shell.active=invocation
        for (name,object) in [(NSApplication.didResignActiveNotification,NSApp as AnyObject),(NSWindow.didChangeOcclusionStateNotification,shell.window as AnyObject)] {
            var foreground=true
            let trace=TransitionMeasurement(mnemonic:"SLOW",command:"SLOW",kind:"launch",token:"root",packId:"cc.system",functionId:"slow",revision:"fixture",collector:shell.collector,foreground:{foreground},scheduleDeadline:false)
            invocation.measurement=trace;foreground=false
            NotificationCenter.default.post(name:name,object:object)
            XCTAssertFalse(trace.sloEligible);foreground=true;trace.finish("canceled")
        }
    }

    // A controlled frame scheduler tests the real SDK without pretending a hidden window rendered.
    func testReadinessWaitsForFrameInsteadOfTimer() async throws {
        let messages=ReadinessMessages(),config=WKWebViewConfiguration()
        config.setURLSchemeHandler(Assets(directory:Bundle.main.resourceURL!.appendingPathComponent("functions/slow/web")),forURLScheme:"commandcenter")
        config.userContentController.add(messages,name:"commandCenter")
        config.userContentController.addUserScript(WKUserScript(source:"window.requestAnimationFrame=callback=>{window.__testFrame=callback;return 1;};window.cancelAnimationFrame=()=>{window.__testFrame=null;};",injectionTime:.atDocumentStart,forMainFrameOnly:true))
        let web=FunctionWebView(frame:NSRect(x:0,y:0,width:900,height:600),configuration:config)
        defer{web.stopLoading();config.userContentController.removeScriptMessageHandler(forName:"commandCenter")}
        web.load(URLRequest(url:URL(string:"commandcenter://app/index.html?function=SLOW&tail=0")!))
        let deadline=Date().addingTimeInterval(8)
        while (try? await web.evaluateJavaScript("typeof window.__testFrame==='function'") as? Bool) != true {
            if Date()>deadline{throw NSError(domain:"SDK did not schedule its frame checkpoint",code:1)}
            try await Task.sleep(nanoseconds:10_000_000)
        }
        try await Task.sleep(nanoseconds:250_000_000)
        XCTAssertNil(messages.ready,"A timer must not acknowledge readiness without a frame")
        _=try await web.evaluateJavaScript("window.__testFrame(performance.now());true")
        while messages.ready == nil {
            if Date()>deadline{throw NSError(domain:"SDK did not acknowledge the released frame",code:1)}
            try await Task.sleep(nanoseconds:10_000_000)
        }
        XCTAssertEqual(messages.ready?["renderOpportunity"] as? String,"frame")
    }
}
