# Current Implementation Tasks - Desktop Meeting Recorder

## Completed Tasks ✅

1. **Authentication Service Setup** - COMPLETED
   - Added required dependencies to package.json
   - Created NexAuthService with OAuth2 flow
   - Implemented SecureStorage for encrypted token storage
   - Added authentication IPC handlers to main.js
   - Updated preload.js with auth APIs

2. **Calendar Sync Service** - COMPLETED
   - Created CalendarSyncService with periodic sync
   - Implemented meeting notifications scheduler
   - Added auto-record capability
   - Local caching for offline access

## Active Task: Meeting Detection Logic

### What we're doing now:
1. Adding required dependencies to package.json
2. Creating authentication service module
3. Implementing OAuth2 flow with Electron

### Next immediate steps:

#### Step 1: Update package.json with new dependencies
```bash
npm install @electron/remote electron-store jsonwebtoken axios-retry node-schedule socket.io-client
```

New dependencies to add:
- `@electron/remote`: ^2.1.0 - IPC communication
- `electron-store`: ^8.1.0 - Secure encrypted storage
- `jsonwebtoken`: ^9.0.2 - JWT token handling
- `axios-retry`: ^3.8.0 - Resilient API calls
- `node-schedule`: ^2.1.1 - Meeting notifications
- `socket.io-client`: ^4.5.0 - WebSocket client

#### Step 2: Create authentication service structure
Create these files:
- `src/services/auth.js` - Main auth service
- `src/services/storage.js` - Secure token storage
- `src/services/api.js` - API client with auth headers
- `src/config/constants.js` - Configuration constants

#### Step 3: Implement NexAuthService class
```javascript
// src/services/auth.js
class NexAuthService {
  constructor() {
    this.store = new SecureStorage();
    this.apiUrl = process.env.NEX_API_URL;
    this.clientId = process.env.NEX_OAUTH_CLIENT_ID;
    this.redirectUri = process.env.NEX_OAUTH_REDIRECT_URI;
  }

  async login() {
    // 1. Open BrowserWindow with OAuth URL
    // 2. Handle callback with authorization code
    // 3. Exchange code for tokens
    // 4. Store tokens securely
  }

  async getAccessToken() {
    // 1. Check if token exists and is valid
    // 2. If expired, refresh it
    // 3. Return valid token
  }

  async logout() {
    // 1. Clear stored tokens
    // 2. Revoke tokens on server (optional)
    // 3. Reset UI state
  }
}
```

#### Step 4: Implement SecureStorage class
```javascript
// src/services/storage.js
const Store = require('electron-store');
const { safeStorage } = require('electron');

class SecureStorage {
  constructor() {
    this.store = new Store({
      name: 'nex-auth',
      encryptionKey: this.getEncryptionKey()
    });
  }

  getEncryptionKey() {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString('nex-desktop-recorder-key');
    }
    return 'fallback-key'; // For development
  }

  setTokens(accessToken, refreshToken, expiresIn) {
    const expiresAt = Date.now() + (expiresIn * 1000);
    this.store.set('auth', {
      accessToken: this.encrypt(accessToken),
      refreshToken: this.encrypt(refreshToken),
      expiresAt
    });
  }

  getTokens() {
    const auth = this.store.get('auth');
    if (!auth) return null;

    return {
      accessToken: this.decrypt(auth.accessToken),
      refreshToken: this.decrypt(auth.refreshToken),
      expiresAt: auth.expiresAt
    };
  }

  encrypt(text) {
    // Use safeStorage for encryption
  }

  decrypt(encrypted) {
    // Use safeStorage for decryption
  }
}
```

#### Step 5: Update main.js to initialize auth
Modify `src/main.js`:
- Import NexAuthService
- Check auth status on app start
- Show login window if not authenticated
- Initialize API client with auth headers

#### Step 6: Create OAuth2 login flow
```javascript
// src/services/oauth.js
const { BrowserWindow } = require('electron');

async function performOAuth2Login(authUrl, redirectUri) {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    authWindow.loadURL(authUrl);

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith(redirectUri)) {
        // Extract authorization code from URL
        const code = extractCodeFromUrl(url);
        authWindow.close();
        resolve(code);
      }
    });

    authWindow.on('closed', () => {
      reject(new Error('Auth window closed by user'));
    });
  });
}
```

#### Step 7: Update .env.example
Add new environment variables:
```
# Nex API Configuration
NEX_API_URL=https://api.nex.ai
NEX_OAUTH_CLIENT_ID=desktop-recorder
NEX_OAUTH_REDIRECT_URI=nex://auth/callback
NEX_OAUTH_SCOPE=calendar.read meetings.write recordings.write

# Existing Recall.ai config (keep)
RECALLAI_API_URL=https://api.recall.ai
RECALLAI_API_KEY=recall_api_key

# Optional services
OPENROUTER_KEY=open_api_key
```

### Files to modify:
1. ✅ `/IMPLEMENTATION_PLAN.md` - Created comprehensive plan
2. ✅ `/CURRENT_TASKS.md` - Created this tracking document
3. ⏳ `/package.json` - Add new dependencies
4. ⏳ `/src/services/auth.js` - Create auth service
5. ⏳ `/src/services/storage.js` - Create secure storage
6. ⏳ `/src/services/api.js` - Create API client
7. ⏳ `/src/main.js` - Integrate auth on startup
8. ⏳ `/.env.example` - Add Nex API config

### Testing checklist:
- [ ] Auth service initializes correctly
- [ ] OAuth2 flow completes successfully
- [ ] Tokens are stored encrypted
- [ ] Token refresh works before expiry
- [ ] API calls include auth headers
- [ ] Logout clears all auth data

### Blockers/Questions:
1. Need to confirm OAuth2 endpoints in Nex API
2. Need client_id and redirect_uri from Nex team
3. Confirm token expiry times (access & refresh)

### Progress status:
- Created implementation plan: ✅
- Created tracking document: ✅
- Ready to add dependencies: 🔄 (Current)
- Auth service implementation: ⏳
- OAuth2 flow implementation: ⏳
- Integration with main app: ⏳

## When resuming next session:
1. Check this document for current status
2. Continue from "Step 1: Update package.json"
3. Follow the implementation steps in order
4. Update this document as tasks complete