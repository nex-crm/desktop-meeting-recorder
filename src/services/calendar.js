const { EventEmitter } = require('events');
const schedule = require('node-schedule');
const constants = require('../config/constants');

class CalendarSyncService extends EventEmitter {
  constructor(apiService, storage) {
    super();
    this.apiService = apiService;
    this.storage = storage;
    this.syncInterval = null;
    this.scheduledNotifications = new Map();
    this.upcomingMeetings = [];
  }

  async initialize() {
    // Initial sync
    await this.syncCalendar();

    // Set up periodic sync (every 5 minutes)
    this.syncInterval = setInterval(() => {
      this.syncCalendar();
    }, 5 * 60 * 1000);

    // Check for meetings starting soon every minute
    setInterval(() => {
      this.checkUpcomingMeetings();
    }, 60 * 1000);
  }

  async syncCalendar() {
    try {
      console.log('Syncing calendar...');

      // Fetch meetings for next 24 hours
      const result = await this.apiService.getUpcomingMeetings(24);

      if (result.meetings) {
        this.upcomingMeetings = result.meetings;
        this.scheduleNotifications();
        this.emit('calendar:synced', this.upcomingMeetings);

        // Store meetings locally for offline access
        this.storage.store.set('upcomingMeetings', {
          meetings: this.upcomingMeetings,
          syncedAt: Date.now()
        });

        console.log(`Synced ${this.upcomingMeetings.length} upcoming meetings`);
      }
    } catch (error) {
      console.error('Failed to sync calendar:', error);

      // Try to use cached meetings if available
      const cached = this.storage.store.get('upcomingMeetings');
      if (cached && cached.meetings) {
        this.upcomingMeetings = cached.meetings;
        console.log('Using cached meetings due to sync failure');
      }
    }
  }

  scheduleNotifications() {
    // Cancel all existing scheduled notifications
    this.scheduledNotifications.forEach(job => job.cancel());
    this.scheduledNotifications.clear();

    const settings = this.storage.getSettings();
    if (!settings.notifications) {
      return;
    }

    // Schedule notifications for each meeting
    this.upcomingMeetings.forEach(meeting => {
      const meetingTime = new Date(meeting.startTime);
      const now = new Date();

      // Only schedule for future meetings
      if (meetingTime > now) {
        // Schedule notifications at configured intervals
        constants.NOTIFICATIONS.MEETING_REMINDER_MINUTES.forEach(minutes => {
          const notificationTime = new Date(meetingTime.getTime() - minutes * 60 * 1000);

          if (notificationTime > now) {
            const jobKey = `${meeting.id}-${minutes}`;
            const job = schedule.scheduleJob(notificationTime, () => {
              this.sendMeetingNotification(meeting, minutes);
            });

            if (job) {
              this.scheduledNotifications.set(jobKey, job);
            }
          }
        });

        // Schedule auto-record if enabled
        if (settings.autoRecord) {
          const autoRecordTime = new Date(meetingTime.getTime() - 30 * 1000); // 30 seconds before
          if (autoRecordTime > now) {
            const job = schedule.scheduleJob(autoRecordTime, () => {
              this.emit('meeting:autoRecord', meeting);
            });

            if (job) {
              this.scheduledNotifications.set(`${meeting.id}-autoRecord`, job);
            }
          }
        }
      }
    });

    console.log(`Scheduled ${this.scheduledNotifications.size} notifications`);
  }

  sendMeetingNotification(meeting, minutesUntil) {
    const { Notification } = require('electron');

    let body;
    if (minutesUntil === 1) {
      body = 'Meeting starts in 1 minute';
    } else {
      body = `Meeting starts in ${minutesUntil} minutes`;
    }

    const notification = new Notification({
      title: meeting.title || 'Upcoming Meeting',
      body,
      subtitle: meeting.organizerName || '',
      sound: constants.NOTIFICATIONS.DEFAULT_NOTIFICATION_SOUND,
      actions: [
        { type: 'button', text: 'Join Meeting' }
      ]
    });

    notification.on('click', () => {
      this.emit('meeting:join', meeting);
    });

    notification.on('action', (event, index) => {
      if (index === 0) {
        this.emit('meeting:join', meeting);
      }
    });

    notification.show();
    this.emit('notification:sent', { meeting, minutesUntil });
  }

  checkUpcomingMeetings() {
    const now = new Date();
    const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);

    this.upcomingMeetings.forEach(meeting => {
      const meetingTime = new Date(meeting.startTime);

      // Check if meeting is starting within the next minute
      if (meetingTime > now && meetingTime <= oneMinuteFromNow) {
        this.emit('meeting:starting', meeting);
      }

      // Check if meeting has started but not ended
      const endTime = new Date(meeting.endTime);
      if (meetingTime <= now && endTime > now) {
        this.emit('meeting:inProgress', meeting);
      }
    });
  }

  getMeetingById(meetingId) {
    return this.upcomingMeetings.find(m => m.id === meetingId);
  }

  getMeetingByEventId(eventId) {
    return this.upcomingMeetings.find(m => m.calendarEventId === eventId);
  }

  getMeetingsInTimeRange(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);

    return this.upcomingMeetings.filter(meeting => {
      const meetingStart = new Date(meeting.startTime);
      const meetingEnd = new Date(meeting.endTime);

      return (
        (meetingStart >= start && meetingStart < end) ||
        (meetingEnd > start && meetingEnd <= end) ||
        (meetingStart <= start && meetingEnd >= end)
      );
    });
  }

  getCurrentMeeting() {
    const now = new Date();

    return this.upcomingMeetings.find(meeting => {
      const meetingStart = new Date(meeting.startTime);
      const meetingEnd = new Date(meeting.endTime);

      return meetingStart <= now && meetingEnd > now;
    });
  }

  getNextMeeting() {
    const now = new Date();

    const futureMeetings = this.upcomingMeetings
      .filter(meeting => new Date(meeting.startTime) > now)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    return futureMeetings[0] || null;
  }

  async notifyRecordingIntent(meeting) {
    try {
      await this.apiService.notifyRecordingIntent(meeting.calendarEventId);
      console.log(`Notified recording intent for meeting ${meeting.id}`);
    } catch (error) {
      console.error('Failed to notify recording intent:', error);
    }
  }

  cleanup() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.scheduledNotifications.forEach(job => job.cancel());
    this.scheduledNotifications.clear();
  }
}

module.exports = CalendarSyncService;