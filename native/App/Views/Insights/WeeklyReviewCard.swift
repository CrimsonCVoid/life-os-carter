import SwiftUI
import SwiftData

/// Compact weekly-review teaser — drops into the Analysis scroll as a
/// glanceable card that shows the headline plus the single strongest win
/// and watch-out, then navigates into the full `WeeklyReviewView`. Mirror
/// of the on-device engine the full screen uses, so the teaser never
/// disagrees with the detail.
struct WeeklyReviewCard: View {
    @Query private var dailies: [DailyEntry]
    @Query private var meals: [MealLog]
    @Query private var lifts: [LiftSessionEntry]
    @Query private var habits: [HabitEntry]
    @Query private var settingsRows: [UserSettings]
    @Environment(\.modelContext) private var modelContext

    private var settings: UserSettings {
        settingsRows.first ?? UserSettings.loadOrCreate(in: modelContext)
    }

    private var review: WeeklyReview? {
        WeeklyReviewEngine.build(
            daily: dailies,
            meals: meals,
            lifts: lifts,
            habits: habits,
            settings: settings,
            asOf: Date()
        )
    }

    var body: some View {
        if let review {
            NavigationLink {
                WeeklyReviewView()
            } label: {
                cardBody(review)
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded { Haptics.tap() })
        }
        // No teaser when there isn't enough history — the empty state
        // lives in the full view, reached from elsewhere; an empty card
        // in the feed would just be noise.
    }

    private func cardBody(_ review: WeeklyReview) -> some View {
        Card(tint: LifeOSColor.accent) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Text("WEEKLY REVIEW")
                        .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                        .foregroundStyle(LifeOSColor.accent)
                    Text("· \(review.weekLabel)")
                        .font(.system(size: 10, weight: .semibold)).tracking(0.6)
                        .foregroundStyle(LifeOSColor.fg3)
                    Spacer()
                    HStack(spacing: 3) {
                        Text("OPEN")
                            .font(.system(size: 9, weight: .bold)).tracking(0.8)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundStyle(LifeOSColor.accent)
                }

                Text(review.headline)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                    .fixedSize(horizontal: false, vertical: true)

                if let win = review.wins.first {
                    teaserRow(
                        icon: "arrow.up.right.circle.fill",
                        tint: LifeOSColor.success,
                        text: win
                    )
                }
                if let watch = review.watchOuts.first {
                    teaserRow(
                        icon: "exclamationmark.triangle.fill",
                        tint: LifeOSColor.warning,
                        text: watch
                    )
                }
            }
        }
    }

    private func teaserRow(icon: String, tint: Color, text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 18)
            Text(text)
                .font(.system(size: 12.5))
                .foregroundStyle(LifeOSColor.fg2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
