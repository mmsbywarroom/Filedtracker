import MapKit
import SwiftUI

struct MapRouteView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var points: [CLLocationCoordinate2D] = []
    @State private var start: CLLocationCoordinate2D?
    @State private var end: CLLocationCoordinate2D?
    @State private var live = false
    @State private var distance = 0.0
    @State private var punchInAt: String?
    @State private var loading = true
    @State private var error = ""

    var body: some View {
        AapScreenScaffold(
            title: "Live map",
            subtitle: live
                ? "Your route today"
                : (punchInAt.map { "Last session · \(AapFormat.prettyDate($0))" } ?? "Your route today"),
            onBack: { dismiss() }
        ) {
            VStack(spacing: 0) {
                ZStack {
                    RouteMapView(points: points, start: start, end: end)
                    if loading {
                        ProgressView().tint(AapTheme.yellow)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 0))
                HStack {
                    VStack(alignment: .leading) {
                        Text(live ? "LIVE" : "ROUTE")
                            .font(.caption.weight(.bold))
                            .foregroundColor(live ? AapTheme.success : AapTheme.yellow)
                        Text(AapFormat.prettyDistance(distance))
                            .font(.title3.weight(.semibold))
                            .foregroundColor(AapTheme.textPrimary)
                    }
                    Spacer()
                    Text(error.isEmpty ? "\(points.count) points" : error)
                        .font(.caption)
                        .foregroundColor(AapTheme.textMuted)
                }
                .padding(16)
                .background(AapTheme.navyCard)
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            let att = try await ApiClient.getAttendance()
            let open = att.obj("open")
            let history = att["history"] as? [[String: Any]] ?? att.arr("history")
            let session = open ?? history.first
            if let session {
                let raw = (session["points"] as? [[String: Any]] ?? []).compactMap { p -> CLLocationCoordinate2D? in
                    guard let lat = (p["lat"] as? NSNumber)?.doubleValue,
                          let lng = (p["lng"] as? NSNumber)?.doubleValue else { return nil }
                    return CLLocationCoordinate2D(latitude: lat, longitude: lng)
                }
                points = downsample(raw, max: 120)
                if let slat = (session["punchInLat"] as? NSNumber)?.doubleValue,
                   let slng = (session["punchInLng"] as? NSNumber)?.doubleValue {
                    start = CLLocationCoordinate2D(latitude: slat, longitude: slng)
                } else {
                    start = points.first
                }
                if let elat = (session["punchOutLat"] as? NSNumber)?.doubleValue,
                   let elng = (session["punchOutLng"] as? NSNumber)?.doubleValue {
                    end = CLLocationCoordinate2D(latitude: elat, longitude: elng)
                } else if open != nil {
                    end = points.last
                }
                live = open != nil
                distance = (session["distanceMeters"] as? NSNumber)?.doubleValue ?? 0
                punchInAt = session.string("punchInAt")
            }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func downsample(_ pts: [CLLocationCoordinate2D], max: Int) -> [CLLocationCoordinate2D] {
        guard pts.count > max else { return pts }
        let step = Double(pts.count - 1) / Double(max - 1)
        return (0..<max).map { i in pts[min(pts.count - 1, Int((Double(i) * step).rounded()))] }
    }
}

private struct RouteMapView: UIViewRepresentable {
    var points: [CLLocationCoordinate2D]
    var start: CLLocationCoordinate2D?
    var end: CLLocationCoordinate2D?

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.showsUserLocation = true
        map.pointOfInterestFilter = .excludingAll
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        map.removeOverlays(map.overlays)
        map.removeAnnotations(map.annotations.filter { !($0 is MKUserLocation) })
        if points.count >= 2 {
            map.addOverlay(MKPolyline(coordinates: points, count: points.count))
        }
        if let start {
            let a = MKPointAnnotation()
            a.coordinate = start
            a.title = "Punch in"
            map.addAnnotation(a)
        }
        if let end, end.latitude != start?.latitude || end.longitude != start?.longitude {
            let a = MKPointAnnotation()
            a.coordinate = end
            a.title = "Current"
            map.addAnnotation(a)
        }
        var all = points
        if let start { all.append(start) }
        if let end { all.append(end) }
        guard !all.isEmpty else {
            map.setRegion(MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 30.7333, longitude: 76.7794),
                span: MKCoordinateSpan(latitudeDelta: 0.4, longitudeDelta: 0.4)
            ), animated: false)
            return
        }
        if all.count == 1 {
            map.setRegion(MKCoordinateRegion(center: all[0], span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)), animated: true)
        } else {
            var rect = MKMapRect.null
            for c in all {
                let p = MKMapPoint(c)
                rect = rect.union(MKMapRect(x: p.x, y: p.y, width: 1, height: 1))
            }
            map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 60, left: 40, bottom: 60, right: 40), animated: true)
        }
    }

    func makeCoordinator() -> Coord { Coord() }

    final class Coord: NSObject, MKMapViewDelegate {
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let line = overlay as? MKPolyline {
                let r = MKPolylineRenderer(polyline: line)
                r.strokeColor = UIColor(red: 1, green: 209 / 255, blue: 0, alpha: 1)
                r.lineWidth = 4
                return r
            }
            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
