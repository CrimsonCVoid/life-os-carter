import SwiftUI

/// Analysis card: tomorrow's PROJECTED readiness band + a 7-day readiness
/// calendar (past actual + forecast). Honest framing throughout — a range,
/// not a number; projection, not prediction.
struct ReadinessForecastCard: View {
    let forecast: ReadinessForecast

    var body: some View {
        Card(tint: heroTint) {
            VStack(alignment: .leading, spacing: 14) {
                header
                if let t = forecast.tomorrow {
                    band(t)
                    ReadinessCalendarStrip(cells: forecast.calendar, cellHeight: 42)
                } else {
                    learning
                }
            }
        }
    }

    private var heroTint: Color {
        forecast.tomorrow.map { LifeOSColor.recovery(Int($0.pointEstimate.rounded())) } ?? LifeOSColor.Metric.peak
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text("READINESS FORECAST")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(LifeOSColor.Metric.peak)
            Spacer()
            Text("PROJECTION")
                .font(.system(size: 8, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Capsule().fill(LifeOSColor.fg3.opacity(0.12)))
        }
    }

    private func band(_ t: ReadinessForecast.ReadinessProjection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Tomorrow likely").font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                Spacer()
                Text("\(Int(t.low.rounded()))–\(Int(t.high.rounded()))")
                    .font(.system(size: 30, weight: .bold, design: .rounded)).monospacedDigit()
                    .foregroundStyle(heroTint)
                Text("/ 100").font(.system(size: 12)).foregroundStyle(LifeOSColor.fg3)
            }
            ForecastBandTrack(proj: t)
            Text("\(t.confidence.label) · projection from today's load, your HRV/RHR trend, and sleep debt — not a guarantee. Tonight's sleep still decides it.")
                .font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var learning: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(LifeOSColor.Metric.peak.opacity(0.16))
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 16, weight: .semibold)).foregroundStyle(LifeOSColor.Metric.peak)
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text("Forecasting your readiness")
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(LifeOSColor.fg)
                Text("Needs about five days of overnight recovery to project tomorrow with an honest range.")
                    .font(.system(size: 12)).foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }
}
