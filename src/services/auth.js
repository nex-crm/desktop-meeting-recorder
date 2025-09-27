// Removed BrowserWindow and shell - not needed for direct API auth
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
        'X-Platform-Id': 'nex-desktop',
        'X-Platform-Version': '1.0.0',
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

  async startEmailAuth(email) {
    console.log('Starting email authentication for:', email);
    try {
      const response = await this.apiClient.post('/v1/auth/email', {
        email: email,
      });

      console.log('Email auth response:', JSON.stringify(response.data, null, 2));

      // Return the attempt data for OTP verification
      return response.data;
    } catch (error) {
      console.error('Email auth error:', error);
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw error;
    }
  }

  async submitOTP(attemptId, code) {
    console.log('Submitting OTP for attempt:', attemptId);
    try {
      const response = await this.apiClient.post('/v1/auth/submit_otp', {
        attemptId: attemptId,
        code: code,
      });

      console.log('OTP submission response:', JSON.stringify(response.data, null, 2));

      // Extract tokens from the response
      const authData = response.data.auth || response.data.data?.auth || response.data;
      const tokens = authData.tokens || [];
      console.log('Extracted tokens array:', tokens);

      // Find tokens by type - handle both string and numeric types
      const accessToken = tokens.find(t => t.type === 'TYPE_ACCESS' || t.type === 1)?.token;
      const refreshToken = tokens.find(t => t.type === 'TYPE_REFRESH' || t.type === 2)?.token;

      if (!accessToken || !refreshToken) {
        console.error('No access or refresh token found in response:', response.data);
        throw new Error('Failed to obtain tokens');
      }

      // Calculate expires_in from the access token expiry
      const accessTokenData = tokens.find(t => t.type === 'TYPE_ACCESS' || t.type === 1);
      let expiresIn = 3600; // Default 1 hour
      if (accessTokenData?.expiresAt) {
        const expiryTime = new Date(accessTokenData.expiresAt).getTime();
        const now = new Date().getTime();
        expiresIn = Math.floor((expiryTime - now) / 1000);
      }

      // Store tokens
      this.storage.setTokens(accessToken, refreshToken, expiresIn);

      const result = {
        accessToken,
        refreshToken,
        expiresIn,
      };

      await this.fetchUserProfile();
      this.setupTokenRefresh();
      this.emit('auth:success');
      return result;
    } catch (error) {
      console.error('OTP submission error:', error);
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw error;
    }
  }

  // This method is no longer needed for direct API auth
  // Keeping for backward compatibility if needed
  async handleAuthCallback(url) {
    console.warn('handleAuthCallback is deprecated for direct API auth');
  }

  // These methods are no longer needed for direct API auth

  async refreshToken() {
    const tokens = this.storage.getTokens();
    if (!tokens || !tokens.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await this.apiClient.post('/v1/auth/token/refresh', {
        token: tokens.refreshToken,
      });

      // Extract tokens from the response - handle both wrapped and unwrapped responses
      const authData = response.data.auth || response.data.data?.auth || response.data;
      const authTokens = authData.tokens || [];

      // Find tokens by type - handle both string and numeric types
      const accessToken = authTokens.find(t => t.type === 'TYPE_ACCESS' || t.type === 1)?.token;
      const refreshToken = authTokens.find(t => t.type === 'TYPE_REFRESH' || t.type === 2)?.token || tokens.refreshToken;

      if (!accessToken) {
        throw new Error('Invalid token response');
      }

      // Calculate expires_in from the access token expiry
      const accessTokenData = authTokens.find(t => t.type === 'TYPE_ACCESS' || t.type === 1);
      let expiresIn = 3600; // Default 1 hour
      if (accessTokenData?.expiresAt) {
        const expiryTime = new Date(accessTokenData.expiresAt).getTime();
        const now = new Date().getTime();
        expiresIn = Math.floor((expiryTime - now) / 1000);
      }

      this.storage.setTokens(
        accessToken,
        refreshToken,
        expiresIn
      );

      this.setupTokenRefresh();

      return {
        accessToken,
        refreshToken,
        expiresIn,
      };
    } catch (error) {
      console.error('Failed to refresh token:', error);
      this.storage.clearAuth();
      throw error;
    }
  }

  async fetchUserProfile() {
    try {
      const response = await this.apiClient.get('/v1/user');
      // The response might be wrapped in data.data or data.user structure
      const user = response.data?.data?.user || response.data?.user || response.data?.data || response.data;

      console.log('User profile response:', response.data);
      console.log('Extracted user:', user);

      // Check if we actually got valid user data
      if (!user || (!user.email && !user.user_id && !user.userId)) {
        console.warn('Invalid or missing user data received:', user);
        throw new Error('Invalid user data - re-authentication required');
      }

      this.storage.setUser(user);

      // Workspace info would need to be fetched with workspace slug, not ID
      // This would require getting the workspace slug from the user response
      // For now, we'll skip workspace fetching until we know how to get the slug

      return user;
    } catch (error) {
      console.error('Failed to fetch user profile:', error);

      // If we failed to get user profile, clear auth and throw
      if (error.response?.status === 401 || error.message?.includes('re-authentication required')) {
        console.log('User profile fetch failed with 401 or invalid data, clearing auth...');
        this.storage.clearAuth();
      }

      throw error;
    }
  }

  async fetchWorkspaceInfo(workspaceSlug) {
    try {
      const response = await this.apiClient.get(`/v1/workspaces/${workspaceSlug}`);
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

    // Token revocation endpoint may not be needed for desktop app
    // The backend doesn't have a revoke endpoint in Bruno collections
    // Just clear local storage

    this.storage.clearAuth();
    this.emit('auth:logout');
  }

  async validateSession() {
    const tokens = this.storage.getTokens();
    if (!tokens) {
      return { isValid: false, reason: 'No tokens found' };
    }

    // Check if we have user data stored
    const storedUser = this.storage.getUser();
    if (!storedUser || (!storedUser.email && !storedUser.user_id && !storedUser.userId)) {
      console.log('No valid user data found in storage, attempting to fetch...');
      try {
        await this.fetchUserProfile();
      } catch (error) {
        console.error('Failed to fetch user profile during validation:', error);
        return { isValid: false, reason: 'No valid user data - re-authentication required' };
      }
    }

    if (tokens.isExpired) {
      try {
        await this.refreshToken();
        return { isValid: true };
      } catch (error) {
        return { isValid: false, reason: 'Failed to refresh token' };
      }
    }

    // No validate endpoint exists, use user endpoint as validation
    try {
      await this.apiClient.get('/v1/user');
      return { isValid: true };
    } catch (error) {
      return { isValid: false, reason: 'Token validation failed' };
    }
  }

  isAuthenticated() {
    const tokens = this.storage.getTokens();
    return !!(tokens && (tokens.accessToken || tokens.refreshToken));
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