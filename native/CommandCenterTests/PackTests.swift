import XCTest
import WebKit
@testable import CommandCenter

@MainActor final class PackTests:XCTestCase {
    var directory:URL!
    var process:Process!
    var shell:Shell!
    override func setUpWithError() throws {
        directory=FileManager.default.temporaryDirectory.appendingPathComponent("cc pack native "+UUID().uuidString)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        process=Process();process.executableURL=Bundle.main.resourceURL!.appendingPathComponent("runtime/node")
        process.arguments=[Bundle.main.resourceURL!.appendingPathComponent("backend.mjs").path,"--data-dir",directory.path,"--port","0"]
        process.standardOutput=FileHandle.nullDevice;process.standardError=FileHandle.nullDevice;try process.run()
        shell=Shell(backend:Backend(directory:directory))
        try requireForegroundWebKit(shell.window)
    }
    override func tearDownWithError() throws {
        shell.cancel();shell.collector.flush();shell.window.orderOut(nil);shell=nil
        if process.isRunning{process.terminate();process.waitUntilExit()};try FileManager.default.removeItem(at:directory)
    }
    func waitFor(_ condition:@escaping()->Bool) async throws {
        let deadline=Date().addingTimeInterval(20)
        while !condition(){if Date()>deadline{throw NSError(domain:"Pack test timeout: \(shell.status.stringValue)",code:1)};try await Task.sleep(nanoseconds:10_000_000)}
    }
    func waitJS(_ expression:String) async throws {
        let deadline=Date().addingTimeInterval(20)
        while (try await shell.web!.evaluateJavaScript(expression) as? Bool) != true {if Date()>deadline{throw NSError(domain:"Pack DOM timeout",code:1)};try await Task.sleep(nanoseconds:20_000_000)}
    }
    func manage(_ action:String,id:String?=nil,source:String?=nil) async throws {
        let body:[String:Any]=await withCheckedContinuation{continuation in shell.managePack(action,id:id,source:source){continuation.resume(returning:$0)}}
        if body["ok"] as? Bool != true{throw NSError(domain:"Pack management failed: \(body["error"] ?? "unknown")",code:1)}
    }
    func launch(_ command:String){shell.command.stringValue=command;shell.execute()}

    // REQ-PK-001/002/005/007/008: actual installed WebKit document, worker and Apply.
    func testInstallApplyRelaunchAndRunWithoutSourceFolder() async throws {
        try await waitFor{FileManager.default.fileExists(atPath:self.directory.appendingPathComponent("connection.json").path)}
        let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let source=directory.appendingPathComponent("editable pack")
        try FileManager.default.copyItem(at:root.appendingPathComponent("examples/notes-pack"),to:source)
        let ui=source.appendingPathComponent("ui.tsx")
        var code=try String(contentsOf:ui,encoding:.utf8)
        code=code.replacingOccurrences(of:"if(tail.trim())throw new Error('NOTES takes no arguments');",with:"")
        try code.write(to:ui,atomically:true,encoding:.utf8)
        try await manage("add",source:source.path)
        XCTAssertFalse(shell.entries.contains{$0.0=="NOTES"})
        XCTAssertFalse(shell.functionToolbar.subviews.contains{$0.identifier?.rawValue=="function:NOTES"})
        launch("SLOW 0 NAV");try await waitFor{self.shell.active?.phase == .interactive};let unrelated=shell.active!.id
        try await manage("apply",id:"example.notes");XCTAssertEqual(shell.active?.id,unrelated)
        XCTAssertTrue(shell.entries.contains{$0.0=="NOTES"})
        XCTAssertTrue(shell.functionToolbar.subviews.contains{$0.identifier?.rawValue=="function:NOTES"})
        launch("NOTES EXTRA");shell.append("discard this draft");try await waitFor{self.shell.active?.phase == .interactive}
        let draft=try await shell.web!.evaluateJavaScript("document.querySelector('textarea').value") as? String;XCTAssertEqual(draft,"discard this draft")
        code=code.replacingOccurrences(of:"Installed from an independent folder",with:"Updated independently")
        try code.write(to:ui,atomically:true,encoding:.utf8)
        try await manage("build",id:"example.notes")
        try await waitFor{
            guard let data=try? Data(contentsOf:self.directory.appendingPathComponent("packs/registry.json")),let rows=try? JSONSerialization.jsonObject(with:data) as? [[String:Any]] else{return false}
            return rows.first?["status"] as? String=="ready"
        }
        try await manage("apply",id:"example.notes");try await waitFor{self.shell.active?.phase == .interactive}
        XCTAssertEqual(shell.command.stringValue,"NOTES");XCTAssertEqual(shell.active?.tail,"")
        let cleared=try await shell.web!.evaluateJavaScript("document.querySelector('textarea').value") as? String;XCTAssertEqual(cleared,"")
        try await waitJS("document.body.textContent.includes('Updated independently')")
        try FileManager.default.moveItem(at:source,to:directory.appendingPathComponent("source unavailable"))
        launch("NOTES");shell.append("Persisted without checkout");try await waitFor{self.shell.active?.phase == .interactive}
        _=try await shell.web!.evaluateJavaScript("document.querySelector('form').requestSubmit()")
        try await waitJS("document.querySelector('p[data-nav-item]')?.textContent==='Persisted without checkout'")
    }

    // REQ-ST-001: command focus does not delay readiness or steal native focus.
    func testReadinessCompletesWhileOperatorKeepsCommandFocus() async throws {
        launch("SLOW 0");shell.focusCommand()
        try await waitFor{self.shell.active?.viewReady == true}
        XCTAssertTrue(shell.commandFocused);XCTAssertFalse(shell.active!.ownsInput);XCTAssertTrue(shell.active!.measurement!.finished)
        let elapsed=shell.active!.measurement!.snapshot["elapsedMs"] as! Double
        try await Task.sleep(nanoseconds:600_000_000)
        XCTAssertEqual(shell.active!.measurement!.snapshot["elapsedMs"] as! Double,elapsed)
        shell.resumeFunction();try await waitFor{self.shell.active?.phase == .interactive}
    }

    // REQ-ST-002/003/004: a deliberate blocked transition is readable through STRAG.
    func testForcedStragglerIsRecordedAndBrowsable() async throws {
        try await waitFor{FileManager.default.fileExists(atPath:self.directory.appendingPathComponent("connection.json").path)}
        launch("SLOW 600");shell.append("still delivered");try await waitFor{self.shell.active?.phase == .interactive}
        XCTAssertTrue(shell.active!.measurement!.straggler);shell.collector.flush()
        let value=try await shell.web!.evaluateJavaScript("document.querySelector('[name=title]').value") as? String;XCTAssertEqual(value,"still delivered")
        launch("STRAG");try await waitFor{self.shell.active?.phase == .interactive}
        try await waitJS("Array.from(document.querySelectorAll('tbody tr')).some(row=>row.textContent.includes('SLOW'))")
        _=try await shell.web!.evaluateJavaScript("document.querySelector('tbody button').click()")
        try await waitFor{self.shell.active?.entryDepth==2 && self.shell.active?.phase == .interactive}
        try await waitJS("document.body.textContent.includes('Straggler detected')")
    }
}
