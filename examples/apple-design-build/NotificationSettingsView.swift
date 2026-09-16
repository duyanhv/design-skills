//  NotificationSettingsView.swift
//
//  Notification settings for iPhone. SwiftUI, deployment target iOS 16.0.
//
//  Design decisions and the Human Interface Guidelines sections they rest on are
//  recorded in NOTES.md next to this file. Every control here is system-provided,
//  so interaction states, Dynamic Type response, and assistive-technology
//  semantics come from the system rather than from this file.

import SwiftUI
import UIKit // UIAccessibility.post, for announcing the test-send result.

// MARK: - Model

/// How a single category is delivered.
///
/// Three mutually exclusive states. `quiet` means the notification is delivered
/// without sound; it is not the same as `off`, which suppresses it entirely.
enum NotificationDelivery: String, CaseIterable, Identifiable, Hashable {
    case off
    case quiet
    case immediate

    var id: String { rawValue }

    /// Short form, used inside the segmented control where width is scarce.
    var shortTitle: LocalizedStringKey {
        switch self {
        case .off: return "Off"
        case .quiet: return "Quiet"
        case .immediate: return "Immediate"
        }
    }

    /// Spoken and menu form. Says what the choice does, not just what it is
    /// called, so Voice Control and VoiceOver users hear the consequence.
    var accessibilityTitle: LocalizedStringKey {
        switch self {
        case .off: return "Off, not delivered"
        case .quiet: return "Quiet, delivered silently"
        case .immediate: return "Immediate, delivered with sound"
        }
    }
}

enum NotificationCategory: String, CaseIterable, Identifiable, Hashable {
    case mentions
    case directMessages
    case productUpdates

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .mentions: return "Mentions"
        case .directMessages: return "Direct Messages"
        case .productUpdates: return "Product Updates"
        }
    }

    /// Plain-language explanation of what lands in this category.
    var explanation: LocalizedStringKey {
        switch self {
        case .mentions: return "When someone names you in a conversation."
        case .directMessages: return "Messages sent only to you."
        case .productUpdates: return "New features and release notes."
        }
    }
}

enum NotificationSound: String, CaseIterable, Identifiable, Hashable {
    case chime
    case ping
    case pulse
    case ripple
    case none

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .chime: return "Chime"
        case .ping: return "Ping"
        case .pulse: return "Pulse"
        case .ripple: return "Ripple"
        case .none: return "None"
        }
    }
}

/// Why a test send failed. The distinction matters because one case is
/// recoverable by the person and the other is not: if the system permission is
/// off, no amount of retrying inside this app will work, and the fix lives in
/// the system Settings app.
enum TestNotificationFailure: Error, Equatable {
    /// The system has not granted notification permission to this app.
    case systemPermissionDenied
    /// Anything else, with whatever the host app could explain.
    case other(message: String)
}

/// Outcome of the most recent test send. Persists until the next attempt, so the
/// result is never a timed element that disappears before it is read.
enum TestNotificationResult: Equatable {
    case succeeded
    case failed(TestNotificationFailure)
}

/// Screen state. The host app owns this object so it can persist and restore the
/// values; this file deliberately performs no storage and no networking.
@MainActor
final class NotificationSettingsModel: ObservableObject {
    @Published var notificationsEnabled: Bool
    @Published var delivery: [NotificationCategory: NotificationDelivery]
    @Published var doNotDisturbEnabled: Bool
    @Published var doNotDisturbStart: Date
    @Published var doNotDisturbEnd: Date
    @Published var sound: NotificationSound

    @Published private(set) var isSendingTest = false
    @Published private(set) var testResult: TestNotificationResult?

    /// Supplied by the host app. It should request authorization if needed and
    /// schedule the test notification, throwing on failure. There is no default
    /// implementation here: a stub that always reported success would make the
    /// screen lie about whether delivery works.
    ///
    /// Throw `TestNotificationFailure.systemPermissionDenied` when the system has
    /// denied notification permission, so the screen can offer the one action
    /// that actually resolves it.
    private let sendTest: (NotificationSound) async throws -> Void

    init(
        notificationsEnabled: Bool = true,
        delivery: [NotificationCategory: NotificationDelivery] = [
            .mentions: .immediate,
            .directMessages: .immediate,
            .productUpdates: .quiet
        ],
        doNotDisturbEnabled: Bool = false,
        doNotDisturbStart: Date = NotificationSettingsModel.time(hour: 22, minute: 0),
        doNotDisturbEnd: Date = NotificationSettingsModel.time(hour: 7, minute: 0),
        sound: NotificationSound = .chime,
        sendTest: @escaping (NotificationSound) async throws -> Void
    ) {
        self.notificationsEnabled = notificationsEnabled
        self.delivery = delivery
        self.doNotDisturbEnabled = doNotDisturbEnabled
        self.doNotDisturbStart = doNotDisturbStart
        self.doNotDisturbEnd = doNotDisturbEnd
        self.sound = sound
        self.sendTest = sendTest
    }

    /// Binding helper so each row can read and write one category.
    func binding(for category: NotificationCategory) -> Binding<NotificationDelivery> {
        Binding(
            get: { self.delivery[category] ?? .off },
            set: { self.delivery[category] = $0 }
        )
    }

    var immediateCount: Int {
        NotificationCategory.allCases.filter { delivery[$0] == .immediate }.count
    }

    /// Length of the Do Not Disturb window, wrapping past midnight. `nil` when the
    /// start and end are the same minute, which describes no window at all.
    var doNotDisturbDuration: DateComponents? {
        let calendar = Calendar.current
        let start = calendar.dateComponents([.hour, .minute], from: doNotDisturbStart)
        let end = calendar.dateComponents([.hour, .minute], from: doNotDisturbEnd)
        let startMinutes = (start.hour ?? 0) * 60 + (start.minute ?? 0)
        let endMinutes = (end.hour ?? 0) * 60 + (end.minute ?? 0)
        var span = endMinutes - startMinutes
        if span < 0 { span += 24 * 60 }
        guard span > 0 else { return nil }
        return DateComponents(hour: span / 60, minute: span % 60)
    }

    func sendTestNotification() async {
        guard !isSendingTest else { return } // Repeat protection for a non-idempotent action.
        isSendingTest = true
        testResult = nil
        do {
            try await sendTest(sound)
            testResult = .succeeded
        } catch let failure as TestNotificationFailure {
            testResult = .failed(failure)
        } catch {
            testResult = .failed(.other(message: error.localizedDescription))
        }
        isSendingTest = false
    }

    /// `nonisolated` so it can be used in the default arguments above, which are
    /// evaluated at the call site rather than on the main actor.
    nonisolated static func time(hour: Int, minute: Int) -> Date {
        Calendar.current.date(
            bySettingHour: hour, minute: minute, second: 0, of: Date()
        ) ?? Date()
    }
}

// MARK: - Screen

/// Pushed from the app's settings list, so it declares a title but no navigation
/// container of its own; the caller's `NavigationStack` supplies the back button
/// and the interactive back gesture.
struct NotificationSettingsView: View {
    @ObservedObject var model: NotificationSettingsModel

    /// Drives the category control choice: a segmented control at normal sizes,
    /// a pop-up menu once text is large enough that segments would truncate.
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Form {
            allowSection

            if model.notificationsEnabled {
                categoriesSection
                doNotDisturbSection
                soundSection
            }

            testSection
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: model.testResult) { result in
            // The status appears below the button, so VoiceOver focus does not
            // move to it. Announce it instead of relying on the person to search.
            guard let result else { return }
            UIAccessibility.post(notification: .announcement, argument: result.announcement)
        }
    }

    // MARK: Allow notifications

    private var allowSection: some View {
        Section {
            // Switch style, used in a list row, per Toggles › iOS, iPadOS.
            Toggle("Allow Notifications", isOn: $model.notificationsEnabled)
        } footer: {
            Text(model.notificationsEnabled
                 ? "Choose how each kind of notification is delivered."
                 : "No notifications will be delivered. Categories, quiet hours, and sound become available when this is on.")
        }
    }

    // MARK: Per-category delivery

    private var categoriesSection: some View {
        Section {
            ForEach(NotificationCategory.allCases) { category in
                DeliveryRow(
                    category: category,
                    selection: model.binding(for: category),
                    useMenu: dynamicTypeSize.isAccessibilitySize
                )
            }
        } header: {
            Text("Categories")
        } footer: {
            // Requirement: see how many categories are set to Immediate.
            // Stated as text rather than a badge, so it does not depend on colour
            // and is read by VoiceOver when the footer is reached.
            Text("\(model.immediateCount) of \(NotificationCategory.allCases.count) categories deliver immediately. Quiet categories arrive without a sound.")
                .accessibilityLabel(immediateSummaryAccessibilityLabel)
        }
    }

    private var immediateSummaryAccessibilityLabel: String {
        let total = NotificationCategory.allCases.count
        return String(
            format: NSLocalizedString(
                "%1$d of %2$d categories are set to Immediate.",
                comment: "Summary of how many notification categories deliver immediately"
            ),
            model.immediateCount, total
        )
    }

    // MARK: Do Not Disturb

    private var doNotDisturbSection: some View {
        Section {
            Toggle("Do Not Disturb", isOn: $model.doNotDisturbEnabled)

            if model.doNotDisturbEnabled {
                // Compact date pickers: the space in a form row is constrained, and
                // hourAndMinute keeps the value editable by keyboard as well as touch.
                DatePicker(
                    "Start",
                    selection: $model.doNotDisturbStart,
                    displayedComponents: .hourAndMinute
                )
                DatePicker(
                    "End",
                    selection: $model.doNotDisturbEnd,
                    displayedComponents: .hourAndMinute
                )
            }
        } header: {
            Text("Quiet Hours")
        } footer: {
            if model.doNotDisturbEnabled {
                Text(doNotDisturbFooter)
            } else {
                Text("Hold notifications during a time window each day.")
            }
        }
    }

    private var doNotDisturbFooter: String {
        guard let duration = model.doNotDisturbDuration,
              let formatted = Self.durationFormatter.string(from: duration) else {
            // Validation stated where the fields are, naming what to do rather
            // than what failed.
            return NSLocalizedString(
                "Start and end are the same time, so nothing is held. Choose a different end time.",
                comment: "Shown when the Do Not Disturb window has zero length"
            )
        }
        let start = model.doNotDisturbStart.formatted(date: .omitted, time: .shortened)
        let end = model.doNotDisturbEnd.formatted(date: .omitted, time: .shortened)
        return String(
            format: NSLocalizedString(
                "Notifications are held from %1$@ to %2$@ every day, about %3$@.",
                comment: "Summary of the Do Not Disturb window: start time, end time, duration"
            ),
            start, end, formatted
        )
    }

    private static let durationFormatter: DateComponentsFormatter = {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.hour, .minute]
        formatter.unitsStyle = .full
        formatter.zeroFormattingBehavior = .dropAll
        return formatter
    }()

    // MARK: Sound

    private var soundSection: some View {
        Section {
            // Five named options: too many, and too long as words, for a segmented
            // control on iPhone. A pop-up menu keeps the chosen value visible in
            // the row and lets long localized names wrap.
            Picker("Sound", selection: $model.sound) {
                ForEach(NotificationSound.allCases) { sound in
                    Text(sound.title).tag(sound)
                }
            }
            .pickerStyle(.menu)
        } header: {
            Text("Sound")
        } footer: {
            Text(model.sound == .none
                 ? "Immediate notifications arrive without a sound. They still appear on the Lock Screen and in Notification Center."
                 : "Used for categories set to Immediate. Quiet categories never play a sound.")
        }
    }

    // MARK: Test notification

    private var testSection: some View {
        Section {
            Button {
                Task { await model.sendTestNotification() }
            } label: {
                HStack {
                    Text(model.isSendingTest ? "Sending Test…" : "Send Test Notification")
                    Spacer()
                    if model.isSendingTest {
                        // Indeterminate: the send has no meaningful progress to report.
                        ProgressView()
                            .accessibilityHidden(true) // The button label already says "Sending".
                    }
                }
            }
            .disabled(model.isSendingTest || !model.notificationsEnabled)

            if let result = model.testResult {
                TestResultRow(result: result)

                // Only recoverable failures get a recovery action, and it is the
                // action that actually resolves the cause.
                if case .failed(.systemPermissionDenied) = result {
                    Button("Open Notification Settings") {
                        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                        UIApplication.shared.open(url)
                    }
                }
            }
        } footer: {
            Text(model.notificationsEnabled
                 ? "Sends one notification to this device using the settings above."
                 : "Turn on Allow Notifications to send a test.")
        }
    }
}

// MARK: - Rows

/// One category and its delivery choice.
private struct DeliveryRow: View {
    let category: NotificationCategory
    @Binding var selection: NotificationDelivery
    let useMenu: Bool

    var body: some View {
        if useMenu {
            // At accessibility text sizes, three segments cannot show their titles.
            Picker(selection: $selection) {
                ForEach(NotificationDelivery.allCases) { option in
                    Text(option.shortTitle).tag(option)
                }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(category.title)
                    Text(category.explanation)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .pickerStyle(.menu)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(category.title)
                    Text(category.explanation)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Picker(selection: $selection) {
                    ForEach(NotificationDelivery.allCases) { option in
                        Text(option.shortTitle)
                            .accessibilityLabel(Text(option.accessibilityTitle))
                            .tag(option)
                    }
                } label: {
                    // Hidden visually, kept for assistive technologies, so the
                    // segmented control is not an unlabelled control.
                    Text(category.title)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            .padding(.vertical, 2)
        }
    }
}

/// Result of the last test send. Carries a symbol, text, and colour, so the
/// outcome is never conveyed by colour alone.
private struct TestResultRow: View {
    let result: TestNotificationResult

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                if let detail {
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        } icon: {
            Image(systemName: symbolName)
                .foregroundStyle(tint)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(result.announcement))
    }

    /// Names what happened and, for failures, what to do next.
    private var title: LocalizedStringKey {
        switch result {
        case .succeeded:
            return "Test notification sent"
        case .failed(.systemPermissionDenied):
            return "Notifications are turned off for this app in iOS Settings"
        case .failed(.other):
            return "Test notification failed. Try again."
        }
    }

    private var detail: String? {
        switch result {
        case .succeeded:
            return nil
        case .failed(.systemPermissionDenied):
            return NSLocalizedString(
                "Allow notifications in iOS Settings, then send the test again.",
                comment: "Recovery instruction when system notification permission is denied"
            )
        case .failed(.other(let message)):
            return message.isEmpty ? nil : message
        }
    }

    /// A symbol and text accompany the colour, so the outcome does not depend on
    /// colour perception.
    private var symbolName: String {
        switch result {
        case .succeeded: return "checkmark.circle.fill"
        case .failed: return "exclamationmark.triangle.fill"
        }
    }

    private var tint: Color {
        switch result {
        case .succeeded: return .green
        case .failed: return .red
        }
    }
}

private extension TestNotificationResult {
    var announcement: String {
        switch self {
        case .succeeded:
            return NSLocalizedString(
                "Test notification sent.",
                comment: "VoiceOver announcement after a successful test send"
            )
        case .failed(.systemPermissionDenied):
            return NSLocalizedString(
                "Test notification failed. Notifications are turned off for this app in iOS Settings. Allow notifications there, then send the test again.",
                comment: "VoiceOver announcement when system notification permission is denied"
            )
        case .failed(.other(let message)):
            let prefix = NSLocalizedString(
                "Test notification failed.",
                comment: "VoiceOver announcement after a failed test send"
            )
            return message.isEmpty ? prefix : "\(prefix) \(message)"
        }
    }
}
