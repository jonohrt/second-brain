import SwiftUI

@main
struct SecondBrainMacApp: App {
    @Environment(\.openWindow) private var openWindow

    var body: some Scene {
        // Main chat window
        Window("Second Brain", id: "main") {
            ContentView()
                .preferredColorScheme(.dark)
                .frame(minWidth: 480, minHeight: 600)
        }
        .defaultSize(width: 520, height: 700)

        // Menu bar icon
        MenuBarExtra("Second Brain", systemImage: "brain.head.profile") {
            Button("Open Chat") {
                openWindow(id: "main")
            }
            .keyboardShortcut("b", modifiers: [.command, .shift])

            Divider()

            Button("New Conversation") {
                openWindow(id: "main")
            }
            .keyboardShortcut("n", modifiers: .command)

            Divider()

            Button("Quit Second Brain") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q", modifiers: .command)
        }
    }
}
