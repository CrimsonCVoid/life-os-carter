import Foundation

/// Shared, dependency-free statistics for the on-device insight engines.
/// Extracted so the driver-ranking / multi-day-lag code doesn't re-duplicate
/// mean / SD / Cohen's d / least-squares a fourth time. Pure functions, no
/// state, no I/O.
///
/// Existing engines (InsightsEngine, StrainRecoveryEngine, RecoveryEngine,
/// AnalysisData) keep their own private copies intentionally — this is purely
/// additive so it doesn't perturb their main-thread-safe call sites.
enum InsightStats {

    static func mean(_ xs: [Double]) -> Double {
        guard !xs.isEmpty else { return 0 }
        return xs.reduce(0, +) / Double(xs.count)
    }

    static func variance(_ xs: [Double], mean m: Double) -> Double {
        guard xs.count > 1 else { return 0 }
        return xs.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(xs.count - 1)
    }

    static func stddev(_ xs: [Double], mean m: Double) -> Double {
        variance(xs, mean: m).squareRoot()
    }

    /// Pooled-SD Cohen's d. 0 when either group is flat / too small.
    static func cohensD(_ a: [Double], _ b: [Double]) -> Double {
        guard a.count > 1, b.count > 1 else { return 0 }
        let ma = mean(a), mb = mean(b)
        let va = variance(a, mean: ma), vb = variance(b, mean: mb)
        let pooled = (Double(a.count - 1) * va + Double(b.count - 1) * vb)
            / Double(a.count + b.count - 2)
        guard pooled > 0 else { return 0 }
        return (ma - mb) / pooled.squareRoot()
    }

    /// OLS slope+intercept over (x,y). nil when x has no spread.
    static func leastSquares(_ pts: [(x: Double, y: Double)]) -> (slope: Double, intercept: Double)? {
        let n = Double(pts.count)
        guard n >= 2 else { return nil }
        let sx = pts.reduce(0) { $0 + $1.x }
        let sy = pts.reduce(0) { $0 + $1.y }
        let sxx = pts.reduce(0) { $0 + $1.x * $1.x }
        let sxy = pts.reduce(0) { $0 + $1.x * $1.y }
        let denom = n * sxx - sx * sx
        guard denom != 0 else { return nil }
        let slope = (n * sxy - sx * sy) / denom
        return (slope, (sy - slope * sx) / n)
    }

    /// Pearson r over (x,y). nil when either axis is flat.
    static func pearson(_ pts: [(x: Double, y: Double)]) -> Double? {
        guard pts.count >= 3 else { return nil }
        let xs = pts.map(\.x), ys = pts.map(\.y)
        let mx = mean(xs), my = mean(ys)
        var sxy = 0.0, sxx = 0.0, syy = 0.0
        for p in pts { let dx = p.x - mx, dy = p.y - my; sxy += dx*dy; sxx += dx*dx; syy += dy*dy }
        guard sxx > 0, syy > 0 else { return nil }
        return sxy / (sxx.squareRoot() * syy.squareRoot())
    }

    /// Standardized OLS slope = slope · (SD_x / SD_y): the change in outcome
    /// SDs per 1-SD change in the input. Scale-free, so sleep-hours and
    /// step-counts rank on the same axis. nil when either axis is flat.
    static func standardizedSlope(_ pts: [(x: Double, y: Double)]) -> Double? {
        guard let (slope, _) = leastSquares(pts) else { return nil }
        let sdx = stddev(pts.map(\.x), mean: mean(pts.map(\.x)))
        let sdy = stddev(pts.map(\.y), mean: mean(pts.map(\.y)))
        guard sdx > 0, sdy > 0 else { return nil }
        return slope * sdx / sdy
    }
}
