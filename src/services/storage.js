const Store = require('electron-store');
const { safeStorage } = require('electron');
const constants = require('../config/constants');

class SecureStorage {
  constructor() {
    this.store = new Store({
      name: constants.STORAGE.STORE_NAME,
      encryptionKey: this.getEncryptionKey(),
      clearInvalidConfig: true,
    });
  }

  getEncryptionKey() {
    if (process.platform === 'darwin' || process.platform === 'win32') {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(constants.STORAGE.ENCRYPTION_KEY_PREFIX).toString('base64');
      }
    }

    console.warn('SafeStorage encryption not available, using fallback');
    return `${constants.STORAGE.ENCRYPTION_KEY_PREFIX}-fallback-key`;
  }

  setTokens(accessToken, refreshToken, expiresIn) {
    const expiresAt = Date.now() + (expiresIn * 1000);

    const authData = {
      accessToken: this.encrypt(accessToken),
      refreshToken: this.encrypt(refreshToken),
      expiresAt,
      updatedAt: Date.now(),
    };

    this.store.set('auth', authData);
    return authData;
  }

  getTokens() {
    const auth = this.store.get('auth');
    if (!auth) return null;

    if (this.isExpired(auth.expiresAt)) {
      return {
        accessToken: null,
        refreshToken: this.decrypt(auth.refreshToken),
        expiresAt: auth.expiresAt,
        isExpired: true,
      };
    }

    return {
      accessToken: this.decrypt(auth.accessToken),
      refreshToken: this.decrypt(auth.refreshToken),
      expiresAt: auth.expiresAt,
      isExpired: false,
    };
  }

  isExpired(expiresAt) {
    return Date.now() >= (expiresAt - constants.AUTH.TOKEN_REFRESH_BUFFER);
  }

  encrypt(text) {
    if (!text) return null;

    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(text).toString('base64');
    }

    return Buffer.from(text).toString('base64');
  }

  decrypt(encrypted) {
    if (!encrypted) return null;

    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      }

      return Buffer.from(encrypted, 'base64').toString('utf-8');
    } catch (error) {
      console.error('Failed to decrypt:', error);
      return null;
    }
  }

  setUser(user) {
    this.store.set('user', {
      id: user.id || user.user_id || user.userId,
      email: user.email,
      // Use full_name from the API response (protobuf field)
      name: user.full_name || user.fullName || user.name,
      full_name: user.full_name || user.fullName || user.name,
      workspaceId: user.workspaceId || user.workspace_id,
      updatedAt: Date.now(),
    });
  }

  getUser() {
    return this.store.get('user');
  }

  setWorkspace(workspace) {
    this.store.set('workspace', {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug || workspace.handle || workspace.id,
      settings: workspace.settings,
      updatedAt: Date.now(),
    });
  }

  getWorkspace() {
    return this.store.get('workspace');
  }

  getWorkspaceSlug() {
    const workspace = this.getWorkspace();
    return workspace?.slug;
  }

  clear() {
    this.store.clear();
  }

  clearAuth() {
    this.store.delete('auth');
    this.clearGoogleTokens();
  }

  setGoogleTokens(tokens) {
    const googleAuth = {
      accessToken: this.encrypt(tokens.access_token),
      refreshToken: this.encrypt(tokens.refresh_token),
      idToken: tokens.id_token ? this.encrypt(tokens.id_token) : null,
      expiresAt: tokens.expiry_date || (Date.now() + (tokens.expires_in * 1000)),
      scope: tokens.scope,
      tokenType: tokens.token_type,
      updatedAt: Date.now(),
    };

    this.store.set('googleAuth', googleAuth);
    return googleAuth;
  }

  getGoogleTokens() {
    const googleAuth = this.store.get('googleAuth');
    if (!googleAuth) return null;

    return {
      access_token: this.decrypt(googleAuth.accessToken),
      refresh_token: this.decrypt(googleAuth.refreshToken),
      id_token: googleAuth.idToken ? this.decrypt(googleAuth.idToken) : null,
      expiry_date: googleAuth.expiresAt,
      expires_in: Math.floor((googleAuth.expiresAt - Date.now()) / 1000),
      scope: googleAuth.scope,
      token_type: googleAuth.tokenType,
      isExpired: this.isExpired(googleAuth.expiresAt),
    };
  }

  clearGoogleTokens() {
    this.store.delete('googleAuth');
  }

  getDeviceFingerprint() {
    let fingerprint = this.store.get('deviceFingerprint');

    if (!fingerprint) {
      const os = require('os');
      const crypto = require('crypto');

      const data = [
        os.hostname(),
        os.platform(),
        os.arch(),
        os.cpus()[0].model,
        process.env.USER || process.env.USERNAME,
      ].join('-');

      fingerprint = crypto.createHash('sha256').update(data).digest('hex');
      this.store.set('deviceFingerprint', fingerprint);
    }

    return fingerprint;
  }

  getSettings() {
    return this.store.get('settings', {
      autoRecord: true,
      notifications: true,
      startOnBoot: false,
      minimizeToTray: true,
      recordingQuality: 'high',
      uploadImmediately: true,
    });
  }

  setSettings(settings) {
    const current = this.getSettings();
    const updated = { ...current, ...settings, updatedAt: Date.now() };
    this.store.set('settings', updated);
    return updated;
  }
}

module.exports = SecureStorage;