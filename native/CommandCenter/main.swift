import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    var shell: Shell?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.appearance = NSAppearance(named: .darkAqua)
        let commandCenter = Shell()
        shell = commandCenter

        let menu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About CommandCenter", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        let identity = appMenu.addItem(withTitle: "Local Identity…", action: #selector(Shell.setIdentity), keyEquivalent: "")
        identity.target = commandCenter
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit CommandCenter", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        menu.addItem(appItem)

        let edit = NSMenuItem()
        let edits = NSMenu(title: "Edit")
        for (title, selector, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAllAndCopy:", "a")] {
            edits.addItem(withTitle: title, action: NSSelectorFromString(selector), keyEquivalent: key)
        }
        edit.submenu = edits
        menu.addItem(edit)

        let viewItem = NSMenuItem()
        let view = NSMenu(title: "View")
        let back = view.addItem(withTitle:"Back",action:#selector(Shell.backShortcut),keyEquivalent:"[")
        back.target=commandCenter
        // Keyboard equivalents live in the document so editable controls keep their keys.
        for (title,action,hint) in [("Previous Item",#selector(Shell.previousSibling),"⌘⌥↑"),("Next Item",#selector(Shell.nextSibling),"⌘⌥↓")] {
            let item=view.addItem(withTitle:title,action:action,keyEquivalent:"");item.target=commandCenter;item.toolTip=hint
        }
        for (title, action) in [("Focus Command", #selector(Shell.focusCommand)), ("Focus Function", #selector(Shell.resumeClicked)), ("Invocation Diagnostics…", #selector(Shell.showDiagnostics))] {
            let item = view.addItem(withTitle: title, action: action, keyEquivalent: "")
            item.target = commandCenter
        }
        viewItem.submenu = view
        menu.addItem(viewItem)

        let win = NSMenuItem()
        let windows = NSMenu(title: "Window")
        windows.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        win.submenu = windows
        menu.addItem(win)
        NSApp.mainMenu = menu
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
