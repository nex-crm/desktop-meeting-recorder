const { app, BrowserWindow, ipcMain, protocol, Notification, dialog } = require('electron');
const path = require('node:path');
const url = require('url');
const fs = require('fs');
const RecallAiSdk = require('@recallai/desktop-sdk');
const axios = require('axios');
const OpenAI = require('openai');
const sdkLogger = require('./sdk-logger');
require('dotenv').config();

// Import Nex services
const NexAuthService = require('./services/auth');
const NexApiService = require('./services/api');
const CalendarSyncService = require('./services/calendar');

// Initialize services immediately
const authService = new NexAuthService();
let apiService;
let calendarService;

// Function to get the OpenRouter headers
function getHeaderLines() {
  return [
    "HTTP-Referer: https://recall.ai", // Replace with your actual app's URL
    "X-Title: Muesli AI Notetaker"
  ];
}

// Initialize OpenAI client with OpenRouter as the base URL
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://recall.ai",
    "X-Title": "Muesli AI Notetaker"
  }
});

// Define available models with their capabilities
const MODELS = {
  // Primary models
  PRIMARY: "anthropic/claude-3.7-sonnet",
  FALLBACKS: []
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Store detected meeting information
let detectedMeeting = null;
// Track meetings that have already been handled in this session
let handledMeetingSessions = new Set();
// Track which recordings have already sent completion events
let processedRecordingCompletions = new Set();
// Track active calendar recordings to correlate with video meetings
let activeCalendarRecordings = new Map(); // Map<recordingId, { meetingId, title, startTime, endTime, videoUrl, platform }>
// Track recordings that are being switched (don't upload these when they end)
let recordingsBeingSwitched = new Set();
// Track pending switches: Map<meetingId, { platform, noteId }>
let pendingSwitches = new Map();

let mainWindow;
let notificationWindow = null;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      // Enable notifications in renderer
      webviewTag: false,
      nativeWindowOpen: true
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f9f9f9',
  });

  // Allow the debug panel header to act as a drag region
  mainWindow.on('ready-to-show', () => {
    try {
      // Set regions that can be used to drag the window
      if (process.platform === 'darwin') {
        // Only needed on macOS
        mainWindow.setWindowButtonVisibility(true);
      }
    } catch (error) {
      console.error('Error setting drag regions:', error);
    }
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    // mainWindow.webContents.openDevTools();
  }

  // Listen for navigation events
  ipcMain.on('navigate', (event, page) => {
    if (page === 'note-editor') {
      mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY + '/../note-editor/index.html');
    } else if (page === 'home') {
      mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
    }
  });

  // Handle window closed - critical for preventing crashes
  mainWindow.on('closed', () => {
    // Dereference the window object to prevent accessing destroyed object
    mainWindow = null;
  });
};

// Function to create custom notification window
const createNotificationWindow = (data = {}) => {
  console.log('Creating custom notification window with data:', data);

  // Close existing notification if any
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.close();
  }

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Create notification window - increased height for dropdown
  notificationWindow = new BrowserWindow({
    width: 420,
    height: 100,
    x: width - 440,
    y: 30,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Set window level to ensure it stays on top even over fullscreen apps
  notificationWindow.setAlwaysOnTop(true, 'screen-saver');
  notificationWindow.setVisibleOnAllWorkspaces(true);

  // Get platform details for calendar meetings
  const isCalendarMeeting = data.platform === 'CALENDAR';
  const meetingTime = data.meeting?.startTime ?
    new Date(data.meeting.startTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    }) : '';
  const endTime = data.meeting?.endTime ?
    new Date(data.meeting.endTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    }) : '';

  // Determine platform icon and name
  let platformIcon = '';
  let platformName = 'Nex';
  let platformLogo = '';

  // Read SVG files and convert to data URLs
  // Use app.getAppPath() to get the correct path regardless of webpack bundling
  const appPath = app.getAppPath();
  const logosPath = path.join(appPath, 'logos');
  const platformLogos = {};

  try {
    const zoomSvg = fs.readFileSync(path.join(logosPath, 'zoom.svg'), 'utf8');
    const teamsSvg = fs.readFileSync(path.join(logosPath, 'teams.svg'), 'utf8');
    const meetSvg = fs.readFileSync(path.join(logosPath, 'meet.svg'), 'utf8');
    const webexSvg = fs.readFileSync(path.join(logosPath, 'webex.svg'), 'utf8');
    const roamSvg = fs.readFileSync(path.join(logosPath, 'roam.svg'), 'utf8');

    // Convert to data URLs
    platformLogos.zoom = `data:image/svg+xml;base64,${Buffer.from(zoomSvg).toString('base64')}`;
    platformLogos.teams = `data:image/svg+xml;base64,${Buffer.from(teamsSvg).toString('base64')}`;
    platformLogos.meet = `data:image/svg+xml;base64,${Buffer.from(meetSvg).toString('base64')}`;
    platformLogos.webex = `data:image/svg+xml;base64,${Buffer.from(webexSvg).toString('base64')}`;
    platformLogos.roam = `data:image/svg+xml;base64,${Buffer.from(roamSvg).toString('base64')}`;
  } catch (err) {
    console.error('Error loading platform logos from', logosPath, ':', err);
    // Fallback to empty logos
    platformLogos.zoom = '';
    platformLogos.teams = '';
    platformLogos.meet = '';
    platformLogos.webex = '';
    platformLogos.roam = '';
  }

  // Check for platform from data or meeting URL
  if (data.platform && data.platform !== 'CALENDAR' && data.platform !== 'TEST') {
    // Ad-hoc meeting - use platform directly
    platformName = data.platform;
    if (platformName.toLowerCase() === 'zoom') {
      platformLogo = platformLogos.zoom;
    } else if (platformName.toLowerCase() === 'teams') {
      platformLogo = platformLogos.teams;
    } else if (platformName.toLowerCase().includes('meet')) {
      platformLogo = platformLogos.meet;
    } else if (platformName.toLowerCase() === 'webex') {
      platformLogo = platformLogos.webex;
    }
  } else if (data.meeting?.videoMeetingUrl) {
    // Calendar meeting - extract from URL
    if (data.meeting.videoMeetingUrl.includes('zoom')) {
      platformLogo = platformLogos.zoom;
      platformName = 'Zoom';
    } else if (data.meeting.videoMeetingUrl.includes('meet.google')) {
      platformLogo = platformLogos.meet;
      platformName = 'Google Meet';
    } else if (data.meeting.videoMeetingUrl.includes('teams')) {
      platformLogo = platformLogos.teams;
      platformName = 'Teams';
    } else if (data.meeting.videoMeetingUrl.includes('webex')) {
      platformLogo = platformLogos.webex;
      platformName = 'WebEx';
    } else if (data.meeting.videoMeetingUrl.includes('ro.am')) {
      platformLogo = platformLogos.roam;
      platformName = 'Roam';
    }
  } else if (data.platform === 'TEST') {
    platformName = 'Test';
  }

  // Use camera emoji as fallback if no logo
  if (!platformLogo) {
    platformIcon = '📹';
  }

  // Create the HTML content inline - Nex style
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          background-color: transparent;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          overflow: hidden;
          user-select: none;
        }
        .notification-wrapper {
          position: relative;
          padding: 10px;
          width: 100%;
          height: 100%;
        }
        .notification-wrapper:hover .close-btn {
          opacity: 1 !important;
        }
        .notification {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08);
          animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          display: flex;
          align-items: stretch;
          overflow: hidden;
        }
        @keyframes slideIn {
          from {
            transform: translateX(420px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .accent-bar {
          width: 4px;
          background: #5AC8FA;
          flex-shrink: 0;
        }
        .notification-body {
          flex: 1;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 16px;
          -webkit-app-region: no-drag;
        }
        .close-btn {
          position: absolute;
          top: 2px;
          left: 2px;
          -webkit-app-region: no-drag;
          cursor: pointer;
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.1);
          font-size: 16px;
          color: #666;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          transition: opacity 0.2s;
          padding: 0;
          z-index: 1000;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          opacity: 0;
        }
        .close-btn:hover {
          color: #333;
          background: #f5f5f5;
          transform: scale(1.1);
        }
        .meeting-info {
          flex: 1;
          padding-left: 20px;
        }
        .meeting-title {
          font-size: 15px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 4px;
          letter-spacing: -0.3px;
        }
        .meeting-time {
          font-size: 14px;
          color: #666;
          letter-spacing: -0.2px;
        }
        .action-container {
          position: relative;
          -webkit-app-region: no-drag;
        }
        .action-button {
          background: white;
          color: #333;
          border: 2px solid #10B981;
          border-radius: 8px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: -0.2px;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 180px;
          justify-content: space-between;
          -webkit-app-region: no-drag;
        }
        .action-button:hover {
          background: #f9f9f9;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.15);
        }
        .action-button:active {
          transform: translateY(0);
        }
        .button-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .app-icon {
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          line-height: 1;
          overflow: hidden;
        }
        .app-icon img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .button-text {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1.2;
        }
        .button-main {
          font-weight: 600;
          color: #1a1a1a;
        }
        .button-sub {
          font-size: 12px;
          color: #666;
          font-weight: normal;
        }
        .dropdown-arrow {
          font-size: 10px;
          color: #999;
        }
        .dropdown-menu {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
          padding: 4px 0;
          min-width: 200px;
          display: none;
          z-index: 100;
        }
        .dropdown-menu.show {
          display: block;
        }
        .dropdown-item {
          padding: 10px 16px;
          cursor: pointer;
          transition: background 0.15s;
          font-size: 14px;
          color: #333;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          -webkit-app-region: no-drag;
        }
        .dropdown-item:hover {
          background: #f5f5f5;
        }
        .dropdown-divider {
          height: 1px;
          background: #e5e5e5;
          margin: 4px 0;
        }
      </style>
    </head>
    <body>
      <div class="notification-wrapper">
        <button class="close-btn" id="closeBtn">×</button>
        <div class="notification">
          <div class="accent-bar"></div>
          <div class="notification-body">
          <div class="meeting-info">
            <div class="meeting-title">${data.title || 'Meeting Detected'}</div>
            <div class="meeting-time">${meetingTime ? (meetingTime + (endTime ? ' - ' + endTime : '')) : (data.body || '')}</div>
          </div>
          <div class="action-container">
            <button class="action-button" id="actionBtn">
              <div class="button-content">
                <div class="app-icon">${platformLogo ? `<img src="${platformLogo}" alt="${platformName}" />` : platformIcon}</div>
                <div class="button-text">
                  <div class="button-main">Join Meeting</div>
                  <div class="button-sub">& open Nex</div>
                </div>
              </div>
              <span class="dropdown-arrow">▼</span>
            </button>
            <div class="dropdown-menu" id="dropdownMenu">
              <button class="dropdown-item" id="joinMeetingBtn">Join Meeting</button>
              <button class="dropdown-item" id="openNexBtn">Open Nex</button>
            </div>
          </div>
        </div>
        </div>
      </div>
      <script>
        const { ipcRenderer, shell } = require('electron');
        const meetingData = ${JSON.stringify(data.meeting || null)};
        const isCalendarMeeting = ${isCalendarMeeting ? 'true' : 'false'};
        let dropdownOpen = false;

        // Close button
        document.getElementById('closeBtn').addEventListener('click', () => {
          ipcRenderer.send('close-notification');
        });

        // Main action button - both open URL and start recording
        document.getElementById('actionBtn').addEventListener('click', (e) => {
          e.stopPropagation();

          // Check if alt/option key is pressed for dropdown
          if (e.altKey || e.metaKey) {
            const dropdown = document.getElementById('dropdownMenu');
            dropdownOpen = !dropdownOpen;
            if (dropdownOpen) {
              dropdown.classList.add('show');
            } else {
              dropdown.classList.remove('show');
            }
          } else {
            // Default action - open URL and start recording
            if (meetingData && meetingData.videoMeetingUrl) {
              shell.openExternal(meetingData.videoMeetingUrl);
            }
            if (isCalendarMeeting && meetingData) {
              ipcRenderer.send('notification-action', 'start-calendar-recording', meetingData);
            } else {
              ipcRenderer.send('notification-action', 'start-recording');
            }
            ipcRenderer.send('close-notification');
          }
        });

        // Join Meeting option - only open URL
        document.getElementById('joinMeetingBtn').addEventListener('click', () => {
          if (meetingData && meetingData.videoMeetingUrl) {
            shell.openExternal(meetingData.videoMeetingUrl);
          }
          ipcRenderer.send('close-notification');
        });

        // Open Nex option - only start recording in Nex
        document.getElementById('openNexBtn').addEventListener('click', () => {
          if (isCalendarMeeting && meetingData) {
            ipcRenderer.send('notification-action', 'start-calendar-recording', meetingData);
          } else {
            ipcRenderer.send('notification-action', 'start-recording');
          }
          ipcRenderer.send('close-notification');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
          if (dropdownOpen) {
            document.getElementById('dropdownMenu').classList.remove('show');
            dropdownOpen = false;
          }
        });

        // Auto-close after 60 seconds
        setTimeout(() => {
          ipcRenderer.send('close-notification');
        }, 60000);
      </script>
    </body>
    </html>
  `;

  // Load HTML as data URL
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  console.log('Loading notification as data URL');
  notificationWindow.loadURL(dataUrl);

  // Send notification data once the window is ready
  if (notificationWindow && notificationWindow.webContents) {
    notificationWindow.webContents.on('did-finish-load', () => {
      console.log('Notification window loaded, sending data');
      if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.webContents.send('notification-data', data);
      }
    });

    // Add error event listener
    notificationWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load notification window:', errorCode, errorDescription);
    });
  }

  // Handle notification closed
  notificationWindow.on('closed', () => {
    console.log('Notification window closed');
    notificationWindow = null;
  });

  // Make window click-through for dragging but keep buttons clickable
  notificationWindow.setIgnoreMouseEvents(false);

  return notificationWindow;
};

// This method will be called when Electron has finished
// Register protocol handler for nex://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nex', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('nex');
}

// Handle protocol on Windows/Linux
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle protocol URL
    const url = commandLine.find(arg => arg.startsWith('nex://'));
    if (url && authService) {
      authService.handleAuthCallback(url);
    }
  });
}

// Handle protocol on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('Received protocol URL:', url);
  if (url.startsWith('nex://')) {
    if (authService) {
      console.log('Handling auth callback...');
      authService.handleAuthCallback(url);
    } else {
      console.error('AuthService not initialized yet');
    }
  }
});

// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  console.log("Registering IPC handlers...");

  // Set app name for notifications on macOS
  if (process.platform === 'darwin') {
    app.setName('Nex Desktop Meeting Recorder');
  }

  // Log all registered IPC handlers
  console.log("IPC handlers:", Object.keys(ipcMain._invokeHandlers));

  // Set up SDK logger IPC handlers
  ipcMain.on('sdk-log', (event, logEntry) => {
    // Forward logs from renderer to any open windows
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sdk-log', logEntry);
    }
  });

  // Set up logger event listener to send logs from main to renderer
  sdkLogger.onLog((logEntry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sdk-log', logEntry);
    }
  });

  // Create recordings directory if it doesn't exist
  try {
    if (!fs.existsSync(RECORDING_PATH)) {
      fs.mkdirSync(RECORDING_PATH, { recursive: true });
    }
  } catch (e) {
    console.error("Couldn't create the recording path:", e);
  }

  // Initialize API service
  apiService = new NexApiService(authService);

  // Initialize calendar service with API service and storage
  calendarService = new CalendarSyncService(apiService, authService.storage);

  // Check if workspace needs to be fetched (for users who logged in before workspace fetching was added)
  if (authService.isAuthenticated()) {
    const workspace = authService.storage.getWorkspace();
    if (!workspace || !workspace.slug) {
      console.log('No workspace found, fetching workspace info...');
      await authService.fetchAndStoreWorkspace().catch(error => {
        console.error('Failed to fetch workspace on startup:', error);
      });
    }

    // Initialize calendar sync after successful auth
    calendarService.initialize().catch(error => {
      console.error('Failed to initialize calendar sync:', error);
    });
  }

  // Set up auth event listeners
  authService.on('auth:success', () => {
    console.log('Authentication successful');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:success');
    }
    // Start calendar sync on successful auth
    calendarService.initialize().catch(error => {
      console.error('Failed to initialize calendar sync after auth:', error);
    });
    // Initialize SDK after successful authentication
    initSDK();
  });

  authService.on('auth:logout', () => {
    console.log('User logged out');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:logout');
    }
  });

  // Authentication IPC handlers
  ipcMain.handle('auth:startEmailAuth', async (event, email) => {
    try {
      const result = await authService.startEmailAuth(email);
      return { success: true, data: result };
    } catch (error) {
      console.error('Email auth error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:submitOTP', async (event, { attemptId, code }) => {
    try {
      const result = await authService.submitOTP(attemptId, code);
      const user = authService.getUser();
      const workspace = authService.getWorkspace();
      return { success: true, tokens: result, user, workspace };
    } catch (error) {
      console.error('OTP submission error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await authService.logout();
      return { success: true };
    } catch (error) {
      console.error('Logout failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:getUser', async () => {
    try {
      const user = authService.getUser();
      return { success: true, user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:fetchWorkspace', async () => {
    try {
      console.log('Manual workspace fetch requested');
      const workspace = await authService.fetchAndStoreWorkspace();
      console.log('Workspace fetched:', workspace);
      return { success: true, workspace };
    } catch (error) {
      console.error('Failed to fetch workspace:', error);
      return { success: false, error: error.message, details: error.response?.data };
    }
  });

  ipcMain.handle('auth:getWorkspace', async () => {
    try {
      const workspace = authService.storage.getWorkspace();
      console.log('Current workspace in storage:', workspace);
      return { success: true, workspace };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:isAuthenticated', async () => {
    return authService.isAuthenticated();
  });

  // Notification window IPC handlers
  ipcMain.on('close-notification', () => {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.close();
    }
  });

  ipcMain.on('notification-action', async (event, action, meetingData) => {
    if (action === 'start-recording') {
      // Join the detected meeting when user clicks "Start Recording" for ad-hoc meetings
      const result = await joinDetectedMeeting();

      // Bring main window to front
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    } else if (action === 'start-calendar-recording' && meetingData) {
      console.log('Starting calendar meeting recording for:', meetingData.title);

      // Bring main window to front
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();

        // Send event to renderer to open the calendar meeting
        mainWindow.webContents.send('open-calendar-meeting', meetingData);
      }
    }
  });

  // Calendar IPC handlers
  ipcMain.handle('calendar:getUpcomingMeetings', async (event, hours) => {
    try {
      const result = await apiService.getUpcomingMeetings(hours);
      // Extract meetings array from the result
      const meetings = result.meetings || result;
      return { success: true, meetings };
    } catch (error) {
      console.error('Failed to fetch upcoming meetings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('calendar:getPastMeetings', async (event, days) => {
    try {
      const result = await apiService.getPastMeetings(days);
      // Extract meetings array from the result
      const meetings = result.meetings || result;
      return { success: true, meetings };
    } catch (error) {
      console.error('Failed to fetch past meetings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('calendar:getMeetingDetails', async (event, eventId) => {
    try {
      const meeting = await apiService.getMeetingDetails(eventId);
      return { success: true, meeting };
    } catch (error) {
      console.error('Failed to fetch meeting details:', error);
      return { success: false, error: error.message };
    }
  });

  // Forward calendar sync events to renderer (if calendar service is initialized)
  if (calendarService) {
    calendarService.on('calendar:synced', (meetings) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('calendar:synced', meetings);
      }
    });

    calendarService.on('meeting:starting', (meeting) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('meeting:starting', meeting);
      }
    });

    calendarService.on('meeting:inProgress', (meeting) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('meeting:inProgress', meeting);
      }
    });

    // Handle calendar meeting notifications (1 minute before meeting)
    calendarService.on('meeting:notification', (notificationData) => {
      console.log('Calendar meeting notification:', notificationData);

      // Show custom notification window with meeting details
      createNotificationWindow({
        title: notificationData.title,
        body: notificationData.body,
        platform: 'CALENDAR',
        actionText: notificationData.actionText,
        meeting: notificationData.meeting
      });
    });

    // Handle meeting join action from calendar notification
    calendarService.on('meeting:join', (meeting) => {
      console.log('Join meeting from calendar notification:', meeting);
      // Bring main window to front and navigate to meeting
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        // Send event to renderer to open the meeting
        mainWindow.webContents.send('open-calendar-meeting', meeting);
      }
    });
  }

  // Debug settings handler
  ipcMain.handle('settings:getDebugMode', async () => {
    // Only show debug panel if explicitly enabled
    return process.env.SHOW_DEBUG_PANEL === 'true';
  });

  // Create the main window first so it can handle protocol callbacks
  createWindow();

  // Check authentication status
  const isAuthenticated = authService.isAuthenticated();

  if (!isAuthenticated) {
    // The renderer will handle showing the login UI
    console.log('User not authenticated - login UI will be shown');
    // Don't initialize SDK yet - wait for successful authentication
  } else {
    // We have tokens, but let's validate the session and check for user data
    console.log('Validating existing session...');
    const validation = await authService.validateSession();

    if (!validation.isValid) {
      console.log('Session validation failed:', validation.reason);

      // Session is invalid, clear auth and show login UI
      authService.logout();
      console.log('Session invalid - cleared auth, login UI will be shown');
      // The renderer will handle showing the login UI
    } else {
      console.log('Session is valid');
      // Initialize SDK for valid session
      initSDK();
    }
  }

  // When the window is ready, send the initial meeting detection status
  mainWindow.webContents.on('did-finish-load', () => {
    // Send the initial meeting detection status
    mainWindow.webContents.send('meeting-detection-status', { detected: detectedMeeting !== null });
  });

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // Set mainWindow to null when all windows are closed
  mainWindow = null;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up before quitting
app.on('before-quit', () => {
  // Clean up mainWindow reference
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow = null;
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// Path to meetings data file in the user's Application Support directory
const meetingsFilePath = path.join(app.getPath('userData'), 'meetings.json');

// Path for RecallAI SDK recordings
const RECORDING_PATH = path.join(app.getPath("userData"), 'recordings');

// Global state to track active recordings
const activeRecordings = {
  // Map of recordingId -> {noteId, platform, state}
  recordings: {},

  // Register a new recording
  addRecording: function(recordingId, noteId, platform = 'unknown') {
    this.recordings[recordingId] = {
      noteId,
      platform,
      state: 'recording',
      startTime: new Date()
    };
    console.log(`Recording registered in global state: ${recordingId} for note ${noteId}`);
  },

  // Update a recording's state
  updateState: function(recordingId, state) {
    if (this.recordings[recordingId]) {
      this.recordings[recordingId].state = state;
      console.log(`Recording ${recordingId} state updated to: ${state}`);
      return true;
    }
    return false;
  },

  // Remove a recording
  removeRecording: function(recordingId) {
    if (this.recordings[recordingId]) {
      delete this.recordings[recordingId];
      console.log(`Recording ${recordingId} removed from global state`);
      return true;
    }
    return false;
  },

  // Get active recording for a note
  getForNote: function(noteId) {
    for (const [recordingId, info] of Object.entries(this.recordings)) {
      if (info.noteId === noteId) {
        return { recordingId, ...info };
      }
    }
    return null;
  },

  // Get all active recordings
  getAll: function() {
    return { ...this.recordings };
  }
};

// Helper function to extract platform from video URL
function extractPlatformFromUrl(url) {
  if (!url) return null;

  const urlLower = url.toLowerCase();
  if (urlLower.includes('zoom')) return 'zoom';
  if (urlLower.includes('meet.google') || urlLower.includes('meet.google.com')) return 'google-meet';
  if (urlLower.includes('teams.microsoft')) return 'teams';
  if (urlLower.includes('webex')) return 'webex';
  if (urlLower.includes('gotomeeting')) return 'gotomeeting';
  if (urlLower.includes('bluejeans')) return 'bluejeans';
  if (urlLower.includes('whereby')) return 'whereby';

  return null;
}

// Helper function to check if a detected meeting matches a calendar recording
function correlateWithCalendarRecording(detectedWindow) {
  const now = new Date();
  const platform = detectedWindow.platform;

  const logMsg1 = `[Correlation] Checking correlation for detected ${platform} meeting, title: ${detectedWindow.title}`;
  const logMsg2 = `[Correlation] Active calendar recordings count: ${activeCalendarRecordings.size}`;
  console.log(logMsg1);
  console.log(logMsg2);

  // Also write to file for debugging
  const logPath = path.join(app.getPath('userData'), 'correlation-debug.log');
  fs.appendFileSync(logPath, `\n${new Date().toISOString()} - ${logMsg1}\n${logMsg2}\n`);

  for (const [recordingId, calendarMeeting] of activeCalendarRecordings) {
    const logMsg3 = `[Correlation] Checking recording ${recordingId}: title="${calendarMeeting.title}", platform="${calendarMeeting.platform}", detectedPlatform="${platform}", startTime="${calendarMeeting.startTime}", currentTime="${now.toISOString()}"`;
    console.log(logMsg3);
    fs.appendFileSync(logPath, `${logMsg3}\n`);

    // Platform matching
    if (calendarMeeting.platform && calendarMeeting.platform === platform) {
      console.log(`Platform match found: ${platform} for calendar meeting ${calendarMeeting.title}`);

      // Time matching - check if we're within the meeting time window (with 5 min buffer)
      if (calendarMeeting.startTime) {
        const startTime = new Date(calendarMeeting.startTime);
        const endTime = calendarMeeting.endTime ? new Date(calendarMeeting.endTime) : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
        const bufferMinutes = 5;
        const startBuffer = new Date(startTime.getTime() - bufferMinutes * 60 * 1000);
        const endBuffer = new Date(endTime.getTime() + bufferMinutes * 60 * 1000);

        if (now >= startBuffer && now <= endBuffer) {
          console.log(`Time match found for calendar meeting: ${calendarMeeting.title}`);
          return { recordingId, calendarMeeting };
        }
      }
    }

    // Title matching (fuzzy match) - if window title contains part of meeting title
    if (detectedWindow.title && calendarMeeting.title) {
      const windowTitle = detectedWindow.title.toLowerCase();
      const meetingTitle = calendarMeeting.title.toLowerCase();

      // Check if meeting title words appear in window title
      const meetingWords = meetingTitle.split(/\s+/).filter(w => w.length > 3); // Skip short words
      const matchingWords = meetingWords.filter(word => windowTitle.includes(word));

      if (matchingWords.length >= Math.min(2, Math.ceil(meetingWords.length / 2))) {
        console.log(`Title match found: "${detectedWindow.title}" matches "${calendarMeeting.title}"`);
        return { recordingId, calendarMeeting };
      }
    }
  }

  return null;
}

// Helper function to check if a video meeting for the given platform is currently detected
function checkForActiveVideoMeeting(platform) {
  if (!detectedMeeting || !detectedMeeting.window) {
    return null;
  }

  const detectedPlatform = detectedMeeting.window.platform;
  const detectedAt = detectedMeeting.detectedAt;
  const now = Date.now();
  const fiveMinutesInMs = 5 * 60 * 1000;

  // Check if the detected meeting matches the platform and was detected recently (within 5 minutes)
  if (detectedPlatform === platform && (now - detectedAt) < fiveMinutesInMs) {
    console.log(`Found active ${platform} meeting: window ID ${detectedMeeting.window.id}`);
    return detectedMeeting.window;
  }

  return null;
}

// Function to switch from audio to video recording when video meeting detected
async function switchToVideoRecording(audioRecordingId, videoWindowId, calendarMeetingId, uploadToken) {
  try {
    console.log('[SWITCH] Starting switch from audio to video recording');
    console.log('[SWITCH] Audio ID:', audioRecordingId, 'Video ID:', videoWindowId, 'Calendar Meeting ID:', calendarMeetingId);

    // Mark this recording as being switched (don't upload when it ends)
    recordingsBeingSwitched.add(audioRecordingId);
    console.log('[SWITCH] Marked audio recording to skip upload on end');

    // Stop the audio-only recording
    console.log('[SWITCH] Stopping audio recording...');
    sdkLogger.logApiCall('stopRecording', {
      windowId: audioRecordingId,
      reason: 'Switching to video recording'
    });

    RecallAiSdk.stopRecording({
      windowId: audioRecordingId
    });

    // CLEAN UP EVERYTHING related to audio recording
    if (global.activeMeetingIds && global.activeMeetingIds[audioRecordingId]) {
      delete global.activeMeetingIds[audioRecordingId];
    }
    activeRecordings.removeRecording(audioRecordingId);
    activeCalendarRecordings.delete(audioRecordingId);
    pendingSwitches.clear();
    console.log('[SWITCH] Cleaned up ALL audio recording tracking');

    // Wait for stop to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Read meetings data to get calendar meeting details
    const meetingsData = await fileOperationManager.readMeetingsData();

    // Find the calendar meeting
    let calendarMeeting = meetingsData.upcomingMeetings.find(m => m.id === calendarMeetingId);
    let wasInUpcoming = true;

    if (!calendarMeeting) {
      calendarMeeting = meetingsData.pastMeetings.find(m => m.id === calendarMeetingId);
      wasInUpcoming = false;
    }

    if (!calendarMeeting) {
      const errorMsg = `Calendar meeting ${calendarMeetingId} not found`;
      console.error('[SWITCH ERROR]', errorMsg);
      throw new Error(errorMsg);
    }

    console.log('[SWITCH] Found calendar meeting:', calendarMeeting.title);

    // Store calendar meeting metadata before deleting
    const calendarMetadata = {
      calendarEventId: calendarMeeting.calendarEventId,
      title: calendarMeeting.title,
      date: calendarMeeting.date,
      startTime: calendarMeeting.startTime,
      endTime: calendarMeeting.endTime,
      attendees: calendarMeeting.attendees,
      location: calendarMeeting.location,
      videoMeetingUrl: calendarMeeting.videoMeetingUrl,
      organizerEmail: calendarMeeting.organizerEmail
    };

    // Delete the old calendar note from both lists
    if (wasInUpcoming) {
      meetingsData.upcomingMeetings = meetingsData.upcomingMeetings.filter(m => m.id !== calendarMeetingId);
      console.log('[SWITCH] Deleted calendar note from upcomingMeetings');
    } else {
      meetingsData.pastMeetings = meetingsData.pastMeetings.filter(m => m.id !== calendarMeetingId);
      console.log('[SWITCH] Deleted calendar note from pastMeetings');
    }

    // Save the deletion
    await fileOperationManager.writeData(meetingsData);

    // Now create a BRAND NEW note using the exact "Record Meeting with Video" workflow
    const platformName = detectedMeeting.window?.platform || 'zoom';
    const platformDisplay = platformName.charAt(0).toUpperCase() + platformName.slice(1);

    console.log('[SWITCH] Creating brand new note (same as Record Meeting with Video button)');
    const newNoteId = await createMeetingNoteAndRecord(platformDisplay, calendarMetadata);

    console.log('[SWITCH] Successfully created new note:', newNoteId);
    return newNoteId;
  } catch (error) {
    console.error('[SWITCH ERROR] Failed to switch to video recording:', error);
    throw error;
  }
}

// File operation manager to prevent race conditions on both reads and writes
const fileOperationManager = {
  isProcessing: false,
  pendingOperations: [],
  cachedData: null,
  lastReadTime: 0,

  // Read the meetings data with caching to reduce file I/O
  readMeetingsData: async function() {
    // If we have cached data that's recent (less than 500ms old), use it
    const now = Date.now();
    if (this.cachedData && (now - this.lastReadTime < 500)) {
      return JSON.parse(JSON.stringify(this.cachedData)); // Deep clone
    }

    // Retry logic for reading
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Read from file
        const fileData = await fs.promises.readFile(meetingsFilePath, 'utf8');
        const data = JSON.parse(fileData);

        // Update cache
        this.cachedData = data;
        this.lastReadTime = now;

        return data;
      } catch (error) {
        lastError = error;
        console.error(`Error reading meetings data (attempt ${attempt + 1}/3):`, error.message);

        // If JSON parse error, wait a bit and retry (file might be mid-write)
        if (error instanceof SyntaxError && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        break;
      }
    }

    console.error('Failed to read meetings data after 3 attempts:', lastError);
    // If file doesn't exist or is invalid, return empty structure
    return { upcomingMeetings: [], pastMeetings: [] };
  },

  // Schedule an operation that needs to update the meetings data
  scheduleOperation: async function(operationFn) {
    return new Promise((resolve, reject) => {
      // Add this operation to the queue
      this.pendingOperations.push({
        operationFn, // This function will receive the current data and return updated data
        resolve,
        reject
      });

      // Process the queue if not already processing
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  },

  // Process the operation queue sequentially
  processQueue: async function() {
    if (this.pendingOperations.length === 0 || this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get the next operation
      const nextOp = this.pendingOperations.shift();

      // Read the latest data
      const currentData = await this.readMeetingsData();

      try {
        // Execute the operation function with the current data
        const updatedData = await nextOp.operationFn(currentData);

        // If the operation returned data, write it
        if (updatedData) {
          // Update cache immediately
          this.cachedData = updatedData;
          this.lastReadTime = Date.now();

          // Write to file
          await fs.promises.writeFile(meetingsFilePath, JSON.stringify(updatedData, null, 2));
        }

        // Resolve the operation's promise
        nextOp.resolve({ success: true });
      } catch (opError) {
        console.error('Error in file operation:', opError);
        nextOp.reject(opError);
      }
    } catch (error) {
      console.error('Error in file operation manager:', error);

      // If there was an operation that failed, reject its promise
      if (this.pendingOperations.length > 0) {
        const failedOp = this.pendingOperations.shift();
        failedOp.reject(error);
      }
    } finally {
      this.isProcessing = false;

      // Check if more operations were added while we were processing
      if (this.pendingOperations.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  },

  // Helper to write data directly - internally uses scheduleOperation
  writeData: async function(data) {
    return this.scheduleOperation(() => data); // Simply return the data to write
  }
};

// API configuration for Recall.ai
const RECALLAI_API_URL = process.env.RECALLAI_API_URL || 'https://api.recall.ai';
const RECALLAI_API_KEY = process.env.RECALLAI_API_KEY;

// Create a desktop SDK upload token
async function createDesktopSdkUpload() {
  try {
    console.log(`Creating upload token with API key: ${RECALLAI_API_KEY}`);

    if (!RECALLAI_API_KEY) {
      console.error("RECALLAI_API_KEY is missing! Set it in .env file");
      return null;
    }

    const url = `${RECALLAI_API_URL}/api/v1/sdk-upload/`;

    const response = await axios.post(url, {
      recording_config: {
        transcript: {
          provider: {
            deepgram_streaming: {
              "model": "nova-3",
              "version": "latest",
              "language": "en-US",
              "punctuate": true,
              "filler_words": false,
              "profanity_filter": false,
              "redact": [],
              "diarize": true,
              "smart_format": true,
              "interim_results": false
            }
          }
        },
        realtime_endpoints: [
          {
            type: "desktop-sdk-callback",
            events: [
              "participant_events.join",
              "video_separate_png.data",
              "transcript.data",
              "transcript.provider_data"
            ]
          },
        ],
      }
    }, {
      headers: { 'Authorization': `Token ${RECALLAI_API_KEY}` },
      timeout: 9000,
    });

    console.log("Upload token created successfully:", response.data.upload_token);
    return response.data;
  } catch (error) {
    console.error("Error creating upload token:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
    }
    return null;
  }
}

// Initialize the Recall.ai SDK
function initSDK() {
  console.log("Initializing Recall.ai SDK");

  // Log the SDK initialization
  sdkLogger.logApiCall('init', {
    dev: process.env.NODE_ENV === 'development',
    api_url: RECALLAI_API_URL,
    config: {
      recording_path: RECORDING_PATH
    }
  });

  RecallAiSdk.init({
    // dev: true,
    api_url: RECALLAI_API_URL,
    config: {
      recording_path: RECORDING_PATH
    }
  });

  // Helper function to send in-app notification - removed, using custom notification window instead
  const sendInAppNotification = (platformName) => {
    // No longer used - custom notification window handles all notifications
  };

  // Check if a detected meeting window is part of a calendar meeting
  const checkIfMeetingIsOnCalendar = (meetingWindow) => {
    if (!calendarService) return false;

    // Get current time
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Get current or imminent meetings (starting within 5 minutes)
    const currentMeeting = calendarService.getCurrentMeeting();
    const upcomingMeetings = calendarService.getMeetingsInTimeRange(fiveMinutesAgo, fiveMinutesFromNow);

    // Check if any calendar meeting matches the detected platform and is happening now or soon
    const relevantMeetings = currentMeeting ? [currentMeeting, ...upcomingMeetings] : upcomingMeetings;

    for (const meeting of relevantMeetings) {
      // Check if meeting has a video URL that matches the platform
      if (meeting.videoMeetingUrl) {
        const url = meeting.videoMeetingUrl.toLowerCase();
        const platform = meetingWindow.platform.toLowerCase();

        // Check for platform matches
        if ((platform === 'zoom' && url.includes('zoom')) ||
            (platform === 'google-meet' && url.includes('meet.google')) ||
            (platform === 'teams' && url.includes('teams.microsoft')) ||
            (platform === 'webex' && url.includes('webex'))) {
          console.log(`Detected meeting matches calendar meeting: ${meeting.title}`);
          return true;
        }
      }
    }

    return false;
  };

  // Helper function to handle meeting detection
  const handleMeetingDetected = async (evt) => {
    console.log("Meeting detected:", evt);

    // Log the meeting detected event
    sdkLogger.logEvent('meeting-detected', {
      platform: evt.window.platform,
      windowId: evt.window.id
    });

    detectedMeeting = {
      ...evt,
      detectedAt: Date.now()
    };

    // Map platform codes to readable names
    const platformNames = {
      'zoom': 'Zoom',
      'google-meet': 'Google Meet',
      'teams': 'Microsoft Teams',
      'webex': 'Webex',
      'gotomeeting': 'GoToMeeting',
      'bluejeans': 'BlueJeans',
      'whereby': 'Whereby'
    };

    // Get the platform name or use the raw value
    const platformName = platformNames[evt.window.platform] || evt.window.platform;

    // Send the meeting detection status to the renderer process
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('meeting-detection-status', {
        detected: true,
        platform: platformName,
        windowId: evt.window.id
      });
    }

    // Also send the detected meeting event
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('meeting-detected', evt);
    }

    // Create a unique session key for this meeting (platform + window ID)
    // This persists for the entire meeting lifecycle, not just the recording
    const meetingSessionKey = `${evt.window.platform}-${evt.window.id}`;

    // CRITICAL: Check if this detected meeting correlates with an active calendar recording
    const correlation = correlateWithCalendarRecording(evt.window);
    console.log('[CORRELATION CHECK] Result:', correlation ? `Found match for ${correlation.calendarMeeting.title}` : 'No match found');
    console.log('[CORRELATION CHECK] Active calendar recordings:', activeCalendarRecordings.size, 'recordings');

    if (correlation) {
      console.log(`Detected meeting correlates with calendar recording: ${correlation.calendarMeeting.title}`);

      // Don't show duplicate notification - we already have a recording running
      handledMeetingSessions.add(meetingSessionKey);

      // Switch from audio to video recording (keep same note, just update recording source)
      try {
        await switchToVideoRecording(
          correlation.recordingId,
          evt.window.id,
          correlation.calendarMeeting.meetingId,
          correlation.calendarMeeting.uploadToken
        );

        console.log('Successfully switched to video recording');

        // Show a brief notification about the switch
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('show-toast', {
            message: `Switched to video recording for ${correlation.calendarMeeting.title}`,
            type: 'success'
          });
        }
      } catch (error) {
        console.error('[SWITCH FATAL ERROR] Failed to switch to video recording:', error);
        console.error('[SWITCH FATAL ERROR] Stack trace:', error.stack);

        // Show error to user
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('show-toast', {
            message: `Failed to start video recording: ${error.message}`,
            type: 'error'
          });
        }
      }

      return; // Don't show notification or do further processing
    }

    // Check if this meeting is already on the calendar (legacy check)
    const isCalendarMeeting = checkIfMeetingIsOnCalendar(evt.window);

    // Only show notification if we haven't handled this meeting session yet AND it's not a calendar meeting
    if (!handledMeetingSessions.has(meetingSessionKey) && !isCalendarMeeting) {
      console.log(`First detection for ad-hoc meeting session ${meetingSessionKey}, showing notification`);
      handledMeetingSessions.add(meetingSessionKey);
      createNotificationWindow({
        title: `${platformName} Meeting Detected`,
        body: 'Click to start recording.',
        platform: platformName,
        actionText: 'Start Recording'
      });
    } else if (isCalendarMeeting) {
      console.log(`Meeting session ${meetingSessionKey} is a calendar meeting, skipping ad-hoc notification`);
      // Still add to handled sessions to prevent future notifications
      handledMeetingSessions.add(meetingSessionKey);
    } else {
      console.log(`Meeting session ${meetingSessionKey} already handled, skipping notification`);
    }
  };

  // Listen for meeting detected events
  RecallAiSdk.addEventListener('meeting-detected', async (evt) => {
    // Use handleMeetingDetected which creates the custom notification window
    handleMeetingDetected(evt);

    // Send the meeting detected status to the renderer process
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('meeting-detection-status', { detected: true });
    }
  });

  // Listen for meeting closed events
  RecallAiSdk.addEventListener('meeting-closed', (evt) => {
    console.log("[MEETING-CLOSED] Meeting window closed:", evt.window.id, evt.window.platform);

    // Log the SDK meeting-closed event
    sdkLogger.logEvent('meeting-closed', {
      windowId: evt.window.id,
      platform: evt.window.platform
    });

    // FIRST: Stop any active recording for this meeting window
    // This handles ALL types: switched meetings, auto-detected meetings, and manually started meetings
    const recordingInfo = activeRecordings.getForRecording(evt.window.id);
    if (recordingInfo) {
      console.log(`[MEETING-CLOSED] Stopping active recording for closed window: ${evt.window.id}`);

      try {
        RecallAiSdk.stopRecording({
          windowId: evt.window.id
        });
        console.log(`[MEETING-CLOSED] Stop command sent for recording ${evt.window.id}`);
      } catch (error) {
        console.error(`[MEETING-CLOSED] Error stopping recording ${evt.window.id}:`, error);
      }

      // Don't remove from activeRecordings yet - let recording-ended event handle that
    } else {
      console.log(`[MEETING-CLOSED] No active recording found for window ${evt.window.id}`);
    }

    // Clean up the global tracking when a meeting ends
    if (evt.window && evt.window.id && global.activeMeetingIds && global.activeMeetingIds[evt.window.id]) {
      console.log(`[MEETING-CLOSED] Cleaning up meeting tracking for: ${evt.window.id}`);

      // Check if we need to stop any related calendar recordings (for switched meetings)
      const trackingInfo = global.activeMeetingIds[evt.window.id];
      if (trackingInfo && trackingInfo.noteId) {
        // Find and clean up any calendar recordings for the same meeting
        for (const [recordingId, calendarMeeting] of activeCalendarRecordings) {
          if (calendarMeeting.meetingId === trackingInfo.noteId && recordingId !== evt.window.id) {
            console.log(`[MEETING-CLOSED] Stopping orphaned calendar recording ${recordingId} as video meeting closed`);

            // Stop the audio recording if it's still running
            try {
              RecallAiSdk.stopRecording({
                windowId: recordingId
              });
            } catch (error) {
              console.error(`[MEETING-CLOSED] Error stopping calendar recording ${recordingId}:`, error);
            }

            // Clean up tracking
            const recording = activeCalendarRecordings.get(recordingId);
            if (recording && recording.pollInterval) {
              clearInterval(recording.pollInterval);
            }
            activeCalendarRecordings.delete(recordingId);
            activeRecordings.removeRecording(recordingId);
          }
        }
      }

      delete global.activeMeetingIds[evt.window.id];
    }

    // Clear the session tracking so we can detect this meeting again if it reopens
    if (evt.window && evt.window.id && evt.window.platform) {
      const meetingSessionKey = `${evt.window.platform}-${evt.window.id}`;
      handledMeetingSessions.delete(meetingSessionKey);
      console.log(`[MEETING-CLOSED] Cleared session tracking for: ${meetingSessionKey}`);
    }

    detectedMeeting = null;

    // Send the meeting closed status to the renderer process
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('meeting-detection-status', { detected: false });
    }
  });

  // Listen for recording ended events
  RecallAiSdk.addEventListener('recording-ended', async (evt) => {
    console.log("Recording ended:", evt);
    console.log("[RECORDING-ENDED] Window ID:", evt.window.id);
    console.log("[RECORDING-ENDED] Platform:", evt.window.platform);

    // Log the SDK recording-ended event
    sdkLogger.logEvent('recording-ended', {
      windowId: evt.window.id
    });

    // Check if this recording is being switched - if so, skip upload
    console.log("[RECORDING-ENDED] Recordings being switched:", Array.from(recordingsBeingSwitched));
    if (recordingsBeingSwitched.has(evt.window.id)) {
      console.log(`[SWITCH] Skipping upload for switched recording: ${evt.window.id}`);
      recordingsBeingSwitched.delete(evt.window.id);

      // Still need to remove from activeRecordings even if we skip upload
      activeRecordings.removeRecording(evt.window.id);
      console.log(`[SWITCH] Removed switched recording ${evt.window.id} from activeRecordings`);
      return;
    }

    console.log("[RECORDING-ENDED] Not a switched recording, proceeding with normal cleanup");

    // Clean up calendar recordings tracking if this was a calendar recording
    if (activeCalendarRecordings.has(evt.window.id)) {
      console.log(`Cleaning up calendar recording tracking for: ${evt.window.id}`);
      const recording = activeCalendarRecordings.get(evt.window.id);
      if (recording && recording.pollInterval) {
        clearInterval(recording.pollInterval);
      }
      activeCalendarRecordings.delete(evt.window.id);
    }

    // Get note ID before removing from tracker
    let noteId = null;

    // First, try to find in activeRecordings
    for (const [recId, info] of Object.entries(activeRecordings.recordings)) {
      if (recId === evt.window.id) {
        noteId = info.noteId;
        console.log(`[CLEANUP] Found noteId ${noteId} for recording ${recId} in activeRecordings`);
        break;
      }
    }

    // If not found in activeRecordings, try global.activeMeetingIds
    if (!noteId && global.activeMeetingIds && global.activeMeetingIds[evt.window.id]) {
      noteId = global.activeMeetingIds[evt.window.id].noteId;
      console.log(`[CLEANUP] Found noteId ${noteId} for recording ${evt.window.id} in global.activeMeetingIds`);
    }

    // If still not found, try to find it by searching the meetings file
    if (!noteId) {
      console.log(`[CLEANUP] noteId not found in trackers, searching meetings file for recording ${evt.window.id}`);
      try {
        const meetingsData = await fileOperationManager.readMeetingsData();
        let meeting = meetingsData.pastMeetings.find(m => m.recordingId === evt.window.id);
        if (!meeting) {
          meeting = meetingsData.upcomingMeetings.find(m => m.recordingId === evt.window.id);
        }
        if (meeting) {
          noteId = meeting.id;
          console.log(`[CLEANUP] Found noteId ${noteId} for recording ${evt.window.id} in meetings file`);
        } else {
          console.warn(`[CLEANUP] Could not find meeting with recordingId ${evt.window.id} anywhere`);
        }
      } catch (err) {
        console.error(`[CLEANUP] Error searching for noteId:`, err);
      }
    }

    // Remove from active recordings tracker
    const removed = activeRecordings.removeRecording(evt.window.id);
    console.log(`[CLEANUP] Removed recording ${evt.window.id} from activeRecordings: ${removed}`);

    // Log current state
    console.log('[CLEANUP] Current activeRecordings:', Object.keys(activeRecordings.recordings));

    // Notify renderer that recording has stopped
    if (mainWindow && !mainWindow.isDestroyed() && noteId) {
      console.log(`[CLEANUP] Sending recording-state-change (idle) to renderer for note ${noteId}`);
      mainWindow.webContents.send('recording-state-change', {
        recordingId: evt.window.id,
        state: 'idle',
        noteId: noteId
      });
    } else {
      console.log('[CLEANUP] Not sending recording-state-change:', {
        hasWindow: !!mainWindow,
        isDestroyed: mainWindow?.isDestroyed(),
        hasNoteId: !!noteId
      });
    }

    try {
      // Update the note with recording information
      await updateNoteWithRecordingInfo(evt.window.id);

      // Add a small delay before uploading (good practice for file system operations)
      console.log(`[UPLOAD] Scheduling upload for recording ${evt.window.id} in 3 seconds...`);
      setTimeout(async () => {
        console.log(`[UPLOAD] Starting upload process for recording ${evt.window.id}`);

        // Check if recording file exists for this window ID
        const possibleFilePaths = [
          path.join(RECORDING_PATH, `${evt.window.id}.mp4`),
          path.join(RECORDING_PATH, `macos-desktop-${evt.window.id}.mp4`),
          path.join(RECORDING_PATH, `macos-desktop${evt.window.id}.mp4`),
          path.join(RECORDING_PATH, `desktop-${evt.window.id}.mp4`)
        ];

        let recordingFileExists = false;
        let foundFilePath = null;
        for (const filePath of possibleFilePaths) {
          if (fs.existsSync(filePath)) {
            recordingFileExists = true;
            foundFilePath = filePath;
            const stats = fs.statSync(filePath);
            console.log(`[UPLOAD] Found recording file: ${filePath} (${stats.size} bytes)`);
            break;
          }
        }

        if (!recordingFileExists) {
          console.error(`[UPLOAD ERROR] No recording file found for window ID ${evt.window.id}`);
          console.error(`[UPLOAD ERROR] Checked paths:`, possibleFilePaths);

          // List all files in recording directory to see what's there
          try {
            const allFiles = fs.readdirSync(RECORDING_PATH);
            console.log(`[UPLOAD ERROR] Files in recording directory:`, allFiles);
          } catch (err) {
            console.error(`[UPLOAD ERROR] Could not list recording directory:`, err);
          }
          return;
        }

        try {
          // The SDK should automatically upload using the upload token from startRecording
          // We don't need to provide a new token here
          console.log('[UPLOAD] Initiating upload (SDK will use token from startRecording)');

          // Log the uploadRecording API call
          sdkLogger.logApiCall('uploadRecording', {
            windowId: evt.window.id
          });

          RecallAiSdk.uploadRecording({
            windowId: evt.window.id
          });
          console.log('[UPLOAD] Upload initiated with SDK for file:', foundFilePath);
        } catch (uploadError) {
          console.error('[UPLOAD ERROR] Error during upload:', uploadError);
          console.error('[UPLOAD ERROR] Error details:', uploadError.message, uploadError.stack);
        }
      }, 3000); // Wait 3 seconds before uploading
    } catch (error) {
      console.error("Error handling recording ended:", error);
    }
  });

  RecallAiSdk.addEventListener('permissions-granted', async(evt) => {
    console.log("PERMISSIONS GRANTED");
  });

  // Track upload progress
  RecallAiSdk.addEventListener('upload-progress', async (evt) => {
    const { progress, window } = evt;
    console.log(`[UPLOAD PROGRESS] ${progress}% for recording: ${window.id}`);

    // Log the SDK upload-progress event
    sdkLogger.logEvent('upload-progress', {
      windowId: window.id,
      progress
    });

    // When upload completes, fetch the video URL from Recall
    if (progress === 100) {
      console.log(`[UPLOAD COMPLETE] Upload completed for recording: ${window.id}`);

      // Wait a bit for Recall to process the upload
      setTimeout(async () => {
        try {
          // Find the meeting associated with this recording
          const meetingsData = await fileOperationManager.readMeetingsData();
          let meeting = meetingsData.pastMeetings.find(m => m.recordingId === window.id);
          let meetingsArray = meetingsData.pastMeetings;

          if (!meeting) {
            meeting = meetingsData.upcomingMeetings.find(m => m.recordingId === window.id);
            meetingsArray = meetingsData.upcomingMeetings;
          }

          if (meeting && meeting.calendarEventId) {
            console.log(`[UPLOAD COMPLETE] Fetching video URL from API for meeting: ${meeting.calendarEventId}`);

            try {
              const videoData = await apiService.getMeetingVideoUrl(meeting.calendarEventId);

              if (videoData && videoData.url) {
                console.log(`[UPLOAD COMPLETE] Got video URL from API: ${videoData.url}`);

                // Update meeting with the Recall video URL
                meeting.recallVideoUrl = videoData.url;
                meeting.videoSource = 'recall';

                // Clear local video path since we have the Recall URL now
                delete meeting.videoPath;

                await fileOperationManager.writeData(meetingsData);

                // Notify renderer to refresh the video player
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('video-url-updated', {
                    meetingId: meeting.id,
                    videoUrl: videoData.url
                  });
                }

                console.log(`[UPLOAD COMPLETE] Updated meeting with Recall video URL`);
              } else {
                console.warn(`[UPLOAD COMPLETE] No video URL in API response for meeting ${meeting.calendarEventId}`);
              }
            } catch (apiError) {
              // API might return 404 if the recording hasn't been processed yet or doesn't exist
              // This is expected for new recordings - the backend needs to be updated with the recording metadata
              console.log(`[UPLOAD COMPLETE] Could not fetch video URL from API (${apiError.message}). Recording will be available locally.`);
            }
          } else {
            console.log(`[UPLOAD COMPLETE] Meeting does not have calendarEventId, skipping video URL fetch`);
          }
        } catch (error) {
          console.error(`[UPLOAD COMPLETE] Error fetching video URL from API:`, error);
        }
      }, 10000); // Wait 10 seconds for Recall to process
    }
  });

  // Track SDK state changes
  RecallAiSdk.addEventListener('sdk-state-change', async (evt) => {
    const { sdk: { state: { code } }, window } = evt;
    console.log("Recording state changed:", code, "for window:", window?.id);

    // Log the SDK sdk-state-change event
    sdkLogger.logEvent('sdk-state-change', {
      state: code,
      windowId: window?.id
    });

    // Update recording state in our global tracker
    if (window && window.id) {
      // Get the meeting note ID associated with this window
      let noteId = null;
      if (global.activeMeetingIds && global.activeMeetingIds[window.id]) {
        noteId = global.activeMeetingIds[window.id].noteId;
      }

      // Check if this is a pending switch - if so, register it
      if (!noteId && code === 'recording' && pendingSwitches.size > 0) {
        for (const [meetingId, switchInfo] of pendingSwitches.entries()) {
          if (switchInfo.platform === window.platform) {
            console.log('[SWITCH] Matched pending switch:', meetingId, 'to window:', window.id);
            noteId = switchInfo.noteId;
            global.activeMeetingIds[window.id] = {
              platformName: window.platform,
              noteId: noteId
            };
            pendingSwitches.delete(meetingId);

            // Update the meeting's recordingId to the actual window ID that started recording
            console.log('[SWITCH] Updating meeting recordingId from previous to:', window.id);
            (async () => {
              try {
                const meetingsData = await fileOperationManager.readMeetingsData();
                let meeting = meetingsData.pastMeetings.find(m => m.id === noteId);
                if (!meeting) {
                  meeting = meetingsData.upcomingMeetings.find(m => m.id === noteId);
                }
                if (meeting) {
                  const oldRecordingId = meeting.recordingId;
                  meeting.recordingId = window.id;
                  await fileOperationManager.writeData(meetingsData);
                  console.log('[SWITCH] Updated meeting recordingId from', oldRecordingId, 'to', window.id);

                  // Remove ALL recording IDs for this meeting from activeRecordings
                  // This handles cases where Zoom creates multiple window IDs
                  console.log('[SWITCH] Removing all old recording IDs for meeting from activeRecordings');
                  const recordingsToRemove = [];
                  for (const [recId, info] of Object.entries(activeRecordings.recordings)) {
                    if (info.noteId === noteId && recId !== window.id) {
                      recordingsToRemove.push(recId);
                    }
                  }

                  recordingsToRemove.forEach(recId => {
                    console.log('[SWITCH] Removing old recording ID:', recId);
                    activeRecordings.removeRecording(recId);
                  });

                  console.log('[SWITCH] Cleanup complete. Current activeRecordings:', Object.keys(activeRecordings.recordings));
                } else {
                  console.error('[SWITCH] Could not find meeting to update recordingId:', noteId);
                }
              } catch (err) {
                console.error('[SWITCH] Error updating meeting recordingId:', err);
              }
            })();

            break;
          }
        }
      }

      // Update the recording state in our tracker
      if (code === 'recording') {
        console.log('Recording in progress...');
        if (noteId) {
          // If recording started, add it to our active recordings
          activeRecordings.addRecording(window.id, noteId, window.platform || 'unknown');
        }
      } else if (code === 'paused') {
        console.log('Recording paused');
        activeRecordings.updateState(window.id, 'paused');
      } else if (code === 'idle') {
        console.log('Recording stopped');
        activeRecordings.removeRecording(window.id);
      }

      // Notify renderer process about recording state change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('recording-state-change', {
          recordingId: window.id,
          state: code,
          noteId
        });
      }
    }
  });

  // Listen for real-time transcript events
  RecallAiSdk.addEventListener('realtime-event', async (evt) => {
    // Only log non-video frame events to prevent flooding the logger
    if (evt.event !== 'video_separate_png.data') {
      console.log("Received realtime event:", evt.event);

      // Log the SDK realtime-event event
      sdkLogger.logEvent('realtime-event', {
        eventType: evt.event,
        windowId: evt.window?.id
      });
    }

    // Handle different event types
    if (evt.event === 'transcript.data' && evt.data && evt.data.data) {
      await processTranscriptData(evt);
    }
    else if (evt.event === 'transcript.provider_data' && evt.data && evt.data.data) {
      await processTranscriptProviderData(evt);
    }
    else if (evt.event === 'participant_events.join' && evt.data && evt.data.data) {
      await processParticipantJoin(evt);
    }
    else if (evt.event === 'video_separate_png.data' && evt.data && evt.data.data) {
      await processVideoFrame(evt);
    }
  });

  // Handle errors
  RecallAiSdk.addEventListener('error', async (evt) => {
    console.error("RecallAI SDK Error:", evt);
    const { type, message } = evt;

    // Log the SDK error event
    sdkLogger.logEvent('error', {
      errorType: type,
      errorMessage: message
    });

    // Show notification for errors
    let notification = new Notification({
      title: 'Recording Error',
      body: `Error: ${type} - ${message}`
    });
    notification.show();
  });
}

// Handle saving meetings data
ipcMain.handle('saveMeetingsData', async (event, data) => {
  try {
    // Use the file operation manager to safely write the file
    await fileOperationManager.writeData(data);
    return { success: true };
  } catch (error) {
    console.error('Failed to save meetings data:', error);
    return { success: false, error: error.message };
  }
});

// Handler to get video file as base64 data URL for playback
ipcMain.handle('getVideoFile', async (event, videoPath) => {
  try {
    if (!videoPath || !fs.existsSync(videoPath)) {
      return { success: false, error: 'Video file not found' };
    }

    // Check file size - if too large (>50MB), don't load to prevent crash
    const stats = fs.statSync(videoPath);
    const fileSizeInMB = stats.size / (1024 * 1024);

    if (fileSizeInMB > 50) {
      console.warn(`Video file too large (${fileSizeInMB.toFixed(2)}MB) - skipping base64 encoding to prevent crash`);
      return { success: false, error: `Video file too large (${fileSizeInMB.toFixed(2)}MB). Video is uploading to cloud - please wait and refresh.` };
    }

    console.log(`Loading video file: ${videoPath} (${fileSizeInMB.toFixed(2)}MB)`);

    // Read the video file as a buffer
    const videoBuffer = fs.readFileSync(videoPath);

    // Convert to base64 data URL
    const base64Video = videoBuffer.toString('base64');
    const dataUrl = `data:video/mp4;base64,${base64Video}`;

    return { success: true, dataUrl };
  } catch (error) {
    console.error('Failed to load video file:', error);
    return { success: false, error: error.message };
  }
});

// Debug handler to check if IPC handlers are registered
ipcMain.handle('debugGetHandlers', async () => {
  console.log("Checking registered IPC handlers...");
  const handlers = Object.keys(ipcMain._invokeHandlers);
  console.log("Registered handlers:", handlers);
  return handlers;
});

// Handler to get active recording ID for a note
ipcMain.handle('getActiveRecordingId', async (event, noteId) => {
  console.log(`[getActiveRecordingId] Called for note: ${noteId}`);
  console.log('[getActiveRecordingId] Current activeRecordings:', Object.keys(activeRecordings.recordings));

  try {
    // If noteId is provided, get recording for that specific note
    if (noteId) {
      const recordingInfo = activeRecordings.getForNote(noteId);
      console.log(`[getActiveRecordingId] Recording info for note ${noteId}:`, recordingInfo);
      return {
        success: true,
        data: recordingInfo
      };
    }

    // Otherwise return all active recordings
    const allRecordings = activeRecordings.getAll();
    console.log('[getActiveRecordingId] All active recordings:', allRecordings);
    return {
      success: true,
      data: allRecordings
    };
  } catch (error) {
    console.error('Error getting active recording ID:', error);
    return { success: false, error: error.message };
  }
});

// Handle deleting a meeting
ipcMain.handle('deleteMeeting', async (event, meetingId) => {
  try {
    console.log(`Deleting meeting with ID: ${meetingId}`);

    // Read current data
    const fileData = await fs.promises.readFile(meetingsFilePath, 'utf8');
    const meetingsData = JSON.parse(fileData);

    // Find the meeting
    const pastMeetingIndex = meetingsData.pastMeetings.findIndex(meeting => meeting.id === meetingId);
    const upcomingMeetingIndex = meetingsData.upcomingMeetings.findIndex(meeting => meeting.id === meetingId);

    let meetingDeleted = false;
    let recordingId = null;

    // Remove from past meetings if found
    if (pastMeetingIndex !== -1) {
      // Store the recording ID for later cleanup if needed
      recordingId = meetingsData.pastMeetings[pastMeetingIndex].recordingId;

      // Remove the meeting
      meetingsData.pastMeetings.splice(pastMeetingIndex, 1);
      meetingDeleted = true;
    }

    // Remove from upcoming meetings if found
    if (upcomingMeetingIndex !== -1) {
      // Store the recording ID for later cleanup if needed
      recordingId = meetingsData.upcomingMeetings[upcomingMeetingIndex].recordingId;

      // Remove the meeting
      meetingsData.upcomingMeetings.splice(upcomingMeetingIndex, 1);
      meetingDeleted = true;
    }

    if (!meetingDeleted) {
      return { success: false, error: 'Meeting not found' };
    }

    // Save the updated data
    await fileOperationManager.writeData(meetingsData);

    // If the meeting had a recording, cleanup the reference in the global tracking
    if (recordingId && global.activeMeetingIds && global.activeMeetingIds[recordingId]) {
      console.log(`Cleaning up tracking for deleted meeting with recording ID: ${recordingId}`);
      delete global.activeMeetingIds[recordingId];
    }

    console.log(`Successfully deleted meeting: ${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting meeting:', error);
    return { success: false, error: error.message };
  }
});

// Handle generating AI summary for a meeting (non-streaming)
ipcMain.handle('generateMeetingSummary', async (event, meetingId) => {
  try {
    console.log(`Manual summary generation requested for meeting: ${meetingId}`);

    // Read current data
    const fileData = await fs.promises.readFile(meetingsFilePath, 'utf8');
    const meetingsData = JSON.parse(fileData);

    // Find the meeting
    const pastMeetingIndex = meetingsData.pastMeetings.findIndex(meeting => meeting.id === meetingId);

    if (pastMeetingIndex === -1) {
      return { success: false, error: 'Meeting not found' };
    }

    const meeting = meetingsData.pastMeetings[pastMeetingIndex];

    // Check if there's a transcript to summarize
    if (!meeting.transcript || meeting.transcript.length === 0) {
      return {
        success: false,
        error: 'No transcript available for this meeting'
      };
    }

    // Log summary generation to console instead of showing a notification
    console.log('Generating AI summary for meeting: ' + meetingId);

    // Generate the summary
    const summary = await generateMeetingSummary(meeting);

    // Get meeting title for use in the new content
    const meetingTitle = meeting.title || "Meeting Notes";

    // Get recording ID
    const recordingId = meeting.recordingId;

    // Check for different possible video file patterns
    const possibleFilePaths = recordingId ? [
      path.join(RECORDING_PATH, `${recordingId}.mp4`),
      path.join(RECORDING_PATH, `macos-desktop-${recordingId}.mp4`),
      path.join(RECORDING_PATH, `macos-desktop${recordingId}.mp4`),
      path.join(RECORDING_PATH, `desktop-${recordingId}.mp4`)
    ] : [];

    // Find the first video file that exists
    let videoExists = false;
    let videoFilePath = null;

    try {
      for (const filePath of possibleFilePaths) {
        if (fs.existsSync(filePath)) {
          videoExists = true;
          videoFilePath = filePath;
          console.log(`Found video file at: ${videoFilePath}`);
          break;
        }
      }
    } catch (err) {
      console.error('Error checking for video files:', err);
    }

    // Save AI summary to dedicated field
    meeting.aiSummary = summary;

    // For backward compatibility, keep content field with personal notes
    if (meeting.personalNotes) {
      meeting.content = meeting.personalNotes;
    }

    // If video exists, store the path separately but don't add it to the content
    if (videoExists) {
      meeting.videoPath = videoFilePath; // Store the path for future reference
      console.log(`Stored video path in meeting object: ${videoFilePath}`);
    } else {
      console.log('Video file not found or no recording ID');
    }

    meeting.hasSummary = true;

    // Save the updated data with summary
    await fileOperationManager.writeData(meetingsData);

    console.log('Updated meeting note with AI summary');

    // Notify the renderer to refresh the note if it's open
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('summary-generated', meetingId);
    }

    return {
      success: true,
      summary
    };
  } catch (error) {
    console.error('Error generating meeting summary:', error);
    return { success: false, error: error.message };
  }
});

// Handle starting a manual desktop recording
ipcMain.handle('startManualRecording', async (event, meetingId) => {
  try {
    console.log(`Starting manual desktop recording for meeting: ${meetingId}`);

    // Read current data
    const fileData = await fs.promises.readFile(meetingsFilePath, 'utf8');
    const meetingsData = JSON.parse(fileData);

    // Find the meeting in both past and upcoming meetings
    let meeting = meetingsData.pastMeetings.find(m => m.id === meetingId);
    let meetingList = meetingsData.pastMeetings;

    if (!meeting) {
      meeting = meetingsData.upcomingMeetings.find(m => m.id === meetingId);
      meetingList = meetingsData.upcomingMeetings;
    }

    if (!meeting) {
      console.error(`Meeting not found with ID: ${meetingId}`);
      console.log('Available past meetings:', meetingsData.pastMeetings.map(m => m.id));
      console.log('Available upcoming meetings:', meetingsData.upcomingMeetings.map(m => m.id));
      return { success: false, error: 'Meeting not found' };
    }

    // SCENARIO 2: Check if video meeting is already detected and running
    const extractedPlatform = extractPlatformFromUrl(meeting.videoMeetingUrl);
    if (extractedPlatform) {
      const existingVideoMeeting = checkForActiveVideoMeeting(extractedPlatform);

      if (existingVideoMeeting) {
        console.log(`Found active ${extractedPlatform} meeting already running, starting directly in video mode`);

        // Start directly in video mode using the existing createMeetingNoteAndRecord function
        const platformNames = {
          'zoom': 'Zoom',
          'google-meet': 'Google Meet',
          'teams': 'Microsoft Teams',
          'webex': 'Webex',
          'gotomeeting': 'GoToMeeting',
          'bluejeans': 'BlueJeans',
          'whereby': 'Whereby'
        };
        const platformName = platformNames[extractedPlatform] || extractedPlatform;

        const noteId = await createMeetingNoteAndRecord(platformName, meeting);

        // IMPORTANT: Track this as a calendar recording so it can be switched if needed
        // This handles the case where user has Zoom open, starts recording, then a NEW Zoom window appears
        activeCalendarRecordings.set(existingVideoMeeting.id, {
          meetingId: noteId,
          title: meeting.title || '',
          startTime: meeting.startTime || meeting.date,
          endTime: meeting.endTime,
          videoUrl: meeting.videoMeetingUrl || '',
          platform: extractedPlatform,
          audioOnly: false, // This is a video recording
          uploadToken: null // Will be created in createMeetingNoteAndRecord
        });
        console.log('[TRACKING] Added direct video recording to calendar recordings for potential switching');

        return {
          success: true,
          recordingId: existingVideoMeeting.id,
          noteId: noteId,
          message: 'Started video recording'
        };
      }
    }

    try {
      // Prepare desktop audio recording - this is the key difference from our previous implementation
      // It returns a key that we use as the window ID

      // Log the prepareDesktopAudioRecording API call
      sdkLogger.logApiCall('prepareDesktopAudioRecording');

      const key = await RecallAiSdk.prepareDesktopAudioRecording();
      console.log('Prepared desktop audio recording with key:', key);

      // Create a recording token
      const uploadData = await createDesktopSdkUpload();
      if (!uploadData || !uploadData.upload_token) {
        return { success: false, error: 'Failed to create recording token' };
      }

      // Store the recording ID in the meeting
      meeting.recordingId = key;

      // Initialize transcript array if not present
      if (!meeting.transcript) {
        meeting.transcript = [];
      }

      // Store tracking info for the recording
      global.activeMeetingIds = global.activeMeetingIds || {};
      global.activeMeetingIds[key] = {
        platformName: 'Desktop Recording',
        noteId: meetingId
      };

      // Register the recording in our active recordings tracker
      activeRecordings.addRecording(key, meetingId, 'Desktop Recording');

      // Track this as an active calendar recording for correlation with video meetings
      const extractedPlatform = extractPlatformFromUrl(meeting.videoMeetingUrl);
      console.log('[TRACKING] Extracted platform:', extractedPlatform, 'from URL:', meeting.videoMeetingUrl);

      activeCalendarRecordings.set(key, {
        meetingId: meetingId,
        title: meeting.title || '',
        startTime: meeting.startTime || meeting.date,
        endTime: meeting.endTime,
        videoUrl: meeting.videoMeetingUrl || '',
        platform: extractedPlatform,
        audioOnly: true,
        uploadToken: uploadData.upload_token
      });
      console.log('Tracking calendar recording:', {
        key,
        meetingId,
        title: meeting.title,
        videoUrl: meeting.videoMeetingUrl,
        extractedPlatform,
        startTime: meeting.startTime || meeting.date,
        endTime: meeting.endTime
      });
      console.log('[TRACKING] Total active calendar recordings:', activeCalendarRecordings.size);

      // Note: We rely on Recall SDK's meeting-detected event for video meeting detection
      // The event fires automatically when the user joins a video meeting (Zoom, Google Meet, etc.)
      // The correlation logic in handleMeetingDetected will automatically switch to video recording
      console.log('Calendar recording tracked - will auto-switch to video if Zoom meeting is joined');

      // Save the updated data
      await fileOperationManager.writeData(meetingsData);

      // Start recording with the key from prepareDesktopAudioRecording
      console.log('Starting desktop recording with key:', key);

      // Log the startRecording API call
      sdkLogger.logApiCall('startRecording', {
        windowId: key,
        uploadToken: `${uploadData.upload_token.substring(0, 8)}...` // Log truncated token for security
      });

      RecallAiSdk.startRecording({
        windowId: key,
        uploadToken: uploadData.upload_token
      });

      return {
        success: true,
        recordingId: key
      };
    } catch (sdkError) {
      console.error('RecallAI SDK error:', sdkError);
      return { success: false, error: 'Failed to prepare desktop recording: ' + sdkError.message };
    }
  } catch (error) {
    console.error('Error starting manual recording:', error);
    return { success: false, error: error.message };
  }
});

// Handle generating summary (stops recording and triggers summary generation)
async function handleGenerateSummary(recordingId) {
  try {
    console.log(`[STOP] Generating summary for recording: ${recordingId}`);
    console.log('[STOP] Current activeRecordings:', Object.keys(activeRecordings.recordings));

    // Clean up calendar recording tracking if applicable
    if (activeCalendarRecordings.has(recordingId)) {
      console.log(`Cleaning up calendar recording tracking for: ${recordingId}`);
      const recording = activeCalendarRecordings.get(recordingId);
      if (recording && recording.pollInterval) {
        clearInterval(recording.pollInterval);
        console.log('Cleared poll interval for calendar recording');
      }
      activeCalendarRecordings.delete(recordingId);
    }

    // Check if this recording ID exists in activeRecordings
    const recordingInfo = activeRecordings.recordings[recordingId];
    if (!recordingInfo) {
      console.warn(`[STOP] Recording ${recordingId} not found in activeRecordings!`);
      console.warn('[STOP] This might be an old/stale recording ID');

      // Try to find the actual active recording for this meeting
      // First, find which meeting this recordingId belongs to
      const meetingsData = await fileOperationManager.readMeetingsData();
      let meeting = meetingsData.pastMeetings.find(m => m.recordingId === recordingId);
      if (!meeting) {
        meeting = meetingsData.upcomingMeetings.find(m => m.recordingId === recordingId);
      }

      if (meeting) {
        console.log(`[STOP] Found meeting: ${meeting.title} (${meeting.id})`);
        // Check if there's a different active recording for this meeting
        const actualRecording = activeRecordings.getForNote(meeting.id);
        if (actualRecording && actualRecording.recordingId !== recordingId) {
          console.log(`[STOP] Found actual active recording: ${actualRecording.recordingId}`);
          console.log(`[STOP] Switching to stop the actual recording instead of ${recordingId}`);
          recordingId = actualRecording.recordingId;
        }
      }
    }

    // Stop the recording - using the windowId property as shown in the reference

    // Log the stopRecording API call
    sdkLogger.logApiCall('stopRecording', {
      windowId: recordingId
    });

    // Update our active recordings tracker
    activeRecordings.updateState(recordingId, 'stopping');

    // Get the note ID for this recording
    let noteId = null;
    for (const [recId, info] of Object.entries(activeRecordings.recordings)) {
      if (recId === recordingId) {
        noteId = info.noteId;
        break;
      }
    }

    console.log(`[STOP] Calling SDK stopRecording for: ${recordingId}`);

    // Notify renderer immediately that we're stopping
    if (mainWindow && !mainWindow.isDestroyed() && noteId) {
      mainWindow.webContents.send('recording-state-change', {
        recordingId: recordingId,
        state: 'stopping',
        noteId: noteId
      });
    }

    RecallAiSdk.stopRecording({
      windowId: recordingId
    });

    console.log(`[STOP] SDK stopRecording called for: ${recordingId}`);

    // The recording-ended event will be triggered automatically,
    // which will handle uploading and generating the summary

    // However, also trigger updateNoteWithRecordingInfo directly as a fallback
    // in case the recording-ended event doesn't fire (e.g., very short recordings)
    setTimeout(async () => {
      console.log('Fallback: Triggering updateNoteWithRecordingInfo after 2 seconds');
      await updateNoteWithRecordingInfo(recordingId);

      // Send final idle state to renderer
      if (mainWindow && !mainWindow.isDestroyed() && noteId) {
        mainWindow.webContents.send('recording-state-change', {
          recordingId: recordingId,
          state: 'idle',
          noteId: noteId
        });
      }
    }, 2000);

    return { success: true };
  } catch (error) {
    console.error('Error generating summary:', error);
    return { success: false, error: error.message };
  }
}

ipcMain.handle('generateSummary', async (event, recordingId) => {
  return handleGenerateSummary(recordingId);
});

// Debug handler to check active calendar recordings
ipcMain.handle('debug-get-active-calendar-recordings', async () => {
  const recordings = Array.from(activeCalendarRecordings.entries()).map(([id, data]) => ({
    recordingId: id,
    ...data
  }));
  console.log('Active calendar recordings:', recordings);
  return recordings;
});

// Test notification handler
ipcMain.handle('testNotification', async () => {
  console.log('Testing notification...');

  // Test custom notification window
  createNotificationWindow({
    title: '🔔 Test Notification',
    body: 'This is a custom notification window test!',
    platform: 'TEST',
    actionText: 'Test Action'
  });

  // Comment out native notification for now - only use custom window
  /*
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: '🔔 Test Notification',
      subtitle: 'Nex Meeting Recorder', // macOS-specific
      body: 'If you see this, notifications are working!',
      silent: false,
      urgency: 'critical',
      timeoutType: 'never', // Keep visible until dismissed
      closeButtonText: 'OK' // macOS-specific
    });

    // Store reference to prevent garbage collection
    global.testNotification = notification;

    notification.on('show', () => {
      console.log('Test notification shown successfully');

      // Make the dock icon bounce on macOS
      if (app.dock) {
        app.dock.bounce('informational');
      }
    });

    notification.on('failed', (event, error) => {
      console.error('Test notification failed:', error);
    });

    notification.on('click', () => {
      console.log('Test notification clicked');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    notification.show();
    return { success: true, message: 'Notification sent' };
  } else {
    return { success: false, message: 'Notifications not supported' };
  }
  */

  return { success: true, message: 'Custom notification window shown' };
});

// Handle generating AI summary with streaming
// Handler to trigger summary generation using the same path as recording completion
ipcMain.handle('triggerSummaryGeneration', async (event, meetingId) => {
  try {
    console.log(`Manual summary generation triggered for meeting: ${meetingId}`);

    // Read current data to get the recording ID
    const fileData = await fs.promises.readFile(meetingsFilePath, 'utf8');
    const meetingsData = JSON.parse(fileData);

    // Find the meeting
    const meeting = [...meetingsData.pastMeetings, ...meetingsData.upcomingMeetings]
      .find(m => m.id === meetingId);

    if (!meeting) {
      return { success: false, error: 'Meeting not found' };
    }

    if (!meeting.recordingId) {
      return { success: false, error: 'No recording ID found for this meeting' };
    }

    // Call the exact same function that stop recording uses
    await updateNoteWithRecordingInfo(meeting.recordingId);

    return { success: true };
  } catch (error) {
    console.error('Error triggering summary generation:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generateMeetingSummaryStreaming', async (event, meetingId) => {
  try {
    console.log(`Streaming summary generation requested for meeting: ${meetingId}`);

    // Read current data
    const fileData = await fs.promises.readFile(meetingsFilePath, 'utf8');
    const meetingsData = JSON.parse(fileData);

    // Find the meeting in both past and upcoming meetings
    let pastMeetingIndex = meetingsData.pastMeetings.findIndex(meeting => meeting.id === meetingId);
    let upcomingMeetingIndex = -1;
    let meeting;
    let meetingList;

    if (pastMeetingIndex !== -1) {
      meeting = meetingsData.pastMeetings[pastMeetingIndex];
      meetingList = 'pastMeetings';
    } else {
      upcomingMeetingIndex = meetingsData.upcomingMeetings.findIndex(meeting => meeting.id === meetingId);
      if (upcomingMeetingIndex !== -1) {
        meeting = meetingsData.upcomingMeetings[upcomingMeetingIndex];
        meetingList = 'upcomingMeetings';
      }
    }

    if (!meeting) {
      return { success: false, error: 'Meeting not found' };
    }

    // Check if there's a transcript to summarize
    if (!meeting.transcript || meeting.transcript.length === 0) {
      return {
        success: false,
        error: 'No transcript available for this meeting'
      };
    }

    // Log summary generation to console instead of showing a notification
    console.log('Generating streaming summary for meeting: ' + meetingId);

    // Get meeting title for use in the new content
    const meetingTitle = meeting.title || "Meeting Notes";

    // Initial placeholder for AI summary
    meeting.aiSummary = "Generating summary...";

    // Update the note on the frontend right away
    mainWindow.webContents.send('summary-update', {
      meetingId,
      aiSummary: meeting.aiSummary
    });

    // Create progress callback for streaming updates
    const streamProgress = (currentText) => {
      // Update aiSummary with current streaming text
      meeting.aiSummary = currentText;

      // Send immediate update to renderer - don't debounce or delay this
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          // Force immediate send of the update
          mainWindow.webContents.send('summary-update', {
            meetingId,
            aiSummary: meeting.aiSummary,
            timestamp: Date.now() // Add timestamp to ensure uniqueness
          });
        } catch (err) {
          console.error('Error sending streaming update to renderer:', err);
        }
      }
    };

    // Generate summary with streaming
    const summary = await generateMeetingSummary(meeting, streamProgress);

    // Make sure the final AI summary is set correctly
    meeting.aiSummary = summary;
    meeting.hasSummary = true;

    // For backward compatibility, also update the content field (combine personal notes + AI summary)
    if (meeting.personalNotes) {
      meeting.content = meeting.personalNotes; // Keep personal notes in legacy content field
    }

    // Save the updated data with summary
    await fileOperationManager.writeData(meetingsData);

    console.log('Updated meeting note with AI summary (streaming)');

    // Send final summary update with completed flag
    console.log('📤 Sending final summary-update with completed flag for meeting:', meetingId);
    mainWindow.webContents.send('summary-update', {
      meetingId,
      aiSummary: meeting.aiSummary,
      completed: true
    });
    console.log('✅ Final summary-update sent with completed: true');

    // Final notification to renderer
    console.log('🔥 SENDING summary-generated event for meeting:', meetingId);
    mainWindow.webContents.send('summary-generated', meetingId);
    console.log('✅ summary-generated event sent');

    return {
      success: true,
      summary
    };
  } catch (error) {
    console.error('Error generating streaming summary:', error);
    return { success: false, error: error.message };
  }
});

// Handle loading meetings data
ipcMain.handle('loadMeetingsData', async () => {
  try {
    // Use our file operation manager to safely read the data
    const data = await fileOperationManager.readMeetingsData();

    // Return the data
    return {
      success: true,
      data: data
    };
  } catch (error) {
    console.error('Failed to load meetings data:', error);
    return { success: false, error: error.message };
  }
});



// Function to create a new meeting note and start recording
async function createMeetingNoteAndRecord(platformName, calendarMeeting = null) {
  console.log("Creating meeting note for platform:", platformName, calendarMeeting ? "(with calendar metadata)" : "(ad-hoc)");
  try {
    if (!detectedMeeting) {
      console.error('No active meeting detected');
      return;
    }
    console.log("Detected meeting info:", detectedMeeting.window.id, detectedMeeting.window.platform);

    // Store the meeting window ID for later reference with transcript events
    global.activeMeetingIds = global.activeMeetingIds || {};
    global.activeMeetingIds[detectedMeeting.window.id] = { platformName };

    // Read the current meetings data
    let meetingsData;
    try {
      const fileData = await fs.promises.readFile(meetingsFilePath, 'utf8');
      meetingsData = JSON.parse(fileData);
    } catch (error) {
      console.error('Error reading meetings data:', error);
      meetingsData = { upcomingMeetings: [], pastMeetings: [] };
    }

    // Generate a unique ID for the new meeting
    const id = 'meeting-' + Date.now();

    // Current date and time
    const now = new Date();

    // Create a new meeting object
    let newMeeting;

    if (calendarMeeting) {
      // Use calendar meeting metadata
      console.log('Creating note from calendar meeting:', calendarMeeting.title);

      // Remove from upcomingMeetings if it exists there
      meetingsData.upcomingMeetings = meetingsData.upcomingMeetings.filter(m => m.id !== calendarMeeting.id);

      newMeeting = {
        ...calendarMeeting,
        id: id, // Use new ID for the recorded meeting
        recordingId: detectedMeeting.window.id,
        videoRecording: true,
        recordingComplete: false,
        platform: platformName,
        content: calendarMeeting.content || `# ${calendarMeeting.title}\n\nRecording: In Progress...`,
        transcript: [] // Initialize empty transcript array
      };
    } else {
      // Create ad-hoc meeting
      const template = `# ${platformName} Meeting Notes\nRecording: In Progress...`;

      newMeeting = {
        id: id,
        type: 'document',
        title: `${platformName} Meeting - ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        subtitle: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hasDemo: false,
        date: now.toISOString(),
        participants: [],
        content: template,
        recordingId: detectedMeeting.window.id,
        platform: platformName,
        transcript: [] // Initialize an empty array for transcript data
      };
    }

    // Update the active meeting tracking with the note ID
    if (global.activeMeetingIds && global.activeMeetingIds[detectedMeeting.window.id]) {
      global.activeMeetingIds[detectedMeeting.window.id].noteId = id;
    }

    // Register this meeting in our active recordings tracker (even before starting)
    // This ensures the UI knows about it immediately
    activeRecordings.addRecording(detectedMeeting.window.id, id, platformName);

    // Add to pastMeetings
    meetingsData.pastMeetings.unshift(newMeeting);

    // Save the updated data
    console.log(`Saving meeting data to ${meetingsFilePath} with ID: ${id}`);
    await fileOperationManager.writeData(meetingsData);

    // Verify the file was written by reading it back
    try {
      const verifyData = await fs.promises.readFile(meetingsFilePath, 'utf8');
      const parsedData = JSON.parse(verifyData);
      const verifyMeeting = parsedData.pastMeetings.find(m => m.id === id);

      if (verifyMeeting) {
        console.log(`Successfully verified meeting ${id} was saved`);

        // Tell the renderer to open the new note
        if (mainWindow && !mainWindow.isDestroyed()) {
          // We need a significant delay to make sure the file is fully processed and loaded
          // This ensures the renderer has time to process the file and recognize the new meeting
          setTimeout(async () => {
            try {
              // Force a file reload before sending the message
              await fs.promises.readFile(meetingsFilePath, 'utf8');

              console.log(`Sending IPC message to open meeting note: ${id}`);
              mainWindow.webContents.send('open-meeting-note', id);

              // Send another message after 2 seconds as a backup
              setTimeout(() => {
                console.log(`Sending backup IPC message to open meeting note: ${id}`);
                mainWindow.webContents.send('open-meeting-note', id);
              }, 2000);
            } catch (error) {
              console.error('Error before sending open-meeting-note message:', error);
            }
          }, 1500); // Increased delay for safety
        }
      } else {
        console.error(`Meeting ${id} not found in saved data!`);
      }
    } catch (verifyError) {
      console.error('Error verifying saved data:', verifyError);
    }

    // Start recording with upload token
    console.log('Starting recording for meeting:', detectedMeeting.window.id);

    try {
      // Get upload token
      const uploadData = await createDesktopSdkUpload();

      if (!uploadData || !uploadData.upload_token) {
        console.error('Failed to get upload token. Recording without upload token.');

        // Log the startRecording API call (no token fallback)
        sdkLogger.logApiCall('startRecording', {
          windowId: detectedMeeting.window.id
        });

        RecallAiSdk.startRecording({
          windowId: detectedMeeting.window.id
        });
      } else {
        console.log('Starting recording with upload token:', uploadData.upload_token);

        // Log the startRecording API call with upload token
        sdkLogger.logApiCall('startRecording', {
          windowId: detectedMeeting.window.id,
          uploadToken: `${uploadData.upload_token.substring(0, 8)}...` // Log truncated token for security
        });

        RecallAiSdk.startRecording({
          windowId: detectedMeeting.window.id,
          uploadToken: uploadData.upload_token
        });
      }
    } catch (error) {
      console.error('Error starting recording with upload token:', error);

      // Fallback to recording without token

      // Log the startRecording API call (error fallback)
      sdkLogger.logApiCall('startRecording', {
        windowId: detectedMeeting.window.id,
        error: 'Fallback after error'
      });

      RecallAiSdk.startRecording({
        windowId: detectedMeeting.window.id
      });
    }

    return id;
  } catch (error) {
    console.error('Error creating meeting note:', error);
  }
}

// Function to process video frames
async function processVideoFrame(evt) {
  try {
    const windowId = evt.window?.id;
    if (!windowId) {
      console.error("Missing window ID in video frame event");
      return;
    }

    // Check if we have this meeting in our active meetings
    if (!global.activeMeetingIds || !global.activeMeetingIds[windowId]) {
      console.log(`No active meeting found for window ID: ${windowId}`);
      return;
    }

    const noteId = global.activeMeetingIds[windowId].noteId;
    if (!noteId) {
      console.log(`No note ID found for window ID: ${windowId}`);
      return;
    }

    // Extract the video data
    const frameData = evt.data.data;
    if (!frameData || !frameData.buffer) {
      console.log("No video frame data in event");
      return;
    }

    // Get data from the event
    const frameBuffer = frameData.buffer; // base64 encoded PNG
    const frameTimestamp = frameData.timestamp;
    const frameType = frameData.type; // 'webcam' or 'screenshare'
    const participantData = frameData.participant;

    // Extract participant info
    const participantId = participantData?.id;
    const participantName = participantData?.name || 'Unknown';

    // Log minimal info to avoid flooding the console
    // console.log(`Received ${frameType} frame from ${participantName} (ID: ${participantId}) at ${frameTimestamp.absolute}`);

    // Send the frame to the renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('video-frame', {
        noteId,
        participantId,
        participantName,
        frameType,
        buffer: frameBuffer,
        timestamp: frameTimestamp
      });
    }
  } catch (error) {
    console.error('Error processing video frame:', error);
  }
}

// Function to process participant join events
async function processParticipantJoin(evt) {
  try {
    const windowId = evt.window?.id;
    if (!windowId) {
      console.error("Missing window ID in participant join event");
      return;
    }

    // Check if we have this meeting in our active meetings
    if (!global.activeMeetingIds || !global.activeMeetingIds[windowId]) {
      console.log(`No active meeting found for window ID: ${windowId}`);
      return;
    }

    const noteId = global.activeMeetingIds[windowId].noteId;
    if (!noteId) {
      console.log(`No note ID found for window ID: ${windowId}`);
      return;
    }

    // Extract the participant data
    const participantData = evt.data.data.participant;
    if (!participantData) {
      console.log("No participant data in event");
      return;
    }

    const participantName = participantData.name || "Unknown Participant";
    const participantId = participantData.id;
    const isHost = participantData.is_host;
    const platform = participantData.platform;

    console.log(`Participant joined: ${participantName} (ID: ${participantId}, Host: ${isHost})`);

    // Skip "Host" and "Guest" generic names
    if (participantName === "Host" || participantName === "Guest" || participantName.includes("others") || (participantName.split(" ").length > 3)) {
      console.log(`Skipping generic participant name: ${participantName}`);
      return;
    }

    // Use the file operation manager to safely update the meetings data
    await fileOperationManager.scheduleOperation(async (meetingsData) => {
      // Find the meeting note with this ID
      const noteIndex = meetingsData.pastMeetings.findIndex(meeting => meeting.id === noteId);
      if (noteIndex === -1) {
        console.log(`No meeting note found with ID: ${noteId}`);
        return null; // Return null to indicate no changes needed
      }

      // Get the meeting and initialize participants array if needed
      const meeting = meetingsData.pastMeetings[noteIndex];
      if (!meeting.participants) {
        meeting.participants = [];
      }

      // Check if participant already exists (based on ID)
      const existingParticipantIndex = meeting.participants.findIndex(p => p.id === participantId);

      if (existingParticipantIndex !== -1) {
        // Update existing participant
        meeting.participants[existingParticipantIndex] = {
          id: participantId,
          name: participantName,
          isHost: isHost,
          platform: platform,
          joinTime: new Date().toISOString(),
          status: 'active'
        };
      } else {
        // Add new participant
        meeting.participants.push({
          id: participantId,
          name: participantName,
          isHost: isHost,
          platform: platform,
          joinTime: new Date().toISOString(),
          status: 'active'
        });
      }

      console.log(`Added/updated participant data for meeting: ${noteId}`);

      // Notify the renderer if this note is currently being edited
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('participants-updated', noteId);
      }

      // Return the updated data to be written
      return meetingsData;
    });

    console.log(`Processed participant join event for meeting: ${noteId}`);
  } catch (error) {
    console.error('Error processing participant join event:', error);
  }
}

let currentUnknownSpeaker = -1;

async function processTranscriptProviderData(evt) {
  // let speakerId = evt.data.data.payload.
  try {
    if (evt.data.data.data.payload.channel.alternatives[0].words[0].speaker !== undefined) {
      currentUnknownSpeaker = evt.data.data.data.payload.channel.alternatives[0].words[0].speaker;
    }
  } catch (error) {
    // console.error("Error processing provider data:", error);
  }
}

// Function to process transcript data and store it with the meeting note
async function processTranscriptData(evt) {
  try {
    const windowId = evt.window?.id;
    if (!windowId) {
      console.error("Missing window ID in transcript event");
      return;
    }

    // Check if we have this meeting in our active meetings
    if (!global.activeMeetingIds || !global.activeMeetingIds[windowId]) {
      console.log(`No active meeting found for window ID: ${windowId}`);
      return;
    }

    const noteId = global.activeMeetingIds[windowId].noteId;
    if (!noteId) {
      console.log(`No note ID found for window ID: ${windowId}`);
      return;
    }

    // Extract the transcript data
    const words = evt.data.data.words || [];
    if (words.length === 0) {
      return; // No words to process
    }

    // Get speaker information
    let speaker;
    if (evt.data.data.participant?.name && evt.data.data.participant?.name !== "Host" && evt.data.data.participant?.name !== "Guest") {
      speaker = evt.data.data.participant?.name;
    } else if (currentUnknownSpeaker !== -1) {
      speaker = `Speaker ${currentUnknownSpeaker}`;
    } else {
      speaker = "Unknown Speaker";
    }

    // Combine all words into a single text
    const text = words.map(word => word.text).join(" ");

    console.log(`Transcript from ${speaker}: "${text}"`);

    // Use the file operation manager to safely update the meetings data
    await fileOperationManager.scheduleOperation(async (meetingsData) => {
      // Find the meeting note with this ID in both past and upcoming meetings
      let noteIndex = meetingsData.pastMeetings.findIndex(meeting => meeting.id === noteId);
      let meeting;
      let meetingList;

      if (noteIndex !== -1) {
        meeting = meetingsData.pastMeetings[noteIndex];
        meetingList = 'pastMeetings';
      } else {
        noteIndex = meetingsData.upcomingMeetings.findIndex(meeting => meeting.id === noteId);
        if (noteIndex !== -1) {
          meeting = meetingsData.upcomingMeetings[noteIndex];
          meetingList = 'upcomingMeetings';
        }
      }

      if (!meeting) {
        console.log(`No meeting note found with ID: ${noteId} in past or upcoming meetings`);
        return null; // Return null to indicate no changes needed
      }

      // Add the transcript data

      // Initialize transcript array if it doesn't exist
      if (!meeting.transcript) {
        meeting.transcript = [];
      }

      // Add the new transcript entry
      meeting.transcript.push({
        text,
        speaker,
        timestamp: new Date().toISOString()
      });

      console.log(`Added transcript data for meeting: ${noteId}`);

      // Notify the renderer if this note is currently being edited
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('transcript-updated', noteId);
      }

      // Return the updated data to be written
      return meetingsData;
    });

    console.log(`Processed transcript data for meeting: ${noteId}`);
  } catch (error) {
    console.error('Error processing transcript data:', error);
  }
}

// Function to generate AI summary from transcript with streaming support
async function generateMeetingSummary(meeting, progressCallback = null) {
  try {
    if (!meeting.transcript || meeting.transcript.length === 0) {
      console.log('No transcript available to summarize');
      return 'No transcript available to summarize.';
    }

    console.log(`Generating AI summary for meeting: ${meeting.id}`);

    // Format the transcript into a single text for the AI to process
    const transcriptText = meeting.transcript.map(entry =>
      `${entry.speaker}: ${entry.text}`
    ).join('\n');

    // Format detected participants if available
    let participantsText = "";
    if (meeting.participants && meeting.participants.length > 0) {
      participantsText = "Detected participants:\n" + meeting.participants.map(p =>
        `- ${p.name}${p.isHost ? ' (Host)' : ''}`
      ).join('\n');
    }

    // Include personal notes if available
    let personalNotesText = "";
    if (meeting.personalNotes && meeting.personalNotes.trim().length > 0) {
      personalNotesText = "Personal notes from the user:\n" + meeting.personalNotes;
    }

    // Define a system prompt to guide the AI's response with a specific format
    const systemMessage =
      "You are an AI assistant that summarizes meeting transcripts. " +
      "The user may have added personal notes during the meeting - pay special attention to these as they represent key takeaways and important points the user cared about. " +
      "You MUST format your response using the following structure:\n\n" +
      "# Participants\n" +
      "- [List all participants mentioned in the transcript]\n\n" +
      "# Summary\n" +
      "- [Key discussion point 1]\n" +
      "- [Key discussion point 2]\n" +
      "- [Key decisions made]\n" +
      "- [Include any important deadlines or dates mentioned]\n" +
      "- [Incorporate insights from the user's personal notes]\n\n" +
      "# Action Items\n" +
      "- [Action item 1] - [Responsible person if mentioned]\n" +
      "- [Action item 2] - [Responsible person if mentioned]\n" +
      "- [Add any other action items discussed or noted by the user]\n\n" +
      "Stick strictly to this format with these exact section headers. Keep each bullet point concise but informative. " +
      "If the user's personal notes mention specific action items or key points, ensure they are included in the appropriate sections.";

    // Prepare the messages array for the API
    const messages = [
      { role: "system", content: systemMessage },
      { role: "user", content: `Summarize the following meeting transcript with the EXACT format specified in your instructions:
${participantsText ? participantsText + "\n\n" : ""}${personalNotesText ? personalNotesText + "\n\n" : ""}
Transcript:
${transcriptText}` }
    ];

    // If no progress callback provided, use the non-streaming version
    if (!progressCallback) {
      // Call the OpenAI API (via OpenRouter) for summarization (non-streaming)
      const response = await openai.chat.completions.create({
        model: MODELS.PRIMARY, // Use our primary model for a good balance of quality and speed
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
        fallbacks: MODELS.FALLBACKS, // Use our defined fallback models
        transform_to_openai: true, // Ensures consistent response format across models
        route: "fallback" // Automatically use fallbacks if the primary model is unavailable
      });

      // Log which model was actually used
      console.log(`AI summary generated successfully using model: ${response.model}`);

      // Return the generated summary
      return response.choices[0].message.content;
    } else {
      // Use streaming version and accumulate the response
      let fullText = '';

      // Create a streaming request
      const stream = await openai.chat.completions.create({
        model: MODELS.PRIMARY, // Use our primary model for a good balance of quality and speed
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
        stream: true,
        fallbacks: MODELS.FALLBACKS, // Use our defined fallback models
        transform_to_openai: true, // Ensures consistent response format across models
        route: "fallback" // Automatically use fallbacks if the primary model is unavailable
      });

      // Handle streaming events
      return new Promise((resolve, reject) => {
        // Process the stream
        (async () => {
          try {
            // Log the model being used when first chunk arrives (if available)
            let modelLogged = false;

            for await (const chunk of stream) {
              // Log the model on first chunk if available
              if (!modelLogged && chunk.model) {
                console.log(`Streaming with model: ${chunk.model}`);
                modelLogged = true;
              }

              // Extract the text content from the chunk
              const content = chunk.choices[0]?.delta?.content || '';

              if (content) {
                // Add the new text chunk to our accumulated text
                fullText += content;

                // Log each token for debugging (less verbose)
                if (content.length < 50) {
                  console.log(`Received token: "${content}"`);
                } else {
                  console.log(`Received content of length: ${content.length}`);
                }

                // Call the progress callback immediately with each token
                if (progressCallback) {
                  progressCallback(fullText);
                }
              }
            }

            console.log('AI summary streaming completed');
            resolve(fullText);
          } catch (error) {
            console.error('Stream error:', error);
            reject(error);
          }
        })();
      });
    }
  } catch (error) {
    console.error('Error generating meeting summary:', error);

    // Check if it's an OpenRouter/OpenAI specific error
    if (error.status) {
      return `Error generating summary: API returned status ${error.status}: ${error.message}`;
    } else if (error.response) {
      // Handle errors with a response object
      return `Error generating summary: ${error.response.status} - ${error.response.data?.error?.message || error.message}`;
    } else {
      // Default error handling
      return `Error generating summary: ${error.message}`;
    }
  }
}

// Function to update a note with recording information when recording ends
async function updateNoteWithRecordingInfo(recordingId) {
  try {
    console.log(`updateNoteWithRecordingInfo called for recordingId: ${recordingId}`);

    // Check if we've already processed this recording completion
    if (processedRecordingCompletions.has(recordingId)) {
      console.log('Recording completion already processed for:', recordingId);
      return;
    }

    console.log(`Processing recording completion for: ${recordingId}`);

    // Mark this recording as processed IMMEDIATELY to prevent race conditions
    processedRecordingCompletions.add(recordingId);

    // Clean up old entries (keep only last 20 to prevent memory leak)
    if (processedRecordingCompletions.size > 20) {
      const firstEntry = processedRecordingCompletions.values().next().value;
      processedRecordingCompletions.delete(firstEntry);
    }

    // Read the current meetings data using retry logic
    let meetingsData;
    try {
      meetingsData = await fileOperationManager.readMeetingsData();
    } catch (error) {
      console.error('[CRITICAL] Error reading meetings data after retries:', error);
      console.error('[CRITICAL] Failed to read meetings data, cannot update note');
      return;
    }

    // Find the meeting note with this recording ID - check both arrays
    let noteIndex = meetingsData.pastMeetings.findIndex(meeting =>
      meeting.recordingId === recordingId
    );
    let meetingsArray = meetingsData.pastMeetings;

    // If not found in pastMeetings, check upcomingMeetings
    if (noteIndex === -1) {
      noteIndex = meetingsData.upcomingMeetings.findIndex(meeting =>
        meeting.recordingId === recordingId
      );
      if (noteIndex !== -1) {
        meetingsArray = meetingsData.upcomingMeetings;
        console.log('Found recording in upcomingMeetings array');
      }
    }

    if (noteIndex === -1) {
      console.log('No meeting note found for recording ID:', recordingId);
      return;
    }

    // Format current date
    const now = new Date();
    const formattedDate = now.toLocaleString();

    // Update the meeting note content
    const meeting = meetingsArray[noteIndex];
    const content = meeting.content;

    // Replace the "Recording: In Progress..." line with completed information
    let updatedContent = content.replace(
      "Recording: In Progress...",
      `Recording: Completed at ${formattedDate}\n`
    );

    // Update the meeting object
    meeting.content = updatedContent;
    meeting.recordingComplete = true;
    meeting.recordingEndTime = now.toISOString();

    // Save the initial update
    await fileOperationManager.writeData(meetingsData);

    // Always attempt to generate AI summary after recording ends
    // This will be triggered immediately, but if there's no transcript yet,
    // the summary will indicate that
    console.log(`Attempting to generate AI summary for meeting ${meeting.id}...`);

    if (meeting.transcript && meeting.transcript.length > 0) {
      console.log(`Transcript available, generating summary...`);

      // Log summary generation to console instead of showing a notification
      console.log('Generating AI summary for meeting: ' + meeting.id);

      // Get meeting title for use in the new content
      const meetingTitle = meeting.title || "Meeting Notes";

      // Create initial placeholder for AI summary
      meeting.aiSummary = "Generating summary...";

      // Notify any open editors immediately
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('summary-update', {
          meetingId: meeting.id,
          aiSummary: meeting.aiSummary
        });
      }

      // Create progress callback for streaming updates
      const streamProgress = (currentText) => {
        // Update aiSummary with current streaming text
        meeting.aiSummary = currentText;

        // Send immediate update to renderer if note is open
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            mainWindow.webContents.send('summary-update', {
              meetingId: meeting.id,
              aiSummary: meeting.aiSummary,
              timestamp: Date.now() // Add timestamp to ensure uniqueness
            });
          } catch (err) {
            console.error('Error sending streaming update to renderer:', err);
          }
        }
      };

      // Generate the summary with streaming updates
      const summary = await generateMeetingSummary(meeting, streamProgress);

      // Check for different possible video file patterns
      const possibleFilePaths = [
        path.join(RECORDING_PATH, `${recordingId}.mp4`),
        path.join(RECORDING_PATH, `macos-desktop-${recordingId}.mp4`),
        path.join(RECORDING_PATH, `macos-desktop${recordingId}.mp4`),
        path.join(RECORDING_PATH, `desktop-${recordingId}.mp4`)
      ];

      // Find the first video file that exists
      let videoExists = false;
      let videoFilePath = null;

      try {
        for (const filePath of possibleFilePaths) {
          if (fs.existsSync(filePath)) {
            videoExists = true;
            videoFilePath = filePath;
            console.log(`Found video file at: ${videoFilePath}`);
            break;
          }
        }
      } catch (err) {
        console.error('Error checking for video files:', err);
      }

      console.log("Attempting to embed video file", videoFilePath);

      // Save AI summary to dedicated field
      meeting.aiSummary = summary;

      // For backward compatibility, keep content field with personal notes
      if (meeting.personalNotes) {
        meeting.content = meeting.personalNotes;
      }

      // If video exists, store the path separately but don't add it to the content
      if (videoExists) {
        meeting.videoPath = videoFilePath; // Store the path for future reference
        console.log(`Stored video path in meeting object: ${videoFilePath}`);
      } else {
        console.log('Video file not found, continuing without embedding');
      }

      meeting.hasSummary = true;

      // Save the updated data with summary
      await fileOperationManager.writeData(meetingsData);

      console.log('Updated meeting note with AI summary');

      // Notify renderer that summary generation is complete
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('summary-generated', meeting.id);
      }
    } else {
      // No transcript available yet - set a placeholder and save
      console.log('No transcript available for summary generation');
      meeting.aiSummary = 'No transcript available. The recording may not have captured any audio, or transcription is still in progress.';
      meeting.hasSummary = false;

      // Save the updated data
      await fileOperationManager.writeData(meetingsData);

      // Notify the renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('summary-update', {
          meetingId: meeting.id,
          aiSummary: meeting.aiSummary
        });
        // Also send completion event even when no transcript
        mainWindow.webContents.send('summary-generated', meeting.id);
      }
    }

    // If the note is currently open, notify the renderer to refresh it
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('recording-completed', meeting.id);
    }

    // Attempt to fetch Recall video URL if this meeting has a calendar event ID
    if (meeting.calendarEventId) {
      console.log(`[RECALL VIDEO] Attempting to fetch video URL for meeting ${meeting.calendarEventId}`);

      // Wait for Recall to process the recording (30 seconds)
      setTimeout(async () => {
        try {
          console.log(`[RECALL VIDEO] Fetching video URL from API...`);
          const videoData = await apiService.getMeetingVideoUrl(meeting.calendarEventId);

          if (videoData && videoData.url) {
            console.log(`[RECALL VIDEO] Got video URL from API: ${videoData.url}`);

            // Re-read meetings data to get latest state
            const latestMeetingsData = await fileOperationManager.readMeetingsData();
            let latestMeeting = latestMeetingsData.pastMeetings.find(m => m.id === meeting.id);

            if (!latestMeeting) {
              latestMeeting = latestMeetingsData.upcomingMeetings.find(m => m.id === meeting.id);
            }

            if (latestMeeting) {
              // Update meeting with Recall video URL
              latestMeeting.recallVideoUrl = videoData.url;
              latestMeeting.videoSource = 'recall';

              // Clear local video path since we have Recall URL
              delete latestMeeting.videoPath;

              await fileOperationManager.writeData(latestMeetingsData);

              // Notify renderer
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('video-url-updated', {
                  meetingId: meeting.id,
                  videoUrl: videoData.url
                });
              }

              console.log(`[RECALL VIDEO] Updated meeting ${meeting.id} with Recall video URL`);
            }
          } else {
            console.warn(`[RECALL VIDEO] No video URL returned from API for meeting ${meeting.calendarEventId}`);
          }
        } catch (error) {
          console.error(`[RECALL VIDEO] Error fetching video URL:`, error);
        }
      }, 30000); // Wait 30 seconds for Recall to process
    }

    // Ensure recording is removed from active recordings tracker
    console.log(`[updateNoteWithRecordingInfo] Removing recording ${recordingId} from activeRecordings`);
    const removed = activeRecordings.removeRecording(recordingId);
    console.log(`[updateNoteWithRecordingInfo] Removed recording ${recordingId}: ${removed}`);
    console.log('[updateNoteWithRecordingInfo] Current activeRecordings:', Object.keys(activeRecordings.recordings));
  } catch (error) {
    console.error('Error updating note with recording info:', error);
    // Even on error, try to clean up the recording state
    console.log(`[updateNoteWithRecordingInfo ERROR] Removing recording ${recordingId} from activeRecordings`);
    activeRecordings.removeRecording(recordingId);
  }
}

// Function to check if there's a detected meeting available
ipcMain.handle('checkForDetectedMeeting', async () => {
  return detectedMeeting !== null;
});

// Function to join the detected meeting
ipcMain.handle('joinDetectedMeeting', async () => {
  return joinDetectedMeeting();
});

// Function to handle joining a detected meeting
async function joinDetectedMeeting() {
  try {
    console.log("Join detected meeting called");

    if (!detectedMeeting) {
      console.log("No detected meeting available");
      return { success: false, error: "No active meeting detected" };
    }

    // Map platform codes to readable names
    const platformNames = {
      'zoom': 'Zoom',
      'google-meet': 'Google Meet',
      'slack': 'Slack',
      'teams': 'Microsoft Teams'
    };

    // Get a user-friendly platform name, or use the raw platform name if not in our map
    const platformName = platformNames[detectedMeeting.window.platform] || detectedMeeting.window.platform;

    console.log("Joining detected meeting for platform:", platformName);

    // Ensure main window exists and is visible
    if (!mainWindow || mainWindow.isDestroyed()) {
      console.log("Creating new main window");
      createWindow();
    }

    // Bring window to front with focus
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();

    // Process with more reliable timing
    return new Promise((resolve) => {
      // Wait a moment for the window to be fully focused and ready
      setTimeout(async () => {
        console.log("Window is ready, creating new meeting note");

        try {
          // Check if we already have an active note for this meeting
          const existingNote = global.activeMeetingIds &&
                              global.activeMeetingIds[detectedMeeting.window.id] &&
                              global.activeMeetingIds[detectedMeeting.window.id].noteId;

          if (existingNote) {
            console.log("Note already exists for this meeting:", existingNote);
            // Just bring the window to front, don't create a new note
            resolve({ success: true, meetingId: existingNote, existing: true });
          } else {
            // Create a new meeting note and start recording
            const id = await createMeetingNoteAndRecord(platformName);

            console.log("Created new meeting with ID:", id);
            resolve({ success: true, meetingId: id });
          }
        } catch (err) {
          console.error("Error creating meeting note:", err);
          resolve({ success: false, error: err.message });
        }
      }, 800); // Increased timeout for more reliability
    });
  } catch (error) {
    console.error("Error in joinDetectedMeeting:", error);
    return { success: false, error: error.message };
  }
}
