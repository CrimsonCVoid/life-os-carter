/**
 * Home Screen + Lock Screen widgets — reads the App Group snapshot the
 * main app writes via SharedStorage. All styled with Liquid Glass (iOS
 * 26 .glassEffect APIs) with a graceful fallback to .ultraThinMaterial.
 *
 * Sizes shipped:
 *   • systemSmall  — strain ring
 *   • systemMedium — strain + sleep + steps strip
 *   • systemLarge  — strain + sleep + steps + readiness + macros
 *   • accessoryCircular  — strain number (Lock Screen complication)
 *   • accessoryRectangular — strain + steps line (Lock Screen)
 *   • accessoryInline    — single-line summary
 */

import SwiftUI
import WidgetKit

// MARK: - Snapshot model (matches src/lib/native/shared-storage.ts TodaySnapshot)

private struct TodaySnapshot: Codable {
    var date: String
    var strain: Double?
    var readiness: Double?
    var sleep: Double?
    var steps: Double?
    var calories: Double?
    var caloriesPct: Double?
    var updatedAt: Double
}

private func readSnapshot() -> TodaySnapshot? {
    guard let defaults = UserDefaults(suiteName: "group.com.hbrady.lifeos"),
          let raw = defaults.string(forKey: "todaySnapshot"),
          let data = raw.data(using: .utf8) else {
        return nil
    }
    return try? JSONDecoder().decode(TodaySnapshot.self, from: data)
}

// MARK: - Timeline provider

private struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(), snapshot: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: Date(), snapshot: readSnapshot()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let entry = Entry(date: Date(), snapshot: readSnapshot())
        // Refresh every 30 min — JS app writes the snapshot opportunistically
        // anyway, so the system reload is just a backstop.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private struct Entry: TimelineEntry {
    let date: Date
    let snapshot: TodaySnapshot?
}

// MARK: - Widget definitions

struct LifeOSWidget: Widget {
    let kind: String = "LifeOSWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            LifeOSWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(
                        colors: [Color(red: 0.04, green: 0.04, blue: 0.06),
                                 Color(red: 0.06, green: 0.06, blue: 0.08)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
        }
        .configurationDisplayName("Life OS")
        .description("Today's strain, sleep, and steps at a glance.")
        .supportedFamilies([
            .systemSmall, .systemMedium, .systemLarge,
            .accessoryCircular, .accessoryRectangular, .accessoryInline
        ])
    }
}

private struct LifeOSWidgetView: View {
    let entry: Entry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .systemSmall: SmallView(snap: entry.snapshot)
        case .systemMedium: MediumView(snap: entry.snapshot)
        case .systemLarge: LargeView(snap: entry.snapshot)
        case .accessoryCircular: AccessoryCircularView(snap: entry.snapshot)
        case .accessoryRectangular: AccessoryRectangularView(snap: entry.snapshot)
        case .accessoryInline: AccessoryInlineView(snap: entry.snapshot)
        default: SmallView(snap: entry.snapshot)
        }
    }
}

// MARK: - System sizes

private struct SmallView: View {
    let snap: TodaySnapshot?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("STRAIN")
                .font(.system(size: 10, weight: .bold)).tracking(1.4)
                .foregroundStyle(Color.cyan)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(snap?.strain.map { String(format: "%.1f", $0) } ?? "—")
                    .font(.system(size: 44, weight: .bold).monospacedDigit())
                    .foregroundStyle(.white)
                Text("/21")
                    .font(.system(size: 12, weight: .medium).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.5))
            }
            Spacer()
            StrainBar(value: snap?.strain ?? 0)
        }
        .padding(14)
    }
}

private struct MediumView: View {
    let snap: TodaySnapshot?
    var body: some View {
        HStack(spacing: 12) {
            MetricChip(label: "STRAIN",
                       value: snap?.strain.map { String(format: "%.1f", $0) } ?? "—",
                       unit: "/21",
                       tone: .cyan)
            MetricChip(label: "SLEEP",
                       value: snap?.sleep.map { String(format: "%.1f", $0) } ?? "—",
                       unit: "h",
                       tone: .purple)
            MetricChip(label: "STEPS",
                       value: snap?.steps.map { compactNumber($0) } ?? "—",
                       unit: "",
                       tone: .green)
        }
        .padding(12)
    }
}

private struct LargeView: View {
    let snap: TodaySnapshot?
    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                MetricChip(label: "STRAIN",
                           value: snap?.strain.map { String(format: "%.1f", $0) } ?? "—",
                           unit: "/21",
                           tone: .cyan)
                MetricChip(label: "READINESS",
                           value: snap?.readiness.map { String(format: "%.0f", $0) } ?? "—",
                           unit: "/100",
                           tone: .mint)
            }
            HStack(spacing: 12) {
                MetricChip(label: "SLEEP",
                           value: snap?.sleep.map { String(format: "%.1f", $0) } ?? "—",
                           unit: "h",
                           tone: .purple)
                MetricChip(label: "STEPS",
                           value: snap?.steps.map { compactNumber($0) } ?? "—",
                           unit: "",
                           tone: .green)
            }
            if let cal = snap?.calories {
                CaloriesBar(calories: cal, pct: snap?.caloriesPct)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
    }
}

// MARK: - Lock Screen complications

private struct AccessoryCircularView: View {
    let snap: TodaySnapshot?
    var body: some View {
        ZStack {
            Circle().strokeBorder(Color.white.opacity(0.25), lineWidth: 2)
            VStack(spacing: -1) {
                Text(snap?.strain.map { String(format: "%.1f", $0) } ?? "—")
                    .font(.system(size: 16, weight: .bold).monospacedDigit())
                Text("strain")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct AccessoryRectangularView: View {
    let snap: TodaySnapshot?
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "bolt.fill").foregroundStyle(Color.cyan)
                Text("Strain \(snap?.strain.map { String(format: "%.1f", $0) } ?? "—")")
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
            }
            HStack(spacing: 4) {
                Image(systemName: "figure.walk").foregroundStyle(Color.green)
                Text("\(snap?.steps.map { compactNumber($0) } ?? "—") steps")
                    .font(.system(size: 11, weight: .medium).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct AccessoryInlineView: View {
    let snap: TodaySnapshot?
    var body: some View {
        Text("Strain \(snap?.strain.map { String(format: "%.1f", $0) } ?? "—") · Sleep \(snap?.sleep.map { String(format: "%.1f", $0) } ?? "—")h")
    }
}

// MARK: - Reusable bits — all Liquid Glass

private struct MetricChip: View {
    let label: String
    let value: String
    let unit: String
    let tone: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 9, weight: .bold)).tracking(1.4)
                .foregroundStyle(tone)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .font(.system(size: 22, weight: .bold).monospacedDigit())
                    .foregroundStyle(.white)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(10)
        .modifier(GlassTile(tone: tone))
    }
}

private struct StrainBar: View {
    let value: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 4).fill(Color.white.opacity(0.1))
                RoundedRectangle(cornerRadius: 4)
                    .fill(LinearGradient(colors: [.cyan, .mint], startPoint: .leading, endPoint: .trailing))
                    .frame(width: geo.size.width * min(1, max(0, value / 21)))
            }
        }
        .frame(height: 4)
    }
}

private struct CaloriesBar: View {
    let calories: Double
    let pct: Double?
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("CALORIES").font(.system(size: 9, weight: .bold)).tracking(1.4)
                    .foregroundStyle(Color.orange)
                Spacer()
                Text("\(Int(calories.rounded())) kcal")
                    .font(.system(size: 11, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.8))
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(Color.white.opacity(0.1))
                    RoundedRectangle(cornerRadius: 3)
                        .fill(LinearGradient(colors: [.orange, .yellow], startPoint: .leading, endPoint: .trailing))
                        .frame(width: geo.size.width * min(1, max(0, pct ?? 0)))
                }
            }
            .frame(height: 6)
        }
        .padding(10)
        .modifier(GlassTile(tone: .orange))
    }
}

private struct GlassTile: ViewModifier {
    let tone: Color
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular.tint(tone.opacity(0.18)),
                               in: RoundedRectangle(cornerRadius: 16))
        } else {
            content
                .background(.ultraThinMaterial,
                            in: RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(tone.opacity(0.4), lineWidth: 1)
                )
        }
    }
}

private func compactNumber(_ n: Double) -> String {
    if n >= 1000 {
        return String(format: "%.1fk", n / 1000)
    }
    return String(format: "%.0f", n)
}
