import AppKit

extension Shell {
    func reloadCatalog(){
        catalog=FunctionCatalog.installed(in:backend.directory);entries=catalog.commands.map{($0.mnemonic,$0.title)}
        for item in catalog.commands {if let operations=item.operations{operationMetadata[item.mnemonic]=operations}}
        let names=Set(catalog.commands.map{$0.mnemonic});operationMetadata=operationMetadata.filter{names.contains($0.key)}
        functionToolbar.setFunctions(entries)
        functionToolbar.setActiveFunction(active?.mnemonic)
    }
    func beginMeasurement(_ invocation:Invocation,kind:String,started:Double?=nil){
        invocation.measurement?.finish("superseded")
        let definition=catalog.commands.first{$0.mnemonic==invocation.mnemonic}
        let trace=TransitionMeasurement(mnemonic:invocation.mnemonic,command:invocation.commandText,kind:kind,token:invocation.transitionToken,packId:definition?.packId ?? "cc.system",functionId:definition?.id ?? invocation.mnemonic.lowercased(),revision:definition?.revision ?? "bundled",collector:collector,foreground:{[weak window] in NSApp.isActive && window?.occlusionState.contains(.visible)==true},started:started)
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
                self.reloadCatalog()
                self.packsButton.title=failed>0 ? "Pack update failed" : ready>0 ? "Updates ready (\(ready))" : building ? "Building pack…" : "Manage Packs…"
                self.functionToolbar.needsLayout=true
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

// REQ-PK-001/005/008/009: native management describes availability and the next useful action.
struct PackPresentation {
    let id: String
    let source: String
    let state: String
    let installed: Bool
    let removed: Bool
    let candidate: String?
    let error: String?
    let relaunch: Bool
    var title: String { source.isEmpty ? id : URL(fileURLWithPath: source).lastPathComponent }
    var preparing: Bool { !removed && (state == "building" || state == "changed") }
    var ready: Bool { !removed && state == "ready" && candidate != nil }
    var failed: Bool { !removed && state == "failed" }
    var status: String {
        if removed { return "Removed" }
        if preparing { return "Preparing…" }
        if failed { return installed ? "Update failed" : "Setup failed" }
        if ready { return installed ? "Update ready" : "Ready to enable" }
        return installed ? "Up to date" : "Not enabled"
    }
    var explanation: String {
        if removed { return "These functions are no longer available in CommandCenter. Removal does not delete saved data." }
        if preparing { return installed ? "Preparing your saved edits. The installed version is still available." : "Preparing functions from this folder. You can enable them when ready." }
        if failed { return installed ? "The installed version is still available. View the error, fix the source, then retry." : "This pack could not be prepared. View the error, fix the source, then retry." }
        if ready { return relaunch ? "Applying restarts the open function without its draft, history or arguments." : installed ? "Your update is ready. Apply it to use the new version." : "Enable this pack to make its functions available in CommandCenter." }
        return installed ? "Saved edits are prepared automatically. You choose when to apply updates." : "Check this folder to prepare its functions."
    }
    var primaryTitle: String? {
        if removed { return "Add Again" }
        if failed { return "Retry" }
        if ready { return installed ? (relaunch ? "Apply & Relaunch" : "Apply Update") : "Enable Functions" }
        return nil
    }
    var primaryAction: String? { removed ? "add" : failed ? "build" : ready ? "apply" : nil }
    var color: NSColor { removed ? .secondaryLabelColor : failed ? .systemRed : preparing || ready ? NSColor(calibratedRed:1,green:0.61,blue:0.16,alpha:1) : installed ? .systemGreen : .secondaryLabelColor }
    init?(_ pack: [String:Any], relaunch: Bool = false) {
        guard let id = pack["id"] as? String else { return nil }
        self.id=id;source=pack["source"] as? String ?? "";state=pack["status"] as? String ?? "unknown"
        removed=pack["removed"] as? Bool == true;installed=pack["active"] as? String != nil && !removed
        candidate=pack["candidate"] as? String;error=pack["error"] as? String;self.relaunch=relaunch
    }
}

private final class PackDocumentView: NSView {
    override var isFlipped: Bool { true }
}

final class PackManagement: NSObject {
    weak var shell: Shell?
    let panel=NSPanel(contentRect:NSRect(x:0,y:0,width:840,height:440),styleMask:[.titled],backing:.buffered,defer:false)
    let scroll=NSScrollView()
    let rows=NSStackView()
    private let document=PackDocumentView()
    private let feedback=NSTextField(labelWithString: "")
    private let count=NSTextField(labelWithString: "Loading packs…")
    private let addButton=NSButton(title:"Add Pack…",target:nil,action:nil)
    private let refreshButton=NSButton()
    private var busy=false
    private var packs=[[String:Any]]()
    private var snapshot: Data?
    private var displayedCount: Int?
    private var refreshFailed=false

    init(shell:Shell) {
        self.shell=shell;super.init()
        panel.title="CommandCenter · Function Packs"
        let root=NSView();root.wantsLayer=true;root.layer?.backgroundColor=NSColor(calibratedWhite:0.055,alpha:1).cgColor;panel.contentView=root
        let title=label("Function Packs",size:22,weight:.semibold)
        let subtitle=label("Packs add functions to CommandCenter.",size:13,color:.secondaryLabelColor)
        addButton.target=self;addButton.action=#selector(addFolder);addButton.bezelStyle = .rounded
        addButton.contentTintColor=shell.commandOrange;addButton.identifier=NSUserInterfaceItemIdentifier("add-pack")
        refreshButton.image=NSImage(systemSymbolName:"arrow.clockwise",accessibilityDescription:"Refresh pack status")
        refreshButton.target=self;refreshButton.action=#selector(refresh);refreshButton.bezelStyle = .rounded;refreshButton.toolTip="Refresh status"
        count.font = .systemFont(ofSize:12,weight:.medium);count.textColor = .secondaryLabelColor
        scroll.hasVerticalScroller=true;scroll.autohidesScrollers=true;scroll.drawsBackground=false;scroll.borderType = .noBorder
        document.translatesAutoresizingMaskIntoConstraints=false;scroll.documentView=document
        rows.orientation = .vertical;rows.alignment = .leading;rows.spacing=12;rows.translatesAutoresizingMaskIntoConstraints=false;document.addSubview(rows)
        let divider=NSBox();divider.boxType = .separator
        let builtins=shell.catalog.commands.filter{$0.packId == "cc.system"}.map{$0.mnemonic}.joined(separator:" · ")
        let included=label("Included with CommandCenter   "+builtins,size:11,color:.secondaryLabelColor)
        let done=NSButton(title:"Done",target:self,action:#selector(close));done.bezelStyle = .rounded;done.keyEquivalent="\u{1b}"
        feedback.font = .systemFont(ofSize:12);feedback.maximumNumberOfLines=2;feedback.lineBreakMode = .byWordWrapping
        for view in [title,subtitle,addButton,refreshButton,count,scroll,divider,included,feedback,done] {view.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(view)}
        NSLayoutConstraint.activate([
            title.leadingAnchor.constraint(equalTo:root.leadingAnchor,constant:24),title.topAnchor.constraint(equalTo:root.topAnchor,constant:24),
            addButton.trailingAnchor.constraint(equalTo:root.trailingAnchor,constant:-24),addButton.centerYAnchor.constraint(equalTo:title.centerYAnchor),
            refreshButton.trailingAnchor.constraint(equalTo:addButton.leadingAnchor,constant:-8),refreshButton.centerYAnchor.constraint(equalTo:addButton.centerYAnchor),
            subtitle.leadingAnchor.constraint(equalTo:title.leadingAnchor),subtitle.topAnchor.constraint(equalTo:title.bottomAnchor,constant:6),subtitle.trailingAnchor.constraint(lessThanOrEqualTo:root.trailingAnchor,constant:-24),
            count.leadingAnchor.constraint(equalTo:title.leadingAnchor),count.topAnchor.constraint(equalTo:subtitle.bottomAnchor,constant:22),
            scroll.leadingAnchor.constraint(equalTo:root.leadingAnchor,constant:24),scroll.trailingAnchor.constraint(equalTo:root.trailingAnchor,constant:-24),scroll.topAnchor.constraint(equalTo:count.bottomAnchor,constant:10),scroll.bottomAnchor.constraint(equalTo:divider.topAnchor,constant:-16),
            document.widthAnchor.constraint(equalTo:scroll.contentView.widthAnchor),
            rows.leadingAnchor.constraint(equalTo:document.leadingAnchor),rows.trailingAnchor.constraint(equalTo:document.trailingAnchor),rows.topAnchor.constraint(equalTo:document.topAnchor),rows.bottomAnchor.constraint(equalTo:document.bottomAnchor,constant:-4),
            divider.leadingAnchor.constraint(equalTo:title.leadingAnchor),divider.trailingAnchor.constraint(equalTo:addButton.trailingAnchor),divider.bottomAnchor.constraint(equalTo:included.topAnchor,constant:-14),
            included.leadingAnchor.constraint(equalTo:title.leadingAnchor),included.bottomAnchor.constraint(equalTo:done.topAnchor,constant:-18),
            done.trailingAnchor.constraint(equalTo:addButton.trailingAnchor),done.bottomAnchor.constraint(equalTo:root.bottomAnchor,constant:-20),done.widthAnchor.constraint(greaterThanOrEqualToConstant:78),
            feedback.leadingAnchor.constraint(equalTo:title.leadingAnchor),feedback.trailingAnchor.constraint(lessThanOrEqualTo:done.leadingAnchor,constant:-16),feedback.centerYAnchor.constraint(equalTo:done.centerYAnchor)
        ])
    }

    private func label(_ text:String,size:CGFloat=13,weight:NSFont.Weight = .regular,color:NSColor = .labelColor)->NSTextField {
        let field=NSTextField(wrappingLabelWithString:text);field.font = .systemFont(ofSize:size,weight:weight);field.textColor=color;return field
    }
    @objc func close() {guard let shell=shell else{return};shell.window.endSheet(panel);panel.orderOut(nil);shell.management=nil;shell.focusCommand()}
    @objc func refresh() {
        shell?.backend.endpoint("/management/packs"){[weak self] body in
            guard let self=self else{return}
            if let packs=body["result"] as? [[String:Any]] {
                if self.refreshFailed {self.refreshFailed=false;self.showFeedback("Status refreshed.")}
                self.render(packs)
            } else {
                self.refreshFailed=true
                if self.snapshot == nil {self.count.stringValue="Added packs"}
                self.showFeedback((body["error"] as? [String:Any])?["message"] as? String ?? "The local service is unavailable. Try refreshing.",error:true)
            }
        }
    }
    @objc func addFolder() {
        guard !busy else{return}
        let picker=NSOpenPanel();picker.canChooseDirectories=true;picker.canChooseFiles=false;picker.allowsMultipleSelection=false
        picker.title="Add a Function Pack";picker.message="Choose a folder containing command-center.json.";picker.prompt="Add Pack"
        picker.beginSheetModal(for:panel){[weak self] response in guard response == .OK,let self=self,let url=picker.url else{return};self.perform("add",source:url.path)}
    }
    // Read installed metadata, never mutable source. This also works when a source folder is offline.
    private func functionNames(_ pack:[String:Any])->[String] {
        guard let shell=shell else{return []}
        for key in ["active","candidate"] {
            guard let revision=pack[key] as? String,revision.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil else{continue}
            let file=shell.backend.directory.appendingPathComponent("packs/builds/\(revision)/artifact.json")
            if let data=try? Data(contentsOf:file),let artifact=try? JSONSerialization.jsonObject(with:data) as? [String:Any],let functions=artifact["functions"] as? [[String:Any]] {return functions.compactMap{$0["mnemonic"] as? String}}
        }
        return shell.catalog.commands.filter{$0.packId == pack["id"] as? String}.map{$0.mnemonic}
    }
    func render(_ packs:[[String:Any]]) {
        let next=try? JSONSerialization.data(withJSONObject:packs,options:.sortedKeys)
        guard next != snapshot else{return};snapshot=next;self.packs=packs
        if displayedCount != packs.count {
            displayedCount=packs.count
            panel.setContentSize(NSSize(width:840,height:min(620,max(380,280+160*CGFloat(packs.count)))))
        }
        let position=scroll.contentView.bounds.origin
        rows.arrangedSubviews.forEach{rows.removeArrangedSubview($0);$0.removeFromSuperview()}
        let added=packs.filter{$0["removed"] as? Bool != true}.count
        count.stringValue="\(added) added \(added == 1 ? "pack" : "packs")"
        if packs.isEmpty {
            let empty=NSStackView();empty.orientation = .vertical;empty.alignment = .leading;empty.spacing=10;empty.edgeInsets=NSEdgeInsets(top:22,left:20,bottom:22,right:20)
            empty.addArrangedSubview(label("Add your first pack",size:17,weight:.semibold))
            empty.addArrangedSubview(label("Choose a folder containing command-center.json. Its functions will appear here before you enable them.",color:.secondaryLabelColor))
            rows.addArrangedSubview(empty);empty.widthAnchor.constraint(equalTo:rows.widthAnchor).isActive=true
        }
        for pack in packs {
            let affected=shell?.active.flatMap{active in shell?.catalog.commands.first{$0.mnemonic==active.mnemonic}?.packId} == pack["id"] as? String
            guard let model=PackPresentation(pack,relaunch:affected) else{continue}
            let card=makeCard(model,functions:functionNames(pack));rows.addArrangedSubview(card);card.widthAnchor.constraint(equalTo:rows.widthAnchor).isActive=true
        }
        panel.contentView?.layoutSubtreeIfNeeded();scroll.contentView.scroll(to:position);scroll.reflectScrolledClipView(scroll.contentView)
    }
    private func redraw() {snapshot=nil;render(packs)}
    private func makeCard(_ pack:PackPresentation,functions:[String])->NSView {
        let card=NSView();card.wantsLayer=true;card.layer?.cornerRadius=8
        card.layer?.backgroundColor=NSColor(calibratedWhite:0.085,alpha:1).cgColor;card.layer?.borderColor=NSColor(calibratedWhite:0.18,alpha:1).cgColor;card.layer?.borderWidth=1
        card.identifier=NSUserInterfaceItemIdentifier("pack:"+pack.id)
        let stack=NSStackView();stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=9;stack.translatesAutoresizingMaskIntoConstraints=false;card.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:card.leadingAnchor,constant:16),stack.trailingAnchor.constraint(equalTo:card.trailingAnchor,constant:-16),stack.topAnchor.constraint(equalTo:card.topAnchor,constant:16),stack.bottomAnchor.constraint(equalTo:card.bottomAnchor,constant:-16)])
        let heading=NSStackView();heading.orientation = .horizontal;heading.spacing=12
        let title=label(pack.title,size:16,weight:.semibold);title.maximumNumberOfLines=1;title.lineBreakMode = .byTruncatingMiddle
        let status=label(pack.status,size:12,weight:.medium,color:pack.color);status.setContentHuggingPriority(.required,for:.horizontal)
        heading.addArrangedSubview(title);heading.addArrangedSubview(NSView());heading.addArrangedSubview(status)
        stack.addArrangedSubview(heading);heading.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        let names=label(functions.isEmpty ? "Functions will be listed after preparation." : functions.joined(separator:"   "),size:13,weight:.medium,color:pack.removed ? .secondaryLabelColor : shell?.commandOrange ?? .systemOrange)
        names.font = .monospacedSystemFont(ofSize:13,weight:.medium);stack.addArrangedSubview(names);names.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        let source=label("Folder  "+(pack.source as NSString).abbreviatingWithTildeInPath,size:11,color:.secondaryLabelColor);source.maximumNumberOfLines=1;source.lineBreakMode = .byTruncatingMiddle;source.toolTip=pack.source
        stack.addArrangedSubview(source);source.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        let explanation=label(pack.explanation,size:12,color:.secondaryLabelColor);stack.addArrangedSubview(explanation);explanation.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        let actions=NSStackView();actions.orientation = .horizontal;actions.spacing=8
        if pack.preparing {let spinner=NSProgressIndicator();spinner.style = .spinning;spinner.controlSize = .small;spinner.startAnimation(nil);actions.addArrangedSubview(spinner)}
        if pack.failed {let details=button("View Error…",action:"details",id:pack.id);actions.addArrangedSubview(details)}
        actions.addArrangedSubview(NSView())
        let more=NSPopUpButton(frame:.zero,pullsDown:true);more.addItem(withTitle:"More");more.bezelStyle = .rounded;more.isEnabled = !busy
        func item(_ title:String,_ action:String) {let item=NSMenuItem(title:title,action:#selector(menuAction(_:)),keyEquivalent:"");item.target=self;item.representedObject=action+":"+pack.id;item.isEnabled = !busy && !(action == "build" && pack.preparing);more.menu?.addItem(item)}
        more.menu?.autoenablesItems=false
        item("Pack Details…","details")
        if !pack.removed {item("Check for Changes","build");more.menu?.addItem(.separator());item("Remove Pack…","remove")}
        else {more.menu?.addItem(.separator());item("Delete Saved Data…","purge")}
        actions.addArrangedSubview(more)
        if let title=pack.primaryTitle,let action=pack.primaryAction {let primary=button(title,action:action,id:pack.id);primary.contentTintColor=shell?.commandOrange;actions.addArrangedSubview(primary)}
        stack.addArrangedSubview(actions);actions.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true
        return card
    }
    private func button(_ title:String,action:String,id:String)->NSButton {
        let button=NSButton(title:title,target:self,action:#selector(PackManagement.action(_:)));button.identifier=NSUserInterfaceItemIdentifier(action+":"+id);button.bezelStyle = .rounded;button.isEnabled = !busy;return button
    }
    @objc private func action(_ sender:NSButton) {if let value=sender.identifier?.rawValue{route(value)}}
    @objc private func menuAction(_ sender:NSMenuItem) {if let value=sender.representedObject as? String{route(value)}}
    private func route(_ value:String) {
        guard !busy,let split=value.firstIndex(of:":") else{return}
        let action=String(value[..<split]),id=String(value[value.index(after:split)...])
        guard let raw=packs.first(where:{$0["id"] as? String==id}),let pack=PackPresentation(raw) else{return}
        if action=="details" {showDetails(pack,raw:raw);return}
        if action=="add" {perform(action,source:pack.source);return}
        if action=="remove" || action=="purge" {
            let alert=NSAlert();alert.messageText=action=="remove" ? "Remove \(pack.title)?" : "Delete saved data for \(pack.title)?"
            alert.informativeText=action=="remove" ? "Its functions will be removed from CommandCenter. Saved data stays on this Mac, and you can add the pack again. An open function from this pack will close." : "This permanently deletes this removed pack’s CommandCenter records. Data owned by external applications is not deleted."
            alert.addButton(withTitle:action=="remove" ? "Remove Pack" : "Delete Data");alert.addButton(withTitle:"Cancel")
            alert.beginSheetModal(for:panel){[weak self] response in if response == .alertFirstButtonReturn{self?.perform(action,id:id)}};return
        }
        perform(action,id:id)
    }
    private func showDetails(_ pack:PackPresentation,raw:[String:Any]) {
        let alert=NSAlert();alert.messageText=pack.title;alert.informativeText="Pack details";alert.addButton(withTitle:"Done")
        let scroll=NSScrollView(frame:NSRect(x:0,y:0,width:590,height:260));scroll.hasVerticalScroller=true;scroll.borderType = .bezelBorder
        let text=NSTextView(frame:scroll.bounds);text.isEditable=false;text.isSelectable=true;text.font = .monospacedSystemFont(ofSize:12,weight:.regular);text.textContainerInset=NSSize(width:10,height:10)
        text.autoresizingMask = [.width];text.isHorizontallyResizable=false;text.textContainer?.widthTracksTextView=true
        text.string="Pack ID: \(pack.id)\nSource folder: \(pack.source)\nFunctions: \(functionNames(raw).joined(separator:", "))\nInstalled build: \(raw["active"] as? String ?? "Not enabled")\nPrepared build: \(pack.candidate ?? "None")"+(pack.error.map{"\n\nPreparation error\n\n"+$0} ?? "")
        scroll.documentView=text;alert.accessoryView=scroll;alert.beginSheetModal(for:panel)
    }
    private func showFeedback(_ text:String,error:Bool=false) {feedback.stringValue=text;feedback.textColor=error ? .systemRed : .secondaryLabelColor}
    private func perform(_ action:String,id:String?=nil,source:String?=nil) {
        guard !busy else{return};busy=true;addButton.isEnabled=false;refreshButton.isEnabled=false;redraw()
        showFeedback(action=="add" ? "Preparing functions from this folder…" : action=="build" ? "Checking source for changes…" : action=="apply" ? "Applying update…" : action=="remove" ? "Removing pack…" : "Deleting saved data…")
        shell?.managePack(action,id:id,source:source){[weak self] body in
            guard let self=self else{return};self.busy=false;self.addButton.isEnabled=true;self.refreshButton.isEnabled=true;self.redraw()
            if body["ok"] as? Bool == true {
                let status=(body["result"] as? [String:Any])?["status"] as? String
                self.showFeedback(action=="apply" ? "Functions are available in CommandCenter." : action=="remove" ? "Pack removed. Saved data was kept." : action=="purge" ? "Saved data deleted." : status=="active" ? "Already up to date." : "Pack prepared. Choose when to enable or apply it above.")
            } else {self.showFeedback((body["error"] as? [String:Any])?["message"] as? String ?? "Could not complete this action. Try refreshing.",error:true)}
            self.refresh()
        }
    }
}
