import Foundation
import Darwin

// REQ-PK-013: descriptor locks protect resources across app processes and crashes.
private final class RuntimeFileLock {
    private var descriptor:Int32
    init?(_ file:URL,operation:Int32) throws {
        descriptor=Darwin.open(file.path,O_CREAT|O_RDWR|O_CLOEXEC|O_NOFOLLOW,mode_t(0o600))
        guard descriptor >= 0 else{throw POSIXError(POSIXErrorCode(rawValue:errno) ?? .EIO)}
        if flock(descriptor,operation) != 0 {
            let error=errno,failed=descriptor;descriptor = -1;Darwin.close(failed)
            if error==EWOULDBLOCK{return nil}
            throw POSIXError(POSIXErrorCode(rawValue:error) ?? .EIO)
        }
    }
    deinit{if descriptor >= 0{Darwin.close(descriptor)}}
}

final class SDKRuntimeLease {
    private var lock:RuntimeFileLock?
    private let root:URL
    fileprivate init(directory:URL,root:URL) throws {
        self.root=root
        lock=try RuntimeFileLock(directory.appendingPathComponent(".lease"),operation:LOCK_SH)
    }
    deinit {
        lock=nil // Close before scheduling, so the sweep can acquire the exclusive lease.
        SDKRuntimeCache.scheduleCleanup(in:root)
    }
}

enum SDKRuntimeCache {
    static let queue=DispatchQueue(label:"CommandCenter.SDKRuntimeCache",qos:.utility)
    static func withSelectionLock<T>(in root:URL,_ body:() throws -> T) throws -> T {
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        let lock=try RuntimeFileLock(root.appendingPathComponent(".coordination"),operation:LOCK_EX)!
        return try withExtendedLifetime(lock){try body()}
    }
    // Must run within withSelectionLock, before exposing the generation to a caller.
    static func lease(directory:URL,root:URL) throws -> SDKRuntimeLease {try SDKRuntimeLease(directory:directory,root:root)}
    static func scheduleCleanup(in root:URL){queue.async{collect(in:root)}}
    static func collect(in root:URL) {
        let files=FileManager.default
        guard files.fileExists(atPath:root.path) else{return}
        var retired=[URL]()
        func temporary(_ name:String,_ prefix:String)->Bool {name.hasPrefix(prefix) && UUID(uuidString:String(name.dropFirst(prefix.count))) != nil}
        do {
            // Sweepers never wait for a selection or another sweep.
            guard let coordination=try RuntimeFileLock(root.appendingPathComponent(".coordination"),operation:LOCK_EX|LOCK_NB) else{return}
            try withExtendedLifetime(coordination) {
                for entry in try files.contentsOfDirectory(at:root,includingPropertiesForKeys:[.isDirectoryKey,.isSymbolicLinkKey]) {
                    do {
                        let values=try entry.resourceValues(forKeys:[.isDirectoryKey,.isSymbolicLinkKey])
                        guard values.isDirectory==true,values.isSymbolicLink != true else{continue}
                        let name=entry.lastPathComponent
                        if temporary(name,".trash-"){retired.append(entry);continue}
                        let generation=name.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil
                        guard generation || temporary(name,".staging-") else{continue}
                        let lease:RuntimeFileLock?
                        if generation {
                            guard let exclusive=try RuntimeFileLock(entry.appendingPathComponent(".lease"),operation:LOCK_EX|LOCK_NB) else{continue}
                            lease=exclusive
                        } else {lease=nil}
                        // Retire under the coordination lock, keeping recursive deletion off it.
                        try withExtendedLifetime(lease) {
                            let trash=root.appendingPathComponent(".trash-"+UUID().uuidString)
                            try files.moveItem(at:entry,to:trash);retired.append(trash)
                        }
                    }catch{NSLog("SDK runtime cache cleanup deferred: %@",error.localizedDescription)}
                }
            }
        }catch{NSLog("SDK runtime cache cleanup deferred: %@",error.localizedDescription)}
        for entry in retired {
            do{try files.removeItem(at:entry)}
            catch{if files.fileExists(atPath:entry.path){NSLog("SDK runtime cache cleanup deferred: %@",error.localizedDescription)}}
        }
    }
}
