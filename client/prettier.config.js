/** @type {import("prettier").Config} */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  importOrder: [
    '^react',
    '^mui',
    '^@(?!/)',
    '^@/entities',
    '^@/features',
    '^@/widget',
    '^@/shared',
    '^./ui',
    '^[./]',
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
  importOrderTypeScriptVersion: '5.0.4',
  plugins: [require.resolve('@trivago/prettier-plugin-sort-imports')],
};

module.exports = config;
