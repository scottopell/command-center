import XCTest
import WebKit
@testable import CommandCenter

// Per-test owner fixtures: no application service, private records or external browser calls.
@MainActor final class CommandBarTests: XCTestCase {
    var shell:Shell!
    var opened=[URL]()
    override func setUpWithError() throws {
        shell=Shell(backend:isolatedBackend(),externalOpener:{[weak self] url in self?.opened.append(url);return true})
        try requireForegroundWebKit(shell.window)
    }
    override func tearDownWithError() throws {shell.cancel();shell.collector.flush();try? SDKRuntimeCache.queue.sync{try FileManager.default.removeItem(at:shell.backend.directory)};shell.window.orderOut(nil);shell=nil;opened=[]}
    func waitFor(_ condition:@escaping()->Bool) async throws {
        let limit=Date().addingTimeInterval(8)
        while !condition(){if Date()>limit{XCTFail("Timed out: \(shell.status.stringValue)");throw NSError(domain:"Timeout",code:1)};try await Task.sleep(nanoseconds:10_000_000)}
    }
    func launch(_ command:String){shell.command.stringValue=command;shell.execute()}
    func js(_ code:String) async throws->Any?{try await shell.web!.evaluateJavaScript(code)}
    func equalJS<T:Equatable>(_ code:String,_ expected:T) async throws {let value=try await js(code) as? T;XCTAssertEqual(value,expected)}
    // REQ-SH-001/002/003/004: retained launch text is independent of handoff and explicit discovery.
    func testRetainedCommandAndInlineDiscoveryPreserveFunctionInput() async throws {
        XCTAssertEqual(shell.command.stringValue,"");XCTAssertNil(shell.command.placeholderAttributedString)
        shell.autocompleteButton.performClick(nil)
        XCTAssertTrue(shell.commandFocused);XCTAssertFalse(shell.suggestionPanel.isHidden)
        XCTAssertEqual(shell.suggestionMatches.count,shell.entries.count)
        shell.autocompleteButton.performClick(nil);XCTAssertTrue(shell.suggestionPanel.isHidden)
        launch("  slow 0 NAV  ")
        XCTAssertEqual(shell.command.stringValue,"SLOW 0 NAV")
        shell.append("buffered title");shell.tab();shell.append("buffered body")
        try await waitFor({self.shell.active?.phase == .interactive})
        try await equalJS("document.querySelector('[name=title]').value","buffered title")
        try await equalJS("document.querySelector('[name=body]').value","buffered body")
        XCTAssertEqual(shell.command.stringValue,"SLOW 0 NAV");XCTAssertNil(shell.command.placeholderAttributedString)
        let generation=shell.active!.id
        shell.escape();XCTAssertEqual(shell.active?.id,generation)
        XCTAssertEqual(shell.command.currentEditor()?.selectedRange,NSRange(location:0,length:10))
        XCTAssertTrue(shell.suggestionPanel.isHidden)
        let editor=shell.command.currentEditor() as! NSTextView
        XCTAssertTrue(shell.control(shell.command,textView:editor,doCommandBy:#selector(NSResponder.insertTab(_:))))
        XCTAssertFalse(shell.commandFocused);XCTAssertEqual(shell.active?.id,generation)
        shell.focusCommand()
        shell.autocompleteButton.performClick(nil)
        XCTAssertEqual(shell.command.stringValue,"SLOW 0 NAV")
        XCTAssertFalse(shell.suggestionPanel.isHidden);XCTAssertEqual(shell.suggestionMatches.count,shell.entries.count)
        let task=shell.suggestions.arrangedSubviews.compactMap{$0 as? NSButton}.first{$0.identifier?.rawValue=="SLOW"}!
        task.performClick(nil);try await waitFor({self.shell.active?.phase == .interactive})
        XCTAssertEqual(shell.active?.mnemonic,"SLOW");XCTAssertEqual(shell.command.stringValue,"SLOW")
        XCTAssertTrue(shell.suggestionPanel.isHidden)
        shell.focusCommand();shell.command.stringValue="DRAFT COMMAND";shell.resumeFunction();shell.focusCommand()
        XCTAssertEqual(shell.command.stringValue,"DRAFT COMMAND")
        XCTAssertEqual(shell.command.currentEditor()?.selectedRange,NSRange(location:13,length:0))
        shell.cancel();XCTAssertEqual(shell.command.stringValue,"");XCTAssertNil(shell.command.placeholderAttributedString)
    }
    // REQ-SH-002/003: invalid feedback still clears for correction; the button does not erase it or revive examples.
    func testInlineDiscoveryKeepsInvalidFeedbackUntilEditing() async throws {
        launch("SLOW 0");try await waitFor({self.shell.active?.phase == .interactive})
        let generation=shell.active!.id
        launch("NOT_A_FUNCTION")
        XCTAssertEqual(shell.active?.id,generation);XCTAssertEqual(shell.command.stringValue,"")
        XCTAssertTrue(shell.command.placeholderAttributedString?.string.contains("UNKNOWN FUNCTION")==true)
        shell.autocompleteButton.performClick(nil)
        XCTAssertEqual(shell.command.stringValue,"");XCTAssertFalse(shell.suggestionPanel.isHidden)
        XCTAssertTrue(shell.command.placeholderAttributedString?.string.contains("UNKNOWN FUNCTION")==true)
        shell.command.stringValue="sl";shell.controlTextDidChange(Notification(name:NSControl.textDidChangeNotification,object:shell.command))
        XCTAssertNil(shell.commandError);XCTAssertNil(shell.command.placeholderAttributedString)
        XCTAssertEqual(shell.command.stringValue,"SL");XCTAssertEqual(shell.suggestionMatches,["SLOW"])
        shell.autocompleteButton.performClick(nil);XCTAssertEqual(shell.command.stringValue,"SL")
        XCTAssertEqual(shell.suggestionMatches.count,shell.entries.count)
    }

    func shortcut(_ mnemonic:String)->NSButton? {
        shell.functionToolbar.subviews.compactMap{$0 as? NSButton}.first{$0.identifier?.rawValue=="function:"+mnemonic}
    }
    // REQ-SH-017: shortcuts share destructive launch and native buffered-input handoff.
    func testToolbarLaunchesBareFunctionFreshAndTracksInvocationInsteadOfDraft() async throws {
        launch("SLOW 0 NAV");try await waitFor{self.shell.active?.phase == .interactive}
        _=try await js("document.querySelector('[name=title]').value='old draft'")
        let original=shell.active!.id
        shell.focusCommand();shell.command.stringValue="DRQS A 42"
        XCTAssertEqual(shell.functionToolbar.activeMnemonic,"SLOW")
        try XCTUnwrap(shortcut("SLOW")).performClick(nil)
        XCTAssertNotEqual(shell.active?.id,original);XCTAssertEqual(shell.active?.tail,"")
        XCTAssertEqual(shell.command.stringValue,"SLOW");shell.append("fresh input")
        try await waitFor{self.shell.active?.phase == .interactive}
        try await equalJS("document.querySelector('[name=title]').value","fresh input")
        shell.focusCommand();shell.command.stringValue="EDITED COMMAND"
        XCTAssertEqual(shell.functionToolbar.activeMnemonic,"SLOW")
        XCTAssertEqual(shortcut("SLOW")?.layer?.borderWidth,1)
        try XCTUnwrap(shortcut("HOST")).performClick(nil)
        XCTAssertEqual(shell.active?.mnemonic,"HOST");XCTAssertEqual(shell.active?.tail,"")
        XCTAssertEqual(shell.command.stringValue,"HOST");XCTAssertEqual(shell.functionToolbar.activeMnemonic,"HOST")
        shell.focusCommand();shell.escape();XCTAssertNil(shell.active);XCTAssertNil(shell.functionToolbar.activeMnemonic)
        XCTAssertEqual(shortcut("HOST")?.layer?.borderWidth,0)
    }

    // REQ-SH-017: every shortcut remains reachable on small windows, with one launch action.
    func testToolbarOverflowPreservesCatalogOrderAndLaunchesHiddenFunction() throws {
        let toolbar=FunctionToolbar(frame:NSRect(x:0,y:0,width:380,height:34))
        let functions=(0..<30).map{("FN\($0)","Fixture function \($0)")}
        var launched=[String]();toolbar.onLaunch={launched.append($0)};toolbar.setFunctions(functions)
        toolbar.layoutSubtreeIfNeeded()
        let buttons=toolbar.subviews.compactMap{$0 as? NSButton}.filter{$0.identifier?.rawValue.hasPrefix("function:")==true}
        let visible=buttons.filter{!$0.isHidden}.map{$0.title}
        let menu=try XCTUnwrap(toolbar.overflowButton.menu)
        let hidden=menu.items.compactMap{$0.representedObject as? String}
        XCTAssertFalse(toolbar.overflowButton.isHidden);XCTAssertEqual(visible+hidden,functions.map{$0.0})
        XCTAssertLessThanOrEqual(toolbar.overflowButton.frame.maxX,toolbar.managementButton.frame.minX-4)
        for button in buttons where !button.isHidden {XCTAssertLessThanOrEqual(button.frame.maxX,toolbar.overflowButton.frame.minX-4)}
        let last=try XCTUnwrap(menu.items.last);toolbar.setActiveFunction("FN29");XCTAssertEqual(last.state,.on)
        menu.performActionForItem(at:menu.index(of:last));XCTAssertEqual(launched,["FN29"])
        toolbar.setActiveFunction(nil);XCTAssertEqual(last.state,.off)
        toolbar.setFrameSize(NSSize(width:3000,height:34));toolbar.needsLayout=true;toolbar.layoutSubtreeIfNeeded()
        XCTAssertTrue(toolbar.overflowButton.isHidden);XCTAssertTrue(buttons.allSatisfy{!$0.isHidden})
        toolbar.setFunctions(functions);XCTAssertTrue(toolbar.subviews.contains{$0===buttons[0]})
    }

    // REQ-SH-017, REQ-PK-007: catalog publication changes shortcuts, not an open invocation or command draft.
    func testToolbarCatalogRefreshPreservesFocusAndCommandDraft() async throws {
        launch("SLOW 0");try await waitFor{self.shell.active?.phase == .interactive}
        shell.focusCommand();shell.command.stringValue="DRQS A 42";let invocation=shell.active!.id
        let directory=shell.backend.directory.appendingPathComponent("packs")
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        let cache=directory.appendingPathComponent("catalog.json")
        let command:[String:Any]=["mnemonic":"NOTES","title":"Personal notes","packId":"example.notes","webDirectory":directory.appendingPathComponent("builds/fixture/functions/notes/web").path]
        try JSONSerialization.data(withJSONObject:["commands":[command],"localSourceOrigins":[]]).write(to:cache)
        shell.reloadCatalog();XCTAssertNotNil(shortcut("NOTES"));XCTAssertTrue(shell.commandFocused)
        XCTAssertEqual(shell.command.stringValue,"DRQS A 42");XCTAssertEqual(shell.active?.id,invocation)
        XCTAssertEqual(shell.functionToolbar.activeMnemonic,"SLOW")
        try JSONSerialization.data(withJSONObject:["commands":[],"localSourceOrigins":[]]).write(to:cache)
        shell.reloadCatalog();XCTAssertNil(shortcut("NOTES"));XCTAssertEqual(shell.active?.id,invocation)
    }

    // REQ-SH-001/017: navigation shares the input row; no blank row separates toolbar and view.
    func testNavigationControlsShareInputRowAndContentStartsBelowToolbar() async throws {
        launch("SLOW 0 NAV");try await waitFor{self.shell.active?.phase == .interactive}
        let base=try XCTUnwrap(shell.window.contentView);base.layoutSubtreeIfNeeded()
        XCTAssertTrue(shell.backButton.superview===shell.commandFrame.superview)
        let input=base.convert(shell.commandFrame.alignmentRect(forFrame:shell.commandFrame.frame),from:shell.commandFrame.superview)
        let back=base.convert(shell.backButton.alignmentRect(forFrame:shell.backButton.frame),from:shell.backButton.superview)
        XCTAssertEqual(input.midY,back.midY,accuracy:1);XCTAssertLessThan(back.maxX,input.minX)
        let toolbar=shell.functionToolbar.convert(shell.functionToolbar.bounds,to:base)
        let view=try XCTUnwrap(shell.web).convert(shell.web!.bounds,to:base)
        XCTAssertEqual(view.maxY,toolbar.minY,accuracy:1)
        _=try await js("document.querySelector('[data-slow-sequence]').click()")
        try await waitFor{self.shell.active?.phase == .interactive && self.shell.active?.entryDepth==2}
        XCTAssertFalse(shell.previousButton.isHidden);XCTAssertFalse(shell.nextButton.isHidden)
        XCTAssertTrue(shell.previousButton.superview===shell.commandFrame.superview)
        XCTAssertTrue(shell.siblingPosition.superview===shell.commandFrame.superview)
        shell.backButton.performClick(nil)
        try await waitFor{self.shell.active?.phase == .interactive && self.shell.active?.entryDepth==1}
    }




}

// Geometry requires AppKit layout, but no function launch, rendering callback or foreground window.
@MainActor final class ShellLayoutTests:XCTestCase {
    // REQ-SH-001/017: preserve real spacing and shared rows across system button ornamentation.
    func testNavigationAlignmentAndAdjacentContentAtSupportedWidths() throws {
        let shell=Shell(backend:isolatedBackend());defer{shell.cancel();shell.collector.flush();shell.window.orderOut(nil);try? SDKRuntimeCache.queue.sync{try FileManager.default.removeItem(at:shell.backend.directory)}}
        let base=try XCTUnwrap(shell.window.contentView)
        func alignment(_ view:NSView)->NSRect {base.convert(view.alignmentRect(forFrame:view.frame),from:view.superview)}
        for width:CGFloat in [930,1280] {
            shell.window.setContentSize(NSSize(width:width,height:850))
            for siblings in [false,true] {
                let invocation=Invocation("SLOW","");invocation.phase = .interactive
                if siblings{XCTAssertTrue(invocation.admitEntry("child",from:"root",depth:2,kind:"push"));invocation.phase = .interactive;invocation.siblingIndex=2;invocation.siblingCount=3}
                shell.active=invocation;shell.updateBackControl();base.layoutSubtreeIfNeeded()
                let input=alignment(shell.commandFrame),back=alignment(shell.backButton)
                print("Compact row: width=\(width), siblings=\(siblings), Back frame=\(shell.backButton.frame), Back alignment=\(back), input alignment=\(input)")
                XCTAssertEqual(input.midY,back.midY,accuracy:1)
                let controls:[NSView]=siblings ? [shell.backButton,shell.previousButton,shell.nextButton,shell.siblingPosition,shell.commandFrame] : [shell.backButton,shell.commandFrame]
                for (left,right) in zip(controls,controls.dropFirst()) {
                    XCTAssertTrue(left.superview===right.superview)
                    XCTAssertLessThan(alignment(left).maxX,alignment(right).minX,"Alignment rectangles must remain separated")
                }
                XCTAssertGreaterThanOrEqual(input.width,240)
                XCTAssertEqual(shell.content.frame.maxY,shell.functionToolbar.frame.minY,accuracy:1)
            }
        }
    }
}
