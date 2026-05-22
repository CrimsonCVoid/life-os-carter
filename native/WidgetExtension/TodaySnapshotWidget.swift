import SwiftUI
import WidgetKit

/// Home/Lock screen widget — pulls today's vitals from the App Group
/// snapshot the main app writes after each refresh. Uses Liquid Glass
/// on iOS 26+, ultra-thin material as a fallback.
struct TodaySnapshotWidget: Widget {
    let kind = "TodaySnapshotWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            TodaySnapshotView(entry: entry)
                .containerBackground(for: .widget) {
                    Color(red: 0.02, green: 0.02, blue: 0.03)
                }
        }
        .configurationDisplayName("Life OS")
        .description("Your day at a glance — strain, readiness, sleep, steps.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct TodaySnapshot: Codable {
    var strain: Double?
    var readiness: Double?
    var sleep: Double?
    var steps: Double?
    var calories: Double?
    var caloriesPct: Double?
    var updatedAt: Double?
}

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: TodaySnapshot
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: .now, snapshot: TodaySnapshot(strain: 12.4, readiness: 72, sleep: 7.5, steps: 8431))
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: .now, snapshot: readShared()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let entry = SnapshotEntry(date: .now, snapshot: readShared())
        // Refresh every 15 minutes — widget data is approximate, not realtime.
        let next = Date().addingTimeInterval(15 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func readShared() -> TodaySnapshot {
        let defaults = UserDefaults(suiteName: "group.com.hbrady.lifeos")
        guard let raw = defaults?.string(forKey: "todaySnapshot"),
              let data = raw.data(using: .utf8),
              let snap = try? JSONDecoder().decode(TodaySnapshot.self, from: data)
        else {
            return TodaySnapshot()
        }
        return snap
    }
}

private struct TodaySnapshotView: View {
    let entry: SnapshotEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryInline:
            Text("Life OS · \(formatted(entry.snapshot.strain)) strain")
        case .accessoryCircular:
            Gauge(value: entry.snapshot.readiness ?? 0, in: 0...100) {
                Text("R")
            } currentValueLabel: {
                Text("\(Int(entry.snapshot.readiness ?? 0))")
                    .font(.system(size: 14, weight: .semibold).monospacedDigit())
            }
            .gaugeStyle(.accessoryCircular)
            .tint(Color.cyan)
        case .accessoryRectangular:
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Strain").font(.caption2).foregroundStyle(.secondary)
                    Text(formatted(entry.snapshot.strain))
                        .font(.system(size: 18, weight: .bold).monospacedDigit())
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Sleep").font(.caption2).foregroundStyle(.secondary)
                    Text("\(formatted(entry.snapshot.sleep)) h")
                        .font(.system(size: 16, weight: .semibold).monospacedDigit())
                }
            }
        default:
            VStack(alignment: .leading, spacing: 10) {
                Text("LIFE OS")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(.white.opacity(0.6))
                HStack {
                    metric("Strain", formatted(entry.snapshot.strain), .pink)
                    Spacer()
                    metric("Sleep", "\(formatted(entry.snapshot.sleep))h", .indigo)
                }
                HStack {
                    metric("Steps", stepsFormatted, .green)
                    Spacer()
                    metric("Ready", "\(Int(entry.snapshot.readiness ?? 0))", .cyan)
                }
            }
        }
    }

    private func metric(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(.white.opacity(0.55))
            Text(value).font(.system(size: 20, weight: .bold).monospacedDigit()).foregroundStyle(tint)
        }
    }

    private var stepsFormatted: String {
        guard let s = entry.snapshot.steps else { return "—" }
        return s >= 1000 ? String(format: "%.1fk", s / 1000) : "\(Int(s))"
    }

    private func formatted(_ v: Double?) -> String {
        guard let v else { return "—" }
        return String(format: "%.1f", v)
    }
}
