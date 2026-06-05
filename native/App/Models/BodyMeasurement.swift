import Foundation
import SwiftData

/// One body-tape measurement entry. All values in centimeters internally
/// (consistent metric storage like weight is lb); BodyView renders in the
/// user's preferred unit. Every site is optional so a user can log just a
/// waist without filling the rest. Shaped for sync like other user content.
@Model
final class BodyMeasurement {
    @Attribute(.unique) var id: UUID
    var date: String          // "YYYY-MM-DD", local tz — matches DailyEntry
    var loggedAt: Date
    var waistCm: Double?
    var chestCm: Double?
    var hipsCm: Double?
    var leftArmCm: Double?
    var rightArmCm: Double?
    var thighCm: Double?
    var neckCm: Double?
    var needsSync: Bool = true
    var serverID: String?

    init(date: String) {
        self.id = UUID()
        self.date = date
        self.loggedAt = Date()
    }

    /// Sites that carry a value, for compact rendering. cm internally.
    var presentSites: [(label: String, cm: Double)] {
        [("Waist", waistCm), ("Chest", chestCm), ("Hips", hipsCm),
         ("L arm", leftArmCm), ("R arm", rightArmCm), ("Thigh", thighCm), ("Neck", neckCm)]
            .compactMap { label, value in value.map { (label, $0) } }
    }
}
