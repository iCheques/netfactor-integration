const buble = require('rollup-plugin-buble');
const commonjs = require('rollup-plugin-commonjs');
const node = require('rollup-plugin-node-resolve');

module.exports = {
  input: './lib/index.js',
  external: ['bipbop-webservice', 'bipbop-websocket', 'icheques-webintegration'],
  plugins: [
    commonjs(),
    node({
      browser: true,
      preferBuiltins: false,
    }),
    buble({
      jsx: 'h',
      transforms: { forOf: false },
    }),
  ],
  output: {
    name: 'NetfactorIntegration',
    exports: 'default',
    file: 'bundle.js',
    format: 'umd',
    globals: {
      'bipbop-webservice': 'BipbopWebService',
      'bipbop-websocket': 'BipbopWebSocket',
      'icheques-webintegration': 'ICheques',
    },
  },
};

