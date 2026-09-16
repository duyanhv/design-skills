import SwiftUI

struct Member: Identifiable {
    let id = UUID()
    let name: String
    let email: String
    var canEdit: Bool
}

@Observable
final class ShareStore {
    var members: [Member] = [
        Member(name: "Ana Lindqvist", email: "ana@example.com", canEdit: true),
        Member(name: "Marcus Oyelaran-Whitfield", email: "marcus.oyelaran@example.com", canEdit: false),
        Member(name: "Priya Raghunathan", email: "priya@example.com", canEdit: true),
    ]
    var inviteEmail = ""
    var linkSharingOn = true
    var isSending = false
    var inviteError: String?

    var canSend: Bool { !inviteEmail.trimmingCharacters(in: .whitespaces).isEmpty && !isSending }

    func remove(_ member: Member) {
        members.removeAll { $0.id == member.id }
    }

    func stopSharing() {
        members.removeAll()
        linkSharingOn = false
    }

    /// Validates on submit rather than on every keystroke, so a half-typed address is not
    /// reported as wrong while it is still being written.
    func invite() {
        guard !isSending else { return }
        let address = inviteEmail.trimmingCharacters(in: .whitespaces)
        guard address.contains("@"), address.contains(".") else {
            inviteError = "Enter a complete email address, like name@example.com."
            return
        }
        inviteError = nil
        isSending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            let name = address.split(separator: "@").first.map(String.init) ?? address
            self.members.append(Member(name: name, email: address, canEdit: false))
            self.inviteEmail = ""
            self.isSending = false
        }
    }
}

struct ShareSheetView: View {
    @State private var store = ShareStore()
    @State private var pendingRemoval: Member?
    @State private var isConfirmingStop = false
    @ScaledMetric(relativeTo: .body) private var avatarSize: CGFloat = 36
    @FocusState private var inviteFocused: Bool

    var body: some View {
        NavigationStack {
            List {
                Section {
                    inviteRow
                } header: {
                    Text("Invite")
                } footer: {
                    if let error = store.inviteError {
                        Text(error).foregroundStyle(.red)
                    }
                }

                Section {
                    Toggle(isOn: $store.linkSharingOn) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Anyone with the link")
                            Text("Viewers can open this report")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("People") {
                    ForEach(store.members) { member in
                        memberRow(member)
                    }
                }

                Section {
                    Button("Stop Sharing", role: .destructive) {
                        isConfirmingStop = true
                    }
                }
            }
            .navigationTitle("Quarterly Report")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            store.linkSharingOn.toggle()
                        } label: {
                            Label(store.linkSharingOn ? "Turn Off Link Sharing" : "Turn On Link Sharing",
                                  systemImage: store.linkSharingOn ? "link.badge.plus" : "link")
                        }
                        Button(role: .destructive) {
                            isConfirmingStop = true
                        } label: {
                            Label("Stop Sharing", systemImage: "person.2.slash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("More sharing options")
                }
            }
            .alert("Remove \(pendingRemoval?.name ?? "")?",
                   isPresented: Binding(get: { pendingRemoval != nil },
                                        set: { if !$0 { pendingRemoval = nil } }),
                   presenting: pendingRemoval) { member in
                Button("Remove", role: .destructive) {
                    store.remove(member)
                    pendingRemoval = nil
                }
                Button("Cancel", role: .cancel) { pendingRemoval = nil }
            } message: { _ in
                Text("They'll lose access to this report.")
            }
            .confirmationDialog("Stop sharing “Quarterly Report”?",
                                isPresented: $isConfirmingStop,
                                titleVisibility: .visible) {
                Button("Stop Sharing", role: .destructive) { store.stopSharing() }
                Button("Cancel", role: .cancel) { }
            } message: {
                Text("^[\(store.members.count) person](inflect: true) will lose access. This can't be undone.")
            }
        }
    }

    /// Side by side while both fit; stacked once the text size makes that impossible.
    /// `ViewThatFits` picks the first layout that fits, so the button never has to wrap its title.
    private var inviteRow: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                inviteField
                sendButton.fixedSize(horizontal: true, vertical: false)
            }
            VStack(alignment: .leading, spacing: 12) {
                inviteField
                sendButton.frame(maxWidth: .infinity)
            }
        }
    }

    private var inviteField: some View {
        TextField("Email address", text: $store.inviteEmail)
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.send)
            .focused($inviteFocused)
            .onSubmit { store.invite() }
            .accessibilityLabel("Email address to invite")
    }

    private var sendButton: some View {
        Button {
            store.invite()
        } label: {
            if store.isSending {
                ProgressView()
                    .accessibilityLabel("Sending invitation")
            } else {
                Text("Send").lineLimit(1)
            }
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(!store.canSend)
    }

    private func memberRow(_ member: Member) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color(.systemFill))
                .frame(width: avatarSize, height: avatarSize)
                .overlay(
                    Text(initials(member.name))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                Text(member.name)
                Text(member.email)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            Label(member.canEdit ? "Can edit" : "View only",
                  systemImage: member.canEdit ? "pencil.circle.fill" : "eye.circle.fill")
                .labelStyle(.titleAndIcon)
                .font(.caption)
                .foregroundStyle(member.canEdit ? Color.accentColor : Color.secondary)
        }
        .accessibilityElement(children: .combine)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                pendingRemoval = member
            } label: {
                Label("Remove", systemImage: "person.badge.minus")
            }
        }
        .accessibilityAction(named: "Remove \(member.name)") {
            pendingRemoval = member
        }
    }

    private func initials(_ name: String) -> String {
        name.split(separator: " ").prefix(2).map { String($0.prefix(1)) }.joined().uppercased()
    }
}
