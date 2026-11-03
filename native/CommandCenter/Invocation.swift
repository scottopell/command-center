import Foundation

// REQ-SH-004/005/007/008/011/014: state has one authority and focus-dependent cancellation.
struct PendingText: Equatable {
    private(set) var segments = [""]
    var isEmpty: Bool { segments == [""] }
    mutating func append(_ text: String) { segments[segments.count - 1] += text }
    mutating func tab() { segments.append("") }
    @discardableResult mutating func backspace() -> Bool {
        guard !segments[segments.count - 1].isEmpty else { return false }
        segments[segments.count - 1].removeLast(); return true
    }
    mutating func take() -> [String] { let result = segments; segments = [""]; return result }
}
enum Phase: String { case resolving, draining, interactive, error, retired }
final class Invocation {
    let id = UUID().uuidString
    let mnemonic: String
    let tail: String
    let commandText: String
    let started:Double
    var transitionToken="root"
    var apiEpoch:Int?
    var measurement:TransitionMeasurement?
    var phase = Phase.resolving
    var ownsInput = true
    var viewReady = false
    var inFlight = false
    var focused = false
    var pending = PendingText()
    var siblingIndex = 0, siblingCount = 0
    private(set) var entryStack = ["root"]
    var entryID: String { entryStack.last! }
    var entryDepth: Int { entryStack.count }
    init(_ mnemonic: String, _ tail: String, commandText:String? = nil,started:Double=ProcessInfo.processInfo.systemUptime) { self.mnemonic = mnemonic; self.tail = tail;self.started=started;self.commandText=commandText ?? (mnemonic + (tail.isEmpty ? "" : " " + tail)) }
    func retire() { measurement?.finish("canceled");phase = .retired; ownsInput = false; pending = PendingText() }
    var allowsMutation: Bool { phase == .interactive && ownsInput }
    // REQ-NV-002/006/007: admission replaces UI/capture authority before JS loads.
    @discardableResult func admitEntry(_ id:String, from:String, depth:Int, kind:String) -> Bool {
        guard phase != .retired, from == entryID, !id.isEmpty, id.utf8.count <= 128,
              (1...4).contains(depth) else { return false }
        switch kind {
        case "push":
            guard allowsMutation, depth == entryDepth + 1, !entryStack.contains(id) else{return false}
            entryStack.append(id)
        case "replace":
            guard allowsMutation, depth == entryDepth, !entryStack.contains(id) else{return false}
            entryStack[entryStack.count - 1] = id
        case "back":
            guard entryDepth > 1, depth == entryDepth - 1, entryStack[entryStack.count - 2] == id else{return false}
            entryStack.removeLast()
        default: return false
        }
        siblingIndex=0;siblingCount=0
        phase = .resolving;viewReady=false;inFlight=false;focused=false;pending=PendingText()
        return true
    }
}
struct Command {
    let mnemonic: String
    let tail: String
    init?(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let split = trimmed.firstIndex(where: { $0.isWhitespace }) ?? trimmed.endIndex
        mnemonic = String(trimmed[..<split]).uppercased()
        tail = String(trimmed[split...].drop(while: { $0.isWhitespace }))
    }
}
