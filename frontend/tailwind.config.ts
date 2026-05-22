import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        // Tactical military palette
        olive:   { 50: "#f5f6ee", 100: "#e6e9d2", 200: "#cfd5a3", 300: "#aeb771", 400: "#909a4d", 500: "#75803a", 600: "#5b652b", 700: "#454d22", 800: "#373d1d", 900: "#2c321a" },
        sand:    { 50: "#faf6ef", 100: "#f0e6d1", 200: "#dfcc9b", 300: "#cab26a", 400: "#b89a45", 500: "#9c7e36", 600: "#806527", 700: "#65501f" },
        steel:   { 50: "#f4f6f7", 100: "#e2e7e9", 200: "#c1cbcf", 300: "#94a4ab", 400: "#677a83", 500: "#4d5e67", 600: "#374651", 700: "#2a3741", 800: "#1f2a32", 900: "#171f25" },
        tactical:{ DEFAULT: "#3e4a26", dark: "#2c3419", light: "#566335" },
        alert:   { critical: "#c0392b", warning: "#d97706", info: "#2563eb", ok: "#15803d" },
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",
        card:        "hsl(var(--card))",
        "card-foreground":  "hsl(var(--card-foreground))",
        primary:     "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary:   "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted:       "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border:      "hsl(var(--border))",
        ring:        "hsl(var(--ring))",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular"],
      },
      keyframes: {
        "fade-in":   { "0%": { opacity: "0", transform: "translateY(4px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "pulse-ring":{ "0%": { boxShadow: "0 0 0 0 rgba(118,128,58,.7)" }, "70%": { boxShadow: "0 0 0 12px rgba(118,128,58,0)" }, "100%": { boxShadow: "0 0 0 0 rgba(118,128,58,0)" } },
        "scan-line": { "0%": { top: "0%" }, "100%": { top: "100%" } },
        "shimmer":   { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in":   "fade-in .35s ease-out",
        "pulse-ring":"pulse-ring 1.6s infinite",
        "scan-line": "scan-line 2.2s linear infinite",
        "shimmer":   "shimmer 1.4s infinite",
      },
      backgroundImage: {
        "tactical-grid":
          "linear-gradient(rgba(174,183,113,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(174,183,113,.06) 1px, transparent 1px)",
        "armory-radial":
          "radial-gradient(ellipse at top, rgba(86,99,53,.18), transparent 60%)",
      },
    },
  },
  plugins: [],
};
export default config;
