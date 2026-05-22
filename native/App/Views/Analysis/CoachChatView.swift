import SwiftUI
import SwiftData

/// Embedded coach chat for the Analysis tab. Streams responses from
/// `/api/overseer` token-by-token so the user sees text appear as it's
/// generated. Sends an empty context object — the server-side prompt
/// builder pulls user facts on its own.
struct CoachChatView: View {
    @State private var messages: [ChatMessage] = []
    @State private var input: String = ""
    @State private var streaming: Bool = false
    @FocusState private var inputFocused: Bool

    struct ChatMessage: Identifiable, Hashable {
        let id = UUID()
        let role: Role
        var content: String
        enum Role { case user, assistant }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(
                            colors: [LifeOSColor.accent, LifeOSColor.Metric.peak],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ))
                    Image(systemName: "sparkles")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 22, height: 22)
                Text("OVERSEER")
                    .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.fg3)
                Spacer()
            }
            .padding(.horizontal, 4)

            Card {
                VStack(spacing: 10) {
                    if messages.isEmpty {
                        emptyState
                    } else {
                        ForEach(messages) { msg in
                            messageBubble(msg)
                        }
                    }
                    inputRow
                }
            }
        }
    }

    // MARK: - Pieces

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ask anything about your last 30 days.")
                .font(.system(size: 13))
                .foregroundStyle(LifeOSColor.fg2)
            HStack(spacing: 6) {
                quickAsk("How's my sleep trending?")
                quickAsk("What's my best lift?")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func quickAsk(_ text: String) -> some View {
        Button {
            input = text
            Task { await send() }
        } label: {
            Text(text)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(LifeOSColor.accent)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Capsule().fill(LifeOSColor.accent.opacity(0.14)))
        }
        .buttonStyle(.plain)
    }

    private func messageBubble(_ msg: ChatMessage) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if msg.role == .assistant {
                Image(systemName: "sparkles")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.accent)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(LifeOSColor.accent.opacity(0.14)))
            } else {
                Spacer().frame(width: 18)
            }
            Text(msg.content.isEmpty && msg.role == .assistant ? "Thinking…" : msg.content)
                .font(.system(size: 13))
                .foregroundStyle(msg.role == .user ? LifeOSColor.fg : LifeOSColor.fg2)
                .frame(maxWidth: .infinity, alignment: msg.role == .user ? .trailing : .leading)
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(msg.role == .user ? LifeOSColor.accent.opacity(0.18) : LifeOSColor.elevated)
                )
        }
    }

    private var inputRow: some View {
        HStack(spacing: 8) {
            TextField("Ask the coach…", text: $input, axis: .vertical)
                .font(.system(size: 13))
                .foregroundStyle(.white)
                .focused($inputFocused)
                .lineLimit(1...3)
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(LifeOSColor.elevated)
                )
                .disabled(streaming)
            Button {
                Task { await send() }
            } label: {
                Image(systemName: streaming ? "stop.fill" : "arrow.up")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(
                        Circle().fill(
                            canSend ? LifeOSColor.accent : LifeOSColor.fg3
                        )
                    )
            }
            .buttonStyle(.plain)
            .disabled(!canSend && !streaming)
        }
    }

    private var canSend: Bool {
        !streaming && !input.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // MARK: - Streaming

    @MainActor
    private func send() async {
        let prompt = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else { return }
        input = ""
        inputFocused = false
        messages.append(.init(role: .user, content: prompt))
        let assistantIdx = messages.count
        messages.append(.init(role: .assistant, content: ""))
        streaming = true
        Haptics.tap()

        struct Body: Encodable {
            let messages: [Msg]
            let context: Ctx
            struct Msg: Encodable {
                let role: String
                let content: String
            }
            struct Ctx: Encodable {
                // Minimal stub context — the server fills user-facts
                // from its own DB lookup. Empty arrays satisfy the
                // OverseerContext shape.
                let recentDays: [String] = []
                let recentMeals: [String] = []
                let recentWorkouts: [String] = []
            }
        }
        let body = Body(
            messages: messages.dropLast().map {
                Body.Msg(
                    role: $0.role == .user ? "user" : "assistant",
                    content: $0.content
                )
            },
            context: Body.Ctx()
        )

        let stream = APIClient.shared.stream("/api/overseer", body: body)
        do {
            for try await chunk in stream {
                // The route streams plain text chunks (no SSE
                // envelope) per the Vercel handler. Append every
                // incoming line.
                if !chunk.isEmpty {
                    messages[assistantIdx].content += chunk
                    if !chunk.hasSuffix("\n") {
                        messages[assistantIdx].content += "\n"
                    }
                }
            }
        } catch {
            messages[assistantIdx].content = "Couldn't reach the coach right now. Try again in a moment."
        }
        streaming = false
        Haptics.success()
    }
}
