import SwiftUI
import SwiftData

/// Nutrition deep dive (sheet, own NavigationStack). Self-contained: queries
/// its own data and renders the TDEE estimate, protein adequacy, macro split,
/// eating window, and a weekly report — each sample-gated with a learning state.
struct NutritionDeepDiveView: View {
    @Query(sort: \MealLog.loggedAt, order: .reverse) private var meals: [MealLog]
    @Query private var daily: [DailyEntry]
    @Query private var settingsRows: [UserSettings]
    @Environment(\.modelContext) private var ctx
    @Environment(\.dismiss) private var dismiss

    @State private var range = 30

    private var settings: UserSettings { settingsRows.first ?? UserSettings.loadOrCreate(in: ctx) }
    private var tdee: NutritionIntelligenceEngine.TDEEEstimate? {
        NutritionIntelligenceEngine.estimateTDEE(meals: meals, daily: daily, settings: settings, days: range)
    }
    private var balance: [NutritionIntelligenceEngine.EnergyBalanceDay] {
        NutritionIntelligenceEngine.energyBalanceSeries(meals: meals, daily: daily, settings: settings, days: range)
    }
    private var protein: [NutritionIntelligenceEngine.ProteinDay] {
        NutritionIntelligenceEngine.proteinAdequacySeries(meals: meals, daily: daily, days: range)
    }
    private var split: [NutritionIntelligenceEngine.MacroSplitDay] {
        NutritionIntelligenceEngine.macroSplitSeries(meals: meals, days: range)
    }
    private var window: [NutritionIntelligenceEngine.EatingWindowDay] {
        NutritionIntelligenceEngine.eatingWindowSeries(meals: meals, days: min(range, 14))
    }
    private var report: NutritionIntelligenceEngine.WeeklyReport? {
        NutritionIntelligenceEngine.weeklyReport(meals: meals, daily: daily, settings: settings)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    rangePicker
                    if let report { weeklyReportCard(report) }
                    tdeeCard
                    proteinCard
                    macroSplitCard
                    eatingWindowCard
                    Spacer(minLength: 60)
                }
                .padding(.horizontal, 14).padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Nutrition deep dive")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { Haptics.tap(); dismiss() }
                        .foregroundStyle(LifeOSColor.accent)
                }
            }
        }
    }

    private var rangePicker: some View {
        Picker("Range", selection: $range) {
            Text("14d").tag(14); Text("30d").tag(30); Text("90d").tag(90)
        }
        .pickerStyle(.segmented)
    }

    private var tdeeCard: some View {
        Card(tint: LifeOSColor.Metric.weight) {
            VStack(alignment: .leading, spacing: 12) {
                Text("ENERGY BALANCE").font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.Metric.weight)
                if let est = tdee {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("\(Int(est.tdee.rounded()))")
                            .font(.system(size: 40, weight: .bold, design: .rounded).monospacedDigit())
                            .foregroundStyle(LifeOSColor.fg)
                        Text("kcal TDEE").font(.system(size: 13)).foregroundStyle(LifeOSColor.fg3)
                        Spacer()
                        if est.confidence < 0.5 {
                            Text("rough estimate").font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(LifeOSColor.warning)
                        }
                    }
                    Text(est.method == .regression
                        ? "Computed from \(est.loggedDays) days of intake vs your real weight movement."
                        : "Estimated from your goal until more weigh-ins land — log weight to sharpen it.")
                        .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                    DeficitWeightChart(days: balance, tdee: est.tdee)
                } else {
                    metricEmpty("scalemass.fill", "Log 7+ days of meals and a couple of weigh-ins and your measured TDEE lands here.")
                }
            }
        }
    }

    private var proteinCard: some View {
        Card(tint: LifeOSColor.Metric.protein) {
            VStack(alignment: .leading, spacing: 10) {
                Text("PROTEIN ADEQUACY (g/kg)").font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.Metric.protein)
                if protein.count >= 4 {
                    ProteinAdequacyChart(series: protein)
                    Text("Shaded zone is the 1.6–2.2 g/kg hypertrophy range.")
                        .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg2)
                } else {
                    metricEmpty("figure.strengthtraining.traditional", "Needs a few logged days with a bodyweight on file.")
                }
            }
        }
    }

    private var macroSplitCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("MACRO SPLIT OVER TIME").font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.fg3)
                if split.count >= 3 { MacroSplitChart(series: split) }
                else { metricEmpty("chart.bar.fill", "Log a few days to see how your macro split drifts.") }
            }
        }
    }

    private var eatingWindowCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("EATING WINDOW").font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.fg3)
                if window.count >= 3 {
                    EatingWindowStrip(series: window)
                    Text("Each bar is a day, first to last meal. Amber = ate after 9pm.")
                        .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg2)
                } else {
                    metricEmpty("clock.fill", "Log meals across a few days to map your feeding window.")
                }
            }
        }
    }

    private func weeklyReportCard(_ r: NutritionIntelligenceEngine.WeeklyReport) -> some View {
        Card(tint: LifeOSColor.Metric.calories) {
            VStack(alignment: .leading, spacing: 12) {
                Text("THIS WEEK").font(.system(size: 10, weight: .heavy)).tracking(1.4)
                    .foregroundStyle(LifeOSColor.Metric.calories)
                HStack(spacing: 12) {
                    stat("CAL ADHERENCE", "\(Int(r.calorieAdherencePct * 100))%", LifeOSColor.Metric.calories)
                    stat("PROTEIN HIT", "\(Int(r.proteinAdherencePct * 100))%", LifeOSColor.Metric.protein)
                    stat("P-STREAK", "\(r.proteinStreak)d", LifeOSColor.success)
                }
                if let best = r.bestDay, let worst = r.worstDay {
                    Text("Best day \(best.day.formatted(.dateTime.weekday(.abbreviated))) (\(Int(best.kcal)) kcal · \(Int(best.protein))g P) · toughest \(worst.day.formatted(.dateTime.weekday(.abbreviated)))")
                        .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                }
                if let cd = r.calorieDeltaVsPrior {
                    let protPart = r.proteinDeltaVsPrior.map { ", \($0 >= 0 ? "+" : "−")\(Int(abs($0)))g protein" } ?? ""
                    Text("\(cd >= 0 ? "+" : "−")\(Int(abs(cd))) kcal/day vs last week\(protPart)")
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
    }

    private func stat(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 8, weight: .heavy)).tracking(0.6).foregroundStyle(LifeOSColor.fg3)
            Text(value).font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit()).foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8).padding(.horizontal, 10)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func metricEmpty(_ icon: String, _ msg: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 24)).foregroundStyle(LifeOSColor.fg3.opacity(0.7))
            Text(msg).font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 16)
    }
}
