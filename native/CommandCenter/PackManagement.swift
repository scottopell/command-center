import AppKit

extension Shell {
    func reloadCatalog(){
        catalog=FunctionCatalog.installed(in:backend.directory);entries=catalog.commands.map{($0.mnemonic,$0.title)}
        for item in catalog.commands {if let operations=item.operations{operationMetadata[item.mnemonic]=operations}}
        let names=Set(catalog.commands.map{$0.mnemonic});operationMetadata=operationMetadata.filter{names.contains($0.key)}
    }
    func beginMeasurement(_ invocation:Invocation,kind:String,started:Double?=nil){
        invocation.measurement?.finish("superseded")
        let definition=catalog.commands.first{$0.mnemonic==invocation.mnemonic}
        let trace=TransitionMeasurement(mnemonic:invocation.mnemonic,command:invocation.commandText,kind:kind,token:invocation.transitionToken,packId:definition?.packId ?? "cc.system",functionId:definition?.id ?? invocation.mnemonic.lowercased(),revision:definition?.revision ?? "bundled",collector:collector,started:started)
        trace.context(["windowVisible":window.isVisible,"windowOcclusionVisible":window.occlusionState.contains(.visible),"thermalState":ProcessInfo.processInfo.thermalState.rawValue])
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
                self.packsButton.title=failed>0 ? "Pack update failed" : ready>0 ? "Updates ready (\(ready))" : building ? "Building pack…" : "Functions…"
                self.packsButton.contentTintColor=failed>0 ? self.commandErrorColor : ready>0 ? self.commandOrange : nil
                self.management?.render(packs)
            }
        }
    }
    @objc func showPackManagement(){
        if let management=management{management.panel.makeKeyAndOrderFront(nil);return}
        let controller=PackManagement(shell:self);management=controller;window.beginSheet(controller.panel);controller.refresh()
    }
    func managePack(_ action:String,id:String?=nil,source:String?=nil,completion:@escaping([String:Any])->Void){
        let affected=active.flatMap{current in catalog.commands.first{$0.mnemonic==current.mnemonic}?.packId==id ? current.mnemonic : nil}
        if (action=="apply" || action=="remove"),affected != nil{cancel()}
        var payload:[String:Any]=["action":action];if let id=id{payload["id"]=id};if let source=source{payload["source"]=source}
        backend.endpoint("/management/packs",payload:payload){[weak self] body in
            guard let self=self else{return};self.reloadCatalog();self.refreshPackBadge()
            if action=="apply",let mnemonic=affected,self.entries.contains(where:{$0.0==mnemonic}){self.command.stringValue=mnemonic;self.execute()}
            completion(body)
        }
    }
}

// REQ-PK-001/005/008/009: native-only management, separate from function worker APIs.
final class PackManagement:NSObject {
    weak var shell:Shell?
    let panel=NSPanel(contentRect:NSRect(x:0,y:0,width:830,height:560),styleMask:[.titled],backing:.buffered,defer:false)
    private let rows=NSStackView()
    private let feedback=NSTextField(labelWithString:"Add a source folder. Builds are automatic; applying them is manual.")
    private var busy=false
    init(shell:Shell){
        self.shell=shell;super.init();panel.title="CommandCenter · Function Packs"
        let root=NSStackView();root.orientation = .vertical;root.alignment = .leading;root.spacing=12;root.edgeInsets=NSEdgeInsets(top:16,left:16,bottom:16,right:16)
        panel.contentView=root
        let title=NSTextField(labelWithString:"FUNCTION PACKS");title.font = .monospacedSystemFont(ofSize:18,weight:.bold);root.addArrangedSubview(title)
        feedback.maximumNumberOfLines=4;feedback.lineBreakMode = .byWordWrapping;root.addArrangedSubview(feedback)
        let scroll=NSScrollView();scroll.hasVerticalScroller=true;scroll.drawsBackground=false
        rows.orientation = .vertical;rows.alignment = .leading;rows.spacing=16;rows.translatesAutoresizingMaskIntoConstraints=false;scroll.documentView=rows;root.addArrangedSubview(scroll)
        NSLayoutConstraint.activate([scroll.widthAnchor.constraint(equalTo:root.widthAnchor,constant:-32),scroll.heightAnchor.constraint(equalToConstant:365),rows.widthAnchor.constraint(equalTo:scroll.widthAnchor,constant:-18)])
        let controls=NSStackView();controls.orientation = .horizontal
        for (title,action) in [("Add Folder…",#selector(addFolder)),("Refresh",#selector(refresh)),("Done",#selector(close))]{let button=NSButton(title:title,target:self,action:action);controls.addArrangedSubview(button)}
        root.addArrangedSubview(controls)
    }
    @objc func close(){guard let shell=shell else{return};shell.window.endSheet(panel);panel.orderOut(nil);shell.management=nil;shell.focusCommand()}
    @objc func refresh(){shell?.backend.endpoint("/management/packs"){[weak self] body in
        if let packs=body["result"] as? [[String:Any]]{self?.render(packs)}else{self?.feedback.stringValue=(body["error"] as? [String:Any])?["message"] as? String ?? "Local service unavailable"}
    }}
    @objc func addFolder(){
        let picker=NSOpenPanel();picker.canChooseDirectories=true;picker.canChooseFiles=false;picker.allowsMultipleSelection=false
        picker.beginSheetModal(for:panel){[weak self] response in guard response == .OK,let self=self,let url=picker.url else{return};self.perform("add",source:url.path)}
    }
    func render(_ packs:[[String:Any]]){
        rows.arrangedSubviews.forEach{rows.removeArrangedSubview($0);$0.removeFromSuperview()}
        if packs.isEmpty{rows.addArrangedSubview(NSTextField(labelWithString:"No folder packs registered. DRQS, HOST, SLOW and STRAG are supplied by CommandCenter."))}
        for pack in packs{
            guard let id=pack["id"] as? String else{continue}
            let removed=pack["removed"] as? Bool==true,state=pack["status"] as? String ?? "unknown"
            let text=NSTextField(labelWithString:"\(id) · \(removed ? "removed · data retained" : state)\n\(pack["source"] as? String ?? "")\n\(String((pack["error"] as? String ?? "").prefix(700)))")
            text.font = .monospacedSystemFont(ofSize:11,weight:.regular);text.maximumNumberOfLines=7;text.lineBreakMode = .byWordWrapping;rows.addArrangedSubview(text);text.widthAnchor.constraint(equalTo:rows.widthAnchor,constant:-10).isActive=true
            let buttons=NSStackView();buttons.orientation = .horizontal
            for (title,action) in [("Build","build"),("Apply & Relaunch","apply"),("Remove","remove"),("Delete Retained Data…","purge")]{
                let button=NSButton(title:title,target:self,action:#selector(PackManagement.action(_:)));button.identifier=NSUserInterfaceItemIdentifier(action+":"+id)
                button.isEnabled = !busy && (action=="purge" ? removed : !removed) && (action != "apply" || (state == "ready" && pack["candidate"] != nil))
                buttons.addArrangedSubview(button)
            }
            rows.addArrangedSubview(buttons)
        }
    }
    @objc func action(_ sender:NSButton){
        guard let value=sender.identifier?.rawValue,let split=value.firstIndex(of:":") else{return};let action=String(value[..<split]),id=String(value[value.index(after:split)...])
        if action=="purge"{let alert=NSAlert();alert.messageText="Delete retained data for \(id)?";alert.informativeText="This permanently deletes this removed pack's CommandCenter KV records. External owner data is not deleted.";alert.addButton(withTitle:"Delete Data");alert.addButton(withTitle:"Cancel");alert.beginSheetModal(for:panel){[weak self] response in if response == .alertFirstButtonReturn{self?.perform(action,id:id)}};return}
        perform(action,id:id)
    }
    private func perform(_ action:String,id:String?=nil,source:String?=nil){
        guard !busy else{return};busy=true;feedback.stringValue=action=="add" || action=="build" ? "Building a controlled copy…" : "Applying management action…"
        shell?.managePack(action,id:id,source:source){[weak self] body in
            guard let self=self else{return};self.busy=false
            self.feedback.stringValue=(body["ok"] as? Bool)==true ? "Completed. Apply uses a fresh function invocation without arguments." : ((body["error"] as? [String:Any])?["message"] as? String ?? "Management action failed")
            self.refresh()
        }
    }
}
