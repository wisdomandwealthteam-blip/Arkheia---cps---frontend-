/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12151A",
        paper: "#F7F7F5",
        line: "#22262D",
        signal: "#4E6BFF",
        risk: {
          low: "#1E8E5A",
          moderate: "#B8862B",
          elevated: "#C1562E",
          high: "#B23A3A",
        },
      },
      fontFamily: {
        display: ["'IBM Plex Mono'", "monospace"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
