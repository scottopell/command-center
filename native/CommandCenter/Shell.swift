import AppKit
import WebKit
import QuartzCore

final class Shell: NSObject, NSTextFieldDelegate, WKNavigationDelegate, NSMenuItemValidation {
    let window: CommandCenterWindow
    let command = NSTextField()
    let commandFrame = CommandInputFrame()
    let autocompleteButton = NSButton()
    let functionToolbar = FunctionToolbar(frame:.zero)
    let content = NSView()
    let backButton = NSButton(title:"‹ Back",target:nil,action:nil)
    let previousButton = NSButton(title:"Previous",target:nil,action:nil)
    let nextButton = NSButton(title:"Next",target:nil,action:nil)
    let siblingPosition = NSTextField(labelWithString:"")
    let status = NSTextField(labelWithString: "READY · Enter a function mnemonic")
    let overlay = NSTextField(labelWithString: "")
    let suggestions = NSStackView()
    let suggestionPanel = NSView()
    var suggestionHeight: NSLayoutConstraint!
    let capture = Capture(frame: .zero)
    let backend: Backend
    let externalOpener: (URL)->Bool
    let clipboardWriter: (String)->Bool
    var catalog = FunctionCatalog.current
    var sdkRuntime=SDKRuntime.bundled
    var runtimeError:String?
    var entries = [(String,String)]()
    let collector:DiagnosticsCollector
    let stragglerNotice=NSTextField(labelWithString:"")
    var packsButton:NSButton {functionToolbar.managementButton}
    var packsTimer:Timer?
    var management:PackManagement?
    var active: Invocation?
    var web: FunctionWebView?
    var eventMonitor: Any?
    var clickMonitor: Any?
    var visibilityObservers=[NSObjectProtocol]()
    var samples = [[String:Any]]()
    var launched = 0, retired = 0
    var operationMetadata = [String:[String:Bool]]()
    var suggestionMatches = [String]()
    var selectedSuggestion = -1
    var completionRequested = false
    var commandError: String?
    let amber = NSColor(calibratedRed:0.98,green:0.72,blue:0.18,alpha:1)
    let commandOrange = NSColor(calibratedRed:1,green:0.61,blue:0.16,alpha:1)
    let commandErrorColor = NSColor(calibratedRed:1,green:0.43,blue:0.33,alpha:1)

    init(backend: Backend = Backend(), clipboardWriter: @escaping (String)->Bool = { value in NSPasteboard.general.clearContents();return NSPasteboard.general.setString(value,forType:.string) }, externalOpener: @escaping (URL)->Bool = { NSWorkspace.shared.open($0) }) {
        self.backend = backend
        self.collector=DiagnosticsCollector(directory:backend.directory)
        self.externalOpener = externalOpener
        self.clipboardWriter = clipboardWriter
        window = CommandCenterWindow(contentRect:NSRect(x:0,y:0,width:1280,height:850),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        super.init()
        functionToolbar.onLaunch={ [weak self] mnemonic in self?.launchFunction(mnemonic) }
        window.title = "CommandCenter"; window.minSize = NSSize(width:930,height:620); window.center()
        window.backgroundColor = NSColor(calibratedWhite:0.04,alpha:1)
        if let url = Bundle.main.url(forResource:"operations",withExtension:"json"), let data = try? Data(contentsOf:url), let registry = try? JSONSerialization.jsonObject(with:data) as? [String:[String:Bool]] { operationMetadata = registry }
        reloadCatalog()
        build()
        window.functionArea=content
        window.selectionCompleted = { [weak self] in
            guard let self=self,let i=self.active,i.allowsMutation else{return}
            let entry=i.entryID,generation=i.id
            let literal=String(data:try! JSONSerialization.data(withJSONObject:entry,options:.fragmentsAllowed),encoding:.utf8)!
            self.web?.evaluateJavaScript("window.commandCenterHost.selectAllDisplay(\(literal))") { [weak self] _,error in
                guard let self=self,self.active?.id==generation,self.active?.entryID==entry else{return}
                if let error=error{self.refuse("Could not copy selected text: \(self.reason(error))")}
            }
        }
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching:.keyDown) { [weak self] event in
            guard let self=self, event.window === self.window else { return event }
            if event.keyCode == 53 { self.escape(); return nil }
            if event.modifierFlags.contains(.command),event.charactersIgnoringModifiers == "[" { self.goBack(pointerResume:false);return nil }
            return event
        }
        clickMonitor = NSEvent.addLocalMonitorForEvents(matching:.leftMouseDown) { [weak self] event in
            guard let self=self, event.window === self.window else { return event }
            if !self.suggestionPanel.isHidden && self.suggestionPanel.bounds.contains(self.suggestionPanel.convert(event.locationInWindow,from:nil)) { return event }
            if !self.commandFrame.bounds.contains(self.commandFrame.convert(event.locationInWindow,from:nil)) { self.hideSuggestions() }
            guard let invocation=self.active else { return event }
            if self.backButton.isEnabled,self.backButton.bounds.contains(self.backButton.convert(event.locationInWindow,from:nil)) {
                self.goBack(pointerResume:true);return nil
            }
            let point=self.content.convert(event.locationInWindow,from:nil)
            if self.content.bounds.contains(point) {
                self.resumeFunction()
                if invocation.phase != .interactive { self.refuse("Still loading: typing is captured; pointer actions are available after handoff."); return nil }
            }
            return event
        }
        showEmpty(); focusCommand(); window.makeKeyAndOrderFront(nil)
        // REQ-ST-002: a brief trip away permanently excludes an unfinished sample.
        for (name,object) in [(NSApplication.didResignActiveNotification,NSApp as AnyObject),(NSWindow.didChangeOcclusionStateNotification,window as AnyObject)] {
            visibilityObservers.append(NotificationCenter.default.addObserver(forName:name,object:object,queue:.main){[weak self] _ in self?.active?.measurement?.observeVisibility()})
        }
        packsTimer=Timer.scheduledTimer(withTimeInterval:2,repeats:true){[weak self] _ in self?.refreshPackBadge()}
    }
    deinit {packsTimer?.invalidate();for observer in visibilityObservers{NotificationCenter.default.removeObserver(observer)};if let monitor=eventMonitor{NSEvent.removeMonitor(monitor)};if let monitor=clickMonitor{NSEvent.removeMonitor(monitor)} }
    func escape() { if commandFocused { cancel();hideSuggestions() } else { focusCommand() } }
    func build() {
        let base=window.contentView!; base.wantsLayer=true
        // REQ-SH-001/003/017: one function input, a launcher toolbar, and overlaid autocomplete.
        command.font = .monospacedSystemFont(ofSize:16,weight:.medium)
        command.textColor=commandOrange;command.backgroundColor=NSColor(calibratedWhite:0.06,alpha:1)
        command.delegate=self;command.target=self;command.action=#selector(execute);command.focusRingType = .none
        command.isBezeled=false;command.isBordered=false;command.drawsBackground=false
        commandFrame.input=command;commandFrame.wantsLayer=true
        commandFrame.layer?.backgroundColor=command.backgroundColor?.cgColor
        commandFrame.layer?.borderWidth=1;commandFrame.layer?.borderColor=commandOrange.cgColor
        command.maximumNumberOfLines=1;command.cell?.usesSingleLineMode=true
        updateCommandFeedback()
        let bar=NSStackView(views:[backButton,previousButton,nextButton,siblingPosition,commandFrame]);bar.orientation = .horizontal;bar.alignment = .centerY;bar.spacing=6;bar.detachesHiddenViews=true
        bar.edgeInsets=NSEdgeInsets(top:8,left:12,bottom:8,right:12)
        commandFrame.setContentHuggingPriority(.defaultLow,for:.horizontal)
        commandFrame.setContentCompressionResistancePriority(.defaultLow,for:.horizontal)
        suggestions.orientation = .vertical;suggestions.spacing=2;suggestions.alignment = .leading
        suggestions.edgeInsets=NSEdgeInsets(top:5,left:5,bottom:5,right:5)
        suggestionPanel.wantsLayer=true;suggestionPanel.layer?.backgroundColor=NSColor(calibratedWhite:0.075,alpha:1).cgColor
        suggestionPanel.layer?.borderColor=commandOrange.withAlphaComponent(0.65).cgColor;suggestionPanel.layer?.borderWidth=1
        suggestionPanel.isHidden=true
        status.font = .monospacedSystemFont(ofSize:11,weight:.regular);status.textColor=amber;status.lineBreakMode = .byTruncatingTail
        content.wantsLayer=true;content.layer?.backgroundColor=NSColor(calibratedWhite:0.035,alpha:1).cgColor
        overlay.font = .monospacedSystemFont(ofSize:17,weight:.medium);overlay.textColor=amber;overlay.maximumNumberOfLines=0;overlay.alignment = .center
        capture.shell=self; capture.isRichText=false;capture.isAutomaticQuoteSubstitutionEnabled=false;capture.isAutomaticDashSubstitutionEnabled=false;capture.isAutomaticSpellingCorrectionEnabled=false;capture.drawsBackground=false;capture.textColor = .clear
        [bar,functionToolbar,content,status,stragglerNotice,capture,suggestionPanel].forEach{ $0.translatesAutoresizingMaskIntoConstraints=false;base.addSubview($0) }
        content.addSubview(overlay);overlay.translatesAutoresizingMaskIntoConstraints=false
        backButton.target=self;backButton.action=#selector(pointerBack)
        backButton.refusesFirstResponder=true;backButton.font = .monospacedSystemFont(ofSize:12,weight:.medium)
        for (button,action,hint) in [(previousButton,#selector(previousSibling),"Previous item · ⌘⌥↑"),(nextButton,#selector(nextSibling),"Next item · ⌘⌥↓")] {
            button.target=self;button.action=action;button.toolTip=hint;button.refusesFirstResponder=true
            button.font = .monospacedSystemFont(ofSize:12,weight:.medium)
        }
        siblingPosition.font = .monospacedSystemFont(ofSize:11,weight:.regular);siblingPosition.textColor=amber
        for view in [backButton,previousButton,nextButton,siblingPosition] {
            view.setContentHuggingPriority(.required,for:.horizontal)
            view.setContentCompressionResistancePriority(.required,for:.horizontal)
        }
        packsButton.target=self;packsButton.action=#selector(showPackManagement);packsButton.refusesFirstResponder=true
        stragglerNotice.font = .monospacedSystemFont(ofSize:11,weight:.medium);stragglerNotice.textColor=commandOrange
        stragglerNotice.setContentHuggingPriority(.required,for:.horizontal)
        stragglerNotice.setContentCompressionResistancePriority(.required,for:.horizontal)
        commandFrame.addSubview(command);command.translatesAutoresizingMaskIntoConstraints=false
        autocompleteButton.image=NSImage(systemSymbolName:"chevron.down",accessibilityDescription:"Show functions")
        autocompleteButton.setAccessibilityLabel("Show functions");autocompleteButton.toolTip="Browse functions"
        autocompleteButton.isBordered=false;autocompleteButton.refusesFirstResponder=true;autocompleteButton.contentTintColor=commandOrange
        autocompleteButton.target=self;autocompleteButton.action=#selector(toggleAutocomplete)
        commandFrame.addSubview(autocompleteButton);autocompleteButton.translatesAutoresizingMaskIntoConstraints=false
        suggestionPanel.addSubview(suggestions);suggestions.translatesAutoresizingMaskIntoConstraints=false
        suggestionHeight=suggestionPanel.heightAnchor.constraint(equalToConstant:10)
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo:base.topAnchor),bar.leadingAnchor.constraint(equalTo:base.leadingAnchor),bar.trailingAnchor.constraint(equalTo:base.trailingAnchor),bar.heightAnchor.constraint(equalToConstant:50),commandFrame.heightAnchor.constraint(equalToConstant:32),commandFrame.widthAnchor.constraint(greaterThanOrEqualToConstant:240),
            backButton.heightAnchor.constraint(equalToConstant:26),previousButton.heightAnchor.constraint(equalToConstant:26),nextButton.heightAnchor.constraint(equalToConstant:26),
            command.leadingAnchor.constraint(equalTo:commandFrame.leadingAnchor,constant:10),command.trailingAnchor.constraint(equalTo:autocompleteButton.leadingAnchor,constant:-6),command.centerYAnchor.constraint(equalTo:commandFrame.centerYAnchor),command.heightAnchor.constraint(equalToConstant:command.intrinsicContentSize.height),
            autocompleteButton.trailingAnchor.constraint(equalTo:commandFrame.trailingAnchor,constant:-5),autocompleteButton.centerYAnchor.constraint(equalTo:commandFrame.centerYAnchor),autocompleteButton.widthAnchor.constraint(equalToConstant:26),autocompleteButton.heightAnchor.constraint(equalToConstant:26),
            suggestionPanel.topAnchor.constraint(equalTo:bar.bottomAnchor,constant:-1),suggestionPanel.leadingAnchor.constraint(equalTo:commandFrame.leadingAnchor),suggestionPanel.trailingAnchor.constraint(equalTo:commandFrame.trailingAnchor),suggestionHeight,
            suggestions.topAnchor.constraint(equalTo:suggestionPanel.topAnchor),suggestions.bottomAnchor.constraint(equalTo:suggestionPanel.bottomAnchor),suggestions.leadingAnchor.constraint(equalTo:suggestionPanel.leadingAnchor),suggestions.trailingAnchor.constraint(equalTo:suggestionPanel.trailingAnchor),
            functionToolbar.topAnchor.constraint(equalTo:bar.bottomAnchor),functionToolbar.leadingAnchor.constraint(equalTo:base.leadingAnchor),functionToolbar.trailingAnchor.constraint(equalTo:base.trailingAnchor),functionToolbar.heightAnchor.constraint(equalToConstant:34),
            content.topAnchor.constraint(equalTo:functionToolbar.bottomAnchor),content.leadingAnchor.constraint(equalTo:base.leadingAnchor),content.trailingAnchor.constraint(equalTo:base.trailingAnchor),content.bottomAnchor.constraint(equalTo:status.topAnchor,constant:-5),
            status.leadingAnchor.constraint(equalTo:base.leadingAnchor,constant:12),status.trailingAnchor.constraint(equalTo:stragglerNotice.leadingAnchor,constant:-12),status.bottomAnchor.constraint(equalTo:base.bottomAnchor,constant:-7),
            overlay.centerXAnchor.constraint(equalTo:content.centerXAnchor),overlay.centerYAnchor.constraint(equalTo:content.centerYAnchor),overlay.widthAnchor.constraint(lessThanOrEqualTo:content.widthAnchor,constant:-70),
            stragglerNotice.trailingAnchor.constraint(equalTo:base.trailingAnchor,constant:-12),stragglerNotice.centerYAnchor.constraint(equalTo:status.centerYAnchor),
            capture.leadingAnchor.constraint(equalTo:base.leadingAnchor),capture.bottomAnchor.constraint(equalTo:base.bottomAnchor),capture.widthAnchor.constraint(equalToConstant:1),capture.heightAnchor.constraint(equalToConstant:1)
        ]); updateSuggestions()
    }
    var commandFocused: Bool {
        if window.firstResponder === command { return true }
        if let editor=command.currentEditor(),window.firstResponder === editor { return true }
        return false
    }
    func controlTextDidBeginEditing(_ obj: Notification) {
        pauseFunction()
        if let editor=command.currentEditor() as? NSTextView {
            editor.isAutomaticQuoteSubstitutionEnabled=false;editor.isAutomaticDashSubstitutionEnabled=false
            editor.isAutomaticTextReplacementEnabled=false;editor.isAutomaticSpellingCorrectionEnabled=false
            editor.insertionPointColor=commandOrange
            editor.textColor=commandOrange
            editor.selectedTextAttributes=[.backgroundColor:commandOrange.withAlphaComponent(0.25),.foregroundColor:commandOrange]
        }
        hideSuggestions()
    }
    func controlTextDidEndEditing(_ obj: Notification) { hideSuggestions() }
    func controlTextDidChange(_ obj: Notification) { clearCommandError();normalizeCommand();completionRequested=false;selectedSuggestion = -1;updateSuggestions() }
    func normalizeCommand() {
        let raw=command.stringValue,upper=raw.uppercased()
        guard raw != upper else{return}
        let editor=command.currentEditor() as? NSTextView
        if editor?.hasMarkedText()==true{return}
        let selected=editor?.selectedRange() ?? NSRange(location:raw.utf16.count,length:0)
        let value=raw as NSString
        let start=min(selected.location,value.length),end=min(selected.location+selected.length,value.length)
        let location=value.substring(to:start).uppercased().utf16.count
        let length=value.substring(with:NSRange(location:start,length:end-start)).uppercased().utf16.count
        command.stringValue=upper
        editor?.setSelectedRange(NSRange(location:location,length:length))
    }
    // REQ-SH-001/002: an idle field is blank; only explicit error feedback uses placeholder rendering.
    func updateCommandFeedback() {
        command.placeholderAttributedString=commandError.map{NSAttributedString(string:$0,attributes:[.foregroundColor:commandErrorColor,.font:command.font!])}
    }
    // REQ-SH-003: explicit discovery never replaces the retained launch command or draft.
    @objc func toggleAutocomplete() {
        let close = !suggestionPanel.isHidden && completionRequested
        if !commandFocused{focusCommand()}
        if close{hideSuggestions();return}
        completionRequested=true;selectedSuggestion = -1;updateSuggestions()
    }
    func hideSuggestions() { suggestionPanel.isHidden=true;selectedSuggestion = -1;completionRequested=false }
    func clearCommandError() {
        guard commandError != nil else{return}
        commandError=nil;commandFrame.layer?.borderColor=commandOrange.cgColor;updateCommandFeedback()
    }
    // REQ-SH-002: feedback occupies the empty input, ready for immediate correction.
    func showCommandError(_ mnemonic:String,message:String?=nil) {
        command.stringValue=""
        commandError=message ?? "UNKNOWN FUNCTION: \(mnemonic) · TYPE ANOTHER COMMAND"
        commandFrame.layer?.borderColor=commandErrorColor.cgColor
        updateCommandFeedback();hideSuggestions();focusCommand()
    }
    func control(_ control:NSControl,textView:NSTextView,doCommandBy selector:Selector)->Bool {
        if selector == #selector(NSResponder.moveDown(_:)) { chooseSuggestion(1);return true }
        if selector == #selector(NSResponder.moveUp(_:)) { chooseSuggestion(-1);return true }
        if selector == #selector(NSResponder.moveRight(_:)) {
            let selection=textView.selectedRange()
            if selection.length==0 && NSMaxRange(selection)==textView.string.utf16.count {
                completionRequested=command.stringValue.trimmingCharacters(in:.whitespaces).isEmpty;updateSuggestions()
                if selectedSuggestion<0 { chooseSuggestion(1) }
                return !suggestionPanel.isHidden
            }
        }
        if selector == #selector(NSResponder.insertTab(_:)) {
            if suggestionPanel.isHidden,let active=active,command.stringValue==active.commandText { resumeFunction();return true }
            if selectedSuggestion>=0 { completeSuggestion() }
            else if !command.stringValue.isEmpty { chooseSuggestion(1);completeSuggestion() }
            else { resumeFunction() }
            return true
        }
        if selector == #selector(NSResponder.insertNewline(_:)) { if selectedSuggestion>=0 { completeSuggestion() };execute();return true }
        return false
    }
    func chooseSuggestion(_ delta:Int) {
        if suggestionPanel.isHidden { completionRequested=command.stringValue.trimmingCharacters(in:.whitespaces).isEmpty;updateSuggestions() }
        guard !suggestionMatches.isEmpty else{return}
        selectedSuggestion=selectedSuggestion<0 ? (delta>0 ? 0 : suggestionMatches.count-1) : (selectedSuggestion+delta+suggestionMatches.count)%suggestionMatches.count
        updateSuggestions(keep:true)
    }
    func completeSuggestion() { guard selectedSuggestion>=0,selectedSuggestion<suggestionMatches.count else{return};clearCommandError();command.stringValue=suggestionMatches[selectedSuggestion]+" ";hideSuggestions() }
    func updateSuggestions(keep:Bool=false) {
        suggestions.arrangedSubviews.forEach{suggestions.removeArrangedSubview($0);$0.removeFromSuperview()}
        let raw=command.stringValue.trimmingCharacters(in:.whitespaces),query=raw.lowercased()
        let parts=command.stringValue.drop(while:{$0.isWhitespace}).split(maxSplits:1,omittingEmptySubsequences:false,whereSeparator:{$0.isWhitespace})
        let hasTail=parts.count>1 && entries.contains{$0.0==parts[0].uppercased()}
        let matches=entries.filter{completionRequested || (!hasTail && !query.isEmpty && ($0.0.lowercased().contains(query) || $0.1.lowercased().contains(query)))}
        suggestionMatches=matches.map{$0.0}
        guard commandFocused,!matches.isEmpty else{hideSuggestions();return}
        for (i,item) in matches.enumerated() {
            let button=NSButton(title:"  \(item.0)    \(item.1.uppercased())",target:self,action:#selector(selectSuggestion(_:)))
            button.identifier=NSUserInterfaceItemIdentifier(item.0);button.isBordered=false;button.refusesFirstResponder=true
            button.alignment = .left;button.font = .monospacedSystemFont(ofSize:13,weight:.medium)
            button.attributedTitle=NSAttributedString(string:button.title,attributes:[.foregroundColor:commandOrange,.font:button.font!])
            button.wantsLayer=true;button.layer?.backgroundColor=(i==selectedSuggestion ? commandOrange.withAlphaComponent(0.16) : NSColor.clear).cgColor
            suggestions.addArrangedSubview(button)
            button.widthAnchor.constraint(equalTo:suggestions.widthAnchor,constant:-10).isActive=true
            button.heightAnchor.constraint(equalToConstant:32).isActive=true
        }
        suggestionHeight.constant=CGFloat(matches.count*34+8);suggestionPanel.isHidden=false
    }
    func launchFunction(_ mnemonic:String) {clearCommandError();command.stringValue=mnemonic;focusCommand();execute()}
    @objc func selectSuggestion(_ sender:NSButton) {launchFunction(sender.identifier!.rawValue)}
    @objc func execute() {
        let acceptedAt=ProcessInfo.processInfo.systemUptime
        reloadCatalog()
        normalizeCommand()
        guard let parsed=Command(command.stringValue) else { focusCommand();return }
        guard entries.contains(where:{$0.0==parsed.mnemonic}) else { showCommandError(parsed.mnemonic);return }
        if let reason=runtimeError ?? catalog.commands.first(where:{$0.mnemonic==parsed.mnemonic})?.unavailableReason {showCommandError(parsed.mnemonic,message:reason);return}
        if catalog.commands.first(where:{$0.mnemonic==parsed.mnemonic})?.apiEpoch != sdkRuntime.manifest.apiEpoch {showCommandError(parsed.mnemonic,message:"Update required: rebuild this function for API epoch \(sdkRuntime.manifest.apiEpoch).");return}
        clearCommandError()
        let submitted=command.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)
        retire();window.functionCanOwnFocus=false;let invocation=Invocation(parsed.mnemonic,parsed.tail,commandText:submitted,started:acceptedAt);active=invocation;launched+=1
        invocation.apiEpoch=sdkRuntime.manifest.apiEpoch
        functionToolbar.setActiveFunction(invocation.mnemonic)
        beginMeasurement(invocation,kind:"launch",started:acceptedAt)
        updateBackControl()
        command.stringValue=submitted;hideSuggestions();overlay.stringValue="\(parsed.mnemonic) · Loading…";overlay.isHidden=false
        status.stringValue="\(parsed.mnemonic) · Capturing text + Tab · Return/actions refused until ready"
        window.makeFirstResponder(capture)
        // REQ-SH-006: native loading destination is independent of WebKit/process warmup.
        window.displayIfNeeded();let milliseconds=(ProcessInfo.processInfo.systemUptime-invocation.started)*1000
        samples.append(["generation":invocation.id,"function":invocation.mnemonic,"visualMs":milliseconds])
        if samples.count>200 { samples.removeFirst(samples.count-200) }
        let configuration=WKWebViewConfiguration();configuration.setURLSchemeHandler(Assets(directory:catalog.commands.first{$0.mnemonic==parsed.mnemonic}!.directory(),runtime:sdkRuntime),forURLScheme:"commandcenter")
        configuration.userContentController.add(Bridge(self,invocation.id),name:"commandCenter")
        let view=FunctionWebView(frame:content.bounds,configuration:configuration);view.autoresizingMask=[.width,.height];view.navigationDelegate=self;view.underPageBackgroundColor=NSColor(calibratedWhite:0.035,alpha:1);web=view
        view.translatesAutoresizingMaskIntoConstraints=false
        content.addSubview(view,positioned:.below,relativeTo:overlay)
        NSLayoutConstraint.activate([view.leadingAnchor.constraint(equalTo:content.leadingAnchor),view.trailingAnchor.constraint(equalTo:content.trailingAnchor),view.topAnchor.constraint(equalTo:content.topAnchor),view.bottomAnchor.constraint(equalTo:content.bottomAnchor)])
        var url=URLComponents();url.scheme="commandcenter";url.host="app";url.path="/index.html";url.queryItems=[URLQueryItem(name:"function",value:parsed.mnemonic),URLQueryItem(name:"tail",value:parsed.tail)]
        view.load(URLRequest(url:url.url!))
        presentFunction()
    }
    func pauseFunction() {
        window.functionCanOwnFocus=false
        guard let invocation=active else{return};invocation.ownsInput=false;web?.keyboardAllowed=false;updateBackControl()
        web?.evaluateJavaScript("window.commandCenterHost?.pause()",completionHandler:nil)
    }
    @objc func focusCommand() {
        let returning = !commandFocused
        pauseFunction();window.makeFirstResponder(command)
        let length=command.stringValue.utf16.count
        let selectLaunch=returning && active?.commandText == command.stringValue
        command.currentEditor()?.selectedRange=selectLaunch ? NSRange(location:0,length:length) : NSRange(location:length,length:0)
        hideSuggestions()
        status.stringValue=active==nil ? "READY · Enter a function mnemonic" : "COMMAND FOCUS · Escape cancels \(active!.mnemonic) · click the function to return"
    }
    @objc func resumeClicked() { resumeFunction() }
    @objc func pointerBack() { goBack(pointerResume:true) }
    @objc func backShortcut() { goBack(pointerResume:false) }
    func validateMenuItem(_ item:NSMenuItem) -> Bool {
        if item.action == #selector(backShortcut){return (active?.entryDepth ?? 0)>1}
        if item.action == #selector(previousSibling){return previousButton.isEnabled}
        if item.action == #selector(nextSibling){return nextButton.isEnabled}
        return true
    }
    // REQ-NV-012: controls show only bounded position metadata and never queue work.
    func updateBackControl() {
        backButton.isHidden=active==nil;backButton.isEnabled=(active?.entryDepth ?? 0)>1
        let count=active?.siblingCount ?? 0,index=active?.siblingIndex ?? 0,ready=active?.allowsMutation == true
        previousButton.isHidden=count==0;nextButton.isHidden=count==0;siblingPosition.isHidden=count==0
        previousButton.isEnabled=ready && index>1;nextButton.isEnabled=ready && index<count
        siblingPosition.stringValue=count>0 ? "\(index) / \(count) loaded" : ""
    }
    @objc func previousSibling(){moveSibling(-1)}
    @objc func nextSibling(){moveSibling(1)}
    func moveSibling(_ direction:Int){
        guard let i=active,i.allowsMutation,(direction == -1 && i.siblingIndex>1)||(direction == 1 && i.siblingIndex<i.siblingCount) else{return}
        web?.evaluateJavaScript("window.commandCenterHost.step(\(direction))",completionHandler:nil)
    }
    func goBack(pointerResume:Bool) {
        guard let i=active,i.entryDepth>1 else{return}
        if pointerResume {
            hideSuggestions();i.ownsInput=true;window.functionCanOwnFocus=false;web?.keyboardAllowed=false
            window.makeFirstResponder(capture)
        }
        // Back is framework-owned and remains available during loading/error.
        let entry=i.entryID
        web?.evaluateJavaScript("window.commandCenterHost.back()") { [weak self,weak i] _,error in
            guard let self=self,let i=i,self.active === i,i.entryID==entry else{return}
            if let error=error{self.refuse("Back: \(self.reason(error))")}
        }
    }
    func resumeFunction() {
        hideSuggestions()
        guard let invocation=active,invocation.phase != .error else { window.makeFirstResponder(capture);return }
        invocation.ownsInput=true
        if invocation.phase == .interactive {
            web?.evaluateJavaScript("window.commandCenterHost.activate()",completionHandler:nil);window.functionCanOwnFocus=true;web?.keyboardAllowed=true;window.makeFirstResponder(web);updateBackControl();status.stringValue="\(invocation.mnemonic) · Interactive · Escape → command; Escape in command → cancel"
        } else { window.makeFirstResponder(capture);drain(invocation) }
    }
    func append(_ text:String) { guard let i=active,i.ownsInput,i.phase != .error else{return};i.pending.append(text);updateCaptureStatus() }
    func tab() { guard let i=active,i.ownsInput,i.phase != .error else{return};i.pending.tab();updateCaptureStatus() }
    func backspace() { guard let i=active,i.ownsInput,i.phase != .error else{return};if !i.pending.backspace(){refuse("Backspace cannot cross a pending field boundary.")}else{updateCaptureStatus()} }
    func updateCaptureStatus() { guard let i=active else{return};status.stringValue="\(i.mnemonic) · Captured \(i.pending.segments.joined().count) characters / \(i.pending.segments.count) fields · loading" }
    func compositionChanged() { if let i=active,i.ownsInput,i.viewReady,!i.inFlight,i.phase == .draining { drain(i) } }
    func refuse(_ message:String) { status.stringValue=message }
    func message(_ raw:Any,generation:String) {
        guard let i=active,i.id==generation,i.phase != .retired,let message=raw as? [String:Any],let kind=message["kind"] as? String else{return}
        if kind == "entryRequest" {
            guard let entry=message["entryId"] as? String,let source=message["fromEntryId"] as? String,
                  let depth=message["depth"] as? Int,let intent=message["intent"] as? String else{return}
            guard let token=message["transitionToken"] as? String,!token.isEmpty,token.utf8.count<=128 else{return}
            admitEntry(i,entry:entry,source:source,depth:depth,intent:intent,token:token,kind:message["transitionKind"] as? String);return
        }
        if kind == "rpc" {
            guard let entry=message["entryId"] as? String,!entry.isEmpty,entry.utf8.count<=128,
                  let id=message["id"] as? Int,let fn=message["function"] as? String,let op=message["operation"] as? String,
                  let mutation=operationMetadata[fn]?[op] else{return}
            // Shared invocation queries may keep a descriptor from a popped
            // screen. Registry-declared reads do not gain UI mutation authority.
            if mutation && (entry != i.entryID || !i.allowsMutation) {
                reply(id,["ok":false,"error":["code":"not_ready","message":"Mutations require the active interactive screen."]],generation);return
            }
            let started=ProcessInfo.processInfo.systemUptime,measurement=i.measurement
            var payload:[String:Any]=["function":fn,"operation":op,"input":message["input"] ?? [:]]
            if let epoch=i.apiEpoch{payload["apiEpoch"]=epoch}
            if let revision=catalog.commands.first(where:{$0.mnemonic==fn})?.revision{payload["revision"]=revision}
            backend.request(payload, mutation:mutation) { [weak self] body in
                measurement?.operation(function:fn,operation:op,durationMs:(ProcessInfo.processInfo.systemUptime-started)*1000,outcome:(body["ok"] as? Bool)==true ? "success" : ((body["error"] as? [String:Any])?["code"] as? String ?? "error"))
                self?.reply(id,body,generation)
            }
            return
        }
        guard message["entryId"] as? String == i.entryID else {
            if let id=message["id"] as? Int,kind == "openExternal" {
                reply(id,["ok":false,"error":["code":"not_current","message":"This screen no longer has UI authority."]],generation)
            }
            return
        }
        switch kind {
        case "siblings":
            guard let index=message["index"] as? Int,let count=message["count"] as? Int,
                  (count==0 && index==0)||(1...200).contains(count) && (1...count).contains(index) else{return}
            i.siblingIndex=index;i.siblingCount=count;updateBackControl()
        case "copySelection":
            // REQ-SH-016: selection is ephemeral UI data, never a worker request.
            guard i.allowsMutation,let text=message["text"] as? String,!text.isEmpty else{return}
            guard text.utf8.count<=2*1024*1024 else{refuse("Selected text exceeds the 2 MiB clipboard limit.");return}
            if clipboardWriter(text){status.stringValue="Copied \(text.count) characters"}else{refuse("Could not copy selected text to the clipboard.")}
        case "openExternal":
            guard let id=message["id"] as? Int else{return}
            guard i.allowsMutation else{reply(id,["ok":false,"error":["code":"not_ready","message":"Open links after the function is interactive."]],generation);return}
            guard let raw=message["url"] as? String,let url=ExternalLinks.allowed(raw,localOrigins:catalog.localSourceOrigins) else{reply(id,["ok":false,"error":["code":"invalid_url","message":"Only HTTPS sources and registered local sources can be opened."]],generation);return}
            let opened=externalOpener(url)
            reply(id,opened ? ["ok":true,"result":NSNull()] : ["ok":false,"error":["code":"unavailable","message":"The system could not open this link."]],generation)
        case "viewReady":
            guard i.phase == .resolving,!i.viewReady,message["transitionToken"] as? String == i.transitionToken else{return}
            var phases=message["phases"] as? [String:Double] ?? [:];phases["nativeReadyMs"]=i.measurement?.elapsedMs ?? 0
            i.measurement?.context(["appActive":NSApp.isActive,"windowVisible":window.isVisible,"windowOcclusionVisible":window.occlusionState.contains(.visible),"renderOpportunity":message["renderOpportunity"] as? String ?? "unknown","documentVisibility":message["visibility"] as? String ?? "unknown"])
            i.measurement?.finish("ready",phases:phases)
            if let index=samples.firstIndex(where:{$0["generation"] as? String==i.id}){samples[index]["readyMs"]=phases["nativeReadyMs"]}
            i.viewReady=true;overlay.isHidden=true;presentFunction();drain(i)
        case "error": guard i.phase != .error && i.phase != .retired else{return};fail(message["message"] as? String ?? "Function failed",i)
        case "refused": refuse(message["message"] as? String ?? "Action refused while loading")
        default: break
        }
    }
    func admitEntry(_ i:Invocation,entry:String,source:String,depth:Int,intent:String,token:String="root",kind:String?=nil) {
        guard active === i,i.admitEntry(entry,from:source,depth:depth,kind:intent) else {refuse("Navigation refused: inactive entry or history limit.");return}
        i.transitionToken=token;beginMeasurement(i,kind:kind == "sibling" ? "sibling" : intent)
        window.functionCanOwnFocus=false;web?.keyboardAllowed=false
        capture.inputContext?.discardMarkedText();capture.unmarkText();capture.string=""
        web?.isHidden=false;overlay.stringValue="\(i.mnemonic) · Loading…";overlay.isHidden=false
        updateBackControl()
        if i.ownsInput{window.makeFirstResponder(capture)}
        presentFunction()
        let json=String(data:try! JSONSerialization.data(withJSONObject:entry,options:.fragmentsAllowed),encoding:.utf8)!
        web?.evaluateJavaScript("window.commandCenterHost.admitEntry(\(json))") { [weak self,weak i] _,error in
            guard let self=self,let i=i,self.active === i,i.entryID==entry else{return}
            if let error=error{self.fail("Entry admission: \(self.reason(error))",i)}
        }
    }
    func reply(_ id:Int,_ body:[String:Any],_ generation:String) {
        guard let i=active,i.id==generation,let data=try? JSONSerialization.data(withJSONObject:body),let json=String(data:data,encoding:.utf8) else{return}
        web?.evaluateJavaScript("window.commandCenterHost.reply(\(id),\(json))",completionHandler:nil)
    }
    func drain(_ i:Invocation) {
        guard active === i,i.ownsInput,i.viewReady,!i.inFlight,i.phase != .error,i.phase != .interactive else{return}
        i.phase = .draining;i.inFlight=true
        let entry=i.entryID
        let batch=i.pending.take();let json=String(data:try! JSONSerialization.data(withJSONObject:batch),encoding:.utf8)!
        web?.evaluateJavaScript("window.commandCenterHost.handoff(\(json))") { [weak self, weak i] _,error in
            guard let self=self,let i=i,self.active === i,i.entryID==entry else{return};i.inFlight=false
            if let error=error { self.fail("Input handoff: \(self.reason(error))",i);return }
            i.focused=true
            guard i.ownsInput else{return}
            if !i.pending.isEmpty { self.drain(i);return }
            if self.capture.hasMarkedText() { self.status.stringValue="Finish text composition to complete input handoff";return }
            i.inFlight=true
            self.web?.evaluateJavaScript("window.commandCenterHost.activate()") { [weak self, weak i] _,error in
                guard let self=self,let i=i,self.active === i,i.entryID==entry else{return};i.inFlight=false
                if let error=error { self.fail(self.reason(error),i);return }
                guard i.ownsInput else{self.web?.evaluateJavaScript("window.commandCenterHost.pause()",completionHandler:nil);return}
                if !i.pending.isEmpty {self.drain(i);return}
                if self.capture.hasMarkedText() {self.web?.evaluateJavaScript("window.commandCenterHost.pause()",completionHandler:nil);self.status.stringValue="Finish text composition to complete input handoff";return}
                i.phase = .interactive;self.window.functionCanOwnFocus=true;self.web?.keyboardAllowed=true;self.window.makeFirstResponder(self.web)
                self.status.stringValue="\(i.mnemonic) · Interactive · Escape → command; Escape in command → cancel"
                self.updateBackControl();self.presentFunction()
                if let index=self.samples.firstIndex(where:{$0["generation"] as? String==i.id}) {
                    self.samples[index]["interactiveMs"]=(ProcessInfo.processInfo.systemUptime-i.started)*1000
                    self.samples[index]["windowVisible"]=self.window.isVisible
                    self.samples[index]["windowOcclusionVisible"]=self.window.occlusionState.contains(.visible)
                    self.samples[index]["windowKey"]=self.window.isKeyWindow
                    self.samples[index]["appActive"]=NSApp.isActive
                }
            }
        }
    }
    func presentFunction() {
        content.layoutSubtreeIfNeeded();web?.needsDisplay=true;window.contentView?.needsDisplay=true
        NSApp.updateWindows();window.displayIfNeeded();CATransaction.flush()
    }
    func reason(_ error:Error)->String { (error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription }
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) {
        // Even ordinary anchors cannot replace trusted function content or open popups.
        decisionHandler(webView === web && ExternalLinks.bundled(navigationAction.request.url) && navigationAction.targetFrame?.isMainFrame == true ? .allow : .cancel)
    }
    func fail(_ message:String,_ i:Invocation) { guard active === i else{return};i.measurement?.finish("error");i.phase = .error;window.functionCanOwnFocus=false;web?.keyboardAllowed=false;web?.isHidden=true;overlay.stringValue="\(i.mnemonic) · ERROR\n\n\(message)";overlay.isHidden=false;updateBackControl();status.stringValue="Escape → command · Escape in command → cancel";if i.ownsInput{window.makeFirstResponder(capture)} }
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error) { if webView === web,let i=active{fail(error.localizedDescription,i)} }
    func webViewWebContentProcessDidTerminate(_ webView:WKWebView) {if webView === web,let i=active{fail("Function web process terminated. Relaunch the command.",i)}}
    func retire() {
        window.functionCanOwnFocus=false
        guard let i=active else{return};i.retire();active=nil;functionToolbar.setActiveFunction(nil);retired+=1;updateBackControl()
        capture.inputContext?.discardMarkedText();capture.unmarkText();capture.string=""
        // REQ-SH-011, REQ-FF-006: revoke identity first, detach immediately; no unload hook.
        if let old=web {old.keyboardAllowed=false;old.evaluateJavaScript("window.commandCenterHost?.dispose()",completionHandler:nil);old.stopLoading();old.configuration.userContentController.removeScriptMessageHandler(forName:"commandCenter");old.navigationDelegate=nil;old.removeFromSuperview()};web=nil
    }
    func showEmpty() {overlay.stringValue="Enter a function to begin.\n\nEscape returns to command.\nEscape in command cancels the function.";overlay.isHidden=false;updateBackControl()}
    func cancel() {clearCommandError();retire();command.stringValue="";showEmpty();focusCommand()}
    @objc func showDiagnostics() {
        guard let invocation=active else{presentDiagnostics(nil);return}
        web?.evaluateJavaScript("window.commandCenterHost.diagnostics()") { [weak self] value,_ in
            guard let self=self,self.active?.id==invocation.id else{return}
            self.presentDiagnostics(value as? [String:Any])
        }
    }
    func presentDiagnostics(_ framework:[String:Any]?) {
        var report:[String:Any]=["launched":launched,"retired":retired,"activeInvocations":active==nil ? 0 : 1,"attachedWebViews":content.subviews.filter{$0 is WKWebView}.count,"contentFrame":NSStringFromRect(content.frame),"webFrame":NSStringFromRect(web?.frame ?? .zero),"phase":active?.phase.rawValue ?? "empty","entryId":active?.entryID ?? "empty","depth":active?.entryDepth ?? 0,"samples":samples]
        if let framework=framework {
            var counts=[String:Int]()
            for key in ["queryCount","cachedBytes","maxResponseBytes","mutationCount","deliveryWaiters"] {
                if let value=framework[key] as? Int,value>=0{counts[key]=value}
            }
            let entries=(framework["entries"] as? [[String:Any]] ?? []).prefix(4).map { raw -> [String:Any] in
                var entry=[String:Any]()
                for key in ["id","screen","phase"]{if let value=raw[key] as? String{entry[key]=String(value.prefix(128))}}
                for key in ["ageMs","preparedMs","interactiveMs","sequenceIndex","sequenceCount"]{if let value=raw[key] as? Double,value.isFinite,value>=0{entry[key]=value}}
                entry["visible"]=raw["visible"] as? Bool ?? false;return entry
            }
            report["entries"]=entries;report["queryIndicators"]=counts
        }
        report["measurementLimits"]="Ownership and response-size indicators; not exact screen heap attribution or immediate process-memory reclamation."
        let data=try! JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]);let alert=NSAlert();alert.messageText="Invocation ownership diagnostics";alert.informativeText=String(data:data,encoding:.utf8)!;alert.runModal()
    }
    @objc func setIdentity() {
        let alert=NSAlert();alert.messageText="Local human identity";alert.informativeText="Used for human attribution and default employee requester. This is a local reference, not authentication."
        let email=NSTextField(frame:NSRect(x:0,y:36,width:360,height:24));email.placeholderString="name@example.com"
        let name=NSTextField(frame:NSRect(x:0,y:0,width:360,height:24));name.placeholderString="Display name"
        let box=NSView(frame:NSRect(x:0,y:0,width:360,height:64));box.addSubview(email);box.addSubview(name);alert.accessoryView=box;alert.addButton(withTitle:"Save");alert.addButton(withTitle:"Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        backend.request(["function":"DRQS","operation":"setIdentity","input":["id":email.stringValue,"name":name.stringValue]], mutation:true) { [weak self] result in
            if result["ok"] as? Bool==true {self?.status.stringValue="Identity saved · relaunch DRQS to use it"}else{self?.status.stringValue=(result["error"] as? [String:Any])?["message"] as? String ?? "Identity could not be saved"}
        }
    }
}
