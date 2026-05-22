import Foundation

/// Drains the App Group `workoutCommands` queue written by the Live
/// Activity intents (Complete Set / +30s / Skip Rest). Call `start`
/// when a workout becomes active; the consumer ticks every 2 seconds
/// AND on app-foreground events. Each command flips through to the
/// callback so the active-workout view model can apply it.
@MainActor
final class WorkoutCommandConsumer {
    private static let appGroup = "group.com.hbrady.lifeos"
    private static let queueKey = "workoutCommands"

    typealias CommandHandler = (Command) -> Void
    enum Command {
        case completeSet
        case addRest(seconds: TimeInterval)
        case skipRest
        case finish
    }

    private var timer: Timer?
    private var onCommand: CommandHandler?

    func start(onCommand: @escaping CommandHandler) {
        self.onCommand = onCommand
        drain()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.drain() }
        }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleForeground),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        NotificationCenter.default.removeObserver(self)
        onCommand = nil
    }

    @objc private func handleForeground() {
        Task { @MainActor in drain() }
    }

    private func drain() {
        guard let onCommand else { return }
        guard let defaults = UserDefaults(suiteName: Self.appGroup),
              let raw = defaults.string(forKey: Self.queueKey),
              let data = raw.data(using: .utf8) else { return }

        struct RawCommand: Decodable {
            let op: String
            let ts: Double
            let args: [String: Double]?
        }

        let parsed = (try? JSONDecoder().decode([RawCommand].self, from: data)) ?? []
        defaults.removeObject(forKey: Self.queueKey)

        for r in parsed {
            switch r.op {
            case "complete_set":
                onCommand(.completeSet)
            case "add_rest":
                onCommand(.addRest(seconds: r.args?["seconds"] ?? 30))
            case "skip_rest":
                onCommand(.skipRest)
            case "finish":
                onCommand(.finish)
            default:
                break
            }
        }
    }
}

#if canImport(UIKit)
import UIKit
#endif
