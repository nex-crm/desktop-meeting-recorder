const { BrowserWindow, shell } = require('electron');
const axios = require('axios');
const axiosRetry = require('axios-retry');
const SecureStorage = require('./storage');
const constants = require('../config/constants');
const { EventEmitter } = require('events');

class NexAuthService extends EventEmitter {
  constructor() {
    super();
    this.storage = new SecureStorage();
    this.apiClient = this.createApiClient();
    this.authWindow = null;
    this.refreshTimer = null;
  }

  createApiClient() {
    const client = axios.create({
      baseURL: constants.API.BASE_URL,
      timeout: constants.API.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'desktop-recorder',
        'X-Device-Id': this.storage.getDeviceFingerprint(),
      },
    });

    axiosRetry(client, {
      retries: constants.API.RETRY_ATTEMPTS,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response && error.response.status === 429);
      },
    });

    client.interceptors.request.use(async (config) => {
      const tokens = this.storage.getTokens();
      if (tokens && tokens.accessToken) {
        config.headers.Authorization = `Bearer ${tokens.accessToken}`;
      }
      return config;
    });

    client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            await this.refreshToken();
            const tokens = this.storage.getTokens();
            originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
            return this.apiClient(originalRequest);
          } catch (refreshError) {
            this.emit('auth:logout');
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    return client;
  }

  async login() {
    return new Promise((resolve, reject) => {
      const authUrl = this.buildAuthUrl();

      this.authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        title: 'Login to Nex',
      });

      this.authWindow.loadURL(authUrl);
      this.authWindow.show();

      const handleCallback = async (url) => {
        if (url.startsWith(constants.AUTH.REDIRECT_URI)) {
          try {
            const code = this.extractAuthCode(url);
            if (code) {
              const tokens = await this.exchangeCodeForTokens(code);
              await this.fetchUserProfile();
              this.setupTokenRefresh();
              this.emit('auth:success');
              resolve(tokens);
            } else {
              const error = new Error('No authorization code found');
              this.emit('auth:error', error);
              reject(error);
            }
          } catch (error) {
            this.emit('auth:error', error);
            reject(error);
          } finally {
            if (this.authWindow) {
              this.authWindow.close();
            }
          }
        }
      };

      this.authWindow.webContents.on('will-redirect', (event, url) => {
        handleCallback(url);
      });

      this.authWindow.webContents.on('will-navigate', (event, url) => {
        handleCallback(url);
      });

      this.authWindow.on('closed', () => {
        this.authWindow = null;
        reject(new Error('Authentication window closed by user'));
      });

      this.authWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load auth page:', errorDescription);
        reject(new Error(`Failed to load authentication page: ${errorDescription}`));
      });
    });
  }

  buildAuthUrl() {
    const params = new URLSearchParams({
      client_id: constants.AUTH.CLIENT_ID,
      redirect_uri: constants.AUTH.REDIRECT_URI,
      response_type: 'code',
      scope: constants.AUTH.SCOPE,
      state: this.generateState(),
    });

    return `${constants.API.BASE_URL}/oauth/authorize?${params.toString()}`;
  }

  generateState() {
    const crypto = require('crypto');
    const state = crypto.randomBytes(32).toString('hex');
    this.storage.store.set('oauth_state', state);
    return state;
  }

  extractAuthCode(url) {
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');

    const savedState = this.storage.store.get('oauth_state');
    if (state !== savedState) {
      throw new Error('OAuth state mismatch - possible CSRF attack');
    }

    this.storage.store.delete('oauth_state');
    return code;
  }

  async exchangeCodeForTokens(code) {
    try {
      const response = await this.apiClient.post('/oauth/token', {
        grant_type: 'authorization_code',
        code,
        client_id: constants.AUTH.CLIENT_ID,
        redirect_uri: constants.AUTH.REDIRECT_URI,
      });

      const { access_token, refresh_token, expires_in } = response.data;

      this.storage.setTokens(access_token, refresh_token, expires_in);

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
      };
    } catch (error) {
      console.error('Failed to exchange code for tokens:', error);
      throw new Error('Failed to obtain access tokens');
    }
  }

  async refreshToken() {
    const tokens = this.storage.getTokens();
    if (!tokens || !tokens.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await this.apiClient.post('/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: constants.AUTH.CLIENT_ID,
      });

      const { access_token, refresh_token, expires_in } = response.data;

      this.storage.setTokens(
        access_token,
        refresh_token || tokens.refreshToken,
        expires_in
      );

      this.setupTokenRefresh();

      return {
        accessToken: access_token,
        refreshToken: refresh_token || tokens.refreshToken,
        expiresIn: expires_in,
      };
    } catch (error) {
      console.error('Failed to refresh token:', error);
      this.storage.clearAuth();
      throw error;
    }
  }

  async fetchUserProfile() {
    try {
      const response = await this.apiClient.get('/api/v1/me');
      const user = response.data;

      this.storage.setUser(user);

      if (user.workspaceId) {
        await this.fetchWorkspaceInfo(user.workspaceId);
      }

      return user;
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      throw error;
    }
  }

  async fetchWorkspaceInfo(workspaceId) {
    try {
      const response = await this.apiClient.get(`/api/v1/workspaces/${workspaceId}`);
      this.storage.setWorkspace(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch workspace info:', error);
    }
  }

  setupTokenRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const tokens = this.storage.getTokens();
    if (!tokens || !tokens.expiresAt) return;

    const now = Date.now();
    const expiresAt = tokens.expiresAt;
    const refreshAt = expiresAt - constants.AUTH.TOKEN_REFRESH_BUFFER;
    const delay = Math.max(0, refreshAt - now);

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshToken();
        console.log('Token refreshed successfully');
      } catch (error) {
        console.error('Failed to refresh token automatically:', error);
        this.emit('auth:refresh-failed', error);
      }
    }, delay);
  }

  async logout() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    const tokens = this.storage.getTokens();
    if (tokens && tokens.refreshToken) {
      try {
        await this.apiClient.post('/oauth/revoke', {
          token: tokens.refreshToken,
          client_id: constants.AUTH.CLIENT_ID,
        });
      } catch (error) {
        console.error('Failed to revoke token:', error);
      }
    }

    this.storage.clearAuth();
    this.emit('auth:logout');
  }

  async validateSession() {
    const tokens = this.storage.getTokens();
    if (!tokens) {
      return { isValid: false, reason: 'No tokens found' };
    }

    if (tokens.isExpired) {
      try {
        await this.refreshToken();
        return { isValid: true };
      } catch (error) {
        return { isValid: false, reason: 'Failed to refresh token' };
      }
    }

    try {
      await this.apiClient.get('/api/v1/auth/validate');
      return { isValid: true };
    } catch (error) {
      return { isValid: false, reason: 'Token validation failed' };
    }
  }

  isAuthenticated() {
    const tokens = this.storage.getTokens();
    return tokens && (tokens.accessToken || tokens.refreshToken);
  }

  getApiClient() {
    return this.apiClient;
  }

  getUser() {
    return this.storage.getUser();
  }

  getWorkspace() {
    return this.storage.getWorkspace();
  }
}

module.exports = NexAuthService;