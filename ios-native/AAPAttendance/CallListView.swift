import SwiftUI

private struct CallRow: Identifiable {
    let id: String
    let serial: Int
    let name: String
    let phone: String
    let vehicleNumber: String
    var outcome: String
    var attending: String
    var companions: String
}

private struct OutcomeOpt: Identifiable {
    let value: String
    let label: String
    let color: Color
    var id: String { value }
}

private let callOutcomes: [OutcomeOpt] = [
    OutcomeOpt(value: "call_complete", label: "Call Complete", color: Color(red: 0.08, green: 0.50, blue: 0.24)),
    OutcomeOpt(value: "call_disconnected", label: "Call Disconnected", color: Color(red: 0.92, green: 0.35, blue: 0.05)),
    OutcomeOpt(value: "call_back_later", label: "Call Back Later", color: Color(red: 0.85, green: 0.47, blue: 0.02)),
    OutcomeOpt(value: "not_interested", label: "Not Interested in Giving Feedback", color: Color(red: 0.49, green: 0.23, blue: 0.93)),
    OutcomeOpt(value: "party_left", label: "Party Left", color: Color(red: 0.75, green: 0.07, blue: 0.24)),
    OutcomeOpt(value: "wrong_number", label: "Wrong Number", color: Color(red: 0.73, green: 0.11, blue: 0.11)),
    OutcomeOpt(value: "call_not_received", label: "Call Not Received", color: Color(red: 0.11, green: 0.31, blue: 0.85)),
    OutcomeOpt(value: "out_of_service", label: "Out of Service", color: Color(red: 0.28, green: 0.33, blue: 0.41)),
    OutcomeOpt(value: "invalid_number", label: "Invalid Number", color: Color(red: 0.62, green: 0.07, blue: 0.22)),
    OutcomeOpt(value: "switched_off", label: "Switched Off", color: Color(red: 0.06, green: 0.09, blue: 0.16)),
]

struct CallListView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var rows: [CallRow] = []
    @State private var callerName = ""
    @State private var assigned = 0
    @State private var called = 0
    @State private var statusCounts: [String: Int] = [:]
    @State private var loading = true
    @State private var message = ""

    var body: some View {
        AapScreenScaffold(title: "Do the call", subtitle: "Numbers assigned to you", onBack: { dismiss() }) {
            if loading {
                ProgressView().tint(AapTheme.yellow).frame(maxWidth: .infinity).padding(40)
            } else if rows.isEmpty && !message.isEmpty {
                Text(message)
                    .foregroundColor(AapTheme.textMuted)
                    .padding(20)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Hello, I am \(callerName.isEmpty ? "____" : callerName) calling on behalf of the Aam Aadmi Party. I am calling you regarding the Jashan-e-Inquilab event.")
                            .font(.subheadline)
                            .foregroundColor(AapTheme.textPrimary)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(AapTheme.navy.opacity(0.12))
                            .cornerRadius(14)

                        Text("Assigned \(assigned) · Called \(called) · Not called yet \(max(0, assigned - called))")
                            .font(.caption)
                            .foregroundColor(AapTheme.textMuted)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(callOutcomes) { opt in
                                    Text("\(opt.label): \(statusCounts[opt.value] ?? 0)")
                                        .font(.caption2.weight(.semibold))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(opt.color)
                                        .clipShape(Capsule())
                                }
                            }
                        }

                        if !message.isEmpty {
                            Text(message).font(.caption).foregroundColor(AapTheme.danger)
                        }

                        if rows.isEmpty {
                            Text("No numbers assigned yet.")
                                .foregroundColor(AapTheme.textMuted)
                        }

                        ForEach(rows) { row in
                            AapCard {
                                VStack(alignment: .leading, spacing: 8) {
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 12) {
                                            Text(row.name)
                                                .font(.subheadline.weight(.semibold))
                                                .foregroundColor(AapTheme.textPrimary)
                                                .frame(width: 120, alignment: .leading)
                                                .lineLimit(1)
                                            Text(row.phone)
                                                .font(.caption)
                                                .foregroundColor(AapTheme.textMuted)
                                                .frame(width: 96, alignment: .leading)
                                            Text(row.vehicleNumber.isEmpty ? "—" : row.vehicleNumber)
                                                .font(.caption)
                                                .foregroundColor(AapTheme.textMuted)
                                                .frame(width: 110, alignment: .leading)
                                            Button("Call") {
                                                let digits = row.phone.filter(\.isNumber)
                                                if let url = URL(string: "tel:+91\(digits)") {
                                                    UIApplication.shared.open(url)
                                                }
                                            }
                                            .buttonStyle(.borderedProminent)
                                            .tint(AapTheme.yellow)
                                            .foregroundColor(AapTheme.navy)
                                        }
                                    }

                                    Menu {
                                        ForEach(callOutcomes) { opt in
                                            Button(opt.label) { update(row.id, outcome: opt.value) }
                                        }
                                    } label: {
                                        let picked = callOutcomes.first { $0.value == row.outcome }
                                        Text(picked?.label ?? "Call status")
                                            .font(.caption.weight(.semibold))
                                            .foregroundColor(.white)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 8)
                                            .background(picked?.color ?? AapTheme.textMuted)
                                            .cornerRadius(10)
                                    }

                                    if !row.outcome.isEmpty {
                                        Text("Are you coming to attend the event?")
                                            .font(.caption)
                                            .foregroundColor(AapTheme.textPrimary)
                                        HStack {
                                            choice("Coming", selected: row.attending == "coming", color: Color(red: 0.08, green: 0.50, blue: 0.24)) {
                                                update(row.id, attending: "coming")
                                            }
                                            choice("Not Coming", selected: row.attending == "not_coming", color: Color(red: 0.73, green: 0.11, blue: 0.11)) {
                                                update(row.id, attending: "not_coming", companions: "")
                                            }
                                        }
                                        if row.attending == "coming" {
                                            Text("Very good! How many other people will be coming with you in your car?")
                                                .font(.caption)
                                                .foregroundColor(AapTheme.textPrimary)
                                            HStack {
                                                choice("Yes", selected: row.companions == "yes", color: Color(red: 0.06, green: 0.46, blue: 0.43)) {
                                                    update(row.id, companions: "yes")
                                                }
                                                choice("No", selected: row.companions == "no", color: Color(red: 0.28, green: 0.33, blue: 0.41)) {
                                                    update(row.id, companions: "no")
                                                }
                                            }
                                        }
                                        if row.attending == "not_coming" {
                                            Text("Alright, noted. Thank you very much!")
                                                .font(.caption)
                                                .foregroundColor(AapTheme.textMuted)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .padding(.top, 18)
        .task { await load() }
    }

    private func choice(_ label: String, selected: Bool, color: Color, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .foregroundColor(selected ? .white : color)
            .background(selected ? color : Color.clear)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(color, lineWidth: 1))
            .cornerRadius(8)
    }

    private func update(_ id: String, outcome: String? = nil, attending: String? = nil, companions: String? = nil) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        if let outcome { rows[index].outcome = outcome }
        if let attending {
            rows[index].attending = attending
            if attending != "coming" { rows[index].companions = "" }
        }
        if let companions { rows[index].companions = companions }
        let row = rows[index]
        guard !row.outcome.isEmpty else { return }
        Task {
            do {
                _ = try await ApiClient.saveCallOutcome(
                    contactId: id,
                    status: row.outcome,
                    attending: row.attending,
                    companions: row.companions
                )
            } catch {
                message = error.localizedDescription
            }
        }
    }

    private func load() async {
        loading = true
        message = ""
        do {
            let json = try await ApiClient.getCalls()
            callerName = json["callerName"] as? String ?? ""
            let summary = json["summary"] as? [String: Any] ?? [:]
            let byStatus = summary["byStatus"] as? [String: Any] ?? [:]
            let list = json["contacts"] as? [[String: Any]] ?? []
            rows = list.compactMap { item in
                guard let id = item["id"] as? String else { return nil }
                return CallRow(
                    id: id,
                    serial: (item["serial"] as? NSNumber)?.intValue ?? (item["serial"] as? Int ?? 0),
                    name: item["name"] as? String ?? "",
                    phone: item["phone"] as? String ?? "",
                    vehicleNumber: item["vehicleNumber"] as? String ?? "",
                    outcome: item["outcome"] as? String ?? "",
                    attending: item["attending"] as? String ?? "",
                    companions: item["companions"] as? String ?? ""
                )
            }
            assigned = (summary["assigned"] as? NSNumber)?.intValue ?? rows.count
            called = (summary["called"] as? NSNumber)?.intValue ?? rows.filter { !$0.outcome.isEmpty }.count
            var counts: [String: Int] = [:]
            for opt in callOutcomes {
                counts[opt.value] = (byStatus[opt.value] as? NSNumber)?.intValue ?? rows.filter { $0.outcome == opt.value }.count
            }
            statusCounts = counts
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }
}
