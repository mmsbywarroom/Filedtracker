import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAP_SERVER_URL || "https://filed.videh.co.in";

const config: CapacitorConfig = {
  appId: "in.videh.filedtracker",
  appName: "Field Tracking",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "automatic",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: "#0A1628",
      style: "LIGHT",
    },
  },
};

export default config;
