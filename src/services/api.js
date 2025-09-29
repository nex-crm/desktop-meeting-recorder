const constants = require('../config/constants');

class NexApiService {
  constructor(authService) {
    this.authService = authService;
    this.client = authService.getApiClient();
  }

  // Workspace endpoints
  async getWorkspaces() {
    const response = await this.client.get('/v1/workspaces');
    return response.data;
  }

  // Calendar endpoints
  async getUpcomingMeetings(hours = 24) {
    const now = new Date();
    // const to = new Date(now.getTime() + (hours * 60 * 60 * 1000)); // Will be used when real API is available

    // TODO: Replace with actual API call when BE team delivers the new endpoint
    // Mock data for development - matching the screenshot
    const mockMeetings = [];

    // Helper to create date for today with specific time
    const todayAt = (hours, minutes) => {
      const d = new Date(now);
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    // Helper to create date for tomorrow with specific time
    const tomorrowAt = (hours, minutes) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    // Meeting starting in 55 seconds for testing notification (to trigger 1-minute notification quickly)
    const testMeetingTime = new Date(now.getTime() + 55 * 1000); // 55 seconds from now
    mockMeetings.push({
      id: 1,
      title: 'Weekly team catchup',
      startTime: testMeetingTime.toISOString(),
      endTime: new Date(testMeetingTime.getTime() + 30 * 60 * 1000).toISOString(), // 30 minute meeting
      date: testMeetingTime.toISOString(),
      organizerEmail: 'founder@company.com',
      location: 'Conference Room',
      videoMeetingUrl: 'https://meet.google.com/abc-defg-hij',
      attendees: ['cofounder@company.com', 'cto@company.com']
    });

    mockMeetings.push({
      id: 2,
      title: 'Weekly team catchup',
      startTime: todayAt(14, 0).toISOString(),
      endTime: todayAt(14, 30).toISOString(),
      date: todayAt(14, 0).toISOString(),
      organizerEmail: 'manager@company.com',
      location: 'Virtual',
      videoMeetingUrl: 'https://meet.google.com/abc-defg-hij',
      attendees: ['dev1@company.com', 'dev2@company.com', 'dev3@company.com']
    });

    mockMeetings.push({
      id: 3,
      title: '30 Min Meeting between Najmuzzaman Mohammed and Sarah Chen',
      startTime: todayAt(20, 0).toISOString(),
      endTime: todayAt(20, 30).toISOString(),
      date: todayAt(20, 0).toISOString(),
      organizerEmail: 'najmuzzaman@company.com',
      location: 'Virtual',
      videoMeetingUrl: 'https://teams.microsoft.com/l/meetup-join/19:meeting_abc',
      attendees: ['sarah.chen@company.com']
    });

    // Tomorrow's meetings
    mockMeetings.push({
      id: 4,
      title: '30 Min Meeting between Najmuzzaman Mohammed and Alex Kim',
      startTime: tomorrowAt(16, 0).toISOString(),
      endTime: tomorrowAt(16, 30).toISOString(),
      date: tomorrowAt(16, 0).toISOString(),
      organizerEmail: 'najmuzzaman@company.com',
      location: 'Virtual',
      videoMeetingUrl: 'https://zoom.us/j/987654321',
      attendees: ['alex.kim@partner.com']
    });

    mockMeetings.push({
      id: 5,
      title: 'Atlas Customer Appointments (Najmuzzaman Mohammed)',
      startTime: tomorrowAt(16, 30).toISOString(),
      endTime: tomorrowAt(17, 30).toISOString(),
      date: tomorrowAt(16, 30).toISOString(),
      organizerEmail: 'najmuzzaman@company.com',
      location: 'Customer Site',
      attendees: ['customer1@atlas.com', 'customer2@atlas.com']
    });

    // Additional meetings in the next 2 hours for testing
    const in15minutes = new Date(now.getTime() + 15 * 60 * 1000);
    mockMeetings.push({
      id: 6,
      title: 'Product Demo with Potential Client',
      startTime: in15minutes.toISOString(),
      endTime: new Date(in15minutes.getTime() + 45 * 60 * 1000).toISOString(),
      date: in15minutes.toISOString(),
      organizerEmail: 'sales@company.com',
      location: 'Virtual',
      videoMeetingUrl: 'https://zoom.us/j/555666777',
      attendees: ['client@potential.com', 'sales@company.com']
    });

    const in30minutes = new Date(now.getTime() + 30 * 60 * 1000);
    mockMeetings.push({
      id: 7,
      title: 'Engineering Sprint Planning',
      startTime: in30minutes.toISOString(),
      endTime: new Date(in30minutes.getTime() + 60 * 60 * 1000).toISOString(),
      date: in30minutes.toISOString(),
      organizerEmail: 'scrum.master@company.com',
      location: 'Conference Room B',
      videoMeetingUrl: 'https://meet.google.com/xyz-uvwx-abc',
      attendees: ['dev1@company.com', 'dev2@company.com', 'dev3@company.com', 'qa@company.com']
    });

    const in45minutes = new Date(now.getTime() + 45 * 60 * 1000);
    mockMeetings.push({
      id: 8,
      title: 'Marketing Campaign Review',
      startTime: in45minutes.toISOString(),
      endTime: new Date(in45minutes.getTime() + 30 * 60 * 1000).toISOString(),
      date: in45minutes.toISOString(),
      organizerEmail: 'marketing@company.com',
      location: 'Virtual',
      videoMeetingUrl: 'https://teams.microsoft.com/l/meetup-join/19:meeting_xyz',
      attendees: ['marketing@company.com', 'content@company.com', 'design@company.com']
    });

    const in60minutes = new Date(now.getTime() + 60 * 60 * 1000);
    mockMeetings.push({
      id: 9,
      title: 'One-on-One: Manager & Senior Dev',
      startTime: in60minutes.toISOString(),
      endTime: new Date(in60minutes.getTime() + 30 * 60 * 1000).toISOString(),
      date: in60minutes.toISOString(),
      organizerEmail: 'manager@company.com',
      location: 'Manager Office',
      videoMeetingUrl: 'https://zoom.us/j/111222333',
      attendees: ['senior.dev@company.com']
    });

    const in90minutes = new Date(now.getTime() + 90 * 60 * 1000);
    mockMeetings.push({
      id: 10,
      title: 'Customer Success Weekly Sync',
      startTime: in90minutes.toISOString(),
      endTime: new Date(in90minutes.getTime() + 45 * 60 * 1000).toISOString(),
      date: in90minutes.toISOString(),
      organizerEmail: 'cs.lead@company.com',
      location: 'Virtual',
      videoMeetingUrl: 'https://meet.google.com/customer-success-sync',
      attendees: ['cs1@company.com', 'cs2@company.com', 'support@company.com']
    });

    const in120minutes = new Date(now.getTime() + 120 * 60 * 1000);
    mockMeetings.push({
      id: 11,
      title: 'Design System Workshop',
      startTime: in120minutes.toISOString(),
      endTime: new Date(in120minutes.getTime() + 90 * 60 * 1000).toISOString(),
      date: in120minutes.toISOString(),
      organizerEmail: 'design.lead@company.com',
      location: 'Design Studio',
      videoMeetingUrl: 'https://zoom.us/j/design-workshop-2024',
      attendees: ['designer1@company.com', 'designer2@company.com', 'ux@company.com', 'frontend@company.com']
    });

    console.log(`Returning ${mockMeetings.length} mock meetings`);
    return {
      meetings: mockMeetings
    };
  }

  async getMeetingDetails(eventId) {
    const response = await this.client.get(`/v1/calendar/meetings/${eventId}`);
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