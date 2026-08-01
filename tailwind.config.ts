import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1E2A24",
        paper: "#F6F4EE",
        pine: {
          DEFAULT: "#2F5D50",
          dark: "#22443A",
          light: "#3E7566",
        },
        sage: {
          DEFAULT: "#E4EBE2",
          dark: "#B7C9BB",
        },
        berry: {
          DEFAULT: "#A23E4C",
          dark: "#7E2F3A",
        },
        gold: {
          DEFAULT: "#C08A2E",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;
