/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "var(--color-ink)",
          soft: "var(--color-ink-soft)",
          mute: "var(--color-ink-mute)",
        },
        lilac: {
          DEFAULT: "var(--color-canvas)",
          deep: "var(--color-canvas-deep)",
        },
        pos: {
          DEFAULT: "var(--color-pos)",
          soft: "var(--color-pos-soft)",
          text: "var(--color-pos-text)",
        },
        neg: {
          DEFAULT: "var(--color-neg)",
          soft: "var(--color-neg-soft)",
          text: "var(--color-neg-text)",
        },
        neu: {
          DEFAULT: "var(--color-neu)",
          soft: "var(--color-neu-soft)",
          text: "var(--color-neu-text)",
        },
        sun: {
          DEFAULT: "var(--color-sun)",
          soft: "var(--color-sun-soft)",
          text: "var(--color-sun-text)",
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        body: ["Figtree", "system-ui", "sans-serif"],
      },
      borderRadius: { "4xl": "2rem", "5xl": "2.5rem" },
    },
  },
  plugins: [],
};
