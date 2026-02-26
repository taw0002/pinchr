/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/renderer/src/**/*.{ts,tsx}',
    './src/renderer/index.html',
    './node_modules/streamdown/dist/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#141414',
        'surface-1': '#141414',
        'surface-2': '#1e1e1e',
        'surface-3': '#252525',
        border: '#2a2a2a',
        'border-hover': '#3a3a3a',
        accent: '#10B981',
        'accent-hover': '#059669',
        'accent-muted': 'rgba(16, 185, 129, 0.12)',
        'text-primary': '#f5f5f5',
        'text-secondary': '#a0a0a0',
        'text-muted': '#666666',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(16, 185, 129, 0.3)',
        'glow': '0 0 20px rgba(16, 185, 129, 0.4)',
        'glow-lg': '0 0 30px rgba(16, 185, 129, 0.5)',
        'inner-glow': 'inset 0 0 20px rgba(16, 185, 129, 0.2)',
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        'gradient-accent-subtle': 'linear-gradient(135deg, rgba(16, 185, 129, 0.8) 0%, rgba(5, 150, 105, 0.6) 100%)',
      },
    },
  },
  plugins: [],
}
