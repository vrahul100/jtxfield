/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontSize: {
                base: '1.125rem', // 18px
            },
            colors: {
                primary: {
                    50: '#EFF8FF',
                    100: '#D1E9FF',
                    200: '#B2DDFF',
                    300: '#84CAFF',
                    400: '#53B1FD',
                    500: '#1570EF', // Cleaner brand primary (#1570EF / rgb(21, 112, 239))
                    600: '#106EDC', // Closest to favicon render (#106EDC / rgb(16, 110, 220))
                    700: '#0E54A8',
                    800: '#0B3F7E',
                    900: '#092E5C',
                    950: '#051C3B',
                },
            },
        },
    },
    plugins: [],
}
