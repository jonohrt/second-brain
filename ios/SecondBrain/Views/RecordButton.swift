import SwiftUI

struct RecordButton: View {
    let isRecording: Bool
    let isDisabled: Bool
    let onStart: () -> Void
    let onStop: () -> Void

    var body: some View {
        Circle()
            .fill(isRecording ? Color.red : Color.blue)
            .frame(width: 80, height: 80)
            .scaleEffect(isRecording ? 1.3 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: isRecording)
            .overlay(
                Image(systemName: "mic.fill")
                    .font(.system(size: isRecording ? 32 : 24))
                    .foregroundColor(.white)
                    .animation(.easeInOut(duration: 0.15), value: isRecording)
            )
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        if !isRecording && !isDisabled {
                            onStart()
                        }
                    }
                    .onEnded { _ in
                        onStop()
                    }
            )
            .opacity(isDisabled ? 0.4 : 1.0)
    }
}
