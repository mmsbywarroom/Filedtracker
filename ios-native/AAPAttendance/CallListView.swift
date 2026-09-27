import SwiftUI

private struct CallRow: Identifiable {
    let id: String
    let serial: Int
    let name: String
    let phone: String
    let vehicleNumber: String
    var outcome: String
}

private let callOutcomes: [(String, String)] = [
    ("connected", "Connected"),
    ("no_answer", "No answer"),
    ("busy", "Busy"),
    ("call_later", "Call later"),
    ("wrong_number", "Wrong number"),
]

struct CallListView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var rows: [CallRow] = []
    @State private var loading = true
    @State private var message = ""

    var body: some View {
        AapScreenScaffold(title: "Do the call", subtitle: "Numbers assigned to you", onBack: { dismiss() }) {
            if loading {
                ProgressView().tint(AapTheme.yellow).frame(maxWidth: .infinity).padding(40)
            } else if rows.isEmpty {
                Text(message.isEmpty ? "No numbers assigned yet." : message)
                    .foregroundColor(AapTheme.textMuted)
                    .padding(20)
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        if !message.isEmpty {
                            Text(message).font(.caption).foregroundColor(AapTheme.danger)
                        }
                        ForEach(rows) { row in
                            AapCard {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("\(row.serial). \(row.name)")
                                        .font(.headline)
                                        .foregroundColor(AapTheme.textPrimary)
                                    Text(row.phone).font(.subheadline).foregroundColor(AapTheme.textMuted)
                                    if !row.vehicleNumber.isEmpty {
                                        Text("Vehicle \(row.vehicleNumber)")
                                            .font(.caption)
                                            .foregroundColor(AapTheme.textMuted)
                                    }
                                    HStack {
                                        Button("Call") {
                                            let digits = row.phone.filter(\.isNumber)
                                            if let url = URL(string: "tel:+91\(digits)") {
                                                UIApplication.shared.open(url)
                                            }
                                        }
                                        .buttonStyle(.borderedProminent)
                                        .tint(AapTheme.yellow)
                                        .foregroundColor(AapTheme.navy)

                                        Picker("Result", selection: binding(for: row.id)) {
                                            Text("Result").tag("")
                                            ForEach(callOutcomes, id: \.0) { item in
                                                Text(item.1).tag(item.0)
                                            }
                                        }
                                        .pickerStyle(.menu)
                                    }
                                }
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .task { await load() }
    }

    private func binding(for id: String) -> Binding<String> {
        Binding(
            get: { rows.first(where: { $0.id == id })?.outcome ?? "" },
            set: { value in
                guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
                rows[index].outcome = value
                if value.isEmpty { return }
                Task {
                    do {
                        _ = try await ApiClient.saveCallOutcome(contactId: id, status: value)
                    } catch {
                        message = error.localizedDescription
                    }
                }
            }
        )
    }

    private func load() async {
        loading = true
        message = ""
        do {
            let json = try await ApiClient.getCalls()
            let list = json["contacts"] as? [[String: Any]] ?? []
            rows = list.compactMap { item in
                guard let id = item["id"] as? String else { return nil }
                return CallRow(
                    id: id,
                    serial: (item["serial"] as? NSNumber)?.intValue ?? (item["serial"] as? Int ?? 0),
                    name: item["name"] as? String ?? "",
                    phone: item["phone"] as? String ?? "",
                    vehicleNumber: item["vehicleNumber"] as? String ?? "",
                    outcome: item["outcome"] as? String ?? ""
                )
            }
        } catch {
            message = error.localizedDescription
        }
        loading = false
    }
}
