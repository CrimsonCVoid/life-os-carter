import Foundation
import SwiftUI

// MARK: - Color tokens

/// Curated palette for habit tinting. Stored as the raw token string on
/// HabitEntry.colorToken so the actual Color resolves through
/// LifeOSColor — adding/changing a token here re-themes every habit
/// that uses it without a SwiftData migration.
enum HabitColor: String, CaseIterable, Identifiable {
    case accent
    case emerald
    case rose
    case amber
    case sky
    case indigo
    case cyan
    case lime

    var id: String { rawValue }

    var color: Color {
        switch self {
        case .accent:  return LifeOSColor.accent
        case .emerald: return LifeOSColor.success
        case .rose:    return LifeOSColor.danger
        case .amber:   return LifeOSColor.warning
        case .sky:     return LifeOSColor.Metric.carbs
        case .indigo:  return LifeOSColor.Metric.sleep
        case .cyan:    return LifeOSColor.Metric.water
        case .lime:    return LifeOSColor.Metric.steps
        }
    }

    static func from(_ raw: String) -> HabitColor {
        HabitColor(rawValue: raw) ?? .accent
    }
}

// MARK: - Categories

/// High-level grouping shown as filter pills in the main list. Stored
/// as the raw value on HabitEntry.category. "general" is the default
/// for habits without an explicit category.
enum HabitCategory: String, CaseIterable, Identifiable {
    case body
    case mind
    case sleep
    case productivity
    case discipline
    case general

    var id: String { rawValue }

    var label: String {
        switch self {
        case .body:         return "Body"
        case .mind:         return "Mind"
        case .sleep:        return "Sleep"
        case .productivity: return "Productivity"
        case .discipline:   return "Discipline"
        case .general:      return "General"
        }
    }

    var icon: String {
        switch self {
        case .body:         return "figure.run"
        case .mind:         return "brain.head.profile"
        case .sleep:        return "moon.fill"
        case .productivity: return "bolt.fill"
        case .discipline:   return "shield.fill"
        case .general:      return "sparkles"
        }
    }

    static func from(_ raw: String) -> HabitCategory {
        HabitCategory(rawValue: raw) ?? .general
    }
}

// MARK: - Cadence

/// How often a habit is "due." Serialized to HabitEntry.cadenceRaw so
/// we can store custom day-sets and weekly quotas without exploding
/// the schema into half a dozen columns.
enum HabitCadence: Hashable {
    case daily
    case weekdays
    case weekends
    /// Apple weekday convention: 1=Sun, 2=Mon, ..., 7=Sat.
    case specific(Set<Int>)
    /// Quota of N completions per week — flexible, not date-gated.
    case weekly(Int)

    var serialized: String {
        switch self {
        case .daily:               return "daily"
        case .weekdays:            return "weekdays"
        case .weekends:            return "weekends"
        case .specific(let days):  return "days:" + days.sorted().map(String.init).joined(separator: ",")
        case .weekly(let n):       return "weekly:\(n)"
        }
    }

    static func parse(_ s: String) -> HabitCadence {
        if s == "daily"    { return .daily }
        if s == "weekdays" { return .weekdays }
        if s == "weekends" { return .weekends }
        if s.hasPrefix("days:") {
            let nums = s.dropFirst(5).split(separator: ",").compactMap { Int($0) }
            return .specific(Set(nums))
        }
        if s.hasPrefix("weekly:") {
            return .weekly(Int(s.dropFirst(7)) ?? 1)
        }
        return .daily
    }

    var label: String {
        switch self {
        case .daily:    return "Daily"
        case .weekdays: return "Weekdays"
        case .weekends: return "Weekends"
        case .specific(let days):
            let syms = ["S","M","T","W","T","F","S"]
            return days.sorted().map { syms[$0 - 1] }.joined(separator: "·")
        case .weekly(let n): return "\(n)× / week"
        }
    }

    /// A habit is "due today" when its cadence includes today's
    /// weekday. Weekly-quota habits always count as available
    /// regardless of weekday — the quota status appears in the row
    /// instead of a strict due/not-due gate.
    func isDueOn(weekday: Int) -> Bool {
        switch self {
        case .daily:               return true
        case .weekdays:            return weekday >= 2 && weekday <= 6
        case .weekends:            return weekday == 1 || weekday == 7
        case .specific(let days):  return days.contains(weekday)
        case .weekly:              return true
        }
    }
}

// MARK: - HabitEntry helpers

extension HabitEntry {

    // ----- Convenience accessors

    var color: Color { HabitColor.from(colorToken).color }
    var categoryEnum: HabitCategory { HabitCategory.from(category) }
    var cadence: HabitCadence { HabitCadence.parse(cadenceRaw) }
    var isCountBased: Bool { dailyTarget > 1 }

    // ----- Count tracking (per-day counts for count-based habits)

    func count(on date: String) -> Int {
        guard let data = countsJSON.data(using: .utf8),
              let obj = try? JSONDecoder().decode([String: Int].self, from: data) else {
            return 0
        }
        return obj[date] ?? 0
    }

    /// Set the day's count and mirror to completedDates if the target
    /// is met (so streak/heatmap math has a uniform source-of-truth).
    /// Clamps below 0 and trims zero entries from the JSON to keep
    /// the blob from ballooning.
    func setCount(_ n: Int, on date: String) {
        var obj: [String: Int] = {
            guard let data = countsJSON.data(using: .utf8),
                  let decoded = try? JSONDecoder().decode([String: Int].self, from: data)
            else { return [:] }
            return decoded
        }()
        let capped = max(0, n)
        if capped == 0 {
            obj.removeValue(forKey: date)
        } else {
            obj[date] = capped
        }
        if let data = try? JSONEncoder().encode(obj),
           let str = String(data: data, encoding: .utf8) {
            countsJSON = str
        }
        if dailyTarget > 1 {
            let hit = capped >= dailyTarget
            let alreadyIn = completedDates.contains(date)
            if hit && !alreadyIn {
                completedDates.append(date)
            } else if !hit && alreadyIn {
                completedDates.removeAll { $0 == date }
            }
        }
        needsSync = true
    }

    func isCompleted(on date: String) -> Bool {
        if isCountBased {
            return count(on: date) >= dailyTarget
        }
        return completedDates.contains(date)
    }

    func toggle(on date: String) {
        if completedDates.contains(date) {
            completedDates.removeAll { $0 == date }
            if isCountBased { setCount(0, on: date) }
        } else {
            completedDates.append(date)
            if isCountBased { setCount(dailyTarget, on: date) }
        }
        needsSync = true
    }

    // ----- Streak / completion analytics

    /// Strict streak: consecutive due-days completed, walking back
    /// from today. Days that aren't due (per cadence) are neutral —
    /// they don't add to or break the streak. If today is due but
    /// not yet done, we start from yesterday so checking a habit at
    /// 11pm doesn't show "0 streak" for the morning.
    func currentStreak(today: Date = Date(), cal: Calendar = .current) -> Int {
        let done = Set(completedDates)
        let cad = cadence
        var cursor = cal.startOfDay(for: today)
        let todayKey = HabitDateFmt.ymd(cursor)
        let todayWeekday = cal.component(.weekday, from: cursor)
        if cad.isDueOn(weekday: todayWeekday) && !done.contains(todayKey) {
            // Allow today-not-yet-done to fall through.
            cursor = cal.date(byAdding: .day, value: -1, to: cursor) ?? cursor
        }
        var count = 0
        var safety = 0
        while safety < 1000 {
            safety += 1
            let weekday = cal.component(.weekday, from: cursor)
            if cad.isDueOn(weekday: weekday) {
                if done.contains(HabitDateFmt.ymd(cursor)) {
                    count += 1
                } else {
                    break
                }
            }
            guard let prev = cal.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return count
    }

    /// Longest run of consecutive completed days ever. Cheap to compute
    /// for typical history sizes; pre-sorts and walks once.
    func bestStreak(cal: Calendar = .current) -> Int {
        let dates = completedDates
            .compactMap(HabitDateFmt.date)
            .sorted()
        guard !dates.isEmpty else { return 0 }
        var best = 1
        var run = 1
        for i in 1..<dates.count {
            let dayDiff = cal.dateComponents([.day], from: dates[i - 1], to: dates[i]).day ?? 0
            if dayDiff == 1 {
                run += 1
                if run > best { best = run }
            } else {
                run = 1
            }
        }
        return best
    }

    /// Completion rate over the last N calendar days, counting only
    /// days where the habit was due. Returns 0 when no due-days fell
    /// in the window (rare, but possible for "weekends only" + a 5-day
    /// window).
    func completionRate(days: Int, today: Date = Date(), cal: Calendar = .current) -> Double {
        let done = Set(completedDates)
        let cad = cadence
        var due = 0
        var hit = 0
        let start = cal.startOfDay(for: today)
        for offset in 0..<days {
            guard let d = cal.date(byAdding: .day, value: -offset, to: start) else { continue }
            let weekday = cal.component(.weekday, from: d)
            if cad.isDueOn(weekday: weekday) {
                due += 1
                if done.contains(HabitDateFmt.ymd(d)) { hit += 1 }
            }
        }
        return due == 0 ? 0 : Double(hit) / Double(due)
    }
}

// MARK: - Date formatting

/// Single source for "YYYY-MM-DD" strings across the habits module.
/// Uses POSIX locale so the format is stable across user locales (the
/// keys are stored, not displayed).
enum HabitDateFmt {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
    static func ymd(_ d: Date) -> String { formatter.string(from: d) }
    static func date(_ s: String) -> Date? { formatter.date(from: s) }
}

// MARK: - Curated SF Symbol catalog

/// Hand-picked icon set surfaced in the editor's icon picker. Bigger
/// than what users typically pick from, smaller than dumping all 5000
/// SF Symbols. Grouped roughly by use case so the grid reads sensibly.
enum HabitIconCatalog {
    static let all: [String] = [
        // Body / fitness
        "figure.run", "figure.walk", "figure.yoga", "figure.flexibility",
        "figure.strengthtraining.traditional", "figure.cooldown",
        "dumbbell.fill", "bicycle", "figure.pool.swim", "figure.outdoor.cycle",
        "heart.fill", "drop.fill", "flame.fill",
        // Mind / mindfulness / learning
        "brain", "brain.head.profile", "book.fill", "books.vertical.fill",
        "pencil", "graduationcap.fill", "lightbulb.fill", "ear.fill",
        "headphones", "music.note",
        // Sleep / recovery
        "moon.fill", "moon.stars.fill", "bed.double.fill", "alarm.fill",
        "snowflake", "sun.max.fill", "sun.haze.fill",
        // Discipline
        "shield.fill", "lock.fill", "checkmark.shield.fill",
        "bolt.fill", "leaf.fill", "tortoise.fill", "hare.fill",
        // Productivity
        "laptopcomputer", "briefcase.fill", "calendar", "clock.fill",
        "list.bullet", "checkmark.circle.fill", "target", "doc.text.fill",
        // Food / nutrition
        "fork.knife", "carrot.fill", "cup.and.saucer.fill",
        "wineglass", "applelogo", "leaf.arrow.circlepath",
        // People / life
        "person.fill", "figure.2.and.child.holdinghands",
        "phone.fill", "envelope.fill",
        // Misc
        "sparkles", "star.fill", "paintbrush.fill", "camera.fill",
        "gamecontroller.fill", "globe", "mountain.2.fill",
    ]
}

// MARK: - Seed packs

/// Pre-built starter habits offered on the empty state. Each pack is
/// themed so the seeded habits look coherent (color + category) right
/// out of the gate instead of a soup of accent-violet rows.
struct HabitSeedPack: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let icon: String
    let tint: HabitColor
    let seeds: [HabitSeed]

    static let all: [HabitSeedPack] = [
        HabitSeedPack(
            id: "body",
            title: "Body",
            subtitle: "Move, hydrate, sleep",
            icon: "figure.run",
            tint: .emerald,
            seeds: [
                HabitSeed(name: "10,000 steps", icon: "figure.walk", color: .lime,
                          category: .body, cadence: .daily, target: 1),
                HabitSeed(name: "Drink 8 glasses water", icon: "drop.fill", color: .cyan,
                          category: .body, cadence: .daily, target: 8),
                HabitSeed(name: "Stretch 10 min", icon: "figure.flexibility", color: .emerald,
                          category: .body, cadence: .daily, target: 1),
                HabitSeed(name: "8 hours sleep", icon: "bed.double.fill", color: .indigo,
                          category: .sleep, cadence: .daily, target: 1),
            ]
        ),
        HabitSeedPack(
            id: "mind",
            title: "Mind",
            subtitle: "Read, reflect, learn",
            icon: "brain.head.profile",
            tint: .indigo,
            seeds: [
                HabitSeed(name: "Read 20 min", icon: "book.fill", color: .indigo,
                          category: .mind, cadence: .daily, target: 1),
                HabitSeed(name: "Meditate", icon: "brain", color: .cyan,
                          category: .mind, cadence: .daily, target: 1),
                HabitSeed(name: "Journal", icon: "pencil", color: .amber,
                          category: .mind, cadence: .daily, target: 1),
                HabitSeed(name: "Study language", icon: "globe", color: .sky,
                          category: .mind, cadence: .weekdays, target: 1),
            ]
        ),
        HabitSeedPack(
            id: "discipline",
            title: "Discipline",
            subtitle: "The hard reps",
            icon: "shield.fill",
            tint: .rose,
            seeds: [
                HabitSeed(name: "Cold shower", icon: "snowflake", color: .cyan,
                          category: .discipline, cadence: .daily, target: 1),
                HabitSeed(name: "No phone before bed", icon: "moon.fill", color: .indigo,
                          category: .discipline, cadence: .daily, target: 1),
                HabitSeed(name: "No alcohol", icon: "wineglass", color: .rose,
                          category: .discipline, cadence: .daily, target: 1),
                HabitSeed(name: "Make bed", icon: "bed.double.fill", color: .amber,
                          category: .discipline, cadence: .daily, target: 1),
            ]
        ),
    ]
}

struct HabitSeed {
    let name: String
    let icon: String
    let color: HabitColor
    let category: HabitCategory
    let cadence: HabitCadence
    let target: Int

    func make(order: Int) -> HabitEntry {
        HabitEntry(
            name: name,
            icon: icon,
            order: order,
            colorToken: color.rawValue,
            cadenceRaw: cadence.serialized,
            dailyTarget: target,
            category: category.rawValue,
            notes: ""
        )
    }
}
