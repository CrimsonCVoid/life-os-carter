/**
 * Widget bundle entry — registers both the static home/lock-screen
 * widget AND the Live Activity widget in one extension target.
 */

import SwiftUI
import WidgetKit

@main
struct LifeOSWidgetBundle: WidgetBundle {
    var body: some Widget {
        LifeOSWidget()
        if #available(iOS 16.2, *) {
            WorkoutActivityWidget()
        }
    }
}
