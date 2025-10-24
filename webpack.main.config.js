const webpack = require('webpack');
require('dotenv').config();

module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.js',
  // Specify this is Node.js code, not browser code
  target: 'electron-main',
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),
  },
  externals: {
    '@recallai/desktop-sdk': 'commonjs @recallai/desktop-sdk',
    'google-auth-library': 'commonjs google-auth-library',
    googleapis: 'commonjs googleapis',
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NEX_API_URL': JSON.stringify(process.env.NEX_API_URL),
      'process.env.NEX_WEB_URL': JSON.stringify(process.env.NEX_WEB_URL),
      'process.env.NEX_OAUTH_CLIENT_ID': JSON.stringify(
        process.env.NEX_OAUTH_CLIENT_ID,
      ),
      'process.env.NEX_OAUTH_REDIRECT_URI': JSON.stringify(
        process.env.NEX_OAUTH_REDIRECT_URI,
      ),
      'process.env.NEX_OAUTH_SCOPE': JSON.stringify(
        process.env.NEX_OAUTH_SCOPE,
      ),
      'process.env.RECALLAI_API_URL': JSON.stringify(
        process.env.RECALLAI_API_URL,
      ),
      'process.env.RECALLAI_API_KEY': JSON.stringify(
        process.env.RECALLAI_API_KEY,
      ),
      'process.env.OPENROUTER_KEY': JSON.stringify(process.env.OPENROUTER_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
      'process.env.SHOW_DEBUG_PANEL': JSON.stringify(
        process.env.SHOW_DEBUG_PANEL,
      ),
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(
        process.env.GOOGLE_CLIENT_ID,
      ),
      'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(
        process.env.GOOGLE_CLIENT_SECRET,
      ),
      'process.env.GOOGLE_REDIRECT_URI': JSON.stringify(
        process.env.GOOGLE_REDIRECT_URI,
      ),
    }),
  ],
};
