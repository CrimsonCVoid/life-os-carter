import SwiftUI
import SwiftData

/// On-demand behavioral correlations on the Analysis tab — Whoop-style
/// "your sleep is 28% better on no-alcohol days." Lazy: stays in an
/// idle state until the user taps "Find correlations". State lives in
/// @State so navigating away drops it; re-tap to refresh.
///
/// Snapshot sent to /api/correlations: last 30 days of DailyEntry
/// (sleep, mood, energy, HRV, RHR, steps, weight + behavioral flags)
/// plus per-day workout counts/volume and meal counts.
struct CorrelationsCard: View {
    @Environment(\.modelContext) private var modelContext
    @State private var state: ViewState = .idle

    private enum ViewState {
        case idle
        case loading
        case loaded(CorrelationsResponse)
        case failed(String)
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                header
                switch state {
                case .idle:               idleBody
                case .loading:            loadingBody
                case .loaded(let r):      loadedBody(r)
                case .failed(let msg):    failedBody(msg)
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().fill(
                    LinearGradient(
                        colors: [LifeOSColor.accent, LifeOSColor.Metric.peak],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                Image(systemName: "function")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(.white)
            }
            .frame(width: 22, height: 22)
            Text("BEHAVIOR CORRELATIONS")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
            if case .loaded = state {
                Button(action: generate) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var idleBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Cross-reference 30 days of sleep, HRV, mood, and behavior flags for patterns — alcohol vs sleep, late eating vs HRV, workouts vs energy.")
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.fg2)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: generate) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles").font(.system(size: 11, weight: .semibold))
                    Text("Find correlations").font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background(Capsule().fill(LifeOSColor.accent))
            }
            .buttonStyle(.plain)
        }
    }

    private var loadingBody: some View {
        HStack(spacing: 10) {
            ProgressView()
                .controlSize(.small)
                .tint(LifeOSColor.accent)
            Text("Crunching 30 days of logs…")
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.fg2)
        }
        .padding(.vertical, 4)
    }

    private func loadedBody(_ r: CorrelationsResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if !r.summary.isEmpty {
                Text(r.summary)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: 10) {
                ForEach(Array(r.correlations.enumerated()), id: \.offset) { _, c in
                    correlationRow(c)
                }
            }
        }
    }

    private func correlationRow(_ c: CorrelationItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(directionColor(c.direction).opacity(0.15))
                Image(systemName: directionIcon(c.direction))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(directionColor(c.direction))
            }
            .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(c.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                    confidenceChip(c.confidence)
                }
                Text(c.detail)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private func failedBody(_ msg: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(msg)
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.warning)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: generate) {
                Text("Try again")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(LifeOSColor.accent)
            }
            .buttonStyle(.plain)
        }
    }

    private func directionColor(_ d: String) -> Color {
        switch d {
        case "positive": return LifeOSColor.success
        case "negative": return LifeOSColor.danger
        default:         return LifeOSColor.fg2
        }
    }

    private func directionIcon(_ d: String) -> String {
        switch d {
        case "positive": return "arrow.up.right"
        case "negative": return "arrow.down.right"
        default:         return "equal"
        }
    }

    private func confidenceChip(_ c: String) -> some View {
        let (label, color): (String, Color) = {
            switch c {
            case "strong":          return ("STRONG", LifeOSColor.success)
            case "modest":          return ("MODEST", LifeOSColor.warning)
            default:                return ("LOW DATA", LifeOSColor.fg3)
            }
        }()
        return Text(label)
            .font(.system(size: 8, weight: .heavy)).tracking(0.6)
            .foregroundStyle(color)
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(Capsule().fill(color.opacity(0.15)))
    }

    // MARK: - API

    private func generate() {
        Haptics.tap()
        state = .loading
        Task {
            do {
                let req = buildRequest()
                let result: CorrelationsResponse = try await APIClient.shared.post(
                    "/api/correlations",
                    body: req,
                    as: CorrelationsResponse.self
                )
                await MainActor.run {
                    state = .loaded(result)
                    Haptics.success()
                }
            } catch {
                await MainActor.run {
                    state = .failed("Couldn't reach the coach right now. Try again in a moment.")
                    Haptics.warning()
                }
            }
        }
    }

    private func buildRequest() -> CorrelationsRequest {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        // Pull last 30 calendar days. Keys are stable YYYY-MM-DD strings.
        let dateKeys: [String] = (0..<30).reversed().compactMap { offset in
            guard let d = cal.date(byAdding: .day, value: -offset, to: today) else { return nil }
            return Self.ymd(d)
        }
        let dailies = (try? modelContext.fetch(FetchDescriptor<DailyEntry>())) ?? []
        let dailyByDate = Dictionary(uniqueKeysWithValues: dailies.map { ($0.date, $0) })

        let allWorkouts = (try? modelContext.fetch(FetchDescriptor<LiftSessionEntry>())) ?? []
        let workoutsByDate = Dictionary(grouping: allWorkouts, by: \.date)

        let allMeals = (try? modelContext.fetch(FetchDescriptor<MealLog>())) ?? []
        let mealsByDate = Dictionary(grouping: allMeals, by: \.date)

        let days: [DayInput] = dateKeys.map { key in
            let d = dailyByDate[key]
            let w = workoutsByDate[key] ?? []
            let m = mealsByDate[key] ?? []
            return DayInput(
                date: key,
                sleepHours: d?.sleepHours,
                mood: d?.moodScore,
                energy: d?.energyScore,
                hrvMs: d?.hrvMs,
                restingHr: d?.restingHr,
                steps: d?.steps,
                weightLb: d?.weightLb,
                alcoholYesterday: d?.alcoholYesterday ?? false,
                caffeineAfter2pm: d?.caffeineAfter2pm ?? false,
                lateEating: d?.lateEating ?? false,
                screenBeforeBed: d?.screenBeforeBed ?? false,
                stressLevel: d?.stressLevel,
                workoutCount: w.count,
                totalVolumeLb: Int(w.reduce(0.0) { $0 + $1.totalVolumeLb }),
                mealCount: m.count
            )
        }
        return CorrelationsRequest(days: days)
    }

    private static func ymd(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: d)
    }
}

// MARK: - DTOs

private struct CorrelationsRequest: Encodable {
    let days: [DayInput]
}

private struct DayInput: Encodable {
    let date: String
    let sleepHours: Double?
    let mood: Int?
    let energy: Int?
    let hrvMs: Double?
    let restingHr: Double?
    let steps: Int?
    let weightLb: Double?
    let alcoholYesterday: Bool
    let caffeineAfter2pm: Bool
    let lateEating: Bool
    let screenBeforeBed: Bool
    let stressLevel: Int?
    let workoutCount: Int
    let totalVolumeLb: Int
    let mealCount: Int
}

struct CorrelationsResponse: Decodable {
    let summary: String
    let correlations: [CorrelationItem]
}

struct CorrelationItem: Decodable {
    let kind: String
    let title: String
    let detail: String
    let direction: String
    let confidence: String
}
