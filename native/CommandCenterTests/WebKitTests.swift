import XCTest
import WebKit
@testable import CommandCenter

@MainActor final class WebKitTests: XCTestCase {
    var shell: Shell!
    var directory: URL!
    var process: Process!
    override func setUpWithError() throws {
        directory=FileManager.default.temporaryDirectory.appendingPathComponent("command-center-native-"+UUID().uuidString)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        process=Process();process.executableURL=Bundle.main.resourceURL!.appendingPathComponent("runtime/node")
        process.arguments=[Bundle.main.resourceURL!.appendingPathComponent("backend.mjs").path,"--data-dir",directory.path,"--port","0"]
        process.currentDirectoryURL=directory;process.standardOutput=FileHandle.nullDevice;process.standardError=FileHandle.nullDevice;try process.run()
        shell=Shell(backend:Backend(directory:directory))
    }
    override func tearDownWithError() throws {
        shell.cancel();shell.window.orderOut(nil);shell=nil
        if process.isRunning {process.terminate();process.waitUntilExit()};try FileManager.default.removeItem(at:directory)
    }
    func waitFor(_ condition: @escaping ()->Bool, seconds:Double=8) async throws {
        let limit=Date().addingTimeInterval(seconds)
        while !condition(){if Date()>limit{XCTFail("Condition timed out. Status: \(shell.status.stringValue)");throw NSError(domain:"Timeout",code:1)};try await Task.sleep(nanoseconds:10_000_000)}
    }
    func launch(_ command:String){shell.command.stringValue=command;shell.execute()}
    func js(_ code:String) async throws -> Any? { try await shell.web!.evaluateJavaScript(code) }
    func assertJS<T: Equatable>(_ code:String,_ expected:T) async throws { let value=try await js(code) as? T;XCTAssertEqual(value,expected) }
    func waitJS(_ code:String) async throws {
        let limit=Date().addingTimeInterval(8)
        while (try await js(code) as? Bool) != true {
            if Date()>limit {XCTFail("DOM condition timed out: \(code)");throw NSError(domain:"DOM timeout",code:1)}
            try await Task.sleep(nanoseconds:20_000_000)
        }
    }
    func readyService() async throws {try await waitFor({FileManager.default.fileExists(atPath:self.directory.appendingPathComponent("connection.json").path)})}
    // REQ-SH-006/007/008/013, REQ-FF-007/009: actual WebKit document and native buffer.
    func testRealWebKitBufferedSequenceAndSubmitRefusal() async throws {
        launch("SLOW 250");shell.append("the bazinator is broken in CI");shell.tab();shell.append("See the latest CI logs from repo ABC, you'll note that all jobs are failing on bazinator, pls advise")
        XCTAssertFalse(shell.active!.allowsMutation);XCTAssertFalse(shell.overlay.isHidden);XCTAssertTrue(shell.overlay.stringValue.contains("SLOW"))
        try await waitFor({self.shell.active?.phase == .interactive})
        let values=try await js("[document.querySelector('[name=title]').value,document.querySelector('[name=body]').value,document.activeElement.name]") as! [String]
        XCTAssertEqual(values,["the bazinator is broken in CI","See the latest CI logs from repo ABC, you'll note that all jobs are failing on bazinator, pls advise","body"])
        XCTAssertGreaterThan(shell.web!.frame.width,900);XCTAssertGreaterThan(shell.web!.frame.height,300)
        XCTAssertLessThan(shell.samples[0]["visualMs"] as! Double,500)
        try await assertJS("document.querySelector('output')===null",true)
    }
    // REQ-SH-004/007/008/014: first Escape is focus only, completion cannot steal focus.
    func testEscapePausesLoadingThenResumeAndCancel() async throws {
        launch("SLOW 200");let id=shell.active!.id;shell.append("kept draft");shell.escape()
        XCTAssertTrue(shell.commandFocused);XCTAssertEqual(shell.active?.id,id);XCTAssertEqual(shell.active?.pending.segments,["kept draft"])
        try await waitFor({self.shell.active?.viewReady == true});XCTAssertTrue(shell.commandFocused);XCTAssertFalse(shell.active!.focused)
        shell.resumeFunction();try await waitFor({self.shell.active?.phase == .interactive});try await assertJS("document.querySelector('[name=title]').value","kept draft")
        shell.escape();XCTAssertNotNil(shell.active);XCTAssertTrue(shell.commandFocused);shell.escape();XCTAssertNil(shell.active);XCTAssertNil(shell.web)
    }
    func testLateLaunchCannotClaimCurrentGenerationAndFreshState() async throws {
        launch("SLOW 1000");let old=shell.active!.id;weak var oldWeb=shell.web;shell.append("discard me");shell.cancel();launch("SLOW 0")
        let current=shell.active!.id;XCTAssertNotEqual(old,current);shell.message(["kind":"viewReady"],generation:old);shell.message(["kind":"error","message":"stale"],generation:old)
        try await waitFor({self.shell.active?.phase == .interactive});try await assertJS("document.querySelector('[name=title]').value","")
        try await waitFor({oldWeb == nil});XCTAssertEqual(shell.content.subviews.filter{$0 is WKWebView}.count,1)
        shell.cancel();XCTAssertEqual(shell.content.subviews.filter{$0 is WKWebView}.count,0)
    }
    func testFocusFailuresAndUnsupportedTabAreExplicit() async throws {
        for tail in ["NOFOCUS","TWOFOCUS","HIDDEN","DISABLED","FAIL","RENDERFAIL"] {
            launch("SLOW 0 "+tail);try await waitFor({self.shell.active?.phase == .error});XCTAssertTrue(shell.overlay.stringValue.contains("ERROR"));shell.cancel()
        }
        launch("SLOW 100");shell.tab();shell.tab();try await waitFor({self.shell.active?.phase == .error});XCTAssertTrue(shell.overlay.stringValue.contains("unsupported"))
    }
    // REQ-DR-005/006/007/009, REQ-BW-008: actual UI form -> native proxy -> isolated worker.
    func testDRQSAdd42SubmitHistoryAndRefreshKeepsDraft() async throws {
        try await readyService();launch("DRQS A 42");shell.append("Native integration report");shell.tab();shell.append("Literal evidence <script>window.bad=true</script>")
        try await waitFor({self.shell.active?.phase == .interactive})
        try await assertJS("document.querySelector('[name=group]').value","42")
        // Screen readiness is independent of the directory/identity reads needed to submit.
        try await waitJS("document.querySelector('form .actions button')?.disabled === false")
        _=try await js("document.querySelector('form').requestSubmit()")
        try await waitJS("!!document.querySelector('[name=comment]') && document.querySelector('form.update > button')?.disabled === false")
        try await waitFor({self.shell.web != nil && self.shell.active?.phase == .interactive})
        try await assertJS("window.bad===undefined",true)
        _=try await js("document.querySelector('[name=comment]').value='draft comment';document.querySelector('.section-heading button').click()")
        try await Task.sleep(nanoseconds:150_000_000)
        try await assertJS("document.querySelector('[name=comment]').value","draft comment")
        _=try await js("document.querySelector('[name=state]').value='N';document.querySelector('[name=owner]').value='owner@example.com';document.querySelector('form').requestSubmit()")
        try await waitJS("document.querySelectorAll('.history section').length === 1 && document.querySelector('[name=comment]')?.value === ''")
        try await assertJS("document.querySelectorAll('.history section').length",1)
        try await assertJS("document.querySelector('[name=comment]').value","")
    }
    func testReadOnlyHOSTAndUndeliverableText() async throws {
        try await readyService();launch("HOST");try await waitFor({self.shell.active?.phase == .interactive},seconds:15)
        try await assertJS("document.activeElement.classList.contains('host')",true)
        for _ in 0..<500 {if (try await js("!!document.querySelector('.service-layout .link')") as? Bool)==true{break};try await Task.sleep(nanoseconds:20_000_000)}
        _=try await js("document.querySelector('.service-layout .link').click();document.querySelector('.function-header button').focus();document.querySelector('.function-header button').click()")
        var refreshed=false
        for _ in 0..<500 {refreshed=(try await js("document.querySelector('.host').getAttribute('aria-busy')==='false'") as? Bool)==true;if refreshed{break};try await Task.sleep(nanoseconds:20_000_000)}
        XCTAssertTrue(refreshed)
        try await assertJS("document.querySelectorAll('.service-layout tr.selected').length",1)
        try await assertJS("document.activeElement===document.querySelector('.function-header button')",true)
        launch("HOST");shell.append("undeliverable");try await waitFor({self.shell.active?.phase == .error},seconds:15)
        XCTAssertTrue(shell.overlay.stringValue.contains("Queued text"))
    }

    func testAcceptedMutationSurvivesRetirementAndLateBridgeIsRefused() async throws {
        try await readyService();launch("SLOW 0");try await waitFor({self.shell.active?.phase == .interactive})
        let id=shell.active!.id
        let input:[String:Any]=["title":"Accepted before cancel","body":"Independent persisted work","group":42,"actor":["kind":"agent","id":"native-test"],"requesters":[["kind":"employee","id":"test@example.com"]]]
        shell.message(["kind":"rpc","entryId":"root","id":100,"function":"DRQS","operation":"create","input":input],generation:id)
        shell.cancel()
        shell.message(["kind":"rpc","entryId":"root","id":101,"function":"DRQS","operation":"create","input":input],generation:id)
        var records=[[String:Any]]()
        for _ in 0..<100 {
            let result=await withCheckedContinuation { continuation in shell.backend.request(["function":"DRQS","operation":"list","input":[:]]){continuation.resume(returning:$0)} }
            records=result["result"] as? [[String:Any]] ?? []
            if !records.isEmpty {break};try await Task.sleep(nanoseconds:10_000_000)
        }
        XCTAssertEqual(records.count,1);XCTAssertNil(shell.active);XCTAssertNil(shell.web)
    }


    func testInputArrivingDuringDrainPausesAndResumesWithoutDuplicates() async throws {
        launch("SLOW 0");shell.append("prefix");shell.escape()
        try await waitFor({self.shell.active?.viewReady == true})
        // Hold WebKit briefly while native input continues, forcing a second pending batch.
        shell.web!.evaluateJavaScript("{ const until = performance.now()+150; while(performance.now()<until){}; }") {_,_ in}
        shell.resumeFunction();XCTAssertTrue(shell.active!.inFlight)
        shell.append(" suffix");shell.tab();shell.append("body");shell.escape()
        try await waitFor({self.shell.active?.inFlight == false})
        XCTAssertTrue(shell.commandFocused);XCTAssertEqual(shell.active!.pending.segments,[" suffix","body"])
        shell.resumeFunction();try await waitFor({self.shell.active?.phase == .interactive})
        let values=try await js("[document.querySelector('[name=title]').value,document.querySelector('[name=body]').value]") as! [String]
        XCTAssertEqual(values,["prefix suffix","body"])
    }
    func testCommittedCompositionCannotFallBetweenBufferedAndDirectInput() async throws {
        launch("SLOW 100")
        shell.capture.setMarkedText("未確定",selectedRange:NSRange(location:3,length:0),replacementRange:NSRange(location:NSNotFound,length:0))
        try await waitFor({self.shell.active?.viewReady == true})
        try await Task.sleep(nanoseconds:100_000_000)
        XCTAssertNotEqual(shell.active?.phase,.interactive)
        shell.capture.insertText("確定",replacementRange:NSRange(location:NSNotFound,length:0))
        try await waitFor({self.shell.active?.phase == .interactive})
        try await assertJS("document.querySelector('[name=title]').value","確定")
    }
    func testPreReadyMutationRejectedBeforeBackendAdmission() async throws {
        try await readyService();launch("SLOW 500");let generation=shell.active!.id
        shell.message(["kind":"rpc","entryId":"root","id":99,"function":"DRQS","operation":"create","input":["title":"must not commit","body":"body","group":42]],generation:generation)
        let result=await withCheckedContinuation { continuation in shell.backend.request(["function":"DRQS","operation":"list","input":[:]]){continuation.resume(returning:$0)} }
        XCTAssertEqual((result["result"] as? [Any])?.count,0)
    }
}
