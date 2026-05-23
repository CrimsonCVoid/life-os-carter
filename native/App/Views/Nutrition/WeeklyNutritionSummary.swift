import SwiftUI
import SwiftData
import Charts

/// 7-day nutrition rollup. Per-day stacked-macro bars, weekly average
/// vs target, top protein/carbs/fat foods. Pure read view; pushed
/// from a Nutrition toolbar button.
struct WeeklyNutritionSummary: View {
    @Query(sort: \MealLog.loggedAt, order: .reverse) private var allMeals: [MealLog]
    @Query private var settingsRows: [UserSettings]

    private let cal = Calendar.current

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                averageCard
                weeklyChart
                topSourcesCard
                dayBreakdown
                Spacer(minLength: 60)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle("This week")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var settings: UserSettings {
        settingsRows.first ?? UserSettings()
    }

    private var daysInWindow: [Date] {
        let today = cal.startOfDay(for: Date())
        return (0..<7).reversed().compactMap { cal.date(byAdding: .day, value: -$0, to: today) }
    }

    private var fmt: ISO8601DateFormatter { .dateOnly }

    private var perDay: [(date: Date, totals: Totals)] {
        daysInWindow.map { d in
            let key = fmt.string(from: d)
            let rows = allMeals.filter { $0.date == key }
            return (d, Totals(
                calories: rows.reduce(0) { $0 + $1.calories },
                protein: rows.reduce(0) { $0 + $1.proteinG },
                carbs: rows.reduce(0) { $0 + $1.carbsG },
                fat: rows.reduce(0) { $0 + $1.fatG }
            ))
        }
    }

    private var averages: Totals {
        let logged = perDay.filter { $0.totals.calories > 0 }
        guard !logged.isEmpty else { return Totals.zero }
        let n = Double(logged.count)
        return Totals(
            calories: logged.reduce(0) { $0 + $1.totals.calories } / n,
            protein: logged.reduce(0) { $0 + $1.totals.protein } / n,
            carbs: logged.reduce(0) { $0 + $1.totals.carbs } / n,
            fat: logged.reduce(0) { $0 + $1.totals.fat } / n
        )
    }

    private var loggedDays: Int {
        perDay.filter { $0.totals.calories > 0 }.count
    }

    // MARK: - Cards

    private var averageCard: some View {
        Card(tint: LifeOSColor.Metric.calories) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("WEEKLY AVERAGE")
                            .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                            .foregroundStyle(LifeOSColor.fg3)
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(Int(averages.calories))")
                                .font(.system(size: 30, weight: .bold).monospacedDigit())
                                .foregroundStyle(LifeOSColor.Metric.calories)
                            Text("kcal/day")
                                .font(.system(size: 12))
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(loggedDays) / 7")
                            .font(.system(size: 18, weight: .bold).monospacedDigit())
                            .foregroundStyle(LifeOSColor.fg)
                        Text("days logged")
                            .font(.system(size: 10))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
                HStack(spacing: 8) {
                    macroAvgChip("Protein", value: averages.protein, goal: Double(settings.proteinGoal), tint: LifeOSColor.Metric.protein)
                    macroAvgChip("Carbs",   value: averages.carbs,   goal: Double(settings.carbsGoal),   tint: LifeOSColor.Metric.carbs)
                    macroAvgChip("Fat",     value: averages.fat,     goal: Double(settings.fatGoal),     tint: LifeOSColor.Metric.fat)
                }
            }
        }
    }

    private func macroAvgChip(_ label: String, value: Double, goal: Double, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 8, weight: .heavy)).tracking(0.6)
                .foregroundStyle(LifeOSColor.fg3)
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text("\(Int(value))")
                    .font(.system(size: 16, weight: .bold).monospacedDigit())
                    .foregroundStyle(tint)
                Text("g")
                    .font(.system(size: 9))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            if goal > 0 {
                Text("of \(Int(goal))g")
                    .font(.system(size: 9))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var weeklyChart: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("CALORIES PER DAY")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                Chart {
                    ForEach(perDay, id: \.date) { row in
                        BarMark(
                            x: .value("Day", row.date, unit: .day),
                            y: .value("Calories", row.totals.calories)
                        )
                        .foregroundStyle(
                            LinearGradient(
                                colors: [LifeOSColor.Metric.calories, LifeOSColor.Metric.calories.opacity(0.4)],
                                startPoint: .top, endPoint: .bottom
                            )
                        )
                        .cornerRadius(4)
                    }
                    RuleMark(y: .value("Goal", Double(settings.caloriesGoal)))
                        .foregroundStyle(LifeOSColor.success.opacity(0.6))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4]))
                        .annotation(position: .topTrailing, alignment: .trailing, spacing: 2) {
                            Text("goal \(settings.caloriesGoal)")
                                .font(.system(size: 9))
                                .foregroundStyle(LifeOSColor.success)
                        }
                }
                .chartXAxis {
                    AxisMarks(values: perDay.map(\.date)) { value in
                        AxisValueLabel(format: .dateTime.weekday(.narrow))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
                .chartYAxis {
                    AxisMarks { _ in
                        AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                        AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                    }
                }
                .frame(height: 160)
            }
        }
    }

    private var topSourcesCard: some View {
        let last7Names = Set(perDay.map { $0.date }.map(fmt.string))
        let bucketMeals = allMeals.filter { last7Names.contains($0.date) }
        let proteinTop = topSources(meals: bucketMeals, key: \.proteinG, label: "g protein")
        let carbsTop = topSources(meals: bucketMeals, key: \.carbsG, label: "g carbs")
        let fatTop = topSources(meals: bucketMeals, key: \.fatG, label: "g fat")
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("TOP SOURCES")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                sourceRow(title: "Protein", entries: proteinTop, tint: LifeOSColor.Metric.protein)
                sourceRow(title: "Carbs",   entries: carbsTop,   tint: LifeOSColor.Metric.carbs)
                sourceRow(title: "Fat",     entries: fatTop,     tint: LifeOSColor.Metric.fat)
            }
        }
    }

    private struct Source {
        let name: String
        let value: Double
        let label: String
    }

    private func topSources(meals: [MealLog], key: KeyPath<MealLog, Double>, label: String) -> [Source] {
        var totals: [String: Double] = [:]
        for m in meals {
            totals[m.name, default: 0] += m[keyPath: key]
        }
        return totals
            .sorted { $0.value > $1.value }
            .prefix(3)
            .map { Source(name: $0.key, value: $0.value, label: label) }
    }

    private func sourceRow(title: String, entries: [Source], tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .heavy)).tracking(0.6)
                .foregroundStyle(tint)
            if entries.isEmpty {
                Text("nothing logged yet")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            } else {
                ForEach(entries.indices, id: \.self) { i in
                    HStack {
                        Text("\(i + 1).")
                            .font(.system(size: 11, weight: .semibold).monospacedDigit())
                            .foregroundStyle(LifeOSColor.fg3)
                            .frame(width: 16, alignment: .leading)
                        Text(entries[i].name)
                            .font(.system(size: 12))
                            .foregroundStyle(LifeOSColor.fg)
                            .lineLimit(1)
                        Spacer()
                        Text("\(Int(entries[i].value)) \(entries[i].label)")
                            .font(.system(size: 11, weight: .semibold).monospacedDigit())
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
            }
        }
    }

    private var dayBreakdown: some View {
        VStack(spacing: 8) {
            ForEach(perDay, id: \.date) { row in
                Card {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.date.formatted(.dateTime.weekday(.wide).month().day()))
                                .font(.system(size: 13, weight: .semibold))
                            if row.totals.calories == 0 {
                                Text("no meals logged")
                                    .font(.system(size: 10))
                                    .foregroundStyle(LifeOSColor.fg3)
                            } else {
                                Text("\(Int(row.totals.protein))p · \(Int(row.totals.carbs))c · \(Int(row.totals.fat))f")
                                    .font(.system(size: 10).monospacedDigit())
                                    .foregroundStyle(LifeOSColor.fg3)
                            }
                        }
                        Spacer()
                        Text(row.totals.calories == 0 ? "—" : "\(Int(row.totals.calories)) kcal")
                            .font(.system(size: 14, weight: .semibold).monospacedDigit())
                            .foregroundStyle(LifeOSColor.Metric.calories)
                    }
                }
            }
        }
    }

    struct Totals {
        let calories: Double
        let protein: Double
        let carbs: Double
        let fat: Double
        static let zero = Totals(calories: 0, protein: 0, carbs: 0, fat: 0)
    }
}
