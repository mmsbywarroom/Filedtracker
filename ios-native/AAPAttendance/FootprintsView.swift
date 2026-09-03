import SwiftUI

struct FootprintsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var records: [[String: Any]] = []
    @State private var loading = true
    @State private var error = ""

    var body: some View {
        AapScreenScaffold(
            title: "Footprints",
            subtitle: records.isEmpty ? "Your attendance sessions" : "\(records.count) recent sessions",
            onBack: { dismiss() }
        ) {
            Group {
                if loading {
                    ProgressView().tint(AapTheme.yellow).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if !error.isEmpty {
                    AapCard {
                        Text("Something went wrong").foregroundColor(AapTheme.textPrimary)
                        Text(error).foregroundColor(AapTheme.textMuted)
                    }.padding(20)
                } else if records.isEmpty {
                    AapCard {
                        Text("No sessions yet").font(.title3.weight(.semibold)).foregroundColor(AapTheme.textPrimary)
                        Text("Once you punch in, every session shows up here with distance travelled and timings.")
                            .foregroundColor(AapTheme.textMuted)
                    }.padding(20)
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(records.indices, id: \.self) { i in
                                sessionCard(records[i])
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 28)
                    }
                }
            }
        }
        .task { await load() }
    }

    private func sessionCard(_ record: [String: Any]) -> some View {
        let live = record.string("status") == "live"
        let tint = live ? AapTheme.success : AapTheme.blue
        return AapCard {
            HStack {
                VStack(alignment: .leading) {
                    Text(AapFormat.prettyDate(record.string("punchInAt")))
                        .font(.headline).foregroundColor(AapTheme.textPrimary)
                    Text("\(AapFormat.prettyTime(record.string("punchInAt"))) — \(record.string("punchOutAt").map { AapFormat.prettyTime($0) } ?? "still open")")
                        .font(.subheadline).foregroundColor(AapTheme.textMuted)
                }
                Spacer()
                Text(live ? "LIVE" : "DONE")
                    .font(.caption.weight(.bold))
                    .foregroundColor(tint)
                    .padding(.horizontal, 11).padding(.vertical, 4)
                    .background(tint.opacity(0.16))
                    .clipShape(Capsule())
            }
            HStack {
                metric("Duration", AapFormat.prettyDuration(from: record.string("punchInAt"), to: record.string("punchOutAt")))
                metric("Distance", AapFormat.prettyDistance((record["distanceMeters"] as? NSNumber)?.doubleValue ?? 0))
                metric("Marks", "\((record["marks"] as? NSNumber)?.intValue ?? 0)")
            }
            if let address = record.string("punchInAddress") {
                Text(address).font(.caption).foregroundColor(AapTheme.textMuted)
            }
        }
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading) {
            Text(label).font(.caption).foregroundColor(AapTheme.textMuted)
            Text(value).font(.subheadline.weight(.semibold)).foregroundColor(AapTheme.yellow)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func load() async {
        do {
            let res = try await ApiClient.getHistory()
            records = res["records"] as? [[String: Any]] ?? res.arr("records")
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}
