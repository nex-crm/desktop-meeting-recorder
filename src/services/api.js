const constants = require('../config/constants');

class NexApiService {
  constructor(authService) {
    this.authService = authService;
    this.client = authService.getApiClient();
  }

  // Calendar endpoints
  async getUpcomingMeetings(hours = 24) {
    const response = await this.client.get('/api/v1/calendar/upcoming-meetings', {
      params: { hours },
    });
    return response.data;
  }

  async getMeetingDetails(eventId) {
    const response = await this.client.get(`/api/v1/calendar/meeting/${eventId}`);
    return response.data;
  }

  async notifyRecordingIntent(eventId) {
    const response = await this.client.post(`/api/v1/calendar/meeting/${eventId}/recording-intent`);
    return response.data;
  }

  // Recording endpoints
  async createDesktopRecording(meetingId, metadata) {
    const response = await this.client.post('/api/v1/desktop/recording/create', {
      meetingId,
      metadata,
      source: 'desktop',
      deviceId: this.authService.storage.getDeviceFingerprint(),
    });
    return response.data;
  }

  async initiateUpload(recordingId, fileSize, fileName) {
    const response = await this.client.post('/api/v1/desktop/recording/initiate-upload', {
      recordingId,
      fileSize,
      fileName,
      chunkSize: constants.RECORDING.CHUNK_SIZE,
    });
    return response.data;
  }

  async getUploadUrl(recordingId, uploadId, partNumber) {
    const response = await this.client.post('/api/v1/desktop/recording/get-upload-url', {
      recordingId,
      uploadId,
      partNumber,
    });
    return response.data.uploadUrl;
  }

  async completeUpload(recordingId, uploadId, parts) {
    const response = await this.client.post('/api/v1/desktop/recording/complete-upload', {
      recordingId,
      uploadId,
      parts,
    });
    return response.data;
  }

  async updateRecordingStatus(recordingId, status, metadata = {}) {
    const response = await this.client.put(`/api/v1/desktop/recording/${recordingId}/status`, {
      status,
      metadata,
      timestamp: new Date().toISOString(),
    });
    return response.data;
  }

  async uploadTranscript(recordingId, transcript) {
    const response = await this.client.post(`/api/v1/desktop/recording/${recordingId}/transcript`, {
      transcript,
      provider: 'deepgram',
      timestamp: new Date().toISOString(),
    });
    return response.data;
  }

  // Meeting endpoints
  async listMeetings(params = {}) {
    const response = await this.client.get('/api/v1/meetings', { params });
    return response.data;
  }

  async getMeeting(meetingId) {
    const response = await this.client.get(`/api/v1/meetings/${meetingId}`);
    return response.data;
  }

  // Settings endpoints
  async getSettings() {
    const response = await this.client.get('/api/v1/settings/desktop');
    return response.data;
  }

  async updateSettings(settings) {
    const response = await this.client.put('/api/v1/settings/desktop', settings);
    return response.data;
  }

  // Device management
  async registerDevice(deviceInfo) {
    const response = await this.client.post('/api/v1/devices/register', {
      fingerprint: this.authService.storage.getDeviceFingerprint(),
      name: deviceInfo.name,
      platform: process.platform,
      version: deviceInfo.version,
    });
    return response.data;
  }

  async updateDeviceStatus(status) {
    const response = await this.client.put('/api/v1/devices/status', {
      fingerprint: this.authService.storage.getDeviceFingerprint(),
      status,
      timestamp: new Date().toISOString(),
    });
    return response.data;
  }
}

module.exports = NexApiService;