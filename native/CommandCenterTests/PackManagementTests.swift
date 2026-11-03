import XCTest
import AppKit
@testable import CommandCenter

private final class PackUIBackend: Backend {
    var requests=[(payload:[String:Any]?,finish:([String:Any])->Void)]()
    override func endpoint(_ route:String,payload:[String:Any]?=nil,mutation:Bool=false,completion:@escaping([String:Any])->Void) {
        requests.append((payload,completion))
    }
}

@MainActor final class PackManagementTests: XCTestCase {
    private var backend:PackUIBackend!
    var shell:Shell!
    var controller:PackManagement!
    let revision=String(repeating:"a",count:64)
    override func setUpWithError() throws {
        backend=PackUIBackend(directory:FileManager.default.temporaryDirectory.appendingPathComponent("cc-pack-ui-"+UUID().uuidString))
        shell=Shell(backend:backend);controller=PackManagement(shell:shell)
        let directory=backend.directory.appendingPathComponent("packs/builds/"+revision)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        let artifact:[String:Any]=["functions":[["mnemonic":"NOTES"],["mnemonic":"READ"]]]
        try JSONSerialization.data(withJSONObject:artifact).write(to:directory.appendingPathComponent("artifact.json"))
    }
    override func tearDownWithError() throws {
        controller.panel.orderOut(nil);controller=nil;shell.cancel();shell.collector.flush();shell.window.orderOut(nil);shell=nil
        try SDKRuntimeCache.queue.sync{try FileManager.default.removeItem(at:backend.directory)};backend=nil
    }
    func pack(_ status:String="active",installed:Bool=true)->[String:Any] {
        var value:[String:Any]=["id":"example.notes","source":"/Users/example/dev/personal-functions","status":status,"candidate":revision]
        if installed {value["active"]=revision};return value
    }
    func descendants(_ view:NSView)->[NSView] {[view]+view.subviews.flatMap{descendants($0)}}
    func button(_ action:String)->NSButton? {descendants(controller.rows).compactMap{$0 as? NSButton}.first{$0.identifier?.rawValue==action+":example.notes"}}
    func labels()->[String] {descendants(controller.rows).compactMap{($0 as? NSTextField)?.stringValue}}
    func menuTitles()->[String] {descendants(controller.rows).compactMap{$0 as? NSPopUpButton}.flatMap{$0.itemTitles}}

    func testAvailabilityAndNextActionAreExplicit() {
        XCTAssertEqual(PackPresentation(pack())?.status,"Up to date")
        XCTAssertNil(PackPresentation(pack())?.primaryAction)
        let setup=PackPresentation(pack("ready",installed:false))!
        XCTAssertEqual(setup.status,"Ready to enable");XCTAssertEqual(setup.primaryTitle,"Enable Functions")
        XCTAssertEqual(PackPresentation(pack("ready"))?.primaryTitle,"Apply Update")
        let open=PackPresentation(pack("ready"),relaunch:true)!
        XCTAssertEqual(open.primaryTitle,"Apply & Relaunch");XCTAssertTrue(open.explanation.contains("draft"))
        let failure=PackPresentation(pack("failed"))!
        XCTAssertEqual(failure.primaryTitle,"Retry");XCTAssertTrue(failure.explanation.contains("installed version is still available"))
        XCTAssertNil(PackPresentation(pack("building"))?.primaryAction)
    }

    func testIncompatibleInstalledPackExplainsUnavailableStateWithoutDeletingIt() {
        var legacy=pack();legacy["incompatible"]="Update required: rebuild for API epoch 1. Saved data is retained."
        let presentation=PackPresentation(legacy)!
        XCTAssertEqual(presentation.status,"Update required");XCTAssertTrue(presentation.installed)
        XCTAssertEqual(presentation.primaryTitle,"Rebuild");XCTAssertEqual(presentation.primaryAction,"build")
        XCTAssertTrue(presentation.explanation.contains("Saved data is retained"))
        legacy["status"]="ready";legacy["candidate"]="compatible-build"
        XCTAssertEqual(PackPresentation(legacy)?.primaryTitle,"Apply Update")
    }

    // Regression for a short document appearing at the bottom of a large empty viewport.
    func testCardsStartAtTopNameTheirFunctionsAndDoNotRebuildDuringPolling() throws {
        controller.render([pack()]);controller.panel.contentView!.layoutSubtreeIfNeeded()
        let card=try XCTUnwrap(controller.rows.arrangedSubviews.first)
        let document=try XCTUnwrap(controller.scroll.documentView)
        XCTAssertTrue(document.isFlipped)
        let bounds=card.convert(card.bounds,to:document),visible=controller.scroll.documentVisibleRect
        XCTAssertEqual(bounds.minY,visible.minY,accuracy:2)
        XCTAssertGreaterThan(bounds.height,120);XCTAssertLessThan(bounds.height,240)
        XCTAssertGreaterThan(bounds.width,700)
        XCTAssertTrue(labels().contains("NOTES   READ"));XCTAssertTrue(labels().contains("Up to date"))
        XCTAssertFalse(menuTitles().contains("Delete Saved Data…"))
        XCTAssertTrue(menuTitles().contains("Remove Pack…"));XCTAssertNil(button("build"))
        controller.render([pack()]);XCTAssertTrue(controller.rows.arrangedSubviews.first===card)
        try capture("active")
        controller.render([pack("ready")]);try capture("update-ready")
        var failed=pack("failed");failed["error"]="The function’s source could not be compiled. Fix the reported type error and retry."
        controller.render([failed]);XCTAssertNotNil(button("details"));XCTAssertEqual(button("build")?.title,"Retry");try capture("error")
    }

    func testEmptyAndRemovedPacksHaveSeparateRelevantControls() throws {
        controller.render([]);XCTAssertTrue(labels().contains("Add your first pack"));try capture("empty")
        var removed=pack();removed["removed"]=true
        controller.render([removed]);XCTAssertEqual(button("add")?.title,"Add Again")
        XCTAssertTrue(menuTitles().contains("Delete Saved Data…"));XCTAssertFalse(menuTitles().contains("Remove Pack…"))
        XCTAssertNil(button("apply"));try capture("removed")
    }

    func testApplyIsSingleFlightAndRecoversAfterFailure() throws {
        controller.render([pack("ready")]);try XCTUnwrap(button("apply")).performClick(nil)
        XCTAssertEqual(backend.requests.count,1);XCTAssertEqual(backend.requests[0].payload?["action"] as? String,"apply")
        let pending=try XCTUnwrap(button("apply"));XCTAssertFalse(pending.isEnabled)
        pending.performClick(nil);XCTAssertEqual(backend.requests.count,1)
        backend.requests[0].finish(["ok":false,"error":["message":"Update postponed: work is still running."]])
        XCTAssertTrue(try XCTUnwrap(button("apply")).isEnabled)
    }

    func testSuccessfulRefreshClearsConnectionFailureWithoutReplacingCards() throws {
        controller.render([pack()]);let card=try XCTUnwrap(controller.rows.arrangedSubviews.first)
        controller.refresh();backend.requests[0].finish(["ok":false,"error":["message":"The local service is unavailable."]])
        controller.refresh();backend.requests[1].finish(["ok":true,"result":[pack()]])
        let text=descendants(controller.panel.contentView!).compactMap{($0 as? NSTextField)?.stringValue}
        XCTAssertTrue(text.contains("Status refreshed."));XCTAssertFalse(text.contains("The local service is unavailable."))
        XCTAssertTrue(controller.rows.arrangedSubviews.first===card)
    }

    private func capture(_ name:String) throws {
        let view=controller.panel.contentView!;view.layoutSubtreeIfNeeded()
        let bitmap=try XCTUnwrap(view.bitmapImageRepForCachingDisplay(in:view.bounds));view.cacheDisplay(in:view.bounds,to:bitmap)
        let png=try XCTUnwrap(bitmap.representation(using:.png,properties:[:]))
        let attachment=XCTAttachment(data:png,uniformTypeIdentifier:"public.png");attachment.name="Function Packs · "+name;attachment.lifetime = .keepAlways;add(attachment)
        let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent(".work/pack-ui")
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true);try png.write(to:root.appendingPathComponent(name+".png"))
    }
}
