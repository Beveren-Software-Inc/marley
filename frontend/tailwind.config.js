/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      keyframes: {
        'slide-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-down': 'slide-down 0.3s ease-out forwards',
      },
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







