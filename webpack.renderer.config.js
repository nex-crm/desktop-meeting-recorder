const webpack = require('webpack');
const rules = require('./webpack.rules');
require('dotenv').config();

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

module.exports = {
  // Put your normal webpack config below here
  module: {
    rules,
  },
  entry: {
    renderer: './src/renderer.js',
    'note-editor/renderer': './src/pages/note-editor/renderer.js',
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NEX_API_URL': JSON.stringify(process.env.NEX_API_URL),
      'process.env.NEX_WEB_URL': JSON.stringify(process.env.NEX_WEB_URL),
      'process.env.SHOW_DEBUG_PANEL': JSON.stringify(process.env.SHOW_DEBUG_PANEL)
    })
  ]
};
