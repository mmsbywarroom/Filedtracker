import Foundation

struct ApiError: LocalizedError {
    let statusCode: Int
    let message: String
    var errorDescription: String? { message }
}

enum ApiClient {
    static func requestOtp(phone: String) async throws {
        _ = try await postPublic(path: "/api/auth/otp/request", body: ["phone": phone])
    }

    static func verifyOtp(phone: String, otp: String) async throws -> [String: Any] {
        try await postPublic(path: "/api/auth/otp/verify", body: ["phone": phone, "otp": otp])
    }

    static func getMe() async throws -> [String: Any] {
        try await authed(path: "/api/me", method: "GET")
    }

    static func getAttendance() async throws -> [String: Any] {
        try await authed(path: "/api/attendance", method: "GET")
    }

    static func getHistory() async throws -> [String: Any] {
        try await authed(path: "/api/attendance/history", method: "GET")
    }

    static func getLeave() async throws -> [String: Any] {
        try await authed(path: "/api/leave", method: "GET")
    }

    static func createLeave(fromDate: String, toDate: String, reason: String) async throws -> [String: Any] {
        try await authed(path: "/api/leave", method: "POST", body: [
            "fromDate": fromDate,
            "toDate": toDate,
            "reason": reason,
        ])
    }

    static func punchIn(lat: Double, lng: Double, accuracy: Double, descriptor: [Double], image: String) async throws -> [String: Any] {
        try await authed(path: "/api/attendance", method: "POST", body: [
            "lat": lat, "lng": lng, "accuracy": accuracy,
            "descriptor": descriptor, "image": image,
        ])
    }

    static func punchOut(lat: Double, lng: Double, accuracy: Double, descriptor: [Double], image: String) async throws -> [String: Any] {
        try await authed(path: "/api/attendance/punch-out", method: "POST", body: [
            "lat": lat, "lng": lng, "accuracy": accuracy,
            "descriptor": descriptor, "image": image,
        ])
    }

    static func registerFace(descriptor: [Double], samples: [[Double]], image: String) async throws -> [String: Any] {
        try await authed(path: "/api/face/register", method: "POST", body: [
            "descriptor": descriptor,
            "samples": samples,
            "image": image,
            // Soft match for eyes/nose/chin when upper head is covered (no UI label).
            "usesTurban": true,
        ])
    }

    static func describeFace(imageDataUrl: String, fast: Bool = true) async throws -> [String: Any] {
        try await authed(path: "/api/face/describe", method: "POST", body: [
            "image": imageDataUrl,
            "relaxed": true,
            "fast": fast,
        ])
    }

    static func reportLocationPermission(foreground: Bool, background: Bool) async throws {
        _ = try await authed(path: "/api/me/location-permission", method: "POST", body: [
            "foreground": foreground,
            "background": background,
            "platform": "ios",
        ])
    }

    private static func postPublic(path: String, body: [String: Any]) async throws -> [String: Any] {
        try await sendFailover(path: path, method: "POST", token: nil, body: body, bases: AppConfig.apiBases)
    }

    private static func authed(path: String, method: String, body: [String: Any]? = nil) async throws -> [String: Any] {
        var bases = AppConfig.apiBases
        let stored = SessionStore.apiBase
        if !stored.isEmpty, !bases.contains(stored) {
            bases.insert(stored, at: 0)
        }
        return try await sendFailover(path: path, method: method, token: SessionStore.token, body: body, bases: bases)
    }

    private static func sendFailover(
        path: String,
        method: String,
        token: String?,
        body: [String: Any]?,
        bases: [String]
    ) async throws -> [String: Any] {
        var last: Error?
        for base in bases {
            do {
                return try await send(url: base + path, method: method, token: token, body: body)
            } catch let e as ApiError {
                // Business / HTTP errors — do not try another host
                throw e
            } catch {
                last = error
            }
        }
        let msg = last?.localizedDescription.lowercased() ?? ""
        if msg.contains("timed out") || msg.contains("timeout") {
            throw ApiError(statusCode: 408, message: "Network timeout. Check internet and try again.")
        }
        throw ApiError(statusCode: 0, message: "Network error. Check internet and try again.")
    }

    private static func send(url: String, method: String, token: String?, body: [String: Any]?) async throws -> [String: Any] {
        guard let u = URL(string: url) else { throw ApiError(statusCode: 0, message: "Bad URL") }
        var req = URLRequest(url: u)
        req.httpMethod = method
        req.timeoutInterval = 22
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("native", forHTTPHeaderField: "X-Client-Source")
        req.setValue("AAPAttendance/1.3.8 AAPNative/1", forHTTPHeaderField: "User-Agent")
        if let token, !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let res: URLResponse
        do {
            (data, res) = try await AppUrlSession.shared.data(for: req)
        } catch {
            let msg = error.localizedDescription.lowercased()
            if msg.contains("timed out") || msg.contains("timeout") {
                throw error // let failover try next base
            }
            if msg.contains("connection") || msg.contains("offline") || msg.contains("internet") {
                throw error
            }
            throw error
        }
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        let raw = String(data: data, encoding: .utf8) ?? ""
        let json = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        if !(200..<300).contains(code) {
            let msg = (json["error"] as? String) ?? (raw.isEmpty ? "Request failed (\(code)). Try again." : raw)
            throw ApiError(statusCode: code, message: msg)
        }
        return json
    }
}

extension Dictionary where Key == String, Value == Any {
    func string(_ key: String) -> String? {
        if self[key] is NSNull { return nil }
        let v = self[key] as? String
        return (v?.isEmpty == false) ? v : nil
    }

    func obj(_ key: String) -> [String: Any]? {
        self[key] as? [String: Any]
    }

    func arr(_ key: String) -> [[String: Any]] {
        (self[key] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
    }

    func doubles(_ key: String) -> [Double] {
        (self[key] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? []
    }

    func nestedDoubles(_ key: String) -> [[Double]] {
        (self[key] as? [Any])?.map { row -> [Double] in
            (row as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? []
        } ?? []
    }
}
