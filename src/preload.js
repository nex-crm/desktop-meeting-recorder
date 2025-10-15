// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

// Set up the SDK logger bridge between main and renderer
contextBridge.exposeInMainWorld('sdkLoggerBridge', {
  // Receive logs from main process
  onSdkLog: (callback) => ipcRenderer.on('sdk-log', (_, logEntry) => callback(logEntry)),

  // Send logs from renderer to main process
  sendSdkLog: (logEntry) => ipcRenderer.send('sdk-log', logEntry)
});

contextBridge.exposeInMainWorld('electronAPI', {
  navigate: (page) => ipcRenderer.send('navigate', page),
  saveMeetingsData: (data) => ipcRenderer.invoke('saveMeetingsData', data),
  loadMeetingsData: () => ipcRenderer.invoke('loadMeetingsData'),
  deleteMeeting: (meetingId) => ipcRenderer.invoke('deleteMeeting', meetingId),
  getVideoFile: (videoPath) => ipcRenderer.invoke('getVideoFile', videoPath),
  generateMeetingSummary: (meetingId) => ipcRenderer.invoke('generateMeetingSummary', meetingId),
  generateMeetingSummaryStreaming: (meetingId) => ipcRenderer.invoke('generateMeetingSummaryStreaming', meetingId),
  triggerSummaryGeneration: (meetingId) => ipcRenderer.invoke('triggerSummaryGeneration', meetingId),
  startManualRecording: (meetingId) => ipcRenderer.invoke('startManualRecording', meetingId),
  generateSummary: (recordingId) => ipcRenderer.invoke('generateSummary', recordingId),
  debugGetHandlers: () => ipcRenderer.invoke('debugGetHandlers'),
  checkForDetectedMeeting: () => ipcRenderer.invoke('checkForDetectedMeeting'),
  joinDetectedMeeting: () => ipcRenderer.invoke('joinDetectedMeeting'),
  testNotification: () => ipcRenderer.invoke('testNotification'),
  onOpenMeetingNote: (callback) => ipcRenderer.on('open-meeting-note', (_, meetingId) => callback(meetingId)),
  onRecordingCompleted: (callback) => ipcRenderer.on('recording-completed', (_, meetingId) => callback(meetingId)),
  onTranscriptUpdated: (callback) => ipcRenderer.on('transcript-updated', (_, meetingId) => callback(meetingId)),
  onSummaryGenerated: (callback) => ipcRenderer.on('summary-generated', (_, meetingId) => callback(meetingId)),
  onSummaryUpdate: (callback) => ipcRenderer.on('summary-update', (_, data) => callback(data)),
  onRecordingStateChange: (callback) => ipcRenderer.on('recording-state-change', (_, data) => callback(data)),
  onVideoUrlUpdated: (callback) => ipcRenderer.on('video-url-updated', (_, data) => callback(data)),
  onParticipantsUpdated: (callback) => ipcRenderer.on('participants-updated', (_, meetingId) => callback(meetingId)),
  onVideoFrame: (callback) => ipcRenderer.on('video-frame', (_, data) => callback(data)),
  onMeetingDetectionStatus: (callback) => ipcRenderer.on('meeting-detection-status', (_, data) => callback(data)),
  onInAppNotification: (callback) => ipcRenderer.on('show-in-app-notification', (_, data) => callback(data)),
  onOpenCalendarMeeting: (callback) => ipcRenderer.on('open-calendar-meeting', (_, data) => callback(data)),
  getActiveRecordingId: (noteId) => ipcRenderer.invoke('getActiveRecordingId', noteId),

  // Authentication APIs
  auth: {
    startEmailAuth: (email) => ipcRenderer.invoke('auth:startEmailAuth', email),
    submitOTP: (attemptId, code) => ipcRenderer.invoke('auth:submitOTP', { attemptId, code }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
    getWorkspace: () => ipcRenderer.invoke('auth:getWorkspace'),
    fetchWorkspace: () => ipcRenderer.invoke('auth:fetchWorkspace'),
    isAuthenticated: () => ipcRenderer.invoke('auth:isAuthenticated'),
    onAuthSuccess: (callback) => ipcRenderer.on('auth:success', callback),
    onAuthLogout: (callback) => ipcRenderer.on('auth:logout', callback),
  },

  // Calendar APIs
  calendar: {
    getUpcomingMeetings: (hours) => ipcRenderer.invoke('calendar:getUpcomingMeetings', hours),
    getPastMeetings: (days) => ipcRenderer.invoke('calendar:getPastMeetings', days),
    getMeetingDetails: (eventId) => ipcRenderer.invoke('calendar:getMeetingDetails', eventId),
    onCalendarSynced: (callback) => ipcRenderer.on('calendar:synced', (_, meetings) => callback(meetings)),
    onMeetingStarting: (callback) => ipcRenderer.on('meeting:starting', (_, meeting) => callback(meeting)),
    onMeetingInProgress: (callback) => ipcRenderer.on('meeting:inProgress', (_, meeting) => callback(meeting)),
  },

  // Settings APIs
  settings: {
    getDebugMode: () => ipcRenderer.invoke('settings:getDebugMode'),
  }
});
