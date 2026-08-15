import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1220",
        navy: "#12263a",
        teal: {
          DEFAULT: "#0f766e",
          bright: "#14b8a6",
        },
        sand: "#f4efe6",
        route: "#1a73e8",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        float: "0 12px 40px rgba(11, 18, 32, 0.12)",
        card: "0 8px 24px rgba(18, 38, 58, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
