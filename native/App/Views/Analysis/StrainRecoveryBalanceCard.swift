import SwiftUI

/// Analysis-screen card: the strain↔recovery story at a glance. A 2×2 quadrant
/// glyph + today's read on top, an ACWR (load-ramp) strip beneath. Tapping it
/// presents `StrainRecoveryDetailView` (the host wires the sheet — this is just
/// the label, so no `.pressable()` / push gotcha applies).
struct StrainRecoveryBalanceCard: View {
    let balance: StrainRecoveryBalance

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                header
                if balance.pairedDayCount < 5 {
                    learning
                } else {
                    quadrantRow
                    Divider().overlay(LifeOSColor.stroke)
                    acwrStrip
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text("STRAIN & RECOVERY")
                .font(.system(size: 10, weight: .heavy)).tracking(1.4)
                .foregroundStyle(LifeOSColor.Metric.peak)
            Spacer()
            HStack(spacing: 3) {
                Text("DETAIL").font(.system(size: 9, weight: .bold)).tracking(0.8)
                Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(LifeOSColor.Metric.peak)
        }
    }

    // MARK: - Quadrant row

    private var quadrantRow: some View {
        HStack(spacing: 14) {
            QuadrantGlyph(
                recovery: balance.todayRecovery,
                strain: balance.todayStrain,
                quadrant: balance.todayQuadrant
            )
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 3) {
                Text(quadrantTitle)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Text(quadrantRead)
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private var quadrantTitle: String {
        switch balance.todayQuadrant {
        case .primedAndPushed:  return "Capitalized"
        case .primedAndRested:  return "Room to push"
        case .drainedButPushed: return "Overreaching"
        case .balanced:         return "Balanced"
        case nil:               return "No reading today"
        }
    }

    private var quadrantRead: String {
        switch balance.todayQuadrant {
        case .primedAndPushed:
            return "You were primed and you spent it — high recovery met with high strain. Bank tonight's recovery."
        case .primedAndRested:
            return "Your body was ready for more than you asked of it. Room to push tomorrow if you want it."
        case .drainedButPushed:
            return "You pushed hard on low recovery. Sustainable once; a pattern is how injuries start."
        case .balanced:
            return "Load and recovery are tracking together — the sustainable middle."
        case nil:
            return "Today isn't scored yet — needs both an overnight recovery reading and logged activity."
        }
    }

    // MARK: - ACWR strip (compact)

    private var acwrStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("LOAD RATIO (ACWR)")
                    .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                Spacer()
                ACWRBandPill(band: balance.acwrBand)
            }
            ACWRTrack(acwr: balance.acwr, height: 10)
        }
    }

    // MARK: - Learning state

    private var learning: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(LifeOSColor.Metric.peak.opacity(0.16))
                Image(systemName: "scalemass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(LifeOSColor.Metric.peak)
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text("Balancing your load")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Text("\(balance.pairedDayCount) of 5 days with both a recovery score and logged strain. A few more and your balance lands here.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }
}

/// A static 2×2 recovery×strain grid with the day's dot. Canvas (not Swift
/// Charts) — trivial static geometry, and it keeps us clear of any chart cost.
struct QuadrantGlyph: View {
    let recovery: Int?
    let strain: Double?
    let quadrant: StrainRecoveryBalance.Quadrant?

    var body: some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height
            let midX = w / 2, midY = h / 2
            let cells: [(CGRect, StrainRecoveryBalance.Quadrant)] = [
                (CGRect(x: 0,    y: 0,    width: midX, height: midY), .drainedButPushed),
                (CGRect(x: midX, y: 0,    width: midX, height: midY), .primedAndPushed),
                (CGRect(x: 0,    y: midY, width: midX, height: midY), .balanced),
                (CGRect(x: midX, y: midY, width: midX, height: midY), .primedAndRested),
            ]
            for (rect, q) in cells {
                let active = q == quadrant
                let c = QuadrantGlyph.tint(q).opacity(active ? 0.30 : 0.10)
                ctx.fill(Path(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 3),
                         with: .color(c))
            }
            if let r = recovery, let s = strain {
                let px = CGFloat(r) / 100 * w
                let py = h - CGFloat(min(21, s)) / 21 * h
                let dot = CGRect(x: px - 3, y: py - 3, width: 6, height: 6)
                ctx.fill(Path(ellipseIn: dot), with: .color(LifeOSColor.fg))
                ctx.stroke(Path(ellipseIn: dot.insetBy(dx: -1.5, dy: -1.5)),
                           with: .color(QuadrantGlyph.tint(quadrant)), lineWidth: 1)
            }
        }
    }

    /// Shared quadrant→tint mapping (glyph, scatter, card all use this).
    static func tint(_ q: StrainRecoveryBalance.Quadrant?) -> Color {
        switch q {
        case .primedAndPushed:  return LifeOSColor.success
        case .primedAndRested:  return LifeOSColor.Metric.steps
        case .drainedButPushed: return LifeOSColor.danger
        case .balanced:         return LifeOSColor.warning
        case nil:               return LifeOSColor.fg3
        }
    }

    static func title(_ q: StrainRecoveryBalance.Quadrant) -> String {
        switch q {
        case .primedAndPushed:  return "Smart push"
        case .primedAndRested:  return "Room to push"
        case .drainedButPushed: return "Overreaching"
        case .balanced:         return "Balanced"
        }
    }
}
