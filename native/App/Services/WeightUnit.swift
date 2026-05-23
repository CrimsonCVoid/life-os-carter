import Foundation

/// Centralized lb/kg display. All input is stored in pounds internally
/// (set weights, body weight, etc.); this helper converts to the
/// user's chosen display unit at render time. Entry surfaces (the
/// SetRow text field, MealLog goals) still type in lb — converting
/// input would require a parallel state flip on every numeric field
/// which is more scope than v1 warrants.
enum WeightUnit: String {
    case lb
    case kg

    var label: String { rawValue }

    /// Pounds → display value in the chosen unit.
    func display(fromLb lb: Double) -> Double {
        switch self {
        case .lb: return lb
        case .kg: return lb * 0.45359237
        }
    }

    /// Format a pound value as "182 lb" or "82.6 kg" — single integer
    /// digit for lb (whole pounds), single decimal for kg (more
    /// granular). Mirrors how Apple Health and Whoop render weights.
    func formatted(fromLb lb: Double, fractionDigits: Int? = nil) -> String {
        let v = display(fromLb: lb)
        let digits = fractionDigits ?? (self == .lb ? 0 : 1)
        let fmt = "%.\(digits)f"
        return "\(String(format: fmt, v)) \(rawValue)"
    }

    static func from(_ raw: String) -> WeightUnit {
        WeightUnit(rawValue: raw) ?? .lb
    }
}
