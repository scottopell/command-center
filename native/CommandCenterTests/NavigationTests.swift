import XCTest
import WebKit
import AppKit
@testable import CommandCenter

final class NavigationFixtureBackend:Backend {
    override init(directory:URL?=nil){super.init(directory:directory ?? FileManager.default.temporaryDirectory.appendingPathComponent("cc-navigation-"+UUID().uuidString))}
    var calls=0
    override func request(_ payload:[String:Any],mutation:Bool=false,completion:@escaping([String:Any])->Void){
        calls += 1;completion(["ok":false,"error":["code":"not_found","message":"No worker belongs to this conformance view"]])
    }
}
// Real WebKit conformance over SLOW's in-memory screens; no app data or writes.
@MainActor final class NavigationTests: XCTestCase {
    var shell:Shell!
    var fixture:NavigationFixtureBackend!
    var context=""
    override func setUpWithError() throws {fixture=NavigationFixtureBackend();shell=Shell(backend:fixture,externalOpener:{_ in false});try requireForegroundWebKit(shell.window)}
    override func tearDownWithError() throws {shell.cancel();shell.collector.flush();try? FileManager.default.removeItem(at:fixture.directory);shell.window.orderOut(nil);shell=nil}
    func waitFor(_ condition:@escaping()->Bool) async throws {
        let deadline=Date().addingTimeInterval(8)
        while !condition(){
            if Date()>deadline{
                let diagnostics=try? await js("({framework:window.commandCenterHost?.diagnostics(),viewports:Array.from(document.querySelectorAll('.entry-viewport')).map(v=>({id:v.dataset.entryId,inert:v.inert,display:getComputedStyle(v).display,rects:v.getClientRects().length}))})")
                XCTFail("Timed out \(context): native phase=\(shell.active?.phase.rawValue ?? "empty") entry=\(shell.active?.entryID ?? "empty") depth=\(shell.active?.entryDepth ?? 0) prepared=\(shell.active?.viewReady ?? false) inFlight=\(shell.active?.inFlight ?? false); framework metadata=\(String(describing:diagnostics))")
                throw NSError(domain:"NavigationTimeout",code:1)
            }
            try await Task.sleep(nanoseconds:10_000_000)
        }
    }
    func js(_ code:String) async throws->Any?{try await shell.web!.evaluateJavaScript(code)}
    func launch() async throws {shell.command.stringValue="SLOW 0 NAV";shell.execute();try await waitFor({self.shell.active?.phase == .interactive})}
    let viewport=activeEntryViewportScript
    func equalJS<T:Equatable>(_ code:String,_ expected:T) async throws {let value=try await js(code) as? T;XCTAssertEqual(value,expected)}
    func waitJS(_ code:String) async throws {
        let deadline=Date().addingTimeInterval(8)
        while (try await js(code) as? Bool) != true {
            if Date()>deadline{XCTFail("JavaScript condition timed out: \(code)");throw NSError(domain:"NavigationJSTimeout",code:1)}
            try await Task.sleep(nanoseconds:10_000_000)
        }
    }
    // Native authority can be tested independently of the retained DOM mechanism.


    func testBackRetainsFieldsDefersFocusAndDiscardsChildInput() async throws {
        try await launch();XCTAssertFalse(shell.backButton.isEnabled)
        shell.goBack(pointerResume:false);XCTAssertEqual(shell.active?.entryID,"root")
        _=try await js("\(viewport).querySelector('[name=title]').value='retained parent';\(viewport).querySelector('[name=body]').focus();\(viewport).querySelector('[data-slow-push]').click()")
        try await waitFor({self.shell.active?.entryDepth==2});XCTAssertTrue(shell.backButton.isEnabled)
        shell.append("child title");shell.tab();shell.append("child body")
        try await waitFor({self.shell.active?.phase == .interactive})
        try await equalJS("\(viewport).querySelector('[name=title]').value","child title")
        try await equalJS("\(viewport).querySelector('[name=body]').value","child body")
        shell.escape();shell.command.stringValue="HOST NOT SUBMITTED"
        let back=NSEvent.keyEvent(with:.keyDown,location:.zero,modifierFlags:.command,timestamp:0,
                                 windowNumber:shell.window.windowNumber,context:nil,characters:"[",
                                 charactersIgnoringModifiers:"[",isARepeat:false,keyCode:33)!
        NSApp.sendEvent(back)
        try await waitFor({self.shell.active?.entryID=="root" && self.shell.active?.viewReady==true})
        XCTAssertTrue(shell.commandFocused);XCTAssertEqual(shell.command.stringValue,"HOST NOT SUBMITTED")
        XCTAssertFalse(shell.active!.ownsInput);XCTAssertNotEqual(shell.active?.phase,.interactive)
        try await equalJS("\(viewport).querySelector('[name=title]').value","retained parent")
        shell.resumeFunction();try await waitFor({self.shell.active?.phase == .interactive})
        try await equalJS("document.activeElement.name","body")
        _=try await js("\(viewport).querySelector('[data-slow-push]').click()")
        try await waitFor({self.shell.active?.entryDepth==2})
        shell.append("discarded child draft");shell.goBack(pointerResume:true)
        try await waitFor({self.shell.active?.entryID=="root" && self.shell.active?.phase == .interactive})
        XCTAssertTrue(shell.active!.pending.isEmpty)
        try await equalJS("\(viewport).querySelector('[name=title]').value","retained parent")
        try await Task.sleep(nanoseconds:600_000_000)
        XCTAssertEqual(shell.active?.entryID,"root");XCTAssertEqual(shell.active?.phase,.interactive)
    }

    func testFailureBackPointerResumeReplaceAndHistoryCeiling() async throws {
        try await launch()
        _=try await js("\(viewport).querySelector('[data-slow-fail]').click()")
        try await waitFor({self.shell.active?.phase == .error})
        XCTAssertTrue(shell.backButton.isEnabled);XCTAssertFalse(shell.overlay.isHidden)
        shell.escape();shell.command.stringValue="COMMAND DRAFT"
        shell.pointerBack()
        try await waitFor({self.shell.active?.entryDepth==1 && self.shell.active?.phase == .interactive})
        XCTAssertFalse(shell.commandFocused);XCTAssertEqual(shell.command.stringValue,"COMMAND DRAFT")
        for depth in 2...4 {
            _=try await js("\(viewport).querySelector('[data-slow-push]').click()")
            try await waitFor({self.shell.active?.entryDepth==depth && self.shell.active?.phase == .interactive})
        }
        let ceilingID=shell.active!.entryID
        _=try await js("\(viewport).querySelector('[data-slow-push]').click()")
        try await Task.sleep(nanoseconds:100_000_000)
        XCTAssertEqual(shell.active?.entryDepth,4);XCTAssertEqual(shell.active?.entryID,ceilingID)
        XCTAssertTrue(shell.status.stringValue.contains("limit"))
        for depth in stride(from:3,through:1,by:-1) {shell.pointerBack();try await waitFor({self.shell.active?.entryDepth==depth && self.shell.active?.phase == .interactive})}
        _=try await js("\(viewport).querySelector('[data-slow-replace]').click()")
        try await waitFor({self.shell.active?.entryID != "root" && self.shell.active?.phase == .interactive})
        XCTAssertEqual(shell.active?.entryDepth,1);XCTAssertFalse(shell.backButton.isEnabled)
    }

    func testPrimaryViewportAnchorAndFocusedRowReturnInWebKit() async throws {
        try await launch()
        _=try await js("const v=\(viewport),row=v.querySelector('[data-slow-row=\"12\"]');row.scrollIntoView({block:'center'});row.focus({preventScroll:true});window.savedNavigationOffset=row.getBoundingClientRect().top-v.getBoundingClientRect().top;row.click()")
        try await waitFor({self.shell.active?.entryDepth==2 && self.shell.active?.phase == .interactive})
        shell.pointerBack()
        try await waitFor({self.shell.active?.entryDepth==1 && self.shell.active?.phase == .interactive})
        try await equalJS("document.activeElement.getAttribute('data-slow-row')","12")
        let offset=try await js("\(viewport).querySelector('[data-slow-row=\"12\"]').getBoundingClientRect().top-\(viewport).getBoundingClientRect().top-window.savedNavigationOffset") as? Double
        XCTAssertNotNil(offset);XCTAssertLessThan(abs(offset ?? 1000),4)
    }



    func testRetainedActivitySuspendsAndResumesOrdinaryEffects() async throws {
        try await launch()
        try await waitJS("\(viewport).querySelector('[data-slow-probe]').getAttribute('data-slow-setups')==='1'")
        _=try await js("\(viewport).querySelector('[data-slow-push]').click()")
        try await waitFor({self.shell.active?.entryDepth==2 && self.shell.active?.phase == .interactive})
        try await equalJS("document.querySelector('[data-entry-id=root] [data-slow-probe]').getAttribute('data-slow-cleanups')","1")
        try await equalJS("\(viewport).querySelector('[data-slow-probe]').getAttribute('data-slow-setups')","1")
        // This test-only reference permits observing cleanup after DOM removal;
        // delete it immediately after inspection, before testing framework release.
        _=try await js("window.slowCleanupProbe=\(viewport).querySelector('[data-slow-probe]');void 0")
        shell.pointerBack();try await waitFor({self.shell.active?.entryDepth==1 && self.shell.active?.phase == .interactive})
        try await equalJS("\(viewport).querySelector('[data-slow-probe]').getAttribute('data-slow-setups')","2")
        try await equalJS("(()=>{const count=window.slowCleanupProbe.getAttribute('data-slow-cleanups');delete window.slowCleanupProbe;return count})()","1")
        try await equalJS("document.querySelectorAll('.entry-viewport').length",1)
    }

    // REQ-NV-004/006/009: a retained hidden tree's props can lag its display:none.
    func testNavigationTargetsActiveEntryWhenHiddenParentAttributesLag() async throws {
        try await launch()
        _=try await js("\(viewport).querySelector('[data-slow-push]').click()")
        try await waitFor{self.shell.active?.entryDepth==2 && self.shell.active?.phase == .interactive}
        // Recreate the allowed intermediate DOM state deterministically instead of
        // depending on React's low-priority hidden render losing a timing race.
        let expected=shell.active!.entryID
        // One page task keeps the deliberately stale attribute stable throughout the observation.
        let observed=try await js("""
        (()=>{
          const parent=document.querySelector('[data-entry-id=root]');parent.removeAttribute('inert');
          const observed={legacyTarget:document.querySelector('.entry-viewport:not([inert])').dataset.entryId,
            hiddenRects:parent.getClientRects().length,activeTarget:\(viewport).dataset.entryId};
          parent.querySelector('[data-slow-push]').click();
          observed.depthAfterHiddenClick=window.commandCenterHost.diagnostics().depth;
          \(viewport).querySelector('[data-slow-push]').click();return observed;
        })()
        """) as? [String:Any]
        XCTAssertEqual(observed?["legacyTarget"] as? String,"root")
        XCTAssertEqual(observed?["hiddenRects"] as? Int,0)
        XCTAssertEqual(observed?["activeTarget"] as? String,expected)
        XCTAssertEqual(observed?["depthAfterHiddenClick"] as? Int,2) // Covered views have no authority.
        try await waitFor{self.shell.active?.entryDepth==3 && self.shell.active?.phase == .interactive}
    }

    func testTwoHundredPushPopTransitionsAndRepeatedCancelRelease() async throws {
        try await launch()
        for cycle in 0..<200 {
            context="soak cycle \(cycle) push"
            _=try await js("\(viewport).querySelector('[data-slow-push]').click()")
            try await waitFor({self.shell.active?.entryDepth==2})
            context="soak cycle \(cycle) Back"
            shell.pointerBack();try await waitFor({self.shell.active?.entryDepth==1 && self.shell.active?.phase == .interactive})
            XCTAssertEqual(shell.active?.entryStack,["root"])
            if cycle % 25 == 24 {
                try await equalJS("window.commandCenterHost.diagnostics().depth",1)
                try await equalJS("window.commandCenterHost.diagnostics().deliveryWaiters",0)
                for depth in 2...4 {
                    context="soak cycle \(cycle) max-depth \(depth)"
                    _=try await js("\(viewport).querySelector('[data-slow-push]').click()")
                    try await waitFor({self.shell.active?.entryDepth==depth && self.shell.active?.phase == .interactive})
                }
                try await equalJS("window.commandCenterHost.diagnostics().depth",4)
                weak var oldWeb=shell.web
                context="soak cycle \(cycle) cancel at depth4"
                shell.cancel();try await waitFor({oldWeb==nil})
                XCTAssertEqual(shell.content.subviews.filter{$0 is WKWebView}.count,0)
                if cycle<199{try await launch()}
            }
        }
        XCTAssertNil(shell.active);XCTAssertNil(shell.web)
    }

    func testContentPolicyBlocksDirectNetworkFramesAndResources() async throws {
        try await launch()
        _=try await js("""
        window.policyChecks={fetch:false,xhr:false,websocket:false,directives:[]};
        document.addEventListener('securitypolicyviolation',e=>window.policyChecks.directives.push(e.violatedDirective));
        fetch('https://example.invalid/cc-policy').then(()=>{},()=>{window.policyChecks.fetch=true});
        const request=new XMLHttpRequest();request.open('GET','https://example.invalid/cc-policy');request.onerror=()=>{window.policyChecks.xhr=true};try{request.send()}catch{window.policyChecks.xhr=true}
        try{const socket=new WebSocket('wss://example.invalid/cc-policy');socket.onerror=()=>{window.policyChecks.websocket=true}}catch{window.policyChecks.websocket=true}
        for(const [tag,property,path] of [['iframe','src','frame'],['script','src','script'],['img','src','image']]){
          const node=document.createElement(tag);node[property]='https://example.invalid/'+path;document.body.appendChild(node);
        }
        const style=document.createElement('link');style.rel='stylesheet';style.href='https://example.invalid/style';document.head.appendChild(style);
        void 0
        """)
        try await waitJS("window.policyChecks.fetch&&window.policyChecks.xhr&&window.policyChecks.websocket")
        try await waitJS("['connect-src','frame-src','script-src-elem','style-src-elem','img-src'].every(kind=>window.policyChecks.directives.some(value=>value===kind||value===kind.replace('-elem','')))")
        XCTAssertEqual(shell.active?.phase,.interactive)
        XCTAssertEqual(shell.web?.url?.scheme,"commandcenter")
        XCTAssertEqual(fixture.calls,0)
    }
}
