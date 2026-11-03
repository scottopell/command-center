import AppKit

// REQ-SH-017: catalog shortcuts are launch controls, not tabs or saved invocations.
final class FunctionToolbar: NSView {
    let managementButton=NSButton(title:"Manage Packs…",target:nil,action:nil)
    let overflowButton=NSPopUpButton(frame:.zero,pullsDown:true)
    var onLaunch: ((String)->Void)?
    private var functions=[(String,String)]()
    private var buttons=[NSButton]()
    private var overflowNames=[String]()
    private(set) var activeMnemonic:String?
    private let orange=NSColor(calibratedRed:1,green:0.61,blue:0.16,alpha:1)

    override init(frame:NSRect) {
        super.init(frame:frame)
        wantsLayer=true;layer?.backgroundColor=NSColor(calibratedWhite:0.065,alpha:1).cgColor
        setAccessibilityRole(.toolbar);setAccessibilityLabel("Function toolbar")
        managementButton.bezelStyle = .rounded;managementButton.controlSize = .small
        managementButton.font = .systemFont(ofSize:11);managementButton.refusesFirstResponder=true
        managementButton.toolTip="Manage installed function packs and updates"
        overflowButton.bezelStyle = .rounded;overflowButton.controlSize = .small;overflowButton.refusesFirstResponder=true
        overflowButton.addItem(withTitle:"More…");overflowButton.menu?.autoenablesItems=false
        overflowButton.setAccessibilityLabel("More functions");overflowButton.isHidden=true
        addSubview(managementButton);addSubview(overflowButton)
    }
    required init?(coder:NSCoder) {fatalError("Use init(frame:)")}

    func setFunctions(_ next:[(String,String)]) {
        guard !functions.elementsEqual(next,by:{$0.0==$1.0 && $0.1==$1.1}) else{return}
        functions=next;buttons.forEach{$0.removeFromSuperview()};buttons=[];overflowNames=[]
        for (mnemonic,title) in functions {
            let button=NSButton(title:mnemonic,target:self,action:#selector(launchButton(_:)))
            button.identifier=NSUserInterfaceItemIdentifier("function:"+mnemonic)
            button.font = .monospacedSystemFont(ofSize:12,weight:.medium)
            button.isBordered=false;button.refusesFirstResponder=true;button.toolTip=title+" · Run "+mnemonic
            button.wantsLayer=true;button.layer?.cornerRadius=4
            addSubview(button);buttons.append(button)
        }
        updateSelection();needsLayout=true
    }
    func setActiveFunction(_ mnemonic:String?) {
        guard activeMnemonic != mnemonic else{return}
        activeMnemonic=mnemonic;updateSelection()
    }
    private func updateSelection() {
        for (index,button) in buttons.enumerated() {
            let (name,title)=functions[index],selected=name==activeMnemonic
            button.attributedTitle=NSAttributedString(string:name,attributes:[.foregroundColor:orange,.font:button.font!])
            button.layer?.backgroundColor=(selected ? orange.withAlphaComponent(0.18) : .clear).cgColor
            button.layer?.borderWidth=selected ? 1 : 0;button.layer?.borderColor=orange.withAlphaComponent(0.65).cgColor
            button.setAccessibilityLabel(name+" — "+title+(selected ? ", current function" : ""))
        }
        updateOverflowSelection()
    }
    private func updateOverflowSelection() {
        for item in overflowButton.itemArray {item.state=(item.representedObject as? String)==activeMnemonic && activeMnemonic != nil ? .on : .off}
        overflowButton.contentTintColor=activeMnemonic.map{overflowNames.contains($0)} == true ? orange : nil
    }
    override func layout() {
        super.layout()
        let padding:CGFloat=12,gap:CGFloat=4,height:CGFloat=24,y=(bounds.height-height)/2
        let managementWidth=ceil(managementButton.intrinsicContentSize.width)
        managementButton.frame=NSRect(x:bounds.width-padding-managementWidth,y:y,width:managementWidth,height:height)
        let available=max(0,managementButton.frame.minX-padding-12)
        let widths=buttons.map{max(52,ceil($0.intrinsicContentSize.width)+16)}
        let total=widths.reduce(0,+)+CGFloat(max(0,widths.count-1))*gap
        let overflow=total>available,moreWidth:CGFloat=76
        let limit=padding+available-(overflow ? moreWidth+gap : 0)
        var x=padding,hidden=[String](),pastLimit=false
        for (index,button) in buttons.enumerated() {
            if x+widths[index]>limit {pastLimit=true}
            button.isHidden=pastLimit
            if pastLimit {hidden.append(functions[index].0)}
            else {button.frame=NSRect(x:x,y:y,width:widths[index],height:height);x+=widths[index]+gap}
        }
        overflowButton.isHidden = !overflow
        overflowButton.frame=NSRect(x:padding+available-moreWidth,y:y,width:moreWidth,height:height)
        if hidden != overflowNames {
            overflowNames=hidden;overflowButton.removeAllItems();overflowButton.addItem(withTitle:"More…")
            for name in hidden {
                let title=functions.first{$0.0==name}?.1 ?? name
                let item=NSMenuItem(title:name+"  ·  "+title,action:#selector(launchMenu(_:)),keyEquivalent:"")
                item.target=self;item.representedObject=name;overflowButton.menu?.addItem(item)
            }
        }
        updateOverflowSelection()
    }
    @objc private func launchButton(_ sender:NSButton) {onLaunch?(sender.title)}
    @objc private func launchMenu(_ sender:NSMenuItem) {if let mnemonic=sender.representedObject as? String {onLaunch?(mnemonic)}}
}
