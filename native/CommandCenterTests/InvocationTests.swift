import XCTest
@testable import CommandCenter
final class InvocationTests: XCTestCase {
    // REQ-SH-007: segment editing cannot cross a Tab or erase tail defaults.
    func testTitleTabBody() {
        var buffer=PendingText();buffer.append("the bazinator is broken in CI");buffer.tab();buffer.append("See the latest CI logs from repo ABC, you'll note that all jobs are failing on bazinator, pls advise")
        XCTAssertEqual(buffer.take(),["the bazinator is broken in CI","See the latest CI logs from repo ABC, you'll note that all jobs are failing on bazinator, pls advise"]);XCTAssertTrue(buffer.isEmpty)
        buffer.tab();XCTAssertFalse(buffer.backspace());buffer.append("👨‍👩‍👦");XCTAssertTrue(buffer.backspace());XCTAssertEqual(buffer.segments,["",""])
    }
    func testCommandTailAndFreshIdentity() {
        let command=Command("  drqs S One  TWO !  ")!;XCTAssertEqual(command.mnemonic,"DRQS");XCTAssertEqual(command.tail,"S One  TWO !")
        XCTAssertNil(Command("  "));let a=Invocation("DRQS","A 42"),b=Invocation("DRQS","A 42");XCTAssertNotEqual(a.id,b.id)
        a.pending.append("draft");a.ownsInput=false;XCTAssertEqual(a.pending.segments,["draft"]);XCTAssertEqual(a.phase,.resolving)
        a.retire();XCTAssertFalse(a.ownsInput);XCTAssertTrue(a.pending.isEmpty);XCTAssertEqual(a.phase,.retired)
    }
    func testBoundedInterleavingsKeepRetirementAndMutationGuard() {
        for phase in [Phase.resolving,.draining,.interactive,.error] {
            for owns in [true,false] {let a=Invocation("SLOW","");a.phase=phase;a.ownsInput=owns;XCTAssertEqual(a.allowsMutation,phase == .interactive && owns);a.retire();XCTAssertFalse(a.allowsMutation);XCTAssertFalse(a.ownsInput);XCTAssertEqual(a.phase,.retired)}
        }
    }
    func testEntryAdmissionBoundsIdentityAndRetiresPendingInput() {
        let i=Invocation("SLOW","");i.phase = .interactive
        XCTAssertEqual(i.entryID,"root");XCTAssertEqual(i.entryDepth,1)
        XCTAssertFalse(i.admitEntry("x",from:"root",depth:0,kind:"back"))
        XCTAssertFalse(i.admitEntry("x",from:"old",depth:2,kind:"push"))
        for depth in 2...4 {
            let parent=i.entryID;i.phase = .interactive;i.pending.append("departing draft")
            XCTAssertTrue(i.admitEntry("entry\(depth)",from:parent,depth:depth,kind:"push"))
            XCTAssertEqual(i.phase,.resolving);XCTAssertFalse(i.viewReady)
            XCTAssertTrue(i.pending.isEmpty);XCTAssertFalse(i.allowsMutation)
        }
        i.phase = .interactive
        XCTAssertFalse(i.admitEntry("too-deep",from:i.entryID,depth:5,kind:"push"))
        XCTAssertEqual(i.entryDepth,4)
        XCTAssertFalse(i.admitEntry("root",from:i.entryID,depth:3,kind:"back"))
        i.phase = .error;i.ownsInput=false;i.pending.append("discard me")
        XCTAssertTrue(i.admitEntry("entry3",from:"entry4",depth:3,kind:"back"))
        XCTAssertFalse(i.ownsInput);XCTAssertTrue(i.pending.isEmpty)
        XCTAssertEqual(i.entryID,"entry3")
        XCTAssertFalse(i.admitEntry("entry2",from:"entry4",depth:2,kind:"back"))
        i.phase = .interactive;i.ownsInput=true
        XCTAssertTrue(i.admitEntry("replacement",from:"entry3",depth:3,kind:"replace"))
        XCTAssertEqual(i.entryStack,["root","entry2","replacement"])
        i.retire();XCTAssertFalse(i.admitEntry("entry2",from:"replacement",depth:2,kind:"back"))
    }
    func testOversizedServiceResponsesPreserveMutationUncertainty() {
        XCTAssertNil(Backend.oversizedResponse(Backend.maximumResponseBytes,mutation:false))
        XCTAssertEqual(Backend.oversizedResponse(Backend.maximumResponseBytes+1,mutation:false)?.0,"response_too_large")
        XCTAssertEqual(Backend.oversizedResponse(Backend.maximumResponseBytes+1,mutation:true)?.0,"outcome_unknown")
        XCTAssertTrue(Backend.oversizedResponse(Backend.maximumResponseBytes+1,mutation:true)!.1.contains("No retry"))
    }
    // REQ-SH-015: arbitrary schemes, credentials and unrelated HTTP apps are refused.
    func testExternalLinksStayOutsideTrustedDocuments() {
        for raw in ["https://example.com/source", "http://127.0.0.1:9876/record"] {
            XCTAssertNotNil(ExternalLinks.allowed(raw,localOrigins:["http://127.0.0.1:9876"]))
            XCTAssertFalse(ExternalLinks.bundled(URL(string:raw)))
        }
        for raw in ["javascript:alert(1)","file:///etc/passwd","data:text/html,hello","codex://new","http://example.com","http://127.0.0.1:9999/","https://user:secret@example.com/","/relative"] {
            XCTAssertNil(ExternalLinks.allowed(raw))
        }
        XCTAssertTrue(ExternalLinks.bundled(URL(string:"commandcenter://app/index.html")))
        XCTAssertFalse(ExternalLinks.bundled(URL(string:"commandcenter://other/index.html")))
    }
}
