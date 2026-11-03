import XCTest
import AppKit
import WebKit
@testable import CommandCenter

// REQ-NV-010, REQ-NV-011, REQ-NV-012, REQ-SH-016: private fixtures and clipboard writer only.
@MainActor final class SelectionAndSiblingTests:XCTestCase {
    var shell:Shell!
    var copied=[String]()
    var context=""
    let viewport=activeEntryViewportScript
    override func setUpWithError() throws {
        shell=Shell(backend:isolatedBackend(),clipboardWriter:{[weak self] text in self?.copied.append(text);return true},externalOpener:{_ in false})
        try requireForegroundWebKit(shell.window)
    }
    override func tearDownWithError() throws {shell.cancel();shell.collector.flush();SDKRuntimeCache.queue.sync{};try? FileManager.default.removeItem(at:shell.backend.directory);shell.window.orderOut(nil);shell=nil;copied=[]}
    func js(_ code:String) async throws->Any? {try await shell.web!.evaluateJavaScript(code)}
    func waitFor(_ condition:@escaping()->Bool) async throws {
        let deadline=Date().addingTimeInterval(8)
        while !condition(){if Date()>deadline{XCTFail("Timed out \(context): phase=\(shell.active?.phase.rawValue ?? "empty") entry=\(shell.active?.entryID ?? "empty")");throw NSError(domain:"SiblingTimeout",code:1)};try await Task.sleep(nanoseconds:10_000_000)}
    }
    func waitJS(_ code:String) async throws {
        let deadline=Date().addingTimeInterval(8)
        while (try await js(code) as? Bool) != true {if Date()>deadline{XCTFail("JS condition timed out: \(code)");throw NSError(domain:"SiblingJSTimeout",code:1)};try await Task.sleep(nanoseconds:10_000_000)}
    }
    func equalJS<T:Equatable>(_ code:String,_ expected:T) async throws {let actual=try await js(code) as? T;XCTAssertEqual(actual,expected)}
    func launch(_ command:String) async throws {shell.command.stringValue=command;shell.execute();try await waitFor({self.shell.active?.phase == .interactive})}
    func key(_ characters:String,code:UInt16,flags:NSEvent.ModifierFlags,repeatKey:Bool=false){
        for type in [NSEvent.EventType.keyDown,.keyUp]{
            let event=NSEvent.keyEvent(with:type,location:.zero,modifierFlags:flags,timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:shell.window.windowNumber,context:nil,characters:characters,charactersIgnoringModifiers:characters,isARepeat:repeatKey,keyCode:code)!
            NSApp.sendEvent(event)
        }
    }


    func testLoadingStepsDoNotQueueAndFailureStillHasBack() async throws {
        try await launch("SLOW 0 NAV")
        _=try await js("\(viewport).querySelector('[data-slow-sequence]').click()")
        try await waitFor({self.shell.active?.phase == .interactive && self.shell.active?.entryDepth==2})
        let first=shell.active!.entryID;shell.nextSibling();shell.nextSibling();shell.nextSibling()
        try await waitFor({self.shell.active?.entryID != first && self.shell.active?.phase == .resolving})
        XCTAssertFalse(shell.nextButton.isEnabled)
        _=try await js("window.commandCenterHost.step(1);window.commandCenterHost.step(1)")
        try await waitFor({self.shell.active?.phase == .interactive});XCTAssertEqual(shell.active?.siblingIndex,2)
        let second=shell.active!.entryID
        _=try await js("\(viewport).querySelector('[data-slow-child-replace]').click();void 0")
        try await waitFor({self.shell.active?.entryID != second && self.shell.active?.phase == .interactive})
        XCTAssertTrue(shell.nextButton.isHidden);XCTAssertEqual(shell.active?.entryDepth,2)
        shell.pointerBack();try await waitFor({self.shell.active?.entryDepth==1 && self.shell.active?.phase == .interactive})
        _=try await js("\(viewport).querySelector('[data-slow-sequence-fail]').click()")
        try await waitFor({self.shell.active?.entryDepth==2 && self.shell.active?.phase == .interactive})
        shell.nextSibling();try await waitFor({self.shell.active?.phase == .error})
        XCTAssertTrue(shell.backButton.isEnabled);XCTAssertFalse(shell.nextButton.isEnabled)
        shell.pointerBack();try await waitFor({self.shell.active?.entryDepth==1 && self.shell.active?.phase == .interactive})
    }
    func testClipboardBridgeRejectsStalePrematureAndOversizedText() async throws {
        shell.command.stringValue="SLOW 300 NAV";shell.execute();let generation=shell.active!.id
        shell.message(["kind":"copySelection","entryId":"root","text":"premature"],generation:generation);XCTAssertTrue(copied.isEmpty)
        try await waitFor({self.shell.active?.phase == .interactive})
        shell.message(["kind":"copySelection","entryId":"old","text":"covered"],generation:generation)
        shell.message(["kind":"copySelection","entryId":"root","text":""],generation:generation)
        shell.message(["kind":"copySelection","entryId":"root","text":String(repeating:"界",count:700000)],generation:generation)
        XCTAssertTrue(copied.isEmpty);XCTAssertTrue(shell.status.stringValue.contains("limit"))
        shell.message(["kind":"copySelection","entryId":"root","text":"Bazinator Ω"],generation:generation)
        XCTAssertEqual(copied,["Bazinator Ω"])
        shell.focusCommand();shell.message(["kind":"copySelection","entryId":"root","text":"paused"],generation:generation);XCTAssertEqual(copied.count,1)
        shell.cancel();shell.message(["kind":"copySelection","entryId":"root","text":"retired"],generation:generation);XCTAssertEqual(copied.count,1)
    }
    func testProgrammaticAndEditableSelectionsNeverAutoCopy() async throws {
        try await launch("SLOW 0 NAV")
        _=try await js("var p=\(viewport).querySelector('[data-copy-fixture]'),range=document.createRange();range.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(range);void 0")
        try await Task.sleep(nanoseconds:60_000_000);XCTAssertTrue(copied.isEmpty)
        _=try await js("var input=\(viewport).querySelector('[name=title]');input.value='editable fixture';input.focus();input.select();input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,shiftKey:true,key:'ArrowLeft'}));input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'ArrowLeft'}));void 0")
        key("\u{F702}",code:123,flags:.shift)
        shell.window.selectAllAndCopy(nil)
        try await Task.sleep(nanoseconds:60_000_000);XCTAssertTrue(copied.isEmpty)
        // Synthetic completion events must not authorize copying even with a selected display range.
        _=try await js("var p=\(viewport).querySelector('[data-copy-fixture]');p.focus();getSelection().selectAllChildren(p);p.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));void 0")
        try await Task.sleep(nanoseconds:60_000_000);XCTAssertTrue(copied.isEmpty)
    }
    func pointerClick(_ selector:String,count:Int=1) async throws {
        // Native mouse selection requires the test window, rather than another app, to be active.
        NSApp.activate(ignoringOtherApps:true);shell.window.makeKeyAndOrderFront(nil)
        _=try await js("document.querySelector('\(selector)').scrollIntoView({block:'center'});void 0")
        let rect=try await js("(()=>{var r=document.querySelector('\(selector)').getBoundingClientRect();return [r.x,r.y,r.height]})()") as! [Double]
        let y=shell.web!.isFlipped ? rect[1]+rect[2]/2 : shell.web!.bounds.height-rect[1]-rect[2]/2
        let point=shell.web!.convert(NSPoint(x:rect[0]+20,y:y),to:nil)
        for type in [NSEvent.EventType.leftMouseDown,.leftMouseUp] {
            let event=NSEvent.mouseEvent(with:type,location:point,modifierFlags:[],timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:shell.window.windowNumber,context:nil,eventNumber:0,clickCount:count,pressure:1)!
            NSApp.sendEvent(event)
        }
    }
    func testActualWebKitPointerAndNativeSelectAllCopiesPlainText() async throws {
        try await launch("SLOW 0 NAV")
        try await pointerClick("[data-copy-fixture]",count:2)
        context="pointer selection"
        try await waitFor({!self.copied.isEmpty});XCTAssertEqual(copied.last,"Bazinator")
        copied=[]
        try await pointerClick("[data-copy-fixture]",count:2)
        try await waitFor({!self.copied.isEmpty});XCTAssertEqual(copied.last,"Bazinator")
        copied=[]
        try await pointerClick("form button")
        try await Task.sleep(nanoseconds:80_000_000);XCTAssertTrue(copied.isEmpty)
        // Read-only documents support native Select All; ordinary Shift-arrow
        // caret movement is not a selection mechanism without caret browsing.
        try await launch("SLOW 0 READONLY")
        let selectAll=NSApp.mainMenu?.items.compactMap{$0.submenu}.flatMap{$0.items}.first{$0.title=="Select All"}
        XCTAssertEqual(selectAll?.keyEquivalent,"a");XCTAssertEqual(selectAll?.action,NSSelectorFromString("selectAllAndCopy:"))
        shell.window.selectAllAndCopy(nil)
        context="native Select All action"
        try await waitFor({!self.copied.isEmpty})
        XCTAssertTrue(copied.last?.contains("Bazinator")==true)
        copied=[]
        _=try await js("getSelection().removeAllRanges();void 0")
        try await Task.sleep(nanoseconds:50_000_000);XCTAssertTrue(copied.isEmpty)
    }
    func testClipboardWriteFailureIsVisibleAndPlainNativePasteboardWorks() async throws {
        shell.cancel();shell.window.orderOut(nil)
        let pasteboard=NSPasteboard.withUniqueName()
        defer{pasteboard.releaseGlobally()}
        shell=Shell(backend:isolatedBackend(),clipboardWriter:{value in pasteboard.clearContents();return pasteboard.setString(value,forType:.string)})
        try await launch("SLOW 0")
        shell.message(["kind":"copySelection","entryId":"root","text":"Native Ω fixture"],generation:shell.active!.id)
        XCTAssertEqual(pasteboard.string(forType:.string),"Native Ω fixture");XCTAssertTrue(pasteboard.types?.contains(.string)==true);XCTAssertNil(pasteboard.data(forType:.html));XCTAssertNil(pasteboard.data(forType:.rtf))
        shell.cancel();shell.window.orderOut(nil)
        shell=Shell(backend:isolatedBackend(),clipboardWriter:{_ in false});try await launch("SLOW 0")
        shell.message(["kind":"copySelection","entryId":"root","text":"fixture"],generation:shell.active!.id)
        XCTAssertTrue(shell.status.stringValue.contains("Could not copy"))
    }
}
