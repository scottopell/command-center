import XCTest
import WebKit
@testable import CommandCenter

private final class SDKMessages:NSObject,WKScriptMessageHandler {
    var error:String?
    func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage){
        if let body=message.body as? [String:Any],body["kind"] as? String=="error"{print("SDK module error: \(body)");error=body["message"] as? String}
    }
}

@MainActor final class SDKRuntimeTests:XCTestCase {
    // REQ-PK-011: actual module loading/React hooks with unchanged function bytes; no pixel claim.
    func testOpenDocumentPinsSDKAndNextDocumentAdoptsNewSameEpochRuntime() async throws {
        let data=FileManager.default.temporaryDirectory.appendingPathComponent("cc-sdk-"+UUID().uuidString)
        defer{try? SDKRuntimeCache.queue.sync{try FileManager.default.removeItem(at:data)}}
        let source=data.appendingPathComponent("service/toolchain/runtime")
        try FileManager.default.createDirectory(at:source.deletingLastPathComponent(),withIntermediateDirectories:true)
        try FileManager.default.copyItem(at:SDKRuntime.bundled.directory,to:source)
        let manifestFile=source.appendingPathComponent("runtime.json"),framework=source.appendingPathComponent("browser/framework.js")
        var manifest=try JSONSerialization.jsonObject(with:Data(contentsOf:manifestFile)) as! [String:Any]
        let original=try String(contentsOf:framework,encoding:.utf8)
        func generation(_ letter:String) throws -> SDKRuntime {
            manifest["fingerprint"]=String(repeating:letter,count:64)
            try JSONSerialization.data(withJSONObject:manifest).write(to:manifestFile)
            try (original+"\nglobalThis.__sdkRuntimeFixture='\(letter)';\n").write(to:framework,atomically:true,encoding:.utf8)
            return try SDKRuntime.selected(in:data,descriptor:SDKRuntime.Descriptor(apiEpoch:SDKRuntime.bundled.manifest.apiEpoch,fingerprint:String(repeating:letter,count:64),directory:source.path))
        }
        let function=Bundle.main.resourceURL!.appendingPathComponent("functions/slow/web"),bytes=try Data(contentsOf:function.appendingPathComponent("app.js"))
        func open(_ runtime:SDKRuntime) async throws -> FunctionWebView {
            let bridge=SDKMessages(),config=WKWebViewConfiguration();config.userContentController.add(bridge,name:"commandCenter")
            config.setURLSchemeHandler(Assets(directory:function,runtime:runtime),forURLScheme:"commandcenter")
            let web=FunctionWebView(frame:NSRect(x:0,y:0,width:900,height:600),configuration:config)
            web.load(URLRequest(url:URL(string:"commandcenter://app/index.html?function=SLOW&tail=0")!))
            let deadline=Date().addingTimeInterval(10)
            while (try? await web.evaluateJavaScript("!!document.querySelector('[name=title]')") as? Bool) != true {
                if let error=bridge.error{throw NSError(domain:error,code:1)}
                if Date()>deadline{throw NSError(domain:"Shared SDK failed to mount React view",code:1)}
                try await Task.sleep(nanoseconds:10_000_000)
            }
            return web
        }
        let first=try await open(generation("a"));defer{first.stopLoading();first.configuration.userContentController.removeScriptMessageHandler(forName:"commandCenter")}
        _=try await first.evaluateJavaScript("document.querySelector('[name=title]').value='Retained SDK draft';true")
        let second=try await open(generation("b"));defer{second.stopLoading();second.configuration.userContentController.removeScriptMessageHandler(forName:"commandCenter")}
        // REQ-PK-013: the asset handler alone pins the old generation. A new
        // module request after sweeping must still read its files from disk.
        SDKRuntimeCache.queue.sync{SDKRuntimeCache.collect(in:data.appendingPathComponent("runtimes"))}
        let oldURL="commandcenter://app/__runtime/"+String(repeating:"a",count:64)+"/browser/framework.js?lease-check=1"
        let reread=try await first.callAsyncJavaScript("await import(url); return globalThis.__sdkRuntimeFixture;",arguments:["url":oldURL],in:nil,contentWorld:.page) as? String
        XCTAssertEqual(reread,"a")
        let old=try await first.evaluateJavaScript("globalThis.__sdkRuntimeFixture") as? String,new=try await second.evaluateJavaScript("globalThis.__sdkRuntimeFixture") as? String
        XCTAssertEqual(old,"a");XCTAssertEqual(new,"b")
        let draft=try await first.evaluateJavaScript("document.querySelector('[name=title]').value") as? String;XCTAssertEqual(draft,"Retained SDK draft")
        XCTAssertEqual(try Data(contentsOf:function.appendingPathComponent("app.js")),bytes)
    }

    // REQ-PK-012: reject incompatible local runtimes before resolving a function's imports.
    func testEpochMismatchAndUntrustedRuntimePathsAreRejected() throws {
        let data=FileManager.default.temporaryDirectory.appendingPathComponent("cc-sdk-"+UUID().uuidString);defer{try? SDKRuntimeCache.queue.sync{try FileManager.default.removeItem(at:data)}}
        let source=data.appendingPathComponent("service/toolchain/runtime");try FileManager.default.createDirectory(at:source.deletingLastPathComponent(),withIntermediateDirectories:true)
        try FileManager.default.copyItem(at:SDKRuntime.bundled.directory,to:source)
        let file=source.appendingPathComponent("runtime.json");var manifest=try JSONSerialization.jsonObject(with:Data(contentsOf:file)) as! [String:Any]
        manifest["apiEpoch"]=99;try JSONSerialization.data(withJSONObject:manifest).write(to:file)
        XCTAssertThrowsError(try SDKRuntime.selected(in:data,descriptor:SDKRuntime.Descriptor(apiEpoch:99,fingerprint:SDKRuntime.bundled.manifest.fingerprint,directory:source.path)))
        XCTAssertThrowsError(try SDKRuntime.selected(in:data,descriptor:SDKRuntime.Descriptor(apiEpoch:SDKRuntime.bundled.manifest.apiEpoch,fingerprint:SDKRuntime.bundled.manifest.fingerprint,directory:"/tmp/untrusted-sdk")))
        XCTAssertThrowsError(try SDKRuntime.bundled.prepareHTML(Data("legacy embedded function".utf8)))
    }

    func testMissingSDKExportReportsLoadFailureInsteadOfWaitingForReadiness() async throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("cc-sdk-link-"+UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:directory)}
        try FileManager.default.copyItem(at:Bundle.main.resourceURL!.appendingPathComponent("functions/slow/web"),to:directory)
        try "import {missingSDKExport} from '@command-center/runtime/framework';missingSDKExport();".write(to:directory.appendingPathComponent("app.js"),atomically:true,encoding:.utf8)
        let messages=SDKMessages(),config=WKWebViewConfiguration();config.userContentController.add(messages,name:"commandCenter")
        config.setURLSchemeHandler(Assets(directory:directory),forURLScheme:"commandcenter")
        let web=FunctionWebView(frame:NSRect(x:0,y:0,width:900,height:600),configuration:config)
        defer{web.stopLoading();config.userContentController.removeScriptMessageHandler(forName:"commandCenter")}
        web.load(URLRequest(url:URL(string:"commandcenter://app/index.html?function=SLOW&tail=0")!))
        let deadline=Date().addingTimeInterval(8)
        while messages.error==nil {
            if Date()>deadline{XCTFail("Missing SDK export did not produce an actionable startup error");return}
            try await Task.sleep(nanoseconds:10_000_000)
        }
        XCTAssertTrue(messages.error!.contains("Function module failed to load"))
        XCTAssertTrue(messages.error!.contains("pack check"))
    }
}
