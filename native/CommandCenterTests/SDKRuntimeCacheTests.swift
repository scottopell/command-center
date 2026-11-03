import XCTest
import Darwin
@testable import CommandCenter

@MainActor final class SDKRuntimeCacheTests:XCTestCase {
    private func fixture() throws -> URL {
        let data=FileManager.default.temporaryDirectory.appendingPathComponent("cc-runtime-cache-"+UUID().uuidString)
        try FileManager.default.createDirectory(at:data.appendingPathComponent("service/toolchain/runtime/browser"),withIntermediateDirectories:true)
        return data
    }
    private func select(_ letter:String,in data:URL) throws -> SDKRuntime {
        let source=data.appendingPathComponent("service/toolchain/runtime"),fingerprint=String(repeating:letter,count:64)
        try JSONSerialization.data(withJSONObject:["apiEpoch":SDKRuntime.bundled.manifest.apiEpoch,"fingerprint":fingerprint,"imports":["@command-center/runtime/framework":"browser/framework.js"]]).write(to:source.appendingPathComponent("runtime.json"))
        try Data(letter.utf8).write(to:source.appendingPathComponent("browser/framework.js"))
        return try SDKRuntime.selected(in:data,descriptor:.init(apiEpoch:SDKRuntime.bundled.manifest.apiEpoch,fingerprint:fingerprint,directory:source.path))
    }
    private func sweep(_ data:URL){SDKRuntimeCache.queue.sync{SDKRuntimeCache.collect(in:data.appendingPathComponent("runtimes"))}}
    private func exists(_ url:URL)->Bool {FileManager.default.fileExists(atPath:url.path)}

    // REQ-PK-013: separate selections and value copies keep a generation leased.
    func testRetainsCurrentAndAllOwnersThenReclaimsLastRelease() throws {
        let data=try fixture();defer{SDKRuntimeCache.queue.sync{};try? FileManager.default.removeItem(at:data)}
        var first:SDKRuntime?=try select("a",in:data),copy=first,second:SDKRuntime?=try select("a",in:data)
        let old=first!.directory,current=try select("b",in:data)
        defer{withExtendedLifetime(current){}}
        first=nil;second=nil;sweep(data)
        XCTAssertTrue(exists(old));XCTAssertEqual(copy?.manifest.fingerprint,String(repeating:"a",count:64))
        copy=nil;SDKRuntimeCache.queue.sync{}
        XCTAssertFalse(exists(old));XCTAssertTrue(exists(current.directory))
        XCTAssertTrue(exists(data.appendingPathComponent("service/toolchain/runtime/browser/framework.js")))
    }

    func testReclaimsAbandonedEntriesButLeavesUnrelatedFilesAndSymlinks() throws {
        let data=try fixture();defer{SDKRuntimeCache.queue.sync{};try? FileManager.default.removeItem(at:data)}
        let current=try select("a",in:data),root=data.appendingPathComponent("runtimes")
        defer{withExtendedLifetime(current){}}
        let stale=root.appendingPathComponent(String(repeating:"b",count:64)),stage=root.appendingPathComponent(".staging-"+UUID().uuidString),trash=root.appendingPathComponent(".trash-"+UUID().uuidString)
        let unrelated=root.appendingPathComponent("notes"),outside=data.appendingPathComponent("function-data"),link=root.appendingPathComponent(String(repeating:"c",count:64))
        for directory in [stale,stage,trash,unrelated,outside]{try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true);try Data("keep me".utf8).write(to:directory.appendingPathComponent("record"))}
        try FileManager.default.createSymbolicLink(at:link,withDestinationURL:outside)
        sweep(data)
        for directory in [stale,stage,trash]{XCTAssertFalse(exists(directory))}
        for directory in [unrelated,outside,link,current.directory]{XCTAssertTrue(exists(directory))}
    }

    func testCleanupFailurePreservesCurrentAndRetriesOnLaterActivity() throws {
        let data=try fixture();defer{SDKRuntimeCache.queue.sync{};try? FileManager.default.removeItem(at:data)}
        let current=try select("a",in:data),stale=data.appendingPathComponent("runtimes/"+String(repeating:"b",count:64))
        defer{withExtendedLifetime(current){}}
        // A malformed lease cannot be safely locked; the sweeper must leave it alone.
        try FileManager.default.createDirectory(at:stale.appendingPathComponent(".lease"),withIntermediateDirectories:true)
        sweep(data);XCTAssertTrue(exists(stale));XCTAssertTrue(exists(current.directory))
        try FileManager.default.removeItem(at:stale.appendingPathComponent(".lease"))
        let same=try select("a",in:data);defer{withExtendedLifetime(same){}}
        SDKRuntimeCache.queue.sync{};XCTAssertFalse(exists(stale))
    }
    func testOtherProcessLeaseSurvivesSweepAndCrashReleasesIt() throws {
        let data=try fixture();defer{SDKRuntimeCache.queue.sync{};try? FileManager.default.removeItem(at:data)}
        var old:SDKRuntime?=try select("a",in:data)
        let oldDirectory=old!.directory,current=try select("b",in:data)
        defer{withExtendedLifetime(current){}}
        // Compile a tiny native lease owner with the Xcode toolchain already required by CI.
        let source=data.appendingPathComponent("lease.c"),executable=data.appendingPathComponent("lease-owner")
        try """
        #include <sys/file.h>
        #include <fcntl.h>
        #include <unistd.h>
        int main(int argc,char **argv) {
            int fd=open(argv[1],O_RDWR|O_CREAT,0600);
            if(fd<0 || flock(fd,LOCK_SH))return 2;
            if(write(1,"1",1)!=1)return 3;
            for(;;)pause();
        }
        """.write(to:source,atomically:true,encoding:.utf8)
        let compiler=Process();compiler.executableURL=URL(fileURLWithPath:"/usr/bin/xcrun");compiler.arguments=["clang",source.path,"-o",executable.path]
        try compiler.run();compiler.waitUntilExit();XCTAssertEqual(compiler.terminationStatus,0)
        let process=Process(),output=Pipe();process.executableURL=executable;process.arguments=[oldDirectory.appendingPathComponent(".lease").path];process.standardOutput=output
        try process.run();defer{if process.isRunning{process.terminate();process.waitUntilExit()}}
        XCTAssertEqual(try output.fileHandleForReading.read(upToCount:1),Data("1".utf8))
        old=nil;sweep(data);XCTAssertTrue(exists(oldDirectory))
        XCTAssertEqual(Darwin.kill(process.processIdentifier,SIGKILL),0);process.waitUntilExit()
        let same=try select("b",in:data);defer{withExtendedLifetime(same){}}
        SDKRuntimeCache.queue.sync{};XCTAssertFalse(exists(oldDirectory));XCTAssertTrue(exists(current.directory))
    }

    func testSweepDoesNotWaitForSelectionAndCleansAfterCoordinationReleases() throws {
        let data=try fixture();defer{SDKRuntimeCache.queue.sync{};try? FileManager.default.removeItem(at:data)}
        let current=try select("a",in:data),root=data.appendingPathComponent("runtimes"),stale=root.appendingPathComponent(String(repeating:"b",count:64))
        defer{withExtendedLifetime(current){}}
        SDKRuntimeCache.queue.sync{}
        try FileManager.default.createDirectory(at:stale,withIntermediateDirectories:true)
        try SDKRuntimeCache.withSelectionLock(in:root) {
            // This would deadlock if the background sweeper waited on the lock.
            sweep(data);XCTAssertTrue(exists(stale))
        }
        sweep(data);XCTAssertFalse(exists(stale));XCTAssertTrue(exists(current.directory))
    }

}
