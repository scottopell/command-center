import Foundation

// REQ-PK-003/011/012: one host runtime, pinned immutably for each document.
struct SDKRuntime {
    struct Descriptor:Decodable {let apiEpoch:Int;let fingerprint:String;let directory:String}
    struct Manifest:Decodable {let apiEpoch:Int;let fingerprint:String;let imports:[String:String]}
    let directory:URL
    let manifest:Manifest
    static let bundled=try! SDKRuntime(directory:Bundle.main.resourceURL!.appendingPathComponent("toolchain/runtime"))
    init(directory:URL) throws {
        self.directory=directory
        manifest=try JSONDecoder().decode(Manifest.self,from:Data(contentsOf:directory.appendingPathComponent("runtime.json")))
        guard manifest.fingerprint.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil,
              manifest.imports.values.allSatisfy({$0.hasPrefix("browser/") && !$0.split(separator:"/").contains("..")}) else{throw NSError(domain:"Invalid local SDK runtime",code:1)}
    }
    static func selected(in data:URL,descriptor:Descriptor?) throws -> SDKRuntime {
        var selected=bundled
        if let descriptor=descriptor {
            let source=URL(fileURLWithPath:descriptor.directory).resolvingSymlinksInPath()
            let allowed=[data.appendingPathComponent("service/toolchain/runtime"),Bundle.main.resourceURL!.appendingPathComponent("toolchain/runtime")]
            guard allowed.contains(where:{$0.resolvingSymlinksInPath()==source}) else{throw NSError(domain:"Invalid host runtime location. Reinstall the local service.",code:1)}
            selected=try SDKRuntime(directory:source)
            guard selected.manifest.fingerprint==descriptor.fingerprint,selected.manifest.apiEpoch==descriptor.apiEpoch else{throw NSError(domain:"Host runtime changed while loading. Try again.",code:1)}
        }
        guard selected.manifest.apiEpoch==bundled.manifest.apiEpoch else{throw NSError(domain:"Update required: restart the matching CommandCenter app and local service.",code:1)}
        let generations=data.appendingPathComponent("runtimes"),destination=generations.appendingPathComponent(selected.manifest.fingerprint)
        if !FileManager.default.fileExists(atPath:destination.appendingPathComponent("runtime.json").path) {
            try FileManager.default.createDirectory(at:generations,withIntermediateDirectories:true)
            let staging=generations.appendingPathComponent(".staging-"+UUID().uuidString)
            defer{try? FileManager.default.removeItem(at:staging)}
            try FileManager.default.createDirectory(at:staging,withIntermediateDirectories:true)
            try FileManager.default.copyItem(at:selected.directory.appendingPathComponent("browser"),to:staging.appendingPathComponent("browser"))
            try FileManager.default.copyItem(at:selected.directory.appendingPathComponent("runtime.json"),to:staging.appendingPathComponent("runtime.json"))
            guard try SDKRuntime(directory:staging).manifest.fingerprint==selected.manifest.fingerprint else{throw NSError(domain:"Host runtime changed while copying. Try again.",code:1)}
            try FileManager.default.moveItem(at:staging,to:destination)
        }
        return try SDKRuntime(directory:destination)
    }
    func prepareHTML(_ data:Data) throws -> Data {
        guard var html=String(data:data,encoding:.utf8),html.contains("<!-- COMMAND_CENTER_RUNTIME -->") else{throw NSError(domain:"Update required: rebuild this legacy function with API epoch \(manifest.apiEpoch).",code:1)}
        let prefix="commandcenter://app/__runtime/\(manifest.fingerprint)/"
        let imports=manifest.imports.mapValues{prefix+$0}
        let map=String(data:try JSONSerialization.data(withJSONObject:["imports":imports],options:.sortedKeys),encoding:.utf8)!
        let nonce=UUID().uuidString
        html=html.replacingOccurrences(of:"script-src commandcenter:;",with:"script-src commandcenter: 'nonce-\(nonce)';")
        let errors="window.addEventListener('error',e=>{if(!window.commandCenterHost&&(e instanceof ErrorEvent||(e.target instanceof HTMLScriptElement&&e.target.type==='module'&&e.target.src===new URL('app.js',location.href).href)))window.webkit.messageHandlers.commandCenter.postMessage({kind:'error',entryId:'root',message:'Function module failed to load. Run pack check against the current SDK. '+(e.message||'Missing local module')});},true);"
        html=html.replacingOccurrences(of:"<!-- COMMAND_CENTER_RUNTIME -->",with:"<script type=\"importmap\" nonce=\"\(nonce)\">\(map)</script><script nonce=\"\(nonce)\">\(errors)</script><link rel=\"stylesheet\" href=\"\(prefix)browser/style.css\">")
        return Data(html.utf8)
    }
}
