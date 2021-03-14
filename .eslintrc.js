module.exports = {
  extends: ['wesbos', 'prettier'],
  rules: {
    'no-use-before-define': ['error', 'nofunc'],
    'prettier/prettier': [
      'error',
      {
        printWidth: 120,
      },
    ],
  },
}
