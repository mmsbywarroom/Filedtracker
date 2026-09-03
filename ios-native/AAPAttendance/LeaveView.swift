import SwiftUI

struct LeaveView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var leaves: [[String: Any]] = []
    @State private var fromDate = Date()
    @State private var toDate = Date()
    @State private var hasFrom = true
    @State private var hasTo = true
    @State private var reason = ""
    @State private var loading = true
    @State private var busy = false
    @State private var message = ""
    @State private var isError = false

    var body: some View {
        AapScreenScaffold(title: "Leave request", subtitle: "Apply and track approvals", onBack: { dismiss() }) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    AapCard {
                        Text("New request").font(.title3.weight(.semibold)).foregroundColor(AapTheme.textPrimary)
                        HStack {
                            dateBtn("From", hasFrom ? ymd(fromDate) : "Pick", show: $hasFrom, date: $fromDate)
                            dateBtn("To", hasTo ? ymd(toDate) : "Pick", show: $hasTo, date: $toDate)
                        }
                        TextEditor(text: $reason)
                            .frame(minHeight: 96)
                            .padding(8)
                            .background(AapTheme.navy.opacity(0.45))
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(AapTheme.yellow.opacity(0.5)))
                            .foregroundColor(AapTheme.textPrimary)
                        Button(action: submit) {
                            HStack {
                                if busy { ProgressView().tint(AapTheme.navy) }
                                Text("Submit request").fontWeight(.bold)
                            }
                            .frame(maxWidth: .infinity).frame(height: 52)
                            .background(AapTheme.yellow).foregroundColor(AapTheme.navy)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                        .disabled(busy)
                    }
                    if !message.isEmpty {
                        Text(message).foregroundColor(isError ? AapTheme.danger : AapTheme.success)
                    }
                    Text("YOUR REQUESTS").font(.caption).foregroundColor(AapTheme.textMuted).tracking(1)
                    if loading {
                        ProgressView().tint(AapTheme.yellow).frame(maxWidth: .infinity).padding(24)
                    } else if leaves.isEmpty {
                        AapCard { Text("No leave requests yet.").foregroundColor(AapTheme.textMuted) }
                    } else {
                        ForEach(leaves.indices, id: \.self) { i in
                            leaveRow(leaves[i])
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 28)
            }
        }
        .task { await reload() }
    }

    private func dateBtn(_ label: String, _ value: String, show: Binding<Bool>, date: Binding<Date>) -> some View {
        VStack(alignment: .leading) {
            Text(label).font(.caption).foregroundColor(AapTheme.textMuted)
            DatePicker("", selection: date, displayedComponents: .date)
                .labelsHidden()
                .colorScheme(.dark)
                .onChange(of: date.wrappedValue) { _ in show.wrappedValue = true }
            Text(show.wrappedValue ? value : "Tap to pick")
                .font(.subheadline)
                .foregroundColor(AapTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(AapTheme.navy.opacity(0.35))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func leaveRow(_ leave: [String: Any]) -> some View {
        AapCard {
            HStack {
                Text("\(leave.string("fromDate") ?? "—") → \(leave.string("toDate") ?? "—")")
                    .foregroundColor(AapTheme.textPrimary)
                Spacer()
                Text((leave.string("status") ?? "pending").uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundColor(AapTheme.yellow)
            }
            if let r = leave.string("reason") {
                Text(r).font(.subheadline).foregroundColor(AapTheme.textMuted)
            }
        }
    }

    private func ymd(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    private func reload() async {
        do {
            let res = try await ApiClient.getLeave()
            leaves = res["leaves"] as? [[String: Any]] ?? res.arr("leaves")
        } catch {
            isError = true
            message = error.localizedDescription
        }
        loading = false
    }

    private func submit() {
        if !hasFrom || !hasTo {
            isError = true
            message = "Pick both dates."
            return
        }
        if reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 {
            isError = true
            message = "Enter a reason (at least 3 letters)."
            return
        }
        busy = true
        isError = false
        message = "Submitting…"
        Task {
            do {
                _ = try await ApiClient.createLeave(
                    fromDate: ymd(fromDate),
                    toDate: ymd(toDate),
                    reason: reason.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                message = "Leave request submitted."
                reason = ""
                hasFrom = false
                hasTo = false
                await reload()
            } catch {
                isError = true
                message = error.localizedDescription
            }
            busy = false
        }
    }
}
