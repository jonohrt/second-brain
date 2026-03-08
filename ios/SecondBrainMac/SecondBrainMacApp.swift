import SwiftUI

@main
struct SecondBrainMacApp: App {
    @Environment(\.openWindow) private var openWindow
    @State private var viewModel = AppViewModel()
    @NSApplicationDelegateAdaptor private var appDelegate: AppDelegate

    var body: some Scene {
        Window("Second Brain", id: "main") {
            ContentView(viewModel: viewModel)
                .preferredColorScheme(.dark)
                .frame(minWidth: 480, minHeight: 600)
                .onAppear {
                    appDelegate.viewModel = viewModel
                }
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
                    viewModel.hasUnreadReply = false
                }
                .onReceive(NotificationCenter.default.publisher(for: .openMainWindow)) { _ in
                    openWindow(id: "main")
                }
        }
        .defaultSize(width: 520, height: 700)
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    var viewModel: AppViewModel? {
        didSet { observeBadge() }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        updateIcon(badge: false)

        let menu = NSMenu()
        menu.addItem(withTitle: "Open Chat", action: #selector(openChat), keyEquivalent: "b")
        menu.items.last?.keyEquivalentModifierMask = [.command, .shift]
        menu.addItem(.separator())
        menu.addItem(withTitle: "New Conversation", action: #selector(newConversation), keyEquivalent: "n")
        menu.items.last?.keyEquivalentModifierMask = .command
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Second Brain", action: #selector(quitApp), keyEquivalent: "q")
        menu.items.last?.keyEquivalentModifierMask = .command
        statusItem.menu = menu
    }

    private func observeBadge() {
        guard let viewModel else { return }
        func track() {
            withObservationTracking {
                let badge = viewModel.hasUnreadReply
                DispatchQueue.main.async { [weak self] in
                    self?.updateIcon(badge: badge)
                }
            } onChange: {
                DispatchQueue.main.async { track() }
            }
        }
        track()
    }

    private func updateIcon(badge: Bool) {
        guard let button = statusItem?.button else { return }
        let config = NSImage.SymbolConfiguration(pointSize: 16, weight: .regular)
        if let image = NSImage(systemSymbolName: "brain.head.profile", accessibilityDescription: "Second Brain")?.withSymbolConfiguration(config) {
            image.isTemplate = true
            button.image = image
        }
        if badge {
            if button.subviews.first(where: { $0.tag == 999 }) == nil {
                let dot = NSView(frame: NSRect(x: button.bounds.width - 8, y: button.bounds.height - 8, width: 6, height: 6))
                dot.tag = 999
                dot.wantsLayer = true
                dot.layer?.backgroundColor = NSColor.red.cgColor
                dot.layer?.cornerRadius = 3
                button.addSubview(dot)
            }
        } else {
            button.subviews.filter { $0.tag == 999 }.forEach { $0.removeFromSuperview() }
        }
    }

    @objc private func openChat() {
        NSApplication.shared.activate()
        NotificationCenter.default.post(name: .openMainWindow, object: nil)
    }

    @objc private func newConversation() {
        Task { @MainActor in
            viewModel?.startNewConversation()
        }
        NSApplication.shared.activate()
        NotificationCenter.default.post(name: .openMainWindow, object: nil)
    }

    @objc private func quitApp() {
        NSApplication.shared.terminate(nil)
    }
}

extension Notification.Name {
    static let openMainWindow = Notification.Name("openMainWindow")
}
