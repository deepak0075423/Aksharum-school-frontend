// Minimal config with one job: catch the Rules of Hooks violations that take
// the whole app down.
//
// A hook declared below an early return runs on some renders and not others.
// React has no error boundary here, so the mismatch unmounts the entire tree —
// the screen goes blank and every other page looks broken too. That is exactly
// what happened to the timetable preview. `npm run lint` now refuses it.
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react-hooks'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    // Exhaustive-deps is noisy on this codebase and mostly deliberate; the
    // ordering rule above is the one that breaks screens.
    'react-hooks/exhaustive-deps': 'off',
  },
};
