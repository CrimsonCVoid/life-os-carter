import UIKit

/// Lightweight, prepared-in-advance haptic generators. Call `Haptics.tap()`
/// on any tap-style interaction, `Haptics.success()` after a complete
/// action, etc. Cheaper than allocating a new generator on every call.
@MainActor
enum Haptics {
    private static let lightImpact = UIImpactFeedbackGenerator(style: .light)
    private static let mediumImpact = UIImpactFeedbackGenerator(style: .medium)
    private static let rigidImpact = UIImpactFeedbackGenerator(style: .rigid)
    private static let heavyImpact = UIImpactFeedbackGenerator(style: .heavy)
    private static let selection = UISelectionFeedbackGenerator()
    private static let notification = UINotificationFeedbackGenerator()

    static func prepareAll() {
        lightImpact.prepare()
        mediumImpact.prepare()
        rigidImpact.prepare()
        heavyImpact.prepare()
        selection.prepare()
        notification.prepare()
    }

    static func tap()        { lightImpact.impactOccurred() }
    static func medium()     { mediumImpact.impactOccurred() }
    static func rigid()      { rigidImpact.impactOccurred() }
    static func heavy()      { heavyImpact.impactOccurred() }
    static func tick()       { selection.selectionChanged() }
    static func success()    { notification.notificationOccurred(.success) }
    static func warning()    { notification.notificationOccurred(.warning) }
    static func error()      { notification.notificationOccurred(.error) }
}
