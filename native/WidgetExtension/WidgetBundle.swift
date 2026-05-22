import SwiftUI
import WidgetKit

@main
struct LifeOSWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodaySnapshotWidget()
        if #available(iOS 16.2, *) {
            WorkoutActivityWidget()
        }
    }
}
