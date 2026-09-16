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

    func remove(_ member: Member) {
        members.removeAll { $0.id == member.id }
    }

    func invite() {
        guard !inviteEmail.isEmpty else { return }
        isSending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            self.members.append(Member(name: self.inviteEmail, email: self.inviteEmail, canEdit: false))
            self.inviteEmail = ""
            self.isSending = false
        }
    }
}

struct ShareSheetView: View {
    @State private var store = ShareStore()
    @State private var pendingRemoval: Member?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    inviteRow
                    linkRow
                    peopleList
                    footer
                }
                .padding(20)
            }
            .background(Color(red: 0.97, green: 0.97, blue: 0.98))
            .navigationTitle("Share")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        store.linkSharingOn.toggle()
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 15))
                    }
                    .frame(width: 24, height: 24)
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Quarterly Report")
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(Color(red: 0.11, green: 0.11, blue: 0.12))
            Text("Shared with \(store.members.count) people")
                .font(.system(size: 13))
                .foregroundColor(Color(red: 0.56, green: 0.56, blue: 0.58))
        }
    }

    private var inviteRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Invite")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(red: 0.36, green: 0.36, blue: 0.38))
            HStack(spacing: 8) {
                TextField("Email address", text: $store.inviteEmail)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.white)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(store.inviteEmail.isEmpty ? Color(white: 0.85) : Color(red: 0.85, green: 0.2, blue: 0.2), lineWidth: 1)
                    )

                Button {
                    store.invite()
                } label: {
                    Text("Send")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color(red: 0.0, green: 0.48, blue: 1.0))
                        .cornerRadius(8)
                }
            }
        }
    }

    private var linkRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Anyone with the link")
                    .font(.system(size: 15))
                    .foregroundColor(Color(red: 0.11, green: 0.11, blue: 0.12))
                Text("Viewers can open this report")
                    .font(.system(size: 12))
                    .foregroundColor(Color(red: 0.56, green: 0.56, blue: 0.58))
            }
            Spacer()
            Toggle("", isOn: $store.linkSharingOn)
                .labelsHidden()
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(10)
    }

    private var peopleList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("People")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(red: 0.36, green: 0.36, blue: 0.38))
                .padding(.bottom, 8)

            ForEach(store.members) { member in
                HStack(spacing: 12) {
                    Circle()
                        .fill(Color(red: 0.82, green: 0.84, blue: 0.88))
                        .frame(width: 36, height: 36)
                        .overlay(
                            Text(initials(member.name))
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Color(red: 0.25, green: 0.27, blue: 0.32))
                        )

                    VStack(alignment: .leading, spacing: 1) {
                        Text(member.name)
                            .font(.system(size: 15))
                            .foregroundColor(Color(red: 0.11, green: 0.11, blue: 0.12))
                            .lineLimit(1)
                        Text(member.email)
                            .font(.system(size: 12))
                            .foregroundColor(Color(red: 0.56, green: 0.56, blue: 0.58))
                            .lineLimit(1)
                    }

                    Spacer()

                    Circle()
                        .fill(member.canEdit ? Color(red: 0.2, green: 0.72, blue: 0.35) : Color(red: 0.75, green: 0.75, blue: 0.77))
                        .frame(width: 8, height: 8)

                    Button {
                        pendingRemoval = member
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(Color(red: 0.56, green: 0.56, blue: 0.58))
                    }
                    .frame(width: 20, height: 20)
                }
                .padding(.vertical, 10)

                if member.id != store.members.last?.id {
                    Divider().padding(.leading, 48)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(Color.white)
        .cornerRadius(10)
        .alert("Are you sure?", isPresented: .constant(pendingRemoval != nil)) {
            Button("OK") {
                if let member = pendingRemoval { store.remove(member) }
                pendingRemoval = nil
            }
            Button("Cancel", role: .cancel) { pendingRemoval = nil }
        }
    }

    private var footer: some View {
        HStack {
            if store.isSending {
                ProgressView().scaleEffect(0.8)
            }
            Spacer()
            Text("Stop sharing")
                .font(.system(size: 15))
                .foregroundColor(Color(red: 0.85, green: 0.2, blue: 0.2))
                .onTapGesture {
                    store.members.removeAll()
                    store.linkSharingOn = false
                }
        }
        .padding(.top, 4)
    }

    private func initials(_ name: String) -> String {
        name.split(separator: " ").prefix(2).map { String($0.prefix(1)) }.joined()
    }
}
