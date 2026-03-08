import SwiftUI

@main
struct SecondBrainMacApp: App {
    @Environment(\.openWindow) private var openWindow
    @State private var viewModel = AppViewModel()

    var body: some Scene {
        // Main chat window
        Window("Second Brain", id: "main") {
            ContentView(viewModel: viewModel)
                .preferredColorScheme(.dark)
                .frame(minWidth: 480, minHeight: 600)
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
                    viewModel.hasUnreadReply = false
                }
        }
        .defaultSize(width: 520, height: 700)

        // Menu bar icon
        MenuBarExtra {
            Button("Open Chat") {
                NSApplication.shared.activate()
                openWindow(id: "main")
            }
            .keyboardShortcut("b", modifiers: [.command, .shift])

            Divider()

            Button("New Conversation") {
                NSApplication.shared.activate()
                openWindow(id: "main")
            }
            .keyboardShortcut("n", modifiers: .command)

            Divider()

            Button("Quit Second Brain") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q", modifiers: .command)
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "brain.head.profile")
                if viewModel.hasUnreadReply {
                    Circle()
                        .fill(.red)
                        .frame(width: 6, height: 6)
                        .offset(x: 2, y: -2)
                }
            }
        }
    }
}
