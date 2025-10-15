const { OAuth2Client } = require('google-auth-library');
const { shell } = require('electron');
const http = require('http');

// Scopes for Google OAuth
const SCOPES = {
  OPENID: 'openid',
  EMAIL: 'email',
  PROFILE: 'profile',
  GMAIL: 'https://www.googleapis.com/auth/gmail.readonly',
  CALENDAR: 'https://www.googleapis.com/auth/calendar.readonly',
};

class GoogleOAuthService {
  constructor(clientId, clientSecret, redirectUri) {
    if (!clientId) {
      throw new Error('Google OAuth client ID is required');
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri || 'http://localhost:30000/external/google/callback';

    this.oauth2Client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    this.server = null;
  }

  /**
   * Authenticate with Google using system browser and local callback server
   * @returns {Promise<Object>} ID token and user info
   */
  async authenticate() {
    return new Promise((resolve, reject) => {
      // Use a local port for desktop app callback
      const PORT = 53134;
      const localRedirectUri = `http://localhost:${PORT}/callback`;

      // Create a temporary OAuth client with local redirect URI
      const tempClient = new OAuth2Client(
        this.clientId,
        this.clientSecret,
        localRedirectUri
      );

      // Generate auth URL
      const authUrl = tempClient.generateAuthUrl({
        access_type: 'offline',
        scope: ['openid', 'email', 'profile'],
        prompt: 'consent',
      });

      // Create local HTTP server to handle callback
      this.server = http.createServer(async (req, res) => {
        if (req.url && req.url.startsWith('/callback')) {
          const url = new URL(req.url, `http://localhost:${PORT}`);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5;">
                  <div style="text-align: center; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h1 style="color: #e23428; margin: 0 0 10px 0;">Authentication Failed</h1>
                    <p style="color: #666;">${error}</p>
                    <p style="color: #999; font-size: 14px; margin-top: 20px;">You can close this window.</p>
                  </div>
                </body>
              </html>
            `);
            this._closeServer();
            reject(new Error(error));
            return;
          }

          if (code) {
            try {
              // Exchange code for tokens
              const { tokens } = await tempClient.getToken(code);

              // Verify ID token
              const userInfo = await this.verifyIdToken(tokens.id_token);

              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5;">
                    <div style="text-align: center; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 20px;">
                        <path d="M20 6L9 17L4 12" stroke="#35da79" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      <h1 style="color: #1a1a1a; margin: 0 0 10px 0;">Successfully signed in!</h1>
                      <p style="color: #666;">You can close this window and return to the app.</p>
                    </div>
                  </body>
                </html>
              `);

              this._closeServer();
              resolve({
                credential: tokens.id_token,
                userInfo,
              });
            } catch (err) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5;">
                    <div style="text-align: center; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                      <h1 style="color: #e23428; margin: 0 0 10px 0;">Authentication Error</h1>
                      <p style="color: #666;">${err.message}</p>
                      <p style="color: #999; font-size: 14px; margin-top: 20px;">You can close this window.</p>
                    </div>
                  </body>
                </html>
              `);
              this._closeServer();
              reject(err);
            }
          }
        }
      });

      this.server.listen(PORT, () => {
        console.log(`Local callback server listening on port ${PORT}`);
        // Open the auth URL in the user's default browser
        shell.openExternal(authUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.server) {
          this._closeServer();
          reject(new Error('Authentication timeout - please try again'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New tokens
   */
  async refreshToken(refreshToken) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      return credentials;
    } catch (error) {
      // Check if token is revoked
      if (error.message?.includes('invalid_grant')) {
        throw new Error('TOKEN_REVOKED');
      }
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }

  /**
   * Verify and decode ID token
   * @param {string} idToken - ID token from Google
   * @returns {Promise<Object>} User info from token
   */
  async verifyIdToken(idToken) {
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: idToken,
        audience: this.clientId,
      });

      const payload = ticket.getPayload();

      return {
        id: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        givenName: payload.given_name,
        familyName: payload.family_name,
        picture: payload.picture,
      };
    } catch (error) {
      throw new Error(`Failed to verify ID token: ${error.message}`);
    }
  }

  /**
   * Get user info from Google using access token
   * @param {string} accessToken - Access token
   * @returns {Promise<Object>} User info
   */
  async getUserInfo(accessToken) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get user info: ${response.statusText}`);
      }

      const userInfo = await response.json();

      return {
        id: userInfo.id,
        email: userInfo.email,
        emailVerified: userInfo.verified_email,
        givenName: userInfo.given_name,
        familyName: userInfo.family_name,
        picture: userInfo.picture,
      };
    } catch (error) {
      throw new Error(`Failed to fetch user info: ${error.message}`);
    }
  }

  /**
   * Revoke access token
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<void>}
   */
  async revokeToken(accessToken) {
    try {
      await this.oauth2Client.revokeToken(accessToken);
    } catch (error) {
      throw new Error(`Failed to revoke token: ${error.message}`);
    }
  }

  /**
   * Close local callback server
   * @private
   */
  _closeServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Generate random state for OAuth
   * @private
   */
  _generateState() {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Get client ID
   * @returns {string}
   */
  getClientId() {
    return this.clientId;
  }

  /**
   * Get available scopes
   * @returns {Object}
   */
  static get SCOPES() {
    return SCOPES;
  }
}

module.exports = GoogleOAuthService;
