import Foundation

enum LocaleStore {
    private static let key = "aap_lang"
    static var lang: String {
        get { UserDefaults.standard.string(forKey: key) ?? "en" }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }

    static func toggle() {
        lang = lang == "pa" ? "en" : "pa"
    }

    static func t(_ en: String, _ pa: String) -> String {
        lang == "pa" ? pa : en
    }
}
