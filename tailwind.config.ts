import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Aam Aadmi Party site: navy header, blue CTA, yellow accent, pale yellow band
        ink: "#0A1628",
        navy: "#12305A",
        teal: {
          DEFAULT: "#1A56C4",
          bright: "#FFD100",
        },
        sand: "#FFF6D4",
        route: "#1A56C4",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        float: "0 12px 40px rgba(10, 22, 40, 0.14)",
        card: "0 8px 24px rgba(18, 48, 90, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
