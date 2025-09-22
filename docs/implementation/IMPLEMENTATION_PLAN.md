# Nex Desktop Meeting Recorder - Implementation Plan & Progress

## Project Overview
Transform the forked Muesli app (Recall.ai demo) into a fully integrated Nex Desktop Meeting Recorder that works seamlessly with the existing Nex CRM meeting bot infrastructure.

## Current Analysis Results

### 1. Existing Nex Core Architecture

#### Recall Integration (`/core/internal/communication/meetings/recall/`)
- **Client**: `recall/client.go` - HTTP client for Recall.ai API
  - Auth via API key from secrets manager
  - Methods: AddToMeeting, RemoveFromMeeting, GetMeetingVideoURL, GetTranscriptURL, StartTranscription
  - Metadata: meeting_id, workspace_id attached to bots
  - Rate limits: 60 req/min for AddToMeeting, 300 req/min for RemoveFromMeeting

#### Meeting Service (`/core/internal/communication/meetings/application/`)
- **MeetingService**: Orchestrates meeting lifecycle
  - Creates meetings linked to calendar events
  - Manages bot lifecycle (scheduled → joined → left)
  - Handles recordings and transcripts
  - Publishes events via Kafka

#### Calendar Integration (`/core/internal/communication/application/`)
- **CalendarService**: Links calendar events to meetings
  - Fetches events from Google Calendar
  - Creates meetings for events with video URLs
  - Supports person and company entity types
  - Lists meetings for specific entities

#### Authentication (`/core/internal/iam/`)
- **JWT-based auth**: Access + refresh tokens
  - AuthService validates tokens
  - Middleware extracts Bearer tokens or cookies
  - User claims include scopes for permissions
  - Secret: `auth/jwt-secret` from secrets manager

#### Database Schema (`/core/db/schemas/10_meeting.sql`)
```sql
- meeting: Core meeting record (workspace_id, calendar_event_id)
- meeting_bot: Bot instances (external_id, provider, status)
- meeting_recording: Recording metadata (external_id, status)
- meeting_transcript: Transcript data (raw_transcript jsonb)
- meeting_video: Video files (video_file_id → file table)
```

#### API Structure
- Webhook handler: `/external/recall/webhook` - Receives Recall.ai events
- Uses Svix for webhook verification
- RESTful endpoints with Chi router
- gRPC services for internal communication

### 2. Current Desktop App Structure

#### File Structure
```
desktop-meeting-recorder/
├── src/
│   ├── main.js         # Main process, Recall SDK integration
│   ├── renderer.js     # UI logic, meeting management
│   ├── preload.js      # IPC bridge
│   └── index.html      # UI template
├── .env.example        # Config template
└── package.json        # Dependencies
```

#### Current Features
- Recall.ai Desktop SDK integration
- Manual recording start/stop
- Local file storage (JSON)
- Deepgram transcription (via Recall)
- OpenRouter AI summaries
- Simple API key auth

## Implementation Plan

### Phase 1: Authentication Foundation (COMPLETED ✅)
**Completion Date**: 2025-01-22

#### Tasks
- [x] Analyze Recall integration in core repository
- [x] Analyze authentication (IAM) implementation
- [x] Analyze calendar integration for meeting detection
- [x] Analyze API structure and endpoints
- [x] Analyze database models and storage patterns
- [x] Create comprehensive implementation plan
- [x] Set up authentication service in desktop app
- [x] Create OAuth2 login flow with Electron
- [x] Implement secure token storage
- [x] Add token refresh mechanism with auto-refresh
- [x] Update package.json with new dependencies
- [x] Implement desktop token exchange endpoint in backend
- [x] Add desktop detection to web app login flow
- [x] Fix cookie path configuration for broader access
- [x] Handle both string and numeric token types
- [x] Add session expiry dialog prompts
- [x] Fix isAuthenticated() to return boolean instead of JWT token
- [x] Add automatic re-authentication detection when user data missing
- [x] Fix user name field extraction from protobuf structures
- [x] Add validation to prevent email showing as name

#### 1.1 Authentication Service (`src/services/auth.js`)
```javascript
class NexAuthService {
  constructor() {
    this.store = new Store({ encryptionKey: 'nex-desktop-recorder' });
    this.apiUrl = process.env.NEX_API_URL || 'https://api.nex.ai';
  }

  async login() {
    // OAuth2 flow with Electron BrowserWindow
    // Store tokens in encrypted store
  }

  async refreshToken() {
    // Auto-refresh before expiry
  }

  async validateSession() {
    // Check token validity
  }
}
```

#### 1.2 Secure Storage (`src/services/storage.js`)
```javascript
const Store = require('electron-store');
const { safeStorage } = require('electron');

class SecureStorage {
  constructor() {
    this.store = new Store({
      encryptionKey: safeStorage.encryptString('nex-desktop-key')
    });
  }

  setTokens(access, refresh) {
    this.store.set('tokens', {
      access,
      refresh,
      expires: Date.now() + 3600000 // 1 hour
    });
  }
}
```

### Phase 2: Calendar Integration

#### 2.1 Calendar Sync Service (`src/services/calendar.js`)
```javascript
class CalendarSyncService {
  async fetchUpcomingMeetings() {
    // GET /api/v1/calendar/upcoming-meetings
    // Cache locally for offline access
  }

  async detectMeetingStart(calendarEvent) {
    // Cross-reference with Recall SDK window detection
  }

  async notifyRecordingIntent(eventId) {
    // POST /api/v1/calendar/meeting/{eventId}/recording-intent
  }
}
```

#### 2.2 Meeting Detection (`src/services/meetingDetector.js`)
```javascript
class MeetingDetector {
  async detectMeeting() {
    const activeWindows = await RecallSdk.getActiveWindows();
    const calendarEvents = await this.calendar.getUpcomingMeetings();

    // Intelligent matching algorithm
    const match = this.matchWindowToCalendar(activeWindows, calendarEvents);
    if (match) {
      return this.startRecording(match.eventId);
    }
  }

  matchWindowToCalendar(windows, events) {
    // Match by:
    // 1. Meeting URL in window title
    // 2. Time proximity (within 5 mins of start)
    // 3. Participant names
  }
}
```

### Phase 3: Recording Pipeline

#### 3.1 Desktop Recording Service (`src/services/recording.js`)
```javascript
class DesktopRecordingService {
  async createRecording(meetingId, eventId) {
    // POST /api/v1/desktop/recording/create
    // Returns recordingId for tracking
  }

  async uploadChunked(recordingId, filePath) {
    // Multipart upload with resume capability
    // POST /api/v1/desktop/recording/initiate-upload
    // POST /api/v1/desktop/recording/get-upload-url
    // POST /api/v1/desktop/recording/complete-upload
  }

  async syncTranscript(recordingId, transcript) {
    // POST /api/v1/desktop/recording/{id}/transcript
  }
}
```

#### 3.2 State Management (`src/services/recordingState.js`)
```javascript
const RECORDING_STATES = {
  IDLE: 'idle',
  SCHEDULED: 'scheduled',
  RECORDING: 'recording',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error'
};

class RecordingStateManager {
  transition(from, to) {
    // Validate state transitions
    // Persist state changes
    // Emit events for UI updates
  }
}
```

### Phase 4: Real-time Communication

#### 4.1 WebSocket Client (`src/services/websocket.js`)
```javascript
const io = require('socket.io-client');

class RealtimeService {
  connect(token) {
    this.socket = io('wss://api.nex.ai/desktop', {
      auth: { token },
      reconnection: true
    });

    this.socket.on('meeting-reminder', this.handleReminder);
    this.socket.on('recording-requested', this.handleRecordingRequest);
    this.socket.on('settings-updated', this.handleSettingsUpdate);
  }
}
```

### Phase 5: UI Enhancements

#### 5.1 React Components Structure
```
src/components/
├── Auth/
│   ├── LoginView.jsx
│   └── SessionStatus.jsx
├── Calendar/
│   ├── MeetingList.jsx
│   ├── MeetingCard.jsx
│   └── CountdownTimer.jsx
├── Recording/
│   ├── RecordingStatus.jsx
│   ├── RecordingControls.jsx
│   └── RecordingHistory.jsx
└── Settings/
    ├── SettingsView.jsx
    └── NotificationPreferences.jsx
```

## API Endpoints to Implement in Core

### Desktop-specific endpoints
```go
// Authentication
POST   /api/v1/auth/desktop/login
POST   /api/v1/auth/desktop/refresh
GET    /api/v1/auth/desktop/validate

// Calendar
GET    /api/v1/calendar/upcoming-meetings
GET    /api/v1/calendar/meeting/{eventId}
POST   /api/v1/calendar/meeting/{eventId}/recording-intent

// Recording
POST   /api/v1/desktop/recording/create
POST   /api/v1/desktop/recording/initiate-upload
POST   /api/v1/desktop/recording/get-upload-url
POST   /api/v1/desktop/recording/complete-upload
PUT    /api/v1/desktop/recording/{id}/status
POST   /api/v1/desktop/recording/{id}/transcript

// WebSocket
WS     /api/v1/desktop/stream
```

## Database Changes Required

```sql
-- Add desktop recording support
ALTER TABLE meeting_recording
  ADD COLUMN recording_source smallint DEFAULT 0, -- 0=bot, 1=desktop
  ADD COLUMN desktop_metadata jsonb; -- Store desktop-specific data

-- Desktop device tracking
CREATE TABLE desktop_device (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES user(id),
  device_fingerprint varchar(255) UNIQUE NOT NULL,
  device_name varchar(255),
  last_seen timestamptz,
  created_at timestamptz NOT NULL
);

-- Desktop recording sessions
CREATE TABLE desktop_recording_session (
  id bigint PRIMARY KEY,
  device_id bigint NOT NULL REFERENCES desktop_device(id),
  meeting_id bigint NOT NULL REFERENCES meeting(id),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  upload_status smallint,
  created_at timestamptz NOT NULL
);
```

## Environment Variables

### Desktop App (.env)
```
# Nex API
NEX_API_URL=https://api.nex.ai
NEX_OAUTH_CLIENT_ID=desktop-recorder
NEX_OAUTH_REDIRECT_URI=nex://auth/callback

# Recall SDK (keep for recording)
RECALLAI_API_KEY=<from secrets>
RECALLAI_API_URL=https://api.recall.ai

# Optional services
DEEPGRAM_API_KEY=<optional>
OPENROUTER_KEY=<optional>

# Feature flags
ENABLE_AUTO_RECORD=true
ENABLE_NOTIFICATIONS=true
ENABLE_OFFLINE_MODE=false
```

## Dependencies to Add

```json
{
  "dependencies": {
    // Authentication & Storage
    "@electron/remote": "^2.1.0",
    "electron-store": "^8.1.0",
    "jsonwebtoken": "^9.0.2",

    // Networking
    "axios": "^1.9.0",
    "axios-retry": "^3.8.0",
    "socket.io-client": "^4.5.0",

    // Scheduling & Notifications
    "node-schedule": "^2.1.1",
    "electron-notification-state": "^2.0.1",

    // Existing dependencies (keep all)
    "@recallai/desktop-sdk": "^1.1.0",
    // ... rest of existing
  }
}
```

## Testing Strategy

### Unit Tests
- Auth service token management
- Calendar sync logic
- Meeting detection algorithm
- State transitions

### Integration Tests
- API authentication flow
- File upload resilience
- WebSocket reconnection
- Calendar event matching

### E2E Tests
- Complete recording flow
- OAuth login process
- Notification triggers
- Offline mode handling

## Security Considerations

1. **Token Security**
   - Encrypt tokens at rest
   - Auto-refresh before expiry
   - Clear tokens on logout

2. **Recording Privacy**
   - Local encryption before upload
   - Secure delete after upload
   - User consent tracking

3. **API Security**
   - Certificate pinning
   - Request signing
   - Rate limiting

4. **Distribution**
   - Code signing certificates
   - Auto-update with verification
   - Notarization for macOS

## Progress Tracking

### Completed
- ✅ Repository forked and cloned
- ✅ Package.json updated with Nex branding
- ✅ README updated with project overview
- ✅ Core architecture analysis completed
- ✅ Implementation plan created
- ✅ Authentication service fully implemented
- ✅ OAuth2 login flow working end-to-end
- ✅ Secure token storage implemented
- ✅ Token refresh mechanism with auto-refresh
- ✅ Desktop token exchange endpoint in backend
- ✅ Web app desktop login detection
- ✅ All authentication issues resolved
- ✅ User data validation and re-auth flow
- ✅ Name field display fixes

### In Progress
- ⏳ None - Phase 1 fully complete, ready for Phase 2

### Pending (Phase 2)
- ⏳ Calendar sync service
- ⏳ Meeting detection logic
- ⏳ Notification system
- ⏳ Data sync service
- ⏳ UI component updates
- ⏳ Core API endpoints
- ⏳ Database migrations
- ⏳ WebSocket integration
- ⏳ Testing implementation
- ⏳ Security hardening
- ⏳ Distribution setup

## Notes & Decisions

1. **Why separate repo vs submodule**: Chose separate repo for:
   - Independent release cycles
   - Different tech stacks (Go vs Electron)
   - Separate CI/CD pipelines
   - Customer deployment flexibility

2. **Authentication approach**: JWT with refresh tokens chosen for:
   - Consistency with existing IAM
   - Offline capability with token caching
   - Better security than API keys

3. **Calendar integration**: Direct API calls instead of local calendar access for:
   - Centralized calendar management
   - Consistent permissions model
   - Real-time updates across devices

4. **Recording storage**: Chunked upload with S3 for:
   - Large file handling
   - Resume capability
   - Direct S3 upload reduces server load

5. **Desktop authentication**: Server-side token bridge for:
   - Security (tokens never exposed in web app JS)
   - Minimal changes to existing systems
   - Reuses existing auth infrastructure

## Next Session Tasks
When resuming, start with Phase 2:
1. Implement Calendar sync service
2. Set up meeting detection logic
3. Create notification system
4. Implement data sync service

## References
- Nex Core repo: `/Users/najmuzzaman/Documents/nex/core`
- Desktop recorder: `/Users/najmuzzaman/Documents/nex/desktop-meeting-recorder`
- Recall.ai docs: https://docs.recall.ai/docs/desktop-recording-sdk
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security