import AppKit
import WebKit

// The border owns padding; the native field keeps its natural text/editor height.
final class CommandInputFrame: NSView {
    weak var input: NSTextField?
    override func mouseDown(with event: NSEvent) {
        if let input=input { _ = window?.makeFirstResponder(input) }
    }
}

// WebKit's internal content view can bypass an outer WKWebView's responder override.
// The window is the final authority on whether function content may own native focus.
final class CommandCenterWindow: NSWindow {
    weak var functionArea: NSView?
    var functionCanOwnFocus = false
    var selectionCompleted:(()->Void)?
    // REQ-SH-016: AppKit menu/Command-A selection may never emit DOM keydown.
    @objc func selectAllAndCopy(_ sender:Any?) {
        NSApp.sendAction(NSSelectorFromString("selectAll:"),to:firstResponder,from:sender)
        selectionCompleted?()
    }
    override func makeFirstResponder(_ responder:NSResponder?) -> Bool {
        if let view=responder as? NSView,let area=functionArea,view.isDescendant(of:area),!functionCanOwnFocus{return false}
        return super.makeFirstResponder(responder)
    }
}

// Stateless asset serving, with all content confined to the bundled function build.
final class Assets: NSObject, WKURLSchemeHandler {
    let directory: URL
    init(directory: URL) { self.directory = directory }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let path = url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = directory.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(directory.standardizedFileURL.path + "/") else { task.didFailWithError(NSError(domain: "Assets", code: 403)); return }
        do {
            let data = try Data(contentsOf: file)
            let type = ["html":"text/html", "js":"text/javascript", "css":"text/css", "json":"application/json", "map":"application/json", "svg":"image/svg+xml", "png":"image/png"][file.pathExtension] ?? "application/octet-stream"
            task.didReceive(URLResponse(url: url, mimeType: type, expectedContentLength: data.count, textEncodingName: "utf-8")); task.didReceive(data); task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
final class FunctionWebView: WKWebView {
    var keyboardAllowed = false
    override var acceptsFirstResponder: Bool { keyboardAllowed }
}
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var shell: Shell?
    let generation: String
    init(_ shell: Shell, _ generation: String) { self.shell = shell; self.generation = generation }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let url=message.frameInfo.request.url,
              url.scheme == "commandcenter", url.host == "app" else { return }
        shell?.message(message.body, generation: generation)
    }
}
class Backend {
    static let maximumResponseBytes=2*1024*1024
    static func oversizedResponse(_ count:Int,mutation:Bool)->(String,String)? {
        guard count>maximumResponseBytes else{return nil}
        return mutation
            ? ("outcome_unknown","Response exceeded the limit; this operation may have committed. Inspect records before retrying. No retry was attempted.")
            : ("response_too_large","The local service response exceeded the 2 MiB limit.")
    }
    struct Connection: Decodable { let url: String; let token: String }
    let directory: URL
    init(directory: URL? = nil) {
        if let directory = directory { self.directory = directory }
        else if let index = CommandLine.arguments.firstIndex(of: "--data-dir"), CommandLine.arguments.count > index + 1 {
            self.directory = URL(fileURLWithPath: CommandLine.arguments[index + 1])
        } else if let override = ProcessInfo.processInfo.environment["COMMAND_CENTER_DATA_DIR"] {
            self.directory = URL(fileURLWithPath: override)
        } else { self.directory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/CommandCenter") }
    }
    func request(_ payload: [String: Any], mutation: Bool = false, completion: @escaping ([String:Any])->Void) {
        endpoint("/rpc",payload:payload,mutation:mutation,completion:completion)
    }
    func endpoint(_ route:String,payload:[String:Any]?=nil,mutation:Bool=false,completion:@escaping([String:Any])->Void){
        func failure(_ code: String, _ message: String) { DispatchQueue.main.async { completion(["ok":false,"error":["code":code,"message":message]]) } }
        do {
            let connection = try JSONDecoder().decode(Connection.self, from: Data(contentsOf: directory.appendingPathComponent("connection.json")))
            guard let base = URL(string: connection.url), base.scheme == "http", base.host == "127.0.0.1", let endpoint = URL(string: connection.url + route) else { throw NSError(domain:"Connection",code:1) }
            var request = URLRequest(url: endpoint); request.httpMethod = payload == nil ? "GET" : "POST"; request.timeoutInterval = route == "/management/packs" ? 200 : 30
            request.setValue("Bearer " + connection.token, forHTTPHeaderField:"Authorization"); request.setValue("application/json", forHTTPHeaderField:"Content-Type")
            if let payload=payload{request.httpBody = try JSONSerialization.data(withJSONObject: payload)}
            // REQ-BW-008/009: no view cancellation token and no retry after uncertain writes.
            URLSession.shared.dataTask(with: request) { data, response, error in
                if let data=data,let(code,message)=Backend.oversizedResponse(data.count,mutation:mutation) {failure(code,message);return}
                guard error == nil, let data = data, let body = try? JSONSerialization.jsonObject(with:data) as? [String:Any] else {
                    failure(mutation ? "outcome_unknown" : "unavailable", mutation ? "Response lost; this operation may have committed. Inspect records before retrying. No retry was attempted." : "The local service could not be reached."); return
                }
                DispatchQueue.main.async { completion(body) }
            }.resume()
        } catch { failure("unavailable", "Local service is unavailable. Install/start it using npm run service:install.") }
    }
}
// REQ-FF-011: the shell consumes the same build catalog as the function registries.
struct FunctionCatalog: Decodable {
    struct Command: Decodable {
        let mnemonic:String;let title:String
        let id:String?;let packId:String?;let revision:String?
        let uiDirectory:String?;let webDirectory:String?;let operations:[String:Bool]?
        func directory()->URL {
            if let directory=webDirectory{return URL(fileURLWithPath:directory)}
            return Bundle.main.resourceURL!.appendingPathComponent(uiDirectory ?? "functions/\(mnemonic.lowercased())/web")
        }
    }
    let commands:[Command]
    let localSourceOrigins:[String]
    static let current:FunctionCatalog = {
        guard let url=Bundle.main.url(forResource:"catalog",withExtension:"json"),
              let data=try? Data(contentsOf:url),let catalog=try? JSONDecoder().decode(FunctionCatalog.self,from:data) else {
            fatalError("Missing or invalid build catalog. Rebuild CommandCenter.")
        }
        return catalog
    }()
    // REQ-PK-001/007: external catalog entries only refer to host-owned builds.
    static func installed(in directory:URL)->FunctionCatalog {
        let file=directory.appendingPathComponent("packs/catalog.json")
        guard let data=try? Data(contentsOf:file),let installed=try? JSONDecoder().decode(FunctionCatalog.self,from:data) else{return current}
        let buildRoot=directory.appendingPathComponent("packs/builds").resolvingSymlinksInPath().path+"/"
        let external=installed.commands.filter{command in
            guard command.packId != "cc.system",let path=command.webDirectory else{return false}
            return URL(fileURLWithPath:path).resolvingSymlinksInPath().path.hasPrefix(buildRoot)
        }
        let commands=current.commands+external
        guard Set(commands.map{$0.mnemonic}).count==commands.count else{return current}
        return FunctionCatalog(commands:commands,localSourceOrigins:Array(Set(current.localSourceOrigins+installed.localSourceOrigins)))
    }
}
// REQ-SH-015: external URLs never become documents with access to the function bridge.
enum ExternalLinks {
    static func allowed(_ raw:String,localOrigins:[String]=FunctionCatalog.current.localSourceOrigins) -> URL? {
        guard raw.utf8.count <= 4096, let url=URL(string:raw), let parts=URLComponents(url:url,resolvingAgainstBaseURL:false),
              parts.user == nil, parts.password == nil, let host=parts.host, !host.isEmpty else { return nil }
        if parts.scheme == "https" { return url }
        if parts.scheme == "http", ["127.0.0.1","localhost"].contains(host) {
            let origin="http://\(host)"+(parts.port.map{":\($0)"} ?? "")
            if localOrigins.contains(origin) {return url}
        }
        return nil
    }
    static func bundled(_ url:URL?) -> Bool { url?.scheme == "commandcenter" && url?.host == "app" }
}
// Receives real AppKit text input/IME composition; committed text is buffered, never raw key replay.
final class Capture: NSTextView {
    weak var shell: Shell?
    private var settingMarkedText = false
    override func setMarkedText(_ text:Any, selectedRange:NSRange, replacementRange:NSRange) {
        settingMarkedText=true;defer{settingMarkedText=false}
        super.setMarkedText(text,selectedRange:selectedRange,replacementRange:replacementRange)
    }
    override func insertText(_ insertString: Any, replacementRange: NSRange) {
        // NSTextView internally inserts preedit while implementing setMarkedText.
        // Only the eventual external commit belongs in the function buffer.
        if settingMarkedText {super.insertText(insertString,replacementRange:replacementRange);return}
        let text = (insertString as? NSAttributedString)?.string ?? (insertString as? String ?? "")
        super.insertText(insertString,replacementRange:replacementRange)
        string="";shell?.append(text);shell?.compositionChanged()
    }
    override func keyDown(with event: NSEvent) {
        if hasMarkedText() { super.keyDown(with:event);return }
        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        if modifiers.contains(.command) || modifiers.contains(.control) {
            if modifiers.contains(.command) && event.charactersIgnoringModifiers?.lowercased() == "v" { paste(nil); return }
            shell?.refuse("While loading: text, paste, Backspace, and forward Tab only. Submit again once ready."); return
        }
        if event.keyCode == 48 {
            if modifiers.contains(.shift) { shell?.refuse("Shift-Tab is available after loading.") } else { shell?.tab() }; return
        }
        if event.keyCode == 51 { shell?.backspace(); return }
        if event.keyCode == 36 || event.keyCode == 76 || [115,116,117,119,121,123,124,125,126].contains(event.keyCode) {
            shell?.refuse("Loading: that action was refused. Submit or navigate again once ready."); return
        }
        super.keyDown(with:event)
    }
    override func paste(_ sender: Any?) { if let text = NSPasteboard.general.string(forType:.string) { shell?.append(text) } }
    override func doCommand(by selector: Selector) { shell?.refuse("That editing action is available once the function is ready.") }
}
