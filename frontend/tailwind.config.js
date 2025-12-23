/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0A6CC2',
        secondary: '#1D9BF0',
        success: '#2FB344',
        warning: '#F59F00',
        danger: '#E03131',
        info: '#0CA678',
        surface: '#FFFFFF',
        muted: '#F7F9FB',
        text: '#1F2933'
      }
    }
  },
  plugins: []
}


