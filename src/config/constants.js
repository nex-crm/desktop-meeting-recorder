const path = require('path');

module.exports = {
  APP_NAME: 'Nex Desktop Meeting Recorder',

  API: {
    BASE_URL: process.env.NEX_API_URL || 'https://api.nex.ai',
    TIMEOUT: 30000,
    RETRY_ATTEMPTS: 3,
  },

  AUTH: {
    CLIENT_ID: process.env.NEX_OAUTH_CLIENT_ID || 'desktop-recorder',
    REDIRECT_URI: process.env.NEX_OAUTH_REDIRECT_URI || 'nex://auth/callback',
    SCOPE: process.env.NEX_OAUTH_SCOPE || 'calendar.read meetings.write recordings.write',
    TOKEN_REFRESH_BUFFER: 5 * 60 * 1000, // Refresh 5 minutes before expiry
  },

  STORAGE: {
    STORE_NAME: 'nex-auth-store',
    ENCRYPTION_KEY_PREFIX: 'nex-desktop-recorder',
  },

  RECORDING: {
    CHUNK_SIZE: 10 * 1024 * 1024, // 10MB chunks for upload
    MAX_RETRY_ATTEMPTS: 5,
    RETRY_DELAY: 1000,
  },

  NOTIFICATIONS: {
    MEETING_REMINDER_MINUTES: [15, 5, 1], // Remind at these intervals before meeting
    DEFAULT_NOTIFICATION_SOUND: true,
  },

  WEBSOCKET: {
    RECONNECT_INTERVAL: 5000,
    MAX_RECONNECT_ATTEMPTS: 10,
    PING_INTERVAL: 30000,
  },

  PATHS: {
    USER_DATA: path.join(process.env.APPDATA || process.env.HOME, '.nex-desktop-recorder'),
    TEMP_RECORDINGS: path.join(process.env.TEMP || '/tmp', 'nex-recordings'),
  },
};