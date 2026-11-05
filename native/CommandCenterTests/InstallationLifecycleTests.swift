import XCTest
@testable import CommandCenter

private final class InstallationBackend:Backend {
    var sent=[(payload:[String:Any],mutation:Bool)]()
    override func request(_ payload:[String:Any],mutation:Bool=false,completion:@escaping([String:Any])->Void){sent.append((payload,mutation))}
}

@MainActor final class InstallationLifecycleTests:XCTestCase {
    private func catalog(_ revision:String="old",other:String="other",removed:Bool=false,pack:String="example.notes",unavailable:Bool=false,epoch:Int=1,readMutating:Bool=false) throws -> FunctionCatalog {
        var notes:[String:Any]=["mnemonic":"NOTES","title":"Notes","id":"notes","packId":pack,"revision":revision,"apiEpoch":epoch,"operations":["read":readMutating,"save":true]]
        if unavailable{notes["unavailableReason"]="Update required"}
        return try JSONDecoder().decode(FunctionCatalog.self,from:JSONSerialization.data(withJSONObject:["apiEpoch":epoch,"localSourceOrigins":[],"commands":(removed ? [] : [notes])+[["mnemonic":"SLOW","title":"Slow","id":"slow","packId":"cc.system","revision":other,"apiEpoch":epoch]]]))
    }
    // REQ-PK-008/014: these decisions have no UI/request-origin dependency.
    func testCommittedOwnRevisionRelaunchesBareMnemonicAndLeavesLaunchSnapshotImmutable() throws {
        let initial=try catalog(),launch=Invocation("NOTES","A 42",commands:initial.commands);launch.pending.append("draft")
        XCTAssertEqual(InstallationLifecycle.effect(for:launch,catalog:try catalog("new"),supportedEpoch:1),.relaunch("NOTES"))
        XCTAssertEqual(launch.contracts["NOTES"]?.revision,"old");XCTAssertEqual(launch.pending.segments,["draft"])
    }
    func testUnchangedAndUnrelatedInstallationsPreserveTheInvocation() throws {
        let initial=try catalog(),launch=Invocation("NOTES","",commands:initial.commands)
        XCTAssertEqual(InstallationLifecycle.effect(for:launch,catalog:initial,supportedEpoch:1),.unchanged)
        XCTAssertEqual(InstallationLifecycle.effect(for:launch,catalog:try catalog(other:"new other pack"),supportedEpoch:1),.unchanged)
        XCTAssertEqual(InstallationLifecycle.effect(for:nil,catalog:initial,supportedEpoch:1),.unchanged)
    }
    func testRemovalReassignmentOrIncompatibilityCancels() throws {
        let launch=Invocation("NOTES","",commands:try catalog().commands)
        for next in [try catalog(removed:true),try catalog(pack:"different.owner"),try catalog(unavailable:true),try catalog(epoch:2)] {
            XCTAssertEqual(InstallationLifecycle.effect(for:launch,catalog:next,supportedEpoch:1),.cancel)
        }
    }
    // REQ-PK-007: a newly published catalog cannot reclassify or relabel old UI calls.
    func testBridgeUsesPinnedRevisionAndOperationMutabilityBeforeReconciliation() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("cc pinned routing "+UUID().uuidString),backend=InstallationBackend(directory:directory)
        var shell:Shell?=Shell(backend:backend)
        defer{shell?.cancel();shell?.collector.flush();shell?.window.orderOut(nil);shell=nil;try? SDKRuntimeCache.queue.sync{try FileManager.default.removeItem(at:directory)}}
        let launch=Invocation("NOTES","",commands:try catalog().commands);launch.phase = .interactive;launch.ownsInput=false;launch.apiEpoch=1;shell!.active=launch
        shell!.catalog=try catalog("new",readMutating:true)
        shell!.message(["kind":"rpc","entryId":"root","id":1,"function":"NOTES","operation":"read","input":[:]],generation:launch.id)
        XCTAssertEqual(backend.sent.count,1);XCTAssertEqual(backend.sent.first?.payload["revision"] as? String,"old");XCTAssertEqual(backend.sent.first?.mutation,false)
    }
}
