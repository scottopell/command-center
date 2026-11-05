import AppKit

// Native host observation, transport and diagnostics; independent of management widgets.

extension Shell {
    func reloadCatalog(reconcile:Bool=true){
        catalog=FunctionCatalog.installed(in:backend.directory);entries=catalog.commands.map{($0.mnemonic,$0.title)}
        do {sdkRuntime=try SDKRuntime.selected(in:backend.directory,descriptor:catalog.runtime);runtimeError=nil}
        catch {runtimeError="Update required: the local SDK runtime is unavailable or incompatible. Reinstall CommandCenter and its service."}
        functionToolbar.setFunctions(entries)
        functionToolbar.setActiveFunction(active?.mnemonic)
        if reconcile{reconcileInstallation()}
    }
    func beginMeasurement(_ invocation:Invocation,kind:String,started:Double?=nil){
        invocation.measurement?.finish("superseded")
        let definition=invocation.contracts[invocation.mnemonic]
        let trace=TransitionMeasurement(mnemonic:invocation.mnemonic,command:invocation.commandText,kind:kind,token:invocation.transitionToken,packId:definition?.packId ?? "cc.system",functionId:definition?.id ?? invocation.mnemonic.lowercased(),revision:definition?.revision ?? "bundled",collector:collector,foreground:{[weak window] in NSApp.isActive && window?.occlusionState.contains(.visible)==true},started:started)
        trace.context(["windowVisible":window.isVisible,"windowOcclusionVisible":window.occlusionState.contains(.visible),"thermalState":ProcessInfo.processInfo.thermalState.rawValue,"apiEpoch":invocation.apiEpoch ?? sdkRuntime.manifest.apiEpoch,"runtimeFingerprint":invocation.runtimeFingerprint ?? sdkRuntime.manifest.fingerprint,"checkedWith":definition?.checkedWith ?? "host build"])
        let generation=invocation.id,token=invocation.transitionToken,noticeID=trace.id,mnemonic=invocation.mnemonic
        trace.onStraggler={ [weak self] in
            guard let self=self,self.active?.id==generation,self.active?.transitionToken==token else{return}
            self.stragglerNotice.stringValue="Straggler detected · \(mnemonic)"
            self.stragglerNotice.identifier=NSUserInterfaceItemIdentifier(noticeID)
            DispatchQueue.main.asyncAfter(deadline:.now()+3){[weak self] in
                guard let self=self,self.stragglerNotice.identifier?.rawValue==noticeID else{return};self.stragglerNotice.stringValue=""
            }
        }
        invocation.measurement=trace
    }
    func refreshPackBadge(){
        let directory=backend.directory
        DispatchQueue.global(qos:.utility).async{[weak self] in
            guard let data=try? Data(contentsOf:directory.appendingPathComponent("packs/registry.json")),let packs=try? JSONSerialization.jsonObject(with:data) as? [[String:Any]] else{return}
            let visible=packs.filter{($0["removed"] as? Bool) != true}
            let ready=visible.filter{$0["status"] as? String=="ready"}.count,failed=visible.filter{$0["status"] as? String=="failed"}.count,building=visible.contains{$0["status"] as? String=="building"}
            DispatchQueue.main.async{[weak self] in
                guard let self=self else{return}
                self.reloadCatalog()
                self.packsButton.title=failed>0 ? "Pack update failed" : ready>0 ? "Updates ready (\(ready))" : building ? "Building pack…" : "Manage Packs…"
                self.functionToolbar.needsLayout=true
                self.packsButton.contentTintColor=failed>0 ? self.commandErrorColor : ready>0 ? self.commandOrange : nil
                self.management?.render(packs)
            }
        }
    }
    func managePack(_ action:String,id:String?=nil,source:String?=nil,revision:String?=nil,completion:@escaping([String:Any])->Void){
        var payload:[String:Any]=["action":action];if let id=id{payload["id"]=id};if let source=source{payload["source"]=source};if let revision=revision{payload["revision"]=revision}
        backend.endpoint("/management/packs",payload:payload,mutation:true){[weak self] body in
            guard let self=self else{return};self.reloadCatalog();self.refreshPackBadge()
            completion(body)
        }
    }
}
