/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "oklch(var(--border) / <alpha-value>)", input: "oklch(var(--input) / <alpha-value>)", ring: "oklch(var(--ring) / <alpha-value>)",
        background: "oklch(var(--background) / <alpha-value>)", foreground: "oklch(var(--foreground) / <alpha-value>)",
        primary: { DEFAULT: "oklch(var(--primary) / <alpha-value>)", hover: "oklch(var(--primary-hover) / <alpha-value>)", text: "oklch(var(--primary-text) / <alpha-value>)", foreground: "oklch(var(--primary-foreground) / <alpha-value>)" },
        secondary: { DEFAULT: "oklch(var(--secondary) / <alpha-value>)", foreground: "oklch(var(--secondary-foreground) / <alpha-value>)" },
        destructive: { DEFAULT: "oklch(var(--destructive) / <alpha-value>)", foreground: "oklch(var(--destructive-foreground) / <alpha-value>)" },
        muted: { DEFAULT: "oklch(var(--muted) / <alpha-value>)", foreground: "oklch(var(--muted-foreground) / <alpha-value>)" },
        accent: { DEFAULT: "oklch(var(--accent) / <alpha-value>)", foreground: "oklch(var(--accent-foreground) / <alpha-value>)" },
        popover: { DEFAULT: "oklch(var(--popover) / <alpha-value>)", foreground: "oklch(var(--popover-foreground) / <alpha-value>)" },
      },
      fontFamily: { sans: ['Onest', 'sans-serif'], display: ['Onest', 'sans-serif'], mono: ['ui-monospace', 'monospace'] },
      borderRadius: { xl: 'var(--radius)', lg: 'var(--radius)', md: 'var(--radius)', sm: 'var(--radius)' },
      boxShadow: { soft: 'var(--shadow-soft)' },
      keyframes: { "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } }, "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } } },
      animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
