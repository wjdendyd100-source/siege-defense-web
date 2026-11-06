// 코드 정적 검사: 정의되지 않은 변수·중복 선언·도달 불가 코드 등 실행 전에 잡을 수 있는 오류만 본다.
// 사용: npx eslint -c tools/eslint.config.mjs game/js tests tools
import globals from 'globals';
export default [
  { files: ['game/js/**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: { 'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-const-assign': 'error', 'no-dupe-class-members': 'error', 'no-self-assign': 'error', 'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }] } },
  { files: ['tools/**/*.js', 'tools/**/*.mjs', 'tests/**/*.mjs'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error' } },
  { files: ['tools/playtest_mobile.js', 'tools/render_portraits.js'], languageOptions: { sourceType: 'commonjs' } },
];
