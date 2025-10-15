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
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        console.warn('No workspace slug available, cannot fetch meetings');
        return { meetings: [] };
      }

      const now = new Date();
      // Include meetings that started up to 4 hours ago (to catch currently running meetings)
      const from = new Date(now.getTime() - (4 * 60 * 60 * 1000));
      const to = new Date(now.getTime() + (hours * 60 * 60 * 1000));

      const requestBody = {
        from_time: from.toISOString(),
        to_time: to.toISOString(),
        limit: 50,
        sort_order: 'SORT_ORDER_ASC'
      };

      console.log(`Fetching meetings from ${requestBody.from_time} to ${requestBody.to_time}`);

      const response = await this.client.post(`/v1/workspaces/${workspaceSlug}/meetings`, requestBody);

      // Extract meetings from response
      const apiMeetings = response.data?.meetings || response.data?.data?.meetings || [];

      console.log(`Fetched ${apiMeetings.length} meetings from List API, enriching with participant data...`);

      // Enrich each meeting with participant data from Get Meeting API
      const enrichedMeetings = await Promise.all(
        apiMeetings.map(async (meeting) => {
          try {
            const detailsResponse = await this.client.get(`/v1/workspaces/${workspaceSlug}/meetings/${meeting.id}`);
            const meetingDetails = detailsResponse.data?.meeting || detailsResponse.data;

            // Transform participants to attendees format
            const attendees = (meetingDetails.participants || []).map(participant => ({
              email: participant.email,
              name: participant.name || participant.email?.split('@')[0],
              status: participant.status,
              isOrganizer: participant.isOrganizer || false,
              isSelf: participant.isSelf || false,
              entityId: participant.entityId,
              photo_url: participant.photo_url || participant.photoUrl,
              title: participant.title || participant.role
            }));

            return {
              id: meeting.id,
              title: meeting.title || 'Untitled Meeting',
              startTime: meeting.startTime,
              endTime: meeting.endTime,
              date: meeting.startTime,
              description: meeting.description,
              videoMeetingUrl: meeting.videoMeeting?.url,
              videoMeetingType: meeting.videoMeeting?.type,
              attendees,
              calendarEventId: meeting.calendar_event_id || meeting.calendarEventId
            };
          } catch (error) {
            console.error(`Failed to fetch details for meeting ${meeting.id}:`, error);
            // Return basic meeting info without participants on error
            return {
              id: meeting.id,
              title: meeting.title || 'Untitled Meeting',
              startTime: meeting.startTime,
              endTime: meeting.endTime,
              date: meeting.startTime,
              description: meeting.description,
              videoMeetingUrl: meeting.videoMeeting?.url,
              attendees: [],
              calendarEventId: meeting.calendar_event_id || meeting.calendarEventId
            };
          }
        })
      );

      console.log(`Enriched ${enrichedMeetings.length} meetings with participant data`);

      // Filter out meetings that have already ended
      const activeMeetings = enrichedMeetings.filter(meeting => {
        const endTime = new Date(meeting.endTime);
        return endTime >= now; // using 'now' from line 25
      });

      console.log(`Filtered to ${activeMeetings.length} active/upcoming meetings (${enrichedMeetings.length - activeMeetings.length} already ended)`);

      return {
        meetings: activeMeetings
      };
    } catch (error) {
      console.error('Failed to fetch meetings from API:', error);

      // Return empty array on error rather than failing completely
      return { meetings: [] };
    }
  }

  async getPastMeetings(days = 7) {
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        console.warn('No workspace slug available, cannot fetch meetings');
        return { meetings: [] };
      }

      const now = new Date();
      // Get meetings from the past X days up to now
      const from = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
      const to = now;

      const requestBody = {
        from_time: from.toISOString(),
        to_time: to.toISOString(),
        limit: 50,
        sort_order: 'SORT_ORDER_DESC' // Most recent first
      };

      console.log(`Fetching past meetings from ${requestBody.from_time} to ${requestBody.to_time}`);

      const response = await this.client.post(`/v1/workspaces/${workspaceSlug}/meetings`, requestBody);

      // Extract meetings from response
      const apiMeetings = response.data?.meetings || response.data?.data?.meetings || [];

      console.log(`Fetched ${apiMeetings.length} past meetings from List API, enriching with participant data...`);

      // Enrich each meeting with participant data from Get Meeting API
      const enrichedMeetings = await Promise.all(
        apiMeetings.map(async (meeting) => {
          try {
            const detailsResponse = await this.client.get(`/v1/workspaces/${workspaceSlug}/meetings/${meeting.id}`);
            const meetingDetails = detailsResponse.data?.meeting || detailsResponse.data;

            // Transform participants to attendees format
            const attendees = (meetingDetails.participants || []).map(participant => ({
              email: participant.email,
              name: participant.name || participant.email?.split('@')[0],
              status: participant.status,
              isOrganizer: participant.isOrganizer || false,
              isSelf: participant.isSelf || false,
              entityId: participant.entityId,
              photo_url: participant.photo_url || participant.photoUrl,
              title: participant.title || participant.role
            }));

            return {
              id: meeting.id,
              title: meeting.title || 'Untitled Meeting',
              startTime: meeting.startTime,
              endTime: meeting.endTime,
              date: meeting.startTime,
              description: meeting.description,
              videoMeetingUrl: meeting.videoMeeting?.url,
              videoMeetingType: meeting.videoMeeting?.type,
              attendees,
              calendarEventId: meeting.calendar_event_id || meeting.calendarEventId
            };
          } catch (error) {
            console.error(`Failed to fetch details for meeting ${meeting.id}:`, error);
            // Return basic meeting info without participants on error
            return {
              id: meeting.id,
              title: meeting.title || 'Untitled Meeting',
              startTime: meeting.startTime,
              endTime: meeting.endTime,
              date: meeting.startTime,
              description: meeting.description,
              videoMeetingUrl: meeting.videoMeeting?.url,
              attendees: [],
              calendarEventId: meeting.calendar_event_id || meeting.calendarEventId
            };
          }
        })
      );

      console.log(`Enriched ${enrichedMeetings.length} past meetings with participant data`);

      // Filter to only include meetings that have already ended
      const pastMeetings = enrichedMeetings.filter(meeting => {
        const endTime = new Date(meeting.endTime);
        return endTime < now;
      });

      console.log(`Filtered to ${pastMeetings.length} past meetings (${enrichedMeetings.length - pastMeetings.length} excluded)`);

      return {
        meetings: pastMeetings
      };
    } catch (error) {
      console.error('Failed to fetch past meetings from API:', error);

      // Return empty array on error rather than failing completely
      return { meetings: [] };
    }
  }

  async getMeetingDetails(meetingId) {
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        throw new Error('No workspace slug available');
      }

      const response = await this.client.get(`/v1/workspaces/${workspaceSlug}/meetings/${meetingId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch meeting details for ${meetingId}:`, error);
      throw error;
    }
  }

  async getMeetingTranscript(meetingId) {
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        throw new Error('No workspace slug available');
      }

      const response = await this.client.get(`/v1/workspaces/${workspaceSlug}/meetings/${meetingId}/transcript`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch transcript for meeting ${meetingId}:`, error);
      throw error;
    }
  }

  async getMeetingVideoUrl(meetingId) {
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        throw new Error('No workspace slug available');
      }

      const response = await this.client.get(`/v1/workspaces/${workspaceSlug}/meetings/${meetingId}/video`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch video URL for meeting ${meetingId}:`, error);
      throw error;
    }
  }

  async getMeetingSummary(meetingId) {
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        throw new Error('No workspace slug available');
      }

      const response = await this.client.get(`/v1/workspaces/${workspaceSlug}/meetings/${meetingId}/summary`);
      return response.data;
    } catch (error) {
      // Handle 501 Not Implemented gracefully
      if (error.response?.status === 501) {
        console.log(`Summary endpoint not yet implemented for meeting ${meetingId}`);
        return null;
      }
      console.error(`Failed to fetch summary for meeting ${meetingId}:`, error);
      throw error;
    }
  }

  async updateMeetingSummary(meetingId, content) {
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        throw new Error('No workspace slug available');
      }

      const response = await this.client.post(
        `/v1/workspaces/${workspaceSlug}/meetings/${meetingId}/summary`,
        { content }
      );
      return response.data;
    } catch (error) {
      // Handle 501 Not Implemented gracefully
      if (error.response?.status === 501) {
        console.log(`Update summary endpoint not yet implemented for meeting ${meetingId}`);
        return null;
      }
      console.error(`Failed to update summary for meeting ${meetingId}:`, error);
      throw error;
    }
  }

  async getMeetingPrep(meetingId) {
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        throw new Error('No workspace slug available');
      }

      const response = await this.client.get(`/v1/workspaces/${workspaceSlug}/meetings/${meetingId}/prep`);
      return response.data;
    } catch (error) {
      // Handle 501 Not Implemented gracefully
      if (error.response?.status === 501) {
        console.log(`Prep endpoint not yet implemented for meeting ${meetingId}`);
        return null;
      }
      console.error(`Failed to fetch prep for meeting ${meetingId}:`, error);
      throw error;
    }
  }

  async updateMeetingPrep(meetingId, content) {
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        throw new Error('No workspace slug available');
      }

      const response = await this.client.post(
        `/v1/workspaces/${workspaceSlug}/meetings/${meetingId}/prep`,
        { content }
      );
      return response.data;
    } catch (error) {
      // Handle 501 Not Implemented gracefully
      if (error.response?.status === 501) {
        console.log(`Update prep endpoint not yet implemented for meeting ${meetingId}`);
        return null;
      }
      console.error(`Failed to update prep for meeting ${meetingId}:`, error);
      throw error;
    }
  }

  async regenerateMeetingPrep(meetingId, prompt = null) {
    try {
      const workspaceSlug = this.authService.storage.getWorkspaceSlug();

      if (!workspaceSlug) {
        throw new Error('No workspace slug available');
      }

      const requestBody = prompt ? { prompt } : {};

      const response = await this.client.post(
        `/v1/workspaces/${workspaceSlug}/meetings/${meetingId}/prep/regenerate`,
        requestBody
      );
      return response.data;
    } catch (error) {
      // Handle 501 Not Implemented gracefully
      if (error.response?.status === 501) {
        console.log(`Regenerate prep endpoint not yet implemented for meeting ${meetingId}`);
        return null;
      }
      console.error(`Failed to regenerate prep for meeting ${meetingId}:`, error);
      throw error;
    }
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