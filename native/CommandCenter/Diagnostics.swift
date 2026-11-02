import AppKit

// REQ-ST-003: persistence is independent of workers and never awaited by a transition.
final class DiagnosticsCollector {
    let directory:URL
    private let queue=DispatchQueue(label:"CommandCenter.diagnostics",qos:.utility)
    private var writes=0
    private var known=Set<String>()
    private let lock=NSLock()
    private var queued=0,dropped=0
    init(directory:URL){self.directory=directory.appendingPathComponent("diagnostics")}
    func record(_ snapshot:[String:Any]) {
        lock.lock()
        if queued>=1024{dropped+=1;lock.unlock();return}
        queued+=1;let droppedCount=dropped;lock.unlock()
        queue.async { [self] in
            defer{lock.lock();queued-=1;lock.unlock()}
            do {
                try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
                var record=snapshot
                if droppedCount>0{var context=record["context"] as? [String:Any] ?? [:];context["droppedDiagnosticUpdates"]=droppedCount;record["context"]=context}
                guard let id=record["id"] as? String,let data=try? JSONSerialization.data(withJSONObject:record),data.count<=65536 else{return}
                let file=directory.appendingPathComponent(id+".json")
                try data.write(to:file,options:.atomic);try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
                writes+=1
                known.insert(id)
                if writes==1 || writes%100==0 || known.count>10000 {prune()}
            } catch { NSLog("CommandCenter diagnostics could not be persisted: %@",error.localizedDescription) }
        }
    }
    private func prune(){
        let keys:Set<URLResourceKey>=[.contentModificationDateKey]
        guard let files=try? FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:Array(keys),options:.skipsHiddenFiles) else{return}
        let sorted=files.filter{$0.pathExtension=="json"}.map{($0,(try? $0.resourceValues(forKeys:keys).contentModificationDate) ?? .distantPast)}.sorted{$0.1>$1.1}
        let cutoff=Date().addingTimeInterval(-30*86400)
        for (index,item) in sorted.enumerated() where index>=10000 || item.1<cutoff {try? FileManager.default.removeItem(at:item.0)}
        known=Set(sorted.prefix(10000).filter{$0.1>=cutoff}.map{$0.0.deletingPathExtension().lastPathComponent})
    }
    func flush(){queue.sync{}}
}

// REQ-ST-001/002: readiness is distinct from input ownership, drainage and IME state.
final class TransitionMeasurement {
    let id=UUID().uuidString
    let started:Double
    let token:String
    private let clock:()->Double
    private let collector:DiagnosticsCollector
    private var timer:Timer?
    private(set) var finished=false
    private(set) var straggler=false
    private(set) var snapshot:[String:Any]
    var onStraggler:(()->Void)?
    init(mnemonic:String,command:String,kind:String,token:String,packId:String,functionId:String,revision:String,collector:DiagnosticsCollector,started:Double?=nil,clock:@escaping()->Double={ProcessInfo.processInfo.systemUptime},scheduleDeadline:Bool=true){
        self.clock=clock;self.started=started ?? clock();self.token=token;self.collector=collector
        snapshot=["mnemonic":mnemonic,"packId":packId,"functionId":functionId,"revision":revision,"command":String(command.prefix(4096)),"kind":kind,"startedAt":ISO8601DateFormatter().string(from:Date()),"elapsedMs":0.0,"straggler":false,"outcome":"pending","phases":[String:Double](),"operations":[[String:Any]](),"context":["os":ProcessInfo.processInfo.operatingSystemVersionString,"processors":ProcessInfo.processInfo.processorCount,"physicalMemoryBytes":ProcessInfo.processInfo.physicalMemory,"appActive":NSApp.isActive] as [String:Any]]
        snapshot["id"]=id;collector.record(snapshot)
        if scheduleDeadline {timer=Timer.scheduledTimer(withTimeInterval:0.501,repeats:false){[weak self] _ in self?.checkBudget()}}
    }
    deinit{timer?.invalidate()}
    var elapsedMs:Double{max(0,(clock()-started)*1000)}
    func context(_ values:[String:Any]){var current=snapshot["context"] as? [String:Any] ?? [:];current.merge(values){_,new in new};snapshot["context"]=current}
    func checkBudget(){
        guard !finished,!straggler,elapsedMs>500 else{return}
        straggler=true;snapshot["straggler"]=true;snapshot["elapsedMs"]=elapsedMs;collector.record(snapshot);onStraggler?()
    }
    func finish(_ outcome:String,phases:[String:Double]=[:]){
        guard !finished else{return};checkBudget();finished=true;timer?.invalidate();timer=nil
        snapshot["elapsedMs"]=elapsedMs;snapshot["outcome"]=outcome;snapshot["phases"]=phases;collector.record(snapshot);onStraggler=nil
    }
    func operation(function:String,operation:String,durationMs:Double,outcome:String){
        var operations=snapshot["operations"] as? [[String:Any]] ?? []
        guard operations.count<32 else{return}
        operations.append(["function":function,"operation":operation,"durationMs":max(0,durationMs),"outcome":String(outcome.prefix(64))]);snapshot["operations"]=operations;collector.record(snapshot)
    }
}
