import XCTest
@testable import CommandCenter

@MainActor final class StragglerTests:XCTestCase {
    // REQ-ST-001/002/003: deterministic policy checks, independent of machine speed.
    func testDeadlineRecordsOnceAndCompletionUpdatesSameRecord() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("cc-diagnostics-"+UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:directory)}
        let collector=DiagnosticsCollector(directory:directory);var now=10.0,notices=0
        let trace=TransitionMeasurement(mnemonic:"SLOW",command:"SLOW 600",kind:"launch",token:"root",packId:"cc.system",functionId:"slow",revision:"fixture",collector:collector,clock:{now},scheduleDeadline:false)
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
        let trace=TransitionMeasurement(mnemonic:"SLOW",command:"SLOW",kind:"back",token:"transition-1",packId:"cc.system",functionId:"slow",revision:"fixture",collector:collector,clock:{now},scheduleDeadline:false)
        now=0.1;trace.finish("canceled");now=5;trace.checkBudget();XCTAssertFalse(trace.straggler);collector.flush()
    }
}
