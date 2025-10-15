/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 */

import './index.css';
import { TranscriptService } from './services/transcript.mjs';

// Login UI Management
let currentAttemptId = null;
let resendTimer = null;

// Initialize login UI handlers
function initializeLoginUI() {
  const loginView = document.getElementById('loginView');
  const emailForm = document.getElementById('emailForm');
  const otpForm = document.getElementById('otpForm');
  const emailInput = document.getElementById('emailInput');
  const emailError = document.getElementById('emailError');
  const otpError = document.getElementById('otpError');
  const otpInputs = document.querySelectorAll('.otp-input');
  const resendCodeBtn = document.getElementById('resendCodeBtn');
  const backToEmailBtn = document.getElementById('backToEmailBtn');
  const userEmail = document.getElementById('userEmail');
  const resendTimerSpan = document.getElementById('resendTimer');
  const emailStep = document.getElementById('emailStep');
  const otpStep = document.getElementById('otpStep');
  const emailSubmitBtn = document.getElementById('emailSubmitBtn');
  const otpSubmitBtn = document.getElementById('otpSubmitBtn');

  // Handle email form submission
  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      emailError.textContent = '';
      emailSubmitBtn.disabled = true;
      emailSubmitBtn.textContent = 'Sending...';

      const email = emailInput.value.trim();

      try {
        const result = await window.electronAPI.auth.startEmailAuth(email);

        if (result.success && result.data) {
          currentAttemptId = result.data.attempt?.id;
          userEmail.textContent = email;

          // Switch to OTP step
          emailStep.style.display = 'none';
          otpStep.style.display = 'block';

          // Focus first OTP input
          if (otpInputs[0]) otpInputs[0].focus();

          // Start resend timer
          startResendTimer();
        } else {
          emailError.textContent = result.error || 'Failed to send verification email';
        }
      } catch (error) {
        console.error('Email auth error:', error);
        emailError.textContent = 'An error occurred. Please try again.';
      } finally {
        emailSubmitBtn.disabled = false;
        emailSubmitBtn.textContent = 'Continue';
      }
    });
  }

  // Handle OTP input
  otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const value = e.target.value;

      if (value.length === 1) {
        // Add filled class
        input.classList.add('filled');

        // Move to next input
        if (index < otpInputs.length - 1) {
          otpInputs[index + 1].focus();
        } else {
          // All inputs filled, submit form
          handleOTPSubmit();
        }
      } else {
        input.classList.remove('filled');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        // Move to previous input on backspace
        otpInputs[index - 1].focus();
      }
    });

    // Handle paste
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData('text').slice(0, 6);

      for (let i = 0; i < pastedData.length && i < otpInputs.length; i++) {
        otpInputs[i].value = pastedData[i];
        otpInputs[i].classList.add('filled');
      }

      if (pastedData.length === 6) {
        handleOTPSubmit();
      }
    });
  });

  // Handle OTP form submission
  if (otpForm) {
    otpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleOTPSubmit();
    });
  }

  async function handleOTPSubmit() {
    otpError.textContent = '';
    const otp = Array.from(otpInputs).map(input => input.value).join('');

    if (otp.length !== 6) {
      otpError.textContent = 'Please enter all 6 digits';
      return;
    }

    otpSubmitBtn.disabled = true;
    otpSubmitBtn.textContent = 'Verifying...';

    try {
      const result = await window.electronAPI.auth.submitOTP(currentAttemptId, otp);

      if (result.success) {
        // Successfully authenticated
        loginView.style.display = 'none';
        document.querySelector('.app-container').style.display = 'flex';

        // Clear OTP inputs
        otpInputs.forEach(input => {
          input.value = '';
          input.classList.remove('filled');
        });

        // Update auth status - call the global function if it exists
        if (window.updateAuthStatus) {
          window.updateAuthStatus();
        } else {
          // Fallback: reload the page to check auth status
          window.location.reload();
        }
      } else {
        otpError.textContent = result.error || 'Invalid code. Please try again.';

        // Clear OTP inputs on error
        otpInputs.forEach(input => {
          input.value = '';
          input.classList.remove('filled');
        });
        otpInputs[0].focus();
      }
    } catch (error) {
      console.error('OTP submission error:', error);
      otpError.textContent = 'An error occurred. Please try again.';
    } finally {
      otpSubmitBtn.disabled = false;
      otpSubmitBtn.textContent = 'Verify';
    }
  }

  // Handle back to email button
  if (backToEmailBtn) {
    backToEmailBtn.addEventListener('click', () => {
      // Clear OTP inputs
      otpInputs.forEach(input => {
        input.value = '';
        input.classList.remove('filled');
      });
      otpError.textContent = '';

      // Clear resend timer
      if (resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
      }

      // Switch to email step
      otpStep.style.display = 'none';
      emailStep.style.display = 'block';
      emailInput.focus();
    });
  }

  // Handle resend code button
  if (resendCodeBtn) {
    resendCodeBtn.addEventListener('click', async () => {
      if (resendCodeBtn.disabled) return;

      const email = userEmail.textContent;
      resendCodeBtn.disabled = true;

      try {
        const result = await window.electronAPI.auth.startEmailAuth(email);

        if (result.success && result.data) {
          currentAttemptId = result.data.attempt?.id;

          // Clear OTP inputs
          otpInputs.forEach(input => {
            input.value = '';
            input.classList.remove('filled');
          });
          otpInputs[0].focus();

          // Restart timer
          startResendTimer();

          // Show success message briefly
          otpError.textContent = '';
          const originalText = resendCodeBtn.textContent;
          resendCodeBtn.textContent = 'Code sent!';
          setTimeout(() => {
            resendCodeBtn.textContent = originalText;
          }, 2000);
        } else {
          otpError.textContent = 'Failed to resend code';
        }
      } catch (error) {
        console.error('Resend code error:', error);
        otpError.textContent = 'Failed to resend code';
      }
    });
  }

  function startResendTimer() {
    let seconds = 45;
    resendCodeBtn.disabled = true;

    if (resendTimer) clearInterval(resendTimer);

    resendTimer = setInterval(() => {
      seconds--;
      resendTimerSpan.textContent = `(${seconds}s)`;

      if (seconds <= 0) {
        clearInterval(resendTimer);
        resendTimer = null;
        resendTimerSpan.textContent = '';
        resendCodeBtn.disabled = false;
      }
    }, 1000);
  }
}

// Create empty meetings data structure to be filled from the file
const meetingsData = {
  upcomingMeetings: [],
  pastMeetings: []
};

// Create empty arrays that will be filled from file
const upcomingMeetings = [];
const pastMeetings = [];

// Group past meetings by date
let pastMeetingsByDate = {};

// Global recording state variables
window.isRecording = false;
window.currentRecordingId = null;


// Function to check if there's an active recording for the current note
async function checkActiveRecordingState() {
  if (!currentEditingMeetingId) return;

  try {
    console.log('Checking active recording state for note:', currentEditingMeetingId);
    const result = await window.electronAPI.getActiveRecordingId(currentEditingMeetingId);

    if (result.success && result.data) {
      console.log('Found active recording for current note:', result.data);
      updateRecordingButtonUI(true, result.data.recordingId);
    } else {
      console.log('No active recording found for note');
      updateRecordingButtonUI(false, null);
    }
  } catch (error) {
    console.error('Error checking recording state:', error);
  }
}

// Function to update the recording button UI
function updateRecordingButtonUI(isActive, recordingId) {
  const recordButton = document.getElementById('recordButton');
  if (!recordButton) return;

  // Get the elements inside the button
  const recordIcon = recordButton.querySelector('.record-icon');
  const stopIcon = recordButton.querySelector('.stop-icon');

  if (isActive) {
    // Recording is active
    console.log('Updating UI for active recording:', recordingId);
    window.isRecording = true;
    window.currentRecordingId = recordingId;

    // Update button UI
    recordButton.classList.add('recording');
    recordIcon.style.display = 'none';
    stopIcon.style.display = 'block';
  } else {
    // No active recording
    console.log('Updating UI for inactive recording');
    window.isRecording = false;
    window.currentRecordingId = null;

    // Update button UI
    recordButton.classList.remove('recording');
    recordIcon.style.display = 'block';
    stopIcon.style.display = 'none';
  }
}


// Function to show/hide spinner on record button during summarization
window.setRecordButtonLoading = function(isLoading) {
  const recordButton = document.getElementById('recordButton');
  const generateBtn = document.getElementById('generateBtn');
  if (!recordButton) return;

  if (isLoading) {
    // Hide the record button
    recordButton.style.display = 'none';

    // Disable the generate button while loading
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.style.opacity = '0.5';
      generateBtn.style.cursor = 'not-allowed';
    }

    // Create loading spinner element if it doesn't exist
    let loadingSpinner = document.getElementById('recordButtonLoadingSpinner');
    if (!loadingSpinner) {
      loadingSpinner = document.createElement('div');
      loadingSpinner.id = 'recordButtonLoadingSpinner';
      loadingSpinner.style.cssText = 'display: flex; align-items: center; justify-content: center;';
      loadingSpinner.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation: spin 1s linear infinite;">
          <style>
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          </style>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor" opacity="0.3"/>
          <path d="M12 2v4c3.31 0 6 2.69 6 6h4c0-5.52-4.48-10-10-10z" fill="currentColor"/>
        </svg>
      `;
      recordButton.parentNode.insertBefore(loadingSpinner, recordButton);
    }
    loadingSpinner.style.display = 'flex';
  } else {
    // Show the record button
    recordButton.style.display = '';

    // Re-enable the generate button
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.style.opacity = '1';
      generateBtn.style.cursor = 'pointer';
    }

    // Hide spinner
    const loadingSpinner = document.getElementById('recordButtonLoadingSpinner');
    if (loadingSpinner) {
      loadingSpinner.style.display = 'none';
    }
  }
}

// Function to format date for section headers
function formatDateHeader(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if date is today, yesterday, or earlier
  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    // Format as "Fri, Apr 25" or similar
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }
}

// We'll initialize pastMeetings and pastMeetingsByDate when we load data from file

// Save meetings data back to file
async function saveMeetingsData() {
  // Save to localStorage as a backup
  localStorage.setItem('meetingsData', JSON.stringify(meetingsData));

  // Save to the actual file using IPC
  try {
    console.log('Saving meetings data to file...');
    const result = await window.electronAPI.saveMeetingsData(meetingsData);
    if (result.success) {
      console.log('Meetings data saved successfully to file');
    } else {
      console.error('Failed to save meetings data to file:', result.error);
    }
  } catch (error) {
    console.error('Error saving meetings data to file:', error);
  }
}

// Keep track of which meeting is being edited
let currentEditingMeetingId = null;

// Function to save the current note
async function saveCurrentNote() {
  // Support both legacy single editor and new dual-section editor
  const legacyEditorElement = document.getElementById('simple-editor');
  const personalNotesElement = document.getElementById('personal-notes-editor');
  const noteTitleElement = document.getElementById('noteTitle');

  // Early exit if elements aren't available
  if (!noteTitleElement || (!legacyEditorElement && !personalNotesElement)) {
    console.warn('Cannot save note: Editor elements not found');
    return;
  }

  // Early exit if no current meeting ID
  if (!currentEditingMeetingId) {
    console.warn('Cannot save note: No active meeting ID');
    return;
  }

  // Get title text, defaulting to "New Note" if empty
  const noteTitle = noteTitleElement.textContent.trim() || 'New Note';

  // Set title back to element in case it was empty
  if (!noteTitleElement.textContent.trim()) {
    noteTitleElement.textContent = noteTitle;
  }

  // Find which meeting is currently active by ID
  const activeMeeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === currentEditingMeetingId);

  if (activeMeeting) {
    console.log(`Saving note with ID: ${currentEditingMeetingId}, Title: ${noteTitle}`);

    // Update the title
    activeMeeting.title = noteTitle;

    // Get content based on which editor is present
    if (personalNotesElement) {
      // New tabbed editor
      const personalNotes = personalNotesElement.value;
      console.log(`Personal notes length: ${personalNotes.length} characters`);

      // Save personal notes separately
      activeMeeting.personalNotes = personalNotes;

      // Get AI summary from editor
      const aiSummaryEditor = document.getElementById('ai-summary-editor');
      const aiSummary = aiSummaryEditor ? aiSummaryEditor.value : '';

      activeMeeting.aiSummary = aiSummary;
      activeMeeting.content = personalNotes; // Legacy field
    } else if (legacyEditorElement) {
      // Legacy single editor
      const content = legacyEditorElement.value;
      console.log(`Note content length: ${content.length} characters`);
      activeMeeting.content = content;
    }

    // Update the data arrays directly to make sure they stay in sync
    const pastIndex = meetingsData.pastMeetings.findIndex(m => m.id === currentEditingMeetingId);
    if (pastIndex !== -1) {
      meetingsData.pastMeetings[pastIndex] = { ...activeMeeting };
      console.log('Updated meeting in pastMeetings array');
    }

    const upcomingIndex = meetingsData.upcomingMeetings.findIndex(m => m.id === currentEditingMeetingId);
    if (upcomingIndex !== -1) {
      meetingsData.upcomingMeetings[upcomingIndex] = { ...activeMeeting };
      console.log('Updated meeting in upcomingMeetings array');
    }

    // Also update the subtitle if it's a date-based one
    const dateObj = new Date(activeMeeting.date);
    if (dateObj) {
      document.getElementById('noteDate').textContent = formatDate(dateObj);
    }

    try {
      // Save the data to file
      await saveMeetingsData();
      console.log('Note saved successfully:', noteTitle);
    } catch (error) {
      console.error('Error saving note:', error);
    }
  } else {
    console.error(`Cannot save note: Meeting not found with ID: ${currentEditingMeetingId}`);

    // Log all available meetings for debugging
    console.log('Available meeting IDs:', [...upcomingMeetings, ...pastMeetings].map(m => m.id).join(', '));
  }
}

// Format date for display in the note header
function formatDate(date) {
  const options = { month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

// Simple debounce function
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Unified Recording Pill Component Function
function createRecordingPill(meeting, context = 'notes') {
  // context can be 'notes', 'calendar', or 'editor'
  const pill = document.createElement('div');
  pill.className = 'recording-pill unified-pill';

  const hasActiveRecording = window.isRecording && window.currentRecordingId && window.currentMeetingId === meeting.id;
  const now = new Date();
  const startTime = meeting.startTime ? new Date(meeting.startTime) : null;
  const isFuture = startTime && startTime > now;
  const hoursUntilMeeting = isFuture ? (startTime - now) / (1000 * 60 * 60) : 0;
  const hasTranscript = meeting.transcript && meeting.transcript.length > 0;

  // Format meeting time
  const timeStr = startTime ? startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(' ', '').toLowerCase() : '';

  let pillContent = '';

  if (hasActiveRecording) {
    // Recording is active - don't show summarize button during recording
    pillContent = `
      <div class="meeting-time-info">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="8" fill="#ff4444"/>
        </svg>
        <span>Recording in progress</span>
      </div>
    `;
  } else if (isFuture && hoursUntilMeeting <= 2) {
    // Meeting starts within 2 hours - show time and auto-summarize if has transcript and not recording
    pillContent = `
      <div class="meeting-time-info">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" fill="currentColor"/>
          <path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor"/>
        </svg>
        <span>Starts ${timeStr}</span>
      </div>
      ${hasTranscript && !window.isRecording ? `
        <div class="pill-actions">
          <button class="generate-btn auto-btn" data-meeting-id="${meeting.id}">
            Auto
          </button>
        </div>
      ` : ''}
    `;
  } else if (isFuture) {
    // Meeting starts later - just show the time
    pillContent = `
      <div class="meeting-time-info">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" fill="currentColor"/>
          <path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor"/>
        </svg>
        <span>Starts at ${timeStr}</span>
      </div>
      ${hasTranscript && !window.isRecording ? `
        <div class="pill-actions">
          <button class="generate-btn auto-btn" data-meeting-id="${meeting.id}">
            Auto
          </button>
        </div>
      ` : ''}
    `;
  } else {
    // Past meeting or no time - show only auto-summarize if has transcript and not recording
    pillContent = `
      ${hasTranscript && !window.isRecording ? `
        <div class="pill-actions">
          <button class="generate-btn auto-btn" data-meeting-id="${meeting.id}">
            Auto
          </button>
        </div>
      ` : ''}
    `;
  }

  pill.innerHTML = pillContent;

  // Add event listeners after setting innerHTML
  const autoBtn = pill.querySelector('.auto-btn');
  if (autoBtn) {
    autoBtn.addEventListener('click', function() {
      const meetingId = this.getAttribute('data-meeting-id');
      generateSummaryForMeeting(meetingId);
    });
  }

  return pill;
}

// Global functions for recording pill actions
window.startRecordingForMeeting = async function(meetingId) {
  console.log('Starting recording for meeting:', meetingId);
  currentEditingMeetingId = meetingId;

  try {
    const result = await window.electronAPI.startManualRecording(meetingId);
    if (result.success) {
      console.log('Recording started successfully:', result.recordingId);
      window.isRecording = true;
      window.currentRecordingId = result.recordingId;
      window.currentMeetingId = meetingId;

      // Refresh all recording pills
      updateAllRecordingPills();
    } else {
      console.error('Failed to start recording:', result.error);
      alert('Failed to start recording: ' + result.error);
    }
  } catch (error) {
    console.error('Error starting recording:', error);
    alert('Error starting recording: ' + error.message);
  }
};

window.stopRecordingForMeeting = async function(meetingId) {
  console.log('Stopping recording for meeting:', meetingId);
  if (window.isRecording && window.currentRecordingId) {
    try {
      const result = await window.electronAPI.generateSummary(window.currentRecordingId);
      if (result.success) {
        console.log('Recording stopped successfully');
        // The UI will be updated by the recording state change event
      } else {
        console.error('Failed to stop recording:', result.error);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  }
};

window.generateSummaryForMeeting = async function(meetingId) {
  console.log('Generating summary for meeting:', meetingId);

  // Show loading state
  const buttons = document.querySelectorAll(`.auto-btn[data-meeting-id="${meetingId}"]`);
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.textContent = 'Generating...';
  });

  try {
    sdkLogger.log('Auto button: Requesting AI summary generation for meeting: ' + meetingId);
    const result = await window.electronAPI.generateMeetingSummaryStreaming(meetingId);

    if (result.success) {
      console.log('Summary generation completed');
      // The UI will be updated by the summary update events

      // Expand sidebar when summary is generated
      const sidebar = document.getElementById('sidebar');
      const editorContent = document.querySelector('.editor-content');
      const chatInputContainer = document.querySelector('.chat-input-container');
      if (sidebar && sidebar.classList.contains('hidden')) {
        sidebar.classList.remove('hidden');
        editorContent.classList.remove('full-width');
        chatInputContainer.style.display = 'block';
      }
    } else {
      console.error('Failed to generate summary:', result.error);
      alert('Failed to generate summary. Please try again.');
    }
  } catch (error) {
    console.error('Error generating summary:', error);
    alert('Error generating summary: ' + error.message);
  } finally {
    // Reset button state
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.textContent = 'Auto';
    });
  }
};

// Function to update all recording pills when state changes
function updateAllRecordingPills() {
  // Update future meeting indicator if exists
  const futureMeetingIndicator = document.getElementById('futureMeetingIndicator');
  if (futureMeetingIndicator && currentEditingMeetingId) {
    const meetingsData = window.electronAPI.loadMeetingsData();
    meetingsData.then(data => {
      const meeting = [...(data.upcomingMeetings || []), ...(data.pastMeetings || [])]
        .find(m => m.id === currentEditingMeetingId);
      if (meeting) {
        const pill = createRecordingPill(meeting, 'editor');
        futureMeetingIndicator.innerHTML = '';
        futureMeetingIndicator.appendChild(pill);
      }
    });
  }

  // Update calendar view pills if visible
  const calendarView = document.querySelector('.calendar-view');
  if (calendarView && calendarView.style.display !== 'none') {
    // Re-render calendar section
    const calendarBtn = document.querySelector('.nav-btn[data-view="calendar"]');
    if (calendarBtn) {
      calendarBtn.click();
    }
  }
}

// Function to handle "Start now" button for future meetings (backward compatibility)
window.startRecordingNow = async function() {
  console.log('Starting recording for future meeting');

  // For future meetings, we need to start recording directly
  if (!currentEditingMeetingId) {
    console.error('No meeting currently being edited');
    return;
  }

  try {
    const result = await window.electronAPI.startManualRecording(currentEditingMeetingId);
    if (result.success) {
      console.log('Recording started successfully:', result.recordingId);
      window.isRecording = true;
      window.currentRecordingId = result.recordingId;
      window.currentMeetingId = currentEditingMeetingId;

      // Update the UI by refreshing the future meeting indicator
      const futureMeetingIndicator = document.getElementById('futureMeetingIndicator');
      if (futureMeetingIndicator) {
        futureMeetingIndicator.innerHTML = `
          <div class="meeting-time-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="8" fill="#ff4444"/>
            </svg>
            <span>Recording in progress</span>
          </div>
          <button class="stop-recording-btn" data-action="stop-recording">
            Stop Recording
          </button>
        `;

        // Add event listener for stop button
        const stopBtn = futureMeetingIndicator.querySelector('.stop-recording-btn');
        if (stopBtn) {
          stopBtn.addEventListener('click', () => {
            window.stopCurrentRecording();
          });
        }
      }
    } else {
      console.error('Failed to start recording:', result.error);
      alert('Failed to start recording: ' + result.error);
    }
  } catch (error) {
    console.error('Error starting recording:', error);
    alert('Error starting recording: ' + error.message);
  }
};

// Function to handle "Stop Recording" button for future meetings that have started recording
window.stopCurrentRecording = async function() {
  console.log('Stopping recording from future meeting indicator');
  if (window.isRecording && window.currentRecordingId) {
    try {
      const result = await window.electronAPI.generateSummary(window.currentRecordingId);
      if (result.success) {
        console.log('Recording stopped successfully');
        // The UI will be updated by the recording state change event
      } else {
        console.error('Failed to stop recording:', result.error);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  }
};

// Function to show attendees dropdown
function showAttendeesDropdown(meeting, triggerElement) {
  // Remove any existing dropdown
  const existingDropdown = document.querySelector('.attendees-dropdown');
  if (existingDropdown) {
    existingDropdown.remove();
    return; // Toggle behavior
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'attendees-dropdown';

  // Filter out the logged-in user
  const allAttendees = meeting.attendees || [];
  const attendees = allAttendees.filter(attendee => !attendee.isSelf);

  let attendeesListHtml = attendees.map(attendee => {
    const attendeeName = attendee.name || attendee.email?.split('@')[0] || 'User';
    const attendeeTitle = attendee.title || attendee.role || '';
    const attendeeEmail = attendee.email || '';

    // Get status indicator
    let statusIndicator = '';
    if (attendee.status === 'STATUS_ACCEPTED') {
      statusIndicator = `
        <div class="status-indicator status-accepted" title="Accepted">
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 11.5L2.5 8L3.91 6.59L6 8.67L12.09 2.59L13.5 4L6 11.5Z" fill="#0F9D58"/>
          </svg>
        </div>
      `;
    } else if (attendee.status === 'STATUS_DECLINED') {
      statusIndicator = `
        <div class="status-indicator status-declined" title="Declined">
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.59 4L8 8.59L3.41 4L2 5.41L6.59 10L2 14.59L3.41 16L8 11.41L12.59 16L14 14.59L9.41 10L14 5.41L12.59 4Z" fill="#DB4437"/>
          </svg>
        </div>
      `;
    } else if (attendee.status === 'STATUS_TENTATIVE') {
      statusIndicator = `
        <div class="status-indicator status-tentative" title="Tentative">
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 11H9V13H7V11ZM8 2C4.69 2 2 4.69 2 8C2 11.31 4.69 14 8 14C11.31 14 14 11.31 14 8C14 4.69 11.31 2 8 2ZM8 12.4C5.57 12.4 3.6 10.43 3.6 8C3.6 5.57 5.57 3.6 8 3.6C10.43 3.6 12.4 5.57 12.4 8C12.4 10.43 10.43 12.4 8 12.4ZM8 5C6.9 5 6 5.9 6 7H7.2C7.2 6.56 7.56 6.2 8 6.2C8.44 6.2 8.8 6.56 8.8 7C8.8 8.2 7 8.05 7 10H8.2C8.2 8.75 10 8.6 10 7C10 5.9 9.1 5 8 5Z" fill="#F4B400"/>
          </svg>
        </div>
      `;
    }

    return `
      <div class="attendee-item">
        <div class="attendee-item-left">
          <div class="attendee-avatar-large">
            ${attendee.photo_url ?
              `<img src="${attendee.photo_url}" alt="${attendeeName}" />` :
              `<div class="avatar-placeholder-large">${attendeeName.charAt(0).toUpperCase()}</div>`
            }
            ${statusIndicator}
          </div>
          <div class="attendee-info">
            <div class="attendee-name">${attendeeName}</div>
            ${attendeeTitle ? `<div class="attendee-title">${attendeeTitle}</div>` : ''}
          </div>
        </div>
        <div class="attendee-actions">
          ${attendeeEmail ? `
            <button class="attendee-action-btn" data-email="${attendeeEmail}" title="Copy email">
              <svg class="email-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 18H4V8L12 13L20 8V18ZM12 11L4 6H20L12 11Z" fill="currentColor"/>
              </svg>
              <svg class="copy-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  dropdown.innerHTML = `
    <div class="attendees-dropdown-header">
      <h3>Attendees</h3>
    </div>
    <div class="attendees-dropdown-list">
      ${attendeesListHtml}
    </div>
  `;

  document.body.appendChild(dropdown);

  // Position the dropdown
  const rect = triggerElement.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + 8}px`;
  dropdown.style.left = `${rect.left}px`;

  // Add email copy handlers
  dropdown.querySelectorAll('.attendee-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const email = btn.dataset.email;
      if (email) {
        await navigator.clipboard.writeText(email);
        // Show visual feedback
        btn.classList.add('copied');
        setTimeout(() => {
          btn.classList.remove('copied');
        }, 1500);
      }
    });
  });

  // Close dropdown when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closeDropdown(e) {
      if (!dropdown.contains(e.target) && !triggerElement.contains(e.target)) {
        dropdown.remove();
        document.removeEventListener('click', closeDropdown);
      }
    });
  }, 0);
}

// Function to create meeting card elements
// Create upcoming meeting card (for Coming up section)
function createUpcomingMeetingCard(meeting) {
  const card = document.createElement('div');
  card.className = 'upcoming-meeting-card';

  // Parse the meeting date
  const meetingDate = new Date(meeting.startTime || meeting.date);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Format time (e.g., "9:30")
  const timeStr = meetingDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  });

  // Format day (Today, Tomorrow, or day name)
  let dayStr;
  if (meetingDate.toDateString() === now.toDateString()) {
    dayStr = 'Today';
  } else if (meetingDate.toDateString() === tomorrow.toDateString()) {
    dayStr = 'Tomorrow';
  } else {
    dayStr = meetingDate.toLocaleDateString('en-US', { weekday: 'long' });
  }

  // Create date badge
  const monthStr = meetingDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const dayNum = meetingDate.getDate();

  // Get attendees info - filter out the logged-in user
  const allAttendees = meeting.attendees || [];
  const attendees = allAttendees.filter(attendee => !attendee.isSelf);
  const totalAttendees = attendees.length;

  // Get first attendee for display
  let attendeesHtml = '';
  if (totalAttendees > 0) {
    const firstAttendee = attendees[0];
    const attendeeName = firstAttendee.name || firstAttendee.email?.split('@')[0] || 'User';
    const additionalCount = totalAttendees - 1;

    // Get status indicator
    let statusIndicator = '';
    if (firstAttendee.status === 'STATUS_ACCEPTED') {
      statusIndicator = `
        <div class="status-indicator status-accepted" title="Accepted">
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 11.5L2.5 8L3.91 6.59L6 8.67L12.09 2.59L13.5 4L6 11.5Z" fill="#0F9D58"/>
          </svg>
        </div>
      `;
    } else if (firstAttendee.status === 'STATUS_DECLINED') {
      statusIndicator = `
        <div class="status-indicator status-declined" title="Declined">
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.59 4L8 8.59L3.41 4L2 5.41L6.59 10L2 14.59L3.41 16L8 11.41L12.59 16L14 14.59L9.41 10L14 5.41L12.59 4Z" fill="#DB4437"/>
          </svg>
        </div>
      `;
    } else if (firstAttendee.status === 'STATUS_TENTATIVE') {
      statusIndicator = `
        <div class="status-indicator status-tentative" title="Tentative">
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 11H9V13H7V11ZM8 2C4.69 2 2 4.69 2 8C2 11.31 4.69 14 8 14C11.31 14 14 11.31 14 8C14 4.69 11.31 2 8 2ZM8 12.4C5.57 12.4 3.6 10.43 3.6 8C3.6 5.57 5.57 3.6 8 3.6C10.43 3.6 12.4 5.57 12.4 8C12.4 10.43 10.43 12.4 8 12.4ZM8 5C6.9 5 6 5.9 6 7H7.2C7.2 6.56 7.56 6.2 8 6.2C8.44 6.2 8.8 6.56 8.8 7C8.8 8.2 7 8.05 7 10H8.2C8.2 8.75 10 8.6 10 7C10 5.9 9.1 5 8 5Z" fill="#F4B400"/>
          </svg>
        </div>
      `;
    }

    attendeesHtml = `
      <div class="meeting-attendees" data-meeting-id="${meeting.id}">
        <div class="attendee-avatar">
          ${firstAttendee.photo_url ?
            `<img src="${firstAttendee.photo_url}" alt="${attendeeName}" />` :
            `<div class="avatar-placeholder">${attendeeName.charAt(0).toUpperCase()}</div>`
          }
          ${statusIndicator}
        </div>
        <span class="attendee-text">${attendeeName}${additionalCount > 0 ? ` +${additionalCount}` : ''}</span>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="date-badge">
      <div class="date-month">${monthStr}</div>
      <div class="date-day">${dayNum}</div>
    </div>
    <div class="upcoming-meeting-content">
      <div class="upcoming-meeting-title">${meeting.title || 'Untitled Meeting'}</div>
      <div class="upcoming-meeting-meta">
        <div class="upcoming-meeting-time">${dayStr} ${timeStr}</div>
        ${attendeesHtml}
      </div>
    </div>
  `;

  card.addEventListener('click', async () => {
    console.log('Upcoming meeting clicked:', meeting);

    // Check if a note already exists for this meeting
    let existingNote = [...pastMeetings, ...upcomingMeetings].find(m =>
      m.id === meeting.id || m.calendarEventId === meeting.id
    );

    if (!existingNote) {
      // Create a new note for this meeting
      existingNote = {
        id: `meeting_${Date.now()}`,
        calendarEventId: meeting.id,
        title: meeting.title || 'Untitled Meeting',
        date: meeting.startTime || meeting.date,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        type: 'calendar',
        subtitle: meeting.organizerEmail || '',
        content: '',
        attendees: meeting.attendees || [],
        location: meeting.location,
        videoMeetingUrl: meeting.videoMeetingUrl,
        isFuture: true // Mark as future meeting
      };

      // Add to upcomingMeetings (not pastMeetings for future meetings)
      upcomingMeetings.push(existingNote);
      meetingsData.upcomingMeetings.push(existingNote);

      // Save to file
      await window.electronAPI.saveMeetingsData(meetingsData);
    } else {
      // Update existing note with latest calendar data (including attendees)
      existingNote.attendees = meeting.attendees || existingNote.attendees || [];
      existingNote.startTime = meeting.startTime || existingNote.startTime;
      existingNote.endTime = meeting.endTime || existingNote.endTime;
      existingNote.location = meeting.location || existingNote.location;
      existingNote.videoMeetingUrl = meeting.videoMeetingUrl || existingNote.videoMeetingUrl;
    }

    // Open the note (either existing or newly created)
    showEditorView(existingNote.id, true); // Pass true to indicate it's a future meeting
  });

  return card;
}

// Create meeting card with time (for date-grouped notes)
function createMeetingCardWithTime(meeting) {
  const card = document.createElement('div');
  card.className = 'meeting-card-with-time';
  card.dataset.id = meeting.id;

  // Format time
  const meetingDate = new Date(meeting.date);
  const timeStr = meetingDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  });

  let iconHtml = `
    <div class="meeting-icon document">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="#9CA3AF"/>
      </svg>
    </div>
  `;

  // Extract participant names if available
  let subtitle = meeting.subtitle;
  if (meeting.participants && meeting.participants.length > 0) {
    subtitle = meeting.participants.map(p => p.name).join(', ');
  }

  card.innerHTML = `
    ${iconHtml}
    <div class="meeting-content">
      <div class="meeting-title">${meeting.title}</div>
      <div class="meeting-subtitle">${subtitle || ''}</div>
    </div>
    <div class="meeting-time-right">
      <span class="time-text">${timeStr}</span>
      <button class="delete-meeting-btn" data-id="${meeting.id}" title="Delete note">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
        </svg>
      </button>
    </div>
  `;

  return card;
}

function createMeetingCard(meeting) {
  const card = document.createElement('div');
  card.className = 'meeting-card';
  card.dataset.id = meeting.id;

  let iconHtml = '';

  if (meeting.type === 'profile') {
    iconHtml = `
      <div class="profile-pic">
        <img src="https://via.placeholder.com/40" alt="Profile">
      </div>
    `;
  } else if (meeting.type === 'calendar') {
    iconHtml = `
      <div class="meeting-icon calendar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3.01 4.9 3.01 6L3 20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V10H19V20ZM19 8H5V6H19V8ZM9 14H7V12H9V14ZM13 14H11V12H13V14ZM17 14H15V12H17V14ZM9 18H7V16H9V18ZM13 18H11V16H13V18ZM17 18H15V16H17V18Z" fill="#6947BD"/>
        </svg>
      </div>
    `;
  } else if (meeting.type === 'document') {
    iconHtml = `
      <div class="meeting-icon document">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="#4CAF50"/>
        </svg>
      </div>
    `;
  }

  let subtitleHtml = meeting.hasDemo
    ? `<div class="meeting-time"><a class="meeting-demo-link">${meeting.subtitle}</a></div>`
    : `<div class="meeting-time">${meeting.subtitle}</div>`;

  card.innerHTML = `
    ${iconHtml}
    <div class="meeting-content">
      <div class="meeting-title">${meeting.title}</div>
      ${subtitleHtml}
    </div>
    <div class="meeting-actions">
      <button class="delete-meeting-btn" data-id="${meeting.id}" title="Delete note">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
        </svg>
      </button>
    </div>
  `;

  return card;
}

// Function to update live transcript in sidebar
function updateLiveTranscript(transcript) {
  const chatContainer = document.getElementById('transcriptChat');
  if (!chatContainer) return;

  // Clear placeholder if it exists
  const placeholder = chatContainer.querySelector('.transcript-placeholder');
  if (placeholder) {
    placeholder.remove();
  }

  // Group consecutive messages from the same speaker
  let processedTranscript = [];
  let currentSpeaker = null;
  let currentMessages = [];

  transcript.forEach(entry => {
    if (entry.speaker !== currentSpeaker) {
      if (currentSpeaker && currentMessages.length > 0) {
        processedTranscript.push({
          speaker: currentSpeaker,
          messages: [...currentMessages],
          timestamp: currentMessages[0].timestamp
        });
      }
      currentSpeaker = entry.speaker;
      currentMessages = [entry];
    } else {
      currentMessages.push(entry);
    }
  });

  // Add the last group
  if (currentSpeaker && currentMessages.length > 0) {
    processedTranscript.push({
      speaker: currentSpeaker,
      messages: [...currentMessages],
      timestamp: currentMessages[0].timestamp
    });
  }

  // Clear and rebuild the chat
  chatContainer.innerHTML = '';

  processedTranscript.forEach((group, index) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'transcript-message';

    // Alternate between user and AI styling for different speakers
    if (index % 2 === 0) {
      messageDiv.classList.add('ai-message');
    } else {
      messageDiv.classList.add('user-message');
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Add speaker name
    const speakerDiv = document.createElement('div');
    speakerDiv.className = 'message-speaker';
    speakerDiv.textContent = group.speaker;
    bubble.appendChild(speakerDiv);

    // Add combined text
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = group.messages.map(m => m.text).join(' ');
    bubble.appendChild(textDiv);

    // Add timestamp
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    const time = new Date(group.timestamp);
    timeDiv.textContent = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(timeDiv);

    messageDiv.appendChild(bubble);
    chatContainer.appendChild(messageDiv);
  });

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Function to update the unified record button based on meeting detection
function updateRecordButtonState() {
  const recordMeetingBtn = document.getElementById('recordMeetingBtn');
  if (!recordMeetingBtn) return;

  if (window.meetingDetected) {
    // Meeting detected - enable button for video recording
    recordMeetingBtn.disabled = false;
    recordMeetingBtn.classList.remove('audio-mode');
    recordMeetingBtn.classList.add('video-mode');
    recordMeetingBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="btn-icon">
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" fill="currentColor"/>
      </svg>
      <span>Record Meeting with Video</span>
    `;
  } else {
    // No meeting detected - enable button for audio-only recording
    recordMeetingBtn.disabled = false;
    recordMeetingBtn.classList.remove('video-mode');
    recordMeetingBtn.classList.add('audio-mode');
    recordMeetingBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="btn-icon">
        <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z" fill="currentColor"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor"/>
      </svg>
      <span>Record Meeting with Audio only</span>
    `;
  }
}

// Function to show home view
function showHomeView() {
  document.getElementById('homeView').style.display = 'block';
  document.getElementById('editorView').style.display = 'none';
  document.getElementById('backButton').style.display = 'none';
  document.getElementById('toggleSidebar').style.display = 'none';

  // Hide the meeting sidebar
  const sidebar = document.getElementById('meetingSidebar');
  if (sidebar) {
    sidebar.style.display = 'none';
  }

  // Hide the sidebar toggle button
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  if (sidebarToggleBtn) {
    sidebarToggleBtn.style.display = 'none';
  }

  // Show unified Record Meeting button and set its state based on meeting detection
  const recordMeetingBtn = document.getElementById('recordMeetingBtn');
  if (recordMeetingBtn) {
    // Always show the button
    recordMeetingBtn.style.display = 'block';
    updateRecordButtonState();
  }
}

// Function to show editor view
function showEditorView(meetingId, isFutureMeeting = false) {
  console.log(`Showing editor view for meeting ID: ${meetingId}, Future: ${isFutureMeeting}`);

  // Make the views visible/hidden
  document.getElementById('homeView').style.display = 'none';
  document.getElementById('editorView').style.display = 'block';
  document.getElementById('backButton').style.display = 'block';
  document.getElementById('toggleSidebar').style.display = 'none'; // Hide the old sidebar toggle

  // Always hide the record meeting button when in editor view
  const recordMeetingBtn = document.getElementById('recordMeetingBtn');
  if (recordMeetingBtn) {
    recordMeetingBtn.style.display = 'none';
  }

  // Show the new meeting sidebar
  const sidebar = document.getElementById('meetingSidebar');
  if (sidebar) {
    sidebar.style.display = 'flex';
    sidebar.classList.add('collapsed'); // Always start collapsed
  }

  // Show the sidebar toggle button and reset its state
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  if (sidebarToggleBtn) {
    sidebarToggleBtn.style.display = 'block';
    sidebarToggleBtn.classList.remove('expanded'); // Reset button position
    // Reset icon to left arrow (for opening)
    sidebarToggleBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12L15.41 7.41Z" fill="currentColor"/>
      </svg>
    `;
  }

  // Find the meeting in either upcoming or past meetings
  let meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);

  // Update transcript service with meeting data
  if (meeting && meeting.transcript && meeting.transcript.length > 0) {
    transcriptService.setTranscript(meeting.transcript);
    if (window.updateTranscriptButtons) {
      window.updateTranscriptButtons(true);
    }
    // Update live transcript in sidebar
    updateLiveTranscript(meeting.transcript);
  } else {
    transcriptService.setTranscript([]);
    if (window.updateTranscriptButtons) {
      window.updateTranscriptButtons(false);
    }
    // Clear transcript in sidebar
    const chatContainer = document.getElementById('transcriptChat');
    if (chatContainer) {
      chatContainer.innerHTML = `
        <div class="transcript-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z" fill="#999" opacity="0.5"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="#999" opacity="0.5"/>
          </svg>
          <p>Transcript will appear here when recording starts</p>
        </div>
      `;
    }
  }

  if (!meeting) {
    console.error(`Meeting not found: ${meetingId}`);
    return;
  }

  // Set the current editing meeting ID
  currentEditingMeetingId = meetingId;
  console.log(`Now editing meeting: ${meetingId} - ${meeting.title}`);



  // Set the meeting title
  document.getElementById('noteTitle').textContent = meeting.title;

  // Set the date display
  const dateObj = new Date(meeting.date);
  document.getElementById('noteDate').textContent = formatDate(dateObj);

  // Set up participants display - filter out the logged-in user
  const participantsElement = document.getElementById('noteParticipants');
  const allAttendees = meeting.attendees || [];
  const attendees = allAttendees.filter(attendee => !attendee.isSelf);

  if (attendees.length > 0) {
    const firstAttendee = attendees[0];
    const attendeeName = firstAttendee.name || firstAttendee.email?.split('@')[0] || 'User';
    const additionalCount = attendees.length - 1;

    // Get status indicator
    let statusIndicator = '';
    if (firstAttendee.status === 'STATUS_ACCEPTED') {
      statusIndicator = `
        <div class="status-indicator status-accepted" title="Accepted">
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 11.5L2.5 8L3.91 6.59L6 8.67L12.09 2.59L13.5 4L6 11.5Z" fill="#0F9D58"/>
          </svg>
        </div>
      `;
    } else if (firstAttendee.status === 'STATUS_DECLINED') {
      statusIndicator = `
        <div class="status-indicator status-declined" title="Declined">
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.59 4L8 8.59L3.41 4L2 5.41L6.59 10L2 14.59L3.41 16L8 11.41L12.59 16L14 14.59L9.41 10L14 5.41L12.59 4Z" fill="#DB4437"/>
          </svg>
        </div>
      `;
    } else if (firstAttendee.status === 'STATUS_TENTATIVE') {
      statusIndicator = `
        <div class="status-indicator status-tentative" title="Tentative">
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 11H9V13H7V11ZM8 2C4.69 2 2 4.69 2 8C2 11.31 4.69 14 8 14C11.31 14 14 11.31 14 8C14 4.69 11.31 2 8 2ZM8 12.4C5.57 12.4 3.6 10.43 3.6 8C3.6 5.57 5.57 3.6 8 3.6C10.43 3.6 12.4 5.57 12.4 8C12.4 10.43 10.43 12.4 8 12.4ZM8 5C6.9 5 6 5.9 6 7H7.2C7.2 6.56 7.56 6.2 8 6.2C8.44 6.2 8.8 6.56 8.8 7C8.8 8.2 7 8.05 7 10H8.2C8.2 8.75 10 8.6 10 7C10 5.9 9.1 5 8 5Z" fill="#F4B400"/>
          </svg>
        </div>
      `;
    }

    participantsElement.innerHTML = `
      <div class="attendee-avatar">
        ${firstAttendee.photo_url ?
          `<img src="${firstAttendee.photo_url}" alt="${attendeeName}" />` :
          `<div class="avatar-placeholder">${attendeeName.charAt(0).toUpperCase()}</div>`
        }
        ${statusIndicator}
      </div>
      <span class="attendee-text">${attendeeName}${additionalCount > 0 ? ` +${additionalCount}` : ''}</span>
    `;
    participantsElement.style.display = 'flex';

    // Remove any existing click handlers by cloning the element
    const newParticipantsElement = participantsElement.cloneNode(true);
    participantsElement.parentNode.replaceChild(newParticipantsElement, participantsElement);

    // Add click handler to show dropdown
    newParticipantsElement.style.cursor = 'pointer';
    newParticipantsElement.addEventListener('click', (e) => {
      e.stopPropagation();
      showAttendeesDropdown(meeting, newParticipantsElement);
    });
  } else {
    // No participants data - hide participants element
    participantsElement.style.display = 'none';
  }

  // Support both legacy and new tabbed editor
  const legacyEditorElement = document.getElementById('simple-editor');
  const personalNotesElement = document.getElementById('personal-notes-editor');
  const aiSummaryEditor = document.getElementById('ai-summary-editor');

  // Important: Reset the editor content completely
  if (legacyEditorElement) {
    legacyEditorElement.value = '';
  }
  if (personalNotesElement) {
    personalNotesElement.value = '';
  }
  if (aiSummaryEditor) {
    aiSummaryEditor.value = '';
  }

  // Add a small delay to ensure the DOM has updated before setting content
  setTimeout(() => {
    if (personalNotesElement) {
      // New tabbed editor
      // Load personal notes
      if (meeting.personalNotes) {
        personalNotesElement.value = meeting.personalNotes;
        console.log(`Loaded personal notes for meeting: ${meetingId}, length: ${meeting.personalNotes.length} characters`);
      } else if (meeting.content) {
        // Migrate legacy content to personal notes
        personalNotesElement.value = meeting.content;
        meeting.personalNotes = meeting.content;
        console.log(`Migrated legacy content to personal notes for meeting: ${meetingId}`);
      }

      // Load AI summary if it exists
      if (meeting.aiSummary && aiSummaryEditor) {
        aiSummaryEditor.value = meeting.aiSummary;
        console.log(`Loaded AI summary for meeting: ${meetingId}, length: ${meeting.aiSummary.length} characters`);
      }


      // Load meeting video if available
      loadMeetingVideo(meeting);
    } else if (legacyEditorElement) {
      // Legacy single editor
      if (meeting.content) {
        legacyEditorElement.value = meeting.content;
        console.log(`Loaded content for meeting: ${meetingId}, length: ${meeting.content.length} characters`);
      } else {
        // If content is missing, create template
        const now = new Date();
        const template = `# Meeting Title\n• ${meeting.title}\n\n# Meeting Date and Time\n• ${now.toLocaleString()}\n\n# Participants\n• \n\n# Description\n• \n\nChat with meeting transcript: `;
        legacyEditorElement.value = template;

        // Save this template to the meeting
        meeting.content = template;
        saveMeetingsData();
        console.log(`Created new template for meeting: ${meetingId}`);
      }
    }

    // Set up auto-save handler for this specific note
    setupAutoSaveHandler();

    // Add event listener to the title
    setupTitleEditing();

    // Handle future meeting UI
    const floatingControls = document.querySelector('.floating-controls');
    if (meeting && meeting.startTime) {
      const startTime = new Date(meeting.startTime);
      const now = new Date();
      const timeDiff = startTime - now;
      const hoursUntilMeeting = timeDiff / (1000 * 60 * 60);

      if (timeDiff > 0) {
        // This is a future meeting
        console.log(`Future meeting starts in ${hoursUntilMeeting.toFixed(1)} hours`);

        // Always show floating controls for future meetings
        if (floatingControls) {
          floatingControls.style.display = 'flex';

          // Add meeting time to the floating controls for all future meetings
          const timeStr = startTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }).replace(' ', '').toLowerCase();

          // Create or update meeting time display in floating controls
          let timeDisplay = floatingControls.querySelector('.meeting-time-display');
          if (!timeDisplay) {
            timeDisplay = document.createElement('div');
            timeDisplay.className = 'meeting-time-display';
            floatingControls.insertBefore(timeDisplay, floatingControls.firstChild);
          }
          timeDisplay.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" fill="currentColor"/>
              <path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor"/>
            </svg>
            <span>Starts ${timeStr}</span>
          `;

          // Hide recording buttons for meetings more than 2 hours away
          const controlButtons = floatingControls.querySelector('.control-buttons');
          if (controlButtons) {
            if (hoursUntilMeeting > 2) {
              controlButtons.style.display = 'none';
            } else {
              controlButtons.style.display = 'flex';
            }
          }
        }

        // Hide the future meeting indicator pill since we're showing time in floating controls
        const indicator = document.getElementById('futureMeetingIndicator');
        if (indicator) {
          indicator.style.display = 'none';
        }

        // Check if this note has an active recording and update the record button (for meetings within 2 hours)
        if (hoursUntilMeeting <= 2) {
          checkActiveRecordingState();
        }
      } else {
        // This is a current or past meeting
        // Remove future meeting indicator if it exists
        const indicator = document.getElementById('futureMeetingIndicator');
        if (indicator) {
          indicator.style.display = 'none';
        }

        // Show recording controls and remove any meeting time display
        if (floatingControls) {
          floatingControls.style.display = 'flex';
          const timeDisplay = floatingControls.querySelector('.meeting-time-display');
          if (timeDisplay) {
            timeDisplay.remove();
          }
        }

        // Check if meeting is older than 4 hours
        const endTime = meeting.endTime ? new Date(meeting.endTime) : new Date(meeting.startTime || meeting.date);
        const now = new Date();
        const hoursSinceEnd = (now - endTime) / (1000 * 60 * 60);

        const recordButton = document.getElementById('recordButton');
        if (hoursSinceEnd > 4) {
          // Meeting ended more than 4 hours ago - hide record button, keep summarize button
          if (recordButton) {
            recordButton.style.display = 'none';
          }
        } else {
          // Meeting ended less than 4 hours ago - show record button
          if (recordButton) {
            recordButton.style.display = 'flex';
          }
          // Check if this note has an active recording and update the record button
          checkActiveRecordingState();
        }
      }
    } else {
      // No start time, treat as regular note
      // Remove future meeting indicator if it exists
      const indicator = document.getElementById('futureMeetingIndicator');
      if (indicator) {
        indicator.style.display = 'none';
      }

      // Show recording controls and remove any meeting time display
      if (floatingControls) {
        floatingControls.style.display = 'flex';
        const timeDisplay = floatingControls.querySelector('.meeting-time-display');
        if (timeDisplay) {
          timeDisplay.remove();
        }
      }

      // Check if this note has an active recording and update the record button
      checkActiveRecordingState();
    }

    // Update debug panel with any available data if it's open
    const debugPanel = document.getElementById('debugPanel');
    if (debugPanel && !debugPanel.classList.contains('hidden')) {
      // Update transcript if available
      if (meeting.transcript && meeting.transcript.length > 0) {
        updateDebugTranscript(meeting.transcript);
      } else {
        // Clear transcript area if no transcript
        const transcriptContent = document.getElementById('transcriptContent');
        if (transcriptContent) {
          transcriptContent.innerHTML = `
            <div class="placeholder-content">
              <p>No transcript available yet</p>
            </div>
          `;
        }
      }

      // Update participants if available
      if (meeting.participants && meeting.participants.length > 0) {
        updateDebugParticipants(meeting.participants);
      } else {
        // Clear participants area if no participants
        const participantsContent = document.getElementById('participantsContent');
        if (participantsContent) {
          participantsContent.innerHTML = `
            <div class="placeholder-content">
              <p>No participants detected yet</p>
            </div>
          `;
        }
      }

      // Reset video preview when changing notes
      const videoContent = document.getElementById('videoContent');
      if (videoContent) {
        videoContent.innerHTML = `
          <div class="placeholder-content video-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" fill="#999"/>
            </svg>
            <p>Video preview will appear here</p>
          </div>
        `;
      }
    }
  }, 50);
}

// Setup the title editing and save function
function setupTitleEditing() {
  const titleElement = document.getElementById('noteTitle');

  // Remove existing event listeners if any
  titleElement.removeEventListener('blur', titleBlurHandler);
  titleElement.removeEventListener('keydown', titleKeydownHandler);

  // Add event listeners
  titleElement.addEventListener('blur', titleBlurHandler);
  titleElement.addEventListener('keydown', titleKeydownHandler);
}

// Event handler for title blur
async function titleBlurHandler() {
  await saveCurrentNote();
}

// Event handler for title keydown
function titleKeydownHandler(e) {
  if (e.key === 'Enter') {
    e.preventDefault(); // Prevent new line
    e.target.blur(); // Remove focus to trigger save
  }
}

// Create a single reference to the auto-save handler to ensure we can remove it properly
let currentAutoSaveHandler = null;


// Function to set up auto-save handler
function setupAutoSaveHandler() {
  // Create a debounced auto-save handler
  const autoSaveHandler = debounce(async () => {
    console.log('Auto-saving note due to content change');
    if (currentEditingMeetingId) {
      console.log(`Auto-save triggered for meeting: ${currentEditingMeetingId}`);
      await saveCurrentNote();
    } else {
      console.warn('Cannot auto-save: No active meeting ID');
    }
  }, 1000);

  // First remove any existing handler
  if (currentAutoSaveHandler) {
    const legacyEditor = document.getElementById('simple-editor');
    const personalNotesEditor = document.getElementById('personal-notes-editor');
    const aiSummaryEditor = document.getElementById('ai-summary-editor');

    if (legacyEditor) {
      console.log('Removing existing auto-save handler from legacy editor');
      legacyEditor.removeEventListener('input', currentAutoSaveHandler);
    }
    if (personalNotesEditor) {
      console.log('Removing existing auto-save handler from personal notes editor');
      personalNotesEditor.removeEventListener('input', currentAutoSaveHandler);
    }
    if (aiSummaryEditor) {
      console.log('Removing existing auto-save handler from AI summary editor');
      aiSummaryEditor.removeEventListener('input', currentAutoSaveHandler);
    }
  }

  // Store the reference for future cleanup
  currentAutoSaveHandler = autoSaveHandler;

  // Attach handler to whichever editors are present
  const legacyEditor = document.getElementById('simple-editor');
  const personalNotesEditor = document.getElementById('personal-notes-editor');
  const aiSummaryEditor = document.getElementById('ai-summary-editor');

  if (personalNotesEditor && aiSummaryEditor) {
    // New tabbed editor - attach to both editors
    personalNotesEditor.addEventListener('input', autoSaveHandler);
    aiSummaryEditor.addEventListener('input', autoSaveHandler);
    console.log(`Set up tabbed editor auto-save handlers for meeting: ${currentEditingMeetingId || 'none'}`);

    // Manually trigger a save once to ensure the content is saved
    setTimeout(() => {
      console.log('Triggering initial save after setup');
      personalNotesEditor.dispatchEvent(new Event('input'));
    }, 500);
  } else if (legacyEditor) {
    legacyEditor.addEventListener('input', autoSaveHandler);
    console.log(`Set up legacy editor auto-save handler for meeting: ${currentEditingMeetingId || 'none'}`);

    // Manually trigger a save once to ensure the content is saved
    setTimeout(() => {
      console.log('Triggering initial save after setup');
      legacyEditor.dispatchEvent(new Event('input'));
    }, 500);
  } else {
    console.warn('Editor element not found for auto-save setup');
  }
}

// Function to create a new meeting
async function createNewMeeting() {
  console.log('Creating new note...');

  // Save any existing note before creating a new one
  if (currentEditingMeetingId) {
    await saveCurrentNote();
    console.log('Saved current note before creating new one');
  }

  // Reset the current editing ID to ensure we start fresh
  currentEditingMeetingId = null;

  // Generate a unique ID
  const id = 'meeting-' + Date.now();
  console.log('Generated new meeting ID:', id);

  // Current date and time
  const now = new Date();

  // Generate the template for the content
  const template = `# Meeting Title\n• New Note\n\n# Meeting Date and Time\n• ${now.toLocaleString()}\n\n# Participants\n• \n\n# Description\n• \n\nChat with meeting transcript: `;

  // Create a new meeting object - ensure it's of type document
  const newMeeting = {
    id: id,
    type: 'document', // Explicitly set as document type, not calendar
    title: 'New Note',
    subtitle: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    hasDemo: false,
    date: now.toISOString(),
    participants: [],
    content: template // Set the content directly
  };

  // Log what we're adding
  console.log(`Adding new meeting: id=${id}, title=${newMeeting.title}, content.length=${template.length}`);

  // Add to pastMeetings - make sure to push to both arrays
  pastMeetings.unshift(newMeeting);
  meetingsData.pastMeetings.unshift(newMeeting);

  // Update the grouped meetings
  const dateKey = formatDateHeader(newMeeting.date);
  if (!pastMeetingsByDate[dateKey]) {
    pastMeetingsByDate[dateKey] = [];
  }
  pastMeetingsByDate[dateKey].unshift(newMeeting);

  // Save the data to file
  try {
    await saveMeetingsData();
    console.log('New meeting created and saved:', newMeeting.title);
  } catch (error) {
    console.error('Error saving new meeting:', error);
  }

  // Set current editing ID to the new meeting ID BEFORE showing the editor
  currentEditingMeetingId = id;
  console.log('Set currentEditingMeetingId to:', id);

  // Force a reset of the editor before showing the new meeting
  const personalNotesEditor = document.getElementById('personal-notes-editor');
  if (personalNotesEditor) {
    personalNotesEditor.value = '';
  }

  const aiSummaryEditor = document.getElementById('ai-summary-editor');
  if (aiSummaryEditor) {
    aiSummaryEditor.value = '';
  }

  // Now show the editor view with the new meeting
  showEditorView(id);

  // Automatically start recording for the new note
  try {
    console.log('Auto-starting recording for new note');
    // Start manual recording for the new note
    window.electronAPI.startManualRecording(id)
      .then(result => {
        if (result.success) {
          console.log('Auto-started recording for new note with ID:', result.recordingId);
          // Update recording button UI
          window.isRecording = true;
          window.currentRecordingId = result.recordingId;

          // Update recording button UI
          const recordButton = document.getElementById('recordButton');
          if (recordButton) {
            const recordIcon = recordButton.querySelector('.record-icon');
            const stopIcon = recordButton.querySelector('.stop-icon');

            recordButton.classList.add('recording');
            recordButton.disabled = false; // Ensure button is enabled so user can stop recording
            recordIcon.style.display = 'none';
            stopIcon.style.display = 'block';
          }
        } else {
          console.error('Failed to auto-start recording:', result.error);
        }
      })
      .catch(error => {
        console.error('Error auto-starting recording:', error);
      });
  } catch (error) {
    console.error('Exception auto-starting recording:', error);
  }

  return id;
}

// Function to render meetings to the page
// Store calendar meetings
let calendarMeetings = [];

// Fetch calendar meetings from API
async function fetchCalendarMeetings() {
  try {
    const result = await window.electronAPI.calendar.getUpcomingMeetings(24); // Next 24 hours

    if (result.success && result.meetings && Array.isArray(result.meetings)) {
      calendarMeetings = result.meetings;

      // Sort meetings by start time
      calendarMeetings.sort((a, b) => {
        const dateA = new Date(a.startTime || a.date);
        const dateB = new Date(b.startTime || b.date);
        return dateA - dateB;
      });
    } else {
      calendarMeetings = [];
    }
  } catch (error) {
    console.error('Failed to fetch calendar meetings:', error);
    calendarMeetings = [];
  }
}

// Fetch past meetings from API for notes section
async function fetchPastMeetings() {
  try {
    const result = await window.electronAPI.calendar.getPastMeetings(7); // Past 7 days

    if (result.success && result.meetings && Array.isArray(result.meetings)) {
      result.meetings.forEach(meeting => {
        // Check if note already exists
        const existingNote = [...pastMeetings, ...upcomingMeetings].find(m =>
          m.id === meeting.id || m.calendarEventId === meeting.id
        );

        if (!existingNote) {
          // Create a new note for this past meeting
          const newNote = {
            id: `meeting_${Date.now()}_${meeting.id}`,
            calendarEventId: meeting.id,
            title: meeting.title || 'Untitled Meeting',
            date: meeting.startTime || meeting.date,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            type: 'calendar',
            subtitle: meeting.organizerEmail || '',
            content: '',
            attendees: meeting.attendees || [],
            location: meeting.location,
            videoMeetingUrl: meeting.videoMeetingUrl,
            isFuture: false
          };

          // Add to pastMeetings
          pastMeetings.unshift(newNote);
          meetingsData.pastMeetings.unshift(newNote);

          // Update grouped meetings
          const dateKey = formatDateHeader(newNote.date);
          if (!pastMeetingsByDate[dateKey]) {
            pastMeetingsByDate[dateKey] = [];
          }
          pastMeetingsByDate[dateKey].unshift(newNote);
        }
      });

      // Save if we added any new past meetings
      if (result.meetings.length > 0) {
        await window.electronAPI.saveMeetingsData(meetingsData);
      }
    }
  } catch (error) {
    console.error('Failed to fetch past meetings:', error);
  }
}

function renderMeetings() {
  // Clear previous content
  const mainContent = document.querySelector('.main-content .content-container');
  mainContent.innerHTML = '';

  // Create "Coming up" section - always show it with refresh button
  if (true) { // Always render the section
    const upcomingSection = document.createElement('section');
    upcomingSection.className = 'upcoming-section';

    // Sort calendar meetings by start time
    const sortedMeetings = [...calendarMeetings].sort((a, b) => {
      return new Date(a.startTime) - new Date(b.startTime);
    });

    // Filter meetings for today and this week
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const endOfWeek = new Date(now);
    const daysUntilEndOfWeek = 6 - now.getDay() + 7; // Current week + next week
    endOfWeek.setDate(now.getDate() + daysUntilEndOfWeek);
    endOfWeek.setHours(23, 59, 59, 999);

    const todayMeetings = sortedMeetings.filter(meeting => {
      const meetingStart = new Date(meeting.startTime);
      const meetingEnd = new Date(meeting.endTime);
      // Show if meeting hasn't ended yet (includes ongoing meetings)
      return meetingEnd >= now && meetingStart <= endOfToday;
    });

    const weekMeetings = sortedMeetings.filter(meeting => {
      const meetingStart = new Date(meeting.startTime);
      const meetingEnd = new Date(meeting.endTime);
      // Show if meeting hasn't ended yet (includes ongoing meetings)
      return meetingEnd >= now && meetingStart <= endOfWeek;
    });

    let showingAll = false;
    const hasMoreMeetings = weekMeetings.length > 4;

    upcomingSection.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Coming up</h2>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${hasMoreMeetings ? '<button class="show-more-btn" id="showMoreUpcoming">Show more</button>' : ''}
          <button class="show-more-btn" id="refreshMeetings" title="Refresh meetings" style="padding: 6px 10px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="upcoming-meetings-list" id="upcoming-list"></div>
    `;
    mainContent.appendChild(upcomingSection);

    const upcomingContainer = document.getElementById('upcoming-list');

    // Function to render meetings
    const renderUpcomingMeetings = (meetings) => {
      upcomingContainer.innerHTML = '';
      if (meetings.length === 0) {
        upcomingContainer.innerHTML = '<p style="color: #6B7280; padding: 20px; text-align: center;">No upcoming meetings</p>';
      } else {
        meetings.forEach(meeting => {
          upcomingContainer.appendChild(createUpcomingMeetingCard(meeting));
        });
      }
    };

    // Initially show first 4 meetings or empty state
    renderUpcomingMeetings(weekMeetings.slice(0, 4));

    // Handle show more button
    if (weekMeetings.length > 4) {
      const showMoreBtn = document.getElementById('showMoreUpcoming');
      showMoreBtn.addEventListener('click', () => {
        showingAll = !showingAll;
        if (showingAll) {
          renderUpcomingMeetings(weekMeetings);
          showMoreBtn.textContent = 'Show less';
        } else {
          renderUpcomingMeetings(weekMeetings.slice(0, 4));
          showMoreBtn.textContent = 'Show more';
        }
      });
    }

    // Handle refresh button
    const refreshBtn = document.getElementById('refreshMeetings');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        const originalHTML = refreshBtn.innerHTML;
        const previousMeetingsCount = calendarMeetings.length;

        refreshBtn.disabled = true;
        refreshBtn.style.opacity = '0.5';
        refreshBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
            <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        `;

        // Fetch latest calendar meetings
        await fetchCalendarMeetings();

        // Get IDs of current calendar meetings from API
        const currentCalendarIds = new Set(calendarMeetings.map(m => m.id));
        console.log('Current calendar meeting IDs from API:', Array.from(currentCalendarIds));

        // Remove calendar meetings from local storage that no longer exist in API
        // Only remove calendar-type meetings that don't have content/notes
        const calendarMeetingsToRemove = [];

        upcomingMeetings.forEach((meeting, index) => {
          // Check using calendarEventId since that's what matches the API
          if (meeting.type === 'calendar' && meeting.calendarEventId && !currentCalendarIds.has(meeting.calendarEventId)) {
            // Only remove if it doesn't have any content (transcript, notes, etc.)
            if (!meeting.transcript?.length && !meeting.content && !meeting.personalNotes) {
              console.log('Marking for removal from upcoming:', meeting.title, meeting.calendarEventId);
              calendarMeetingsToRemove.push({ array: upcomingMeetings, index, meeting });
            }
          }
        });

        pastMeetings.forEach((meeting, index) => {
          // Check using calendarEventId since that's what matches the API
          if (meeting.type === 'calendar' && meeting.calendarEventId && !currentCalendarIds.has(meeting.calendarEventId)) {
            // Only remove if it doesn't have any content (transcript, notes, etc.)
            if (!meeting.transcript?.length && !meeting.content && !meeting.personalNotes) {
              console.log('Marking for removal from past:', meeting.title, meeting.calendarEventId);
              calendarMeetingsToRemove.push({ array: pastMeetings, index, meeting });
            }
          }
        });

        // Remove meetings from arrays (reverse order to maintain indices)
        calendarMeetingsToRemove.reverse().forEach(({ array, index }) => {
          array.splice(index, 1);
        });

        // Update meetingsData to reflect removals
        meetingsData.upcomingMeetings = [...upcomingMeetings];
        meetingsData.pastMeetings = [...pastMeetings];

        // Save to file if we removed any meetings
        if (calendarMeetingsToRemove.length > 0) {
          await window.electronAPI.saveMeetingsData(meetingsData);
          console.log(`Removed ${calendarMeetingsToRemove.length} obsolete calendar meetings`);
        }

        // Re-render meetings
        renderMeetings();

        const newMeetingsCount = calendarMeetings.length - previousMeetingsCount;
        const removedCount = calendarMeetingsToRemove.length;

        let message = '';
        if (newMeetingsCount > 0 && removedCount > 0) {
          message = `${newMeetingsCount} new, ${removedCount} removed`;
        } else if (newMeetingsCount > 0) {
          message = `${newMeetingsCount} new meeting${newMeetingsCount > 1 ? 's' : ''}`;
        } else if (removedCount > 0) {
          message = `${removedCount} meeting${removedCount > 1 ? 's' : ''} removed`;
        } else {
          message = 'Up to date';
        }

        // Show toast notification
        showToast(message, 'success');

        refreshBtn.innerHTML = `<span style="font-size: 11px;">${message}</span>`;
        refreshBtn.disabled = false;
        refreshBtn.style.opacity = '1';

        setTimeout(() => {
          refreshBtn.innerHTML = originalHTML;
        }, 2000);
      });
    }
  }

  // Group notes by date (all past meetings, regardless of type)
  const notesByDate = {};
  const now = new Date();
  const allNotes = pastMeetings
    .filter(meeting => {
      // Calculate if meeting is in the future based on endTime or startTime
      if (meeting.endTime) {
        return new Date(meeting.endTime) <= now;
      } else if (meeting.startTime) {
        return new Date(meeting.startTime) <= now;
      }
      // If no time info, include it (legacy meetings or ad-hoc recordings)
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Group meetings by date
  allNotes.forEach(meeting => {
    const dateKey = formatDateHeader(meeting.date);
    if (!notesByDate[dateKey]) {
      notesByDate[dateKey] = [];
    }
    notesByDate[dateKey].push(meeting);
  });

  // Create notes sections grouped by date
  Object.entries(notesByDate).forEach(([dateHeader, meetings]) => {
    const dateSection = document.createElement('section');
    dateSection.className = 'date-section';

    // Add date header
    const dateHeaderEl = document.createElement('h3');
    dateHeaderEl.className = 'date-header';
    dateHeaderEl.textContent = dateHeader;
    dateSection.appendChild(dateHeaderEl);

    // Add meetings for this date
    const meetingsList = document.createElement('div');
    meetingsList.className = 'date-meetings-list';

    meetings.forEach(meeting => {
      meetingsList.appendChild(createMeetingCardWithTime(meeting));
    });

    dateSection.appendChild(meetingsList);
    mainContent.appendChild(dateSection);
  });
}

// Load meetings data from file
async function loadMeetingsDataFromFile() {
  console.log("Loading meetings data from file...");
  try {
    const result = await window.electronAPI.loadMeetingsData();
    console.log("Load result success:", result.success);

    if (result.success) {
      console.log(`Got data with ${result.data.pastMeetings?.length || 0} past meetings`);
      if (result.data.pastMeetings && result.data.pastMeetings.length > 0) {
        console.log("Most recent meeting:", result.data.pastMeetings[0].id, result.data.pastMeetings[0].title);
      }

      // Initialize arrays if they don't exist in the loaded data
      if (!result.data.upcomingMeetings) {
        result.data.upcomingMeetings = [];
      }

      if (!result.data.pastMeetings) {
        result.data.pastMeetings = [];
      }

      // Update the meetings data objects
      Object.assign(meetingsData, result.data);

      // Clear and reassign the references
      upcomingMeetings.length = 0;
      pastMeetings.length = 0;

      console.log("Before updating arrays, pastMeetings count:", pastMeetings.length);

      // Copy all meetings to the arrays (including calendar-created notes)
      // We want to keep calendar-created notes as they can have transcripts
      meetingsData.upcomingMeetings
        .forEach(meeting => upcomingMeetings.push(meeting));

      meetingsData.pastMeetings
        .forEach(meeting => pastMeetings.push(meeting));

      console.log("After updating arrays, pastMeetings count:", pastMeetings.length);
      if (pastMeetings.length > 0) {
        console.log("First past meeting:", pastMeetings[0].id, pastMeetings[0].title);
      }

      // Regroup past meetings by date
      pastMeetingsByDate = {};
      meetingsData.pastMeetings.forEach(meeting => {
        const dateKey = formatDateHeader(meeting.date);
        if (!pastMeetingsByDate[dateKey]) {
          pastMeetingsByDate[dateKey] = [];
        }
        pastMeetingsByDate[dateKey].push(meeting);
      });

      console.log('Meetings data loaded from file');

      // Re-render the meetings
      renderMeetings();
    } else {
      console.error('Failed to load meetings data from file:', result.error);
    }
  } catch (error) {
    console.error('Error loading meetings data from file:', error);
  }
}

// Function to update the transcript section in the debug panel
function updateDebugTranscript(transcript) {
  const transcriptContent = document.getElementById('transcriptContent');
  if (!transcriptContent) return;

  // Update transcript service with new data
  transcriptService.setTranscript(transcript);

  // Show download button when transcript is available
  if (transcript && transcript.length > 0) {
    if (window.updateTranscriptButtons) {
      window.updateTranscriptButtons(true);
    }
  }

  // Check if user was at bottom before clearing content
  const wasAtBottom = transcriptContent.scrollTop + transcriptContent.clientHeight >= transcriptContent.scrollHeight - 5;

  // Clear previous content
  transcriptContent.innerHTML = '';

  if (!transcript || transcript.length === 0) {
    // Show placeholder if no transcript is available
    transcriptContent.innerHTML = `
      <div class="placeholder-content">
        <p>No transcript available yet</p>
      </div>
    `;
    return;
  }

  // Create transcript entries
  const transcriptDiv = document.createElement('div');
  transcriptDiv.className = 'transcript-entries';

  // Add each transcript entry
  transcript.forEach((entry, index) => {
    const entryDiv = document.createElement('div');
    entryDiv.className = 'transcript-entry';

    // Format timestamp
    const timestamp = new Date(entry.timestamp);
    const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Create HTML for this entry
    entryDiv.innerHTML = `
      <div class="transcript-speaker">${entry.speaker || 'Unknown'}</div>
      <div class="transcript-text">${entry.text}</div>
      <div class="transcript-timestamp">${formattedTime}</div>
    `;

    // Add a highlight class for the newest entry
    if (index === transcript.length - 1) {
      entryDiv.classList.add('newest-entry');
    }

    transcriptDiv.appendChild(entryDiv);
  });

  transcriptContent.appendChild(transcriptDiv);

  // Only auto-scroll to bottom if user was at the bottom before the update
  if (wasAtBottom) {
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      transcriptContent.scrollTop = transcriptContent.scrollHeight;
    }, 0);
  }
}

// Function to update the video preview in the debug panel
function updateDebugVideoPreview(frameData) {
  // Get the image data from the frame
  const { frameType } = frameData;

  // Determine if this is a screenshare or participant video
  const isScreenshare = frameType !== 'webcam';

  if (isScreenshare) {
    updateScreensharePreview(frameData);
  } else {
    updateParticipantVideoPreview(frameData);
  }

  // Make sure debug panel toggle shows new content notification if panel is closed
  const debugPanel = document.getElementById('debugPanel');
  if (debugPanel && debugPanel.classList.contains('hidden')) {
    const debugPanelToggle = document.getElementById('debugPanelToggle');
    if (debugPanelToggle && !debugPanelToggle.classList.contains('has-new-content')) {
      debugPanelToggle.classList.add('has-new-content');
    }
  }
}

// Function to update participant video preview
function updateParticipantVideoPreview(frameData) {
  const videoContent = document.getElementById('videoContent');
  if (!videoContent) return;

  const { buffer, participantId, participantName } = frameData;

  // Check if we already have a container for this participant
  let participantVideoContainer = document.getElementById(`video-participant-${participantId}`);

  // If no container exists, create one
  if (!participantVideoContainer) {
    // Clear the placeholder content if this is the first frame
    if (videoContent.querySelector('.placeholder-content')) {
      videoContent.innerHTML = '';
    }

    // Create a container for this participant's video
    participantVideoContainer = document.createElement('div');
    participantVideoContainer.id = `video-participant-${participantId}`;
    participantVideoContainer.className = 'video-participant-container';

    // Add the name label
    const nameLabel = document.createElement('div');
    nameLabel.className = 'video-participant-name';
    nameLabel.textContent = participantName;
    participantVideoContainer.appendChild(nameLabel);

    // Create an image element for the video frame
    const videoImg = document.createElement('img');
    videoImg.className = 'video-frame';
    videoImg.id = `video-frame-${participantId}`;
    participantVideoContainer.appendChild(videoImg);

    // Add the frame type label
    const typeLabel = document.createElement('div');
    typeLabel.className = 'video-frame-type';
    typeLabel.textContent = 'Camera';
    participantVideoContainer.appendChild(typeLabel);

    // Add to the video content area
    videoContent.appendChild(participantVideoContainer);
  }

  // Update the image with the new frame
  const videoImg = document.getElementById(`video-frame-${participantId}`);
  if (videoImg) {
    videoImg.src = `data:image/png;base64,${buffer}`;
  }
}

// Function to update screenshare preview
function updateScreensharePreview(frameData) {
  const screenshareContent = document.getElementById('screenshareContent');
  if (!screenshareContent) return;

  const { buffer, participantId } = frameData;

  // Check if we already have a container for this screenshare
  let screenshareContainer = document.getElementById(`screenshare-participant-${participantId}`);

  // If no container exists, create one
  if (!screenshareContainer) {
    // Clear the placeholder content if this is the first frame
    if (screenshareContent.querySelector('.placeholder-content')) {
      screenshareContent.innerHTML = '';
    }

    // Create a container for this participant's screenshare
    screenshareContainer = document.createElement('div');
    screenshareContainer.id = `screenshare-participant-${participantId}`;
    screenshareContainer.className = 'video-participant-container';

    // Create an image element for the screenshare frame
    const screenshareImg = document.createElement('img');
    screenshareImg.className = 'video-frame';
    screenshareImg.id = `screenshare-frame-${participantId}`;
    screenshareContainer.appendChild(screenshareImg);

    // Add the frame type label
    const typeLabel = document.createElement('div');
    typeLabel.className = 'video-frame-type';
    typeLabel.textContent = 'Screen';
    screenshareContainer.appendChild(typeLabel);

    // Add to the screenshare content area
    screenshareContent.appendChild(screenshareContainer);
  }

  // Update the image with the new frame
  const screenshareImg = document.getElementById(`screenshare-frame-${participantId}`);
  if (screenshareImg) {
    screenshareImg.src = `data:image/png;base64,${buffer}`;
  }
}

// Function to update the participants section in the debug panel
function updateDebugParticipants(participants) {
  const participantsContent = document.getElementById('participantsContent');
  if (!participantsContent) return;

  // Clear previous content
  participantsContent.innerHTML = '';

  if (!participants || participants.length === 0) {
    // Show placeholder if no participants are available
    participantsContent.innerHTML = `
      <div class="placeholder-content">
        <p>No participants detected yet</p>
      </div>
    `;
    return;
  }

  // Create participants list
  const participantsList = document.createElement('div');
  participantsList.className = 'participants-list';

  // Add each participant
  participants.forEach(participant => {
    const participantDiv = document.createElement('div');
    participantDiv.className = 'participant-entry';

    participantDiv.innerHTML = `
      <div class="participant-avatar">
        <svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="40" rx="20" fill="#f0f0f0"/>
          <path d="M20 20C22.7614 20 25 17.7614 25 15C25 12.2386 22.7614 10 20 10C17.2386 10 15 12.2386 15 15C15 17.7614 17.2386 20 20 20Z" fill="#a0a0a0"/>
          <path d="M12 31C12 26.0294 15.5817 22 20 22C24.4183 22 28 26.0294 28 31" stroke="#a0a0a0" stroke-width="4"/>
        </svg>
      </div>
      <div class="participant-name">${participant.name || 'Unknown'}</div>
      <div class="participant-status">${participant.status || 'Active'}</div>
    `;

    participantsList.appendChild(participantDiv);
  });

  participantsContent.appendChild(participantsList);
}

// Function to initialize the debug panel
function initDebugPanel() {
  const debugPanelToggle = document.getElementById('debugPanelToggle');
  const debugPanel = document.getElementById('debugPanel');
  const closeDebugPanelBtn = document.getElementById('closeDebugPanelBtn');

  // Set up toggle button for the debug panel
  if (debugPanelToggle && debugPanel) {
    debugPanelToggle.addEventListener('click', () => {
      // Toggle the debug panel visibility
      if (debugPanel.classList.contains('hidden')) {
        debugPanel.classList.remove('hidden');
        document.querySelector('.app-container').classList.add('debug-panel-open');

        // Update the toggle button position and remove any notification indicators
        debugPanelToggle.style.right = '50%';
        debugPanelToggle.classList.remove('has-new-content');
        debugPanelToggle.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7.99 11H20v2H7.99v3L4 12l3.99-4v3z" fill="currentColor"/>
          </svg>
        `;

        // If there's an active meeting, refresh the debug panels with latest data
        if (currentEditingMeetingId) {
          const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === currentEditingMeetingId);
          if (meeting) {
            // Update transcript if available
            if (meeting.transcript && meeting.transcript.length > 0) {
              updateDebugTranscript(meeting.transcript);
            } else {
              // Clear transcript area if no transcript
              const transcriptContent = document.getElementById('transcriptContent');
              if (transcriptContent) {
                transcriptContent.innerHTML = `
                  <div class="placeholder-content">
                    <p>No transcript available yet</p>
                  </div>
                `;
              }
            }

            // Update participants if available
            if (meeting.participants && meeting.participants.length > 0) {
              updateDebugParticipants(meeting.participants);
            } else {
              // Clear participants area if no participants
              const participantsContent = document.getElementById('participantsContent');
              if (participantsContent) {
                participantsContent.innerHTML = `
                  <div class="placeholder-content">
                    <p>No participants detected yet</p>
                  </div>
                `;
              }
            }

            // Reset video preview when opening debug panel
            const videoContent = document.getElementById('videoContent');
            if (videoContent) {
              videoContent.innerHTML = `
                <div class="placeholder-content video-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" fill="#999"/>
                  </svg>
                  <p>Video preview will appear here</p>
                </div>
              `;
            }
          }
        }
      } else {
        debugPanel.classList.add('hidden');
        document.querySelector('.app-container').classList.remove('debug-panel-open');

        // Reset the toggle button position
        debugPanelToggle.style.right = '0';
        debugPanelToggle.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" fill="currentColor"/>
          </svg>
        `;
      }
    });
  }

  // Set up notification test buttons
  const testSystemNotifBtn = document.getElementById('testSystemNotifBtn');
  const testInAppNotifBtn = document.getElementById('testInAppNotifBtn');
  const notifTestResult = document.getElementById('notifTestResult');

  if (testSystemNotifBtn) {
    testSystemNotifBtn.addEventListener('click', async () => {
      notifTestResult.innerHTML = 'Testing system notification...<br>';

      try {
        const result = await window.electronAPI.testNotification();

        if (result.details && Array.isArray(result.details)) {
          // Display detailed results
          notifTestResult.innerHTML += result.details.map(line => {
            // Add some formatting for better readability
            if (line.startsWith('✅')) {
              return `<span style="color: green;">${line}</span>`;
            } else if (line.startsWith('❌')) {
              return `<span style="color: red;">${line}</span>`;
            } else if (line.startsWith('⚠️')) {
              return `<span style="color: orange;">${line}</span>`;
            } else if (line.startsWith('📋')) {
              return `<strong>${line}</strong>`;
            }
            return line;
          }).join('<br>') + '<br>';
        } else {
          notifTestResult.innerHTML += `Result: ${JSON.stringify(result, null, 2)}<br>`;
        }

        // Scroll to bottom to show latest results
        notifTestResult.scrollTop = notifTestResult.scrollHeight;
      } catch (error) {
        notifTestResult.innerHTML += `❌ Error: ${error.message}<br>`;
      }
    });
  }

  if (testInAppNotifBtn) {
    testInAppNotifBtn.addEventListener('click', () => {
      notifTestResult.innerHTML = 'Testing in-app notification...<br>';

      // Create test notification
      const notification = document.createElement('div');
      notification.className = 'in-app-notification';
      notification.innerHTML = `
        <div class="notification-content">
          <div class="notification-text">
            <div class="notification-title">Test Notification</div>
            <div class="notification-body">This is a test in-app notification.</div>
          </div>
          <button class="notification-action-btn" data-action="test-action">
            Test Action
          </button>
        </div>
        <button class="notification-close" data-action="close">×</button>
      `;
      document.body.appendChild(notification);

      // Add event listeners for action buttons
      const actionBtn = notification.querySelector('.notification-action-btn');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          alert('Test Action clicked!');
        });
      }

      // Add event listener for close button
      const closeBtn = notification.querySelector('.notification-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          notification.remove();
        });
      }

      notifTestResult.innerHTML += '✅ In-app notification shown!<br>';

      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (notification.parentElement) {
          notification.classList.add('fade-out');
          setTimeout(() => notification.remove(), 300);
        }
      }, 5000);
    });
  }

  // Set up close button for the debug panel
  if (closeDebugPanelBtn && debugPanel) {
    closeDebugPanelBtn.addEventListener('click', () => {
      debugPanel.classList.add('hidden');
      // Restore the editorView to full width
      document.querySelector('.app-container').classList.remove('debug-panel-open');

      // Reset the toggle button position and icon
      const debugPanelToggle = document.getElementById('debugPanelToggle');
      if (debugPanelToggle) {
        debugPanelToggle.style.right = '0';
        debugPanelToggle.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" fill="currentColor"/>
          </svg>
        `;
      }
    });
  }

  // Set up clear button for the logger section
  const clearLoggerBtn = document.getElementById('clearLoggerBtn');
  if (clearLoggerBtn) {
    clearLoggerBtn.addEventListener('click', () => {
      sdkLogger.clear();
    });
  }
}

// SDK Logger functions
const sdkLogger = {
  logs: [],
  maxLogs: 100,

  // Initialize the logger
  init() {
    // Listen for logs from the main process
    window.sdkLoggerBridge?.onSdkLog(logEntry => {
      // Add an origin flag to logs created in this renderer to prevent duplicates
      if (!logEntry.originatedFromRenderer) {
        this.addLogEntry(logEntry);
      }
    });

    // Log initialization
    this.log('SDK Logger initialized', 'info');
  },

  // Log an API call
  logApiCall(method, params = {}) {
    const logEntry = {
      type: 'api-call',
      method,
      params,
      timestamp: new Date()
    };

    // Send to main process
    this._sendToMainProcess(logEntry);

    // Add to local logs
    this.addLogEntry(logEntry);
  },

  // Log an event
  logEvent(eventType, data = {}) {
    const logEntry = {
      type: 'event',
      eventType,
      data,
      timestamp: new Date()
    };

    // Send to main process
    this._sendToMainProcess(logEntry);

    // Add to local logs
    this.addLogEntry(logEntry);
  },

  // Log an error
  logError(errorType, message) {
    const logEntry = {
      type: 'error',
      errorType,
      message,
      timestamp: new Date()
    };

    // Send to main process
    this._sendToMainProcess(logEntry);

    // Add to local logs
    this.addLogEntry(logEntry);
  },

  // Log a generic message
  log(message, level = 'info') {
    const logEntry = {
      type: level,
      message,
      timestamp: new Date()
    };

    // Send to main process
    this._sendToMainProcess(logEntry);

    // Add to local logs
    this.addLogEntry(logEntry);
  },

  // Helper to send logs to main process
  _sendToMainProcess(logEntry) {
    if (window.sdkLoggerBridge?.sendSdkLog) {
      // Mark this log entry as originating from this renderer to prevent duplicates
      const markedLogEntry = { ...logEntry, originatedFromRenderer: true };
      window.sdkLoggerBridge.sendSdkLog(markedLogEntry);
    }
  },

  // Add a log entry to the UI and internal array
  addLogEntry(entry) {
    // Add to internal logs array
    this.logs.push(entry);

    // Trim logs if we have too many
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Add to UI
    const loggerContent = document.getElementById('sdkLoggerContent');
    if (loggerContent) {
      const logElement = document.createElement('div');
      logElement.className = `sdk-log-entry ${entry.type}`;

      const timestamp = document.createElement('div');
      timestamp.className = 'timestamp';
      timestamp.textContent = this.formatTimestamp(entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp));
      logElement.appendChild(timestamp);

      // Format content based on log type
      let content = '';

      switch (entry.type) {
        case 'api-call':
          content = `<span class="method">RecallAiSdk.${entry.method}()</span>`;
          if (entry.params && Object.keys(entry.params).length > 0) {
            content += `<div class="params">${this.formatParams(entry.params)}</div>`;
          }
          break;

        case 'event':
          content = `<span class="event-type">Event: ${entry.eventType}</span>`;
          if (entry.data && Object.keys(entry.data).length > 0) {
            content += `<div class="params">${this.formatParams(entry.data)}</div>`;
          }
          break;

        case 'error':
          content = `<span class="error-type">Error: ${entry.errorType}</span>`;
          if (entry.message) {
            content += `<div class="params">${entry.message}</div>`;
          }
          break;

        default:
          content = entry.message;
      }

      logElement.innerHTML += content;

      // Add to the top of the log
      loggerContent.insertBefore(logElement, loggerContent.firstChild);

      // Only auto-scroll to top if user is already at the top
      const isAtTop = loggerContent.scrollTop <= 5;
      if (isAtTop) {
        loggerContent.scrollTop = 0;
      }
    }
  },

  // Clear all logs
  clear() {
    this.logs = [];
    const loggerContent = document.getElementById('sdkLoggerContent');
    if (loggerContent) {
      loggerContent.innerHTML = '';
    }
  },

  // Format timestamp to readable string
  formatTimestamp(date) {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  },

  // Format parameters object to JSON string
  formatParams(params) {
    try {
      return JSON.stringify(params, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>')
        .replace(/ /g, '&nbsp;');
    } catch (e) {
      return String(params);
    }
  }
};

// Global transcript service instance
let transcriptService;
window.transcriptService = null; // Make it accessible for debugging

// Initialize video section functionality
function initVideoSection() {
  const videoSectionToggle = document.getElementById('videoSectionToggle');
  const videoSection = document.getElementById('videoSection');

  if (videoSectionToggle && videoSection) {
    videoSectionToggle.addEventListener('click', () => {
      videoSection.classList.toggle('collapsed');
    });
  }
}

// Load video for meeting
function loadMeetingVideo(meeting) {
  console.log('loadMeetingVideo called for meeting:', meeting.id, 'videoPath:', meeting.videoPath, 'recallVideoUrl:', meeting.recallVideoUrl);
  const videoSection = document.getElementById('videoSection');
  const videoSource = document.getElementById('videoSource');
  const meetingVideo = document.getElementById('meetingVideo');
  const videoDuration = document.getElementById('videoDuration');

  if (!videoSection || !videoSource || !meetingVideo) {
    console.log('Video section elements not found');
    return;
  }

  // Check if meeting has a Recall video URL (prioritize this over local)
  if (meeting.recallVideoUrl) {
    // Show video section
    videoSection.style.display = 'block';

    console.log('Loading video from Recall URL:', meeting.recallVideoUrl);

    // Load video directly from Recall URL
    videoSource.src = meeting.recallVideoUrl;
    meetingVideo.load();

    // Update duration when metadata loads
    meetingVideo.addEventListener('loadedmetadata', () => {
      const duration = meetingVideo.duration;
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      videoDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, { once: true });

    // Handle video errors
    meetingVideo.addEventListener('error', (e) => {
      console.error('Video loading error:', e, meetingVideo.error);
      videoSection.style.display = 'none';
    }, { once: true });
  }
  // Fallback to local video path if no Recall URL
  else if (meeting.videoPath) {
    // Show video section
    videoSection.style.display = 'block';

    console.log('Loading video from local path:', meeting.videoPath);

    // Load video through IPC to get base64 data URL
    window.electronAPI.getVideoFile(meeting.videoPath).then(result => {
      if (result.success && result.dataUrl) {
        videoSource.src = result.dataUrl;
        meetingVideo.load();

        // Update duration when metadata loads
        meetingVideo.addEventListener('loadedmetadata', () => {
          const duration = meetingVideo.duration;
          const minutes = Math.floor(duration / 60);
          const seconds = Math.floor(duration % 60);
          videoDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, { once: true });
      } else {
        console.error('Failed to load video:', result.error);
        videoSection.style.display = 'none';
      }
    }).catch(error => {
      console.error('Error loading video file:', error);
      videoSection.style.display = 'none';
    });

    // Handle video errors
    meetingVideo.addEventListener('error', (e) => {
      console.error('Video loading error:', e, meetingVideo.error);
      videoSection.style.display = 'none';
    }, { once: true });
  } else {
    // Hide video section if no recording
    videoSection.style.display = 'none';
  }
}

// Initialize tabbed editor functionality
function initTabbedEditor() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.editor-tab-content');

  if (!tabButtons.length || !tabContents.length) {
    console.log('Tabbed editor elements not found');
    return;
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      const targetContent = document.getElementById(`${targetTab}-tab`);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      console.log(`Switched to ${targetTab} tab`);
    });
  });

  // Initialize video section
  initVideoSection();
}


// Initialize sidebar functionality
function initMeetingSidebar() {
  const sidebar = document.getElementById('meetingSidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const copyTextBtn = document.getElementById('copyTextBtn');
  const downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');

  if (!sidebar || !toggleBtn) return;

  // Toggle sidebar
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    // Toggle button position class and icon direction
    if (sidebar.classList.contains('collapsed')) {
      toggleBtn.classList.remove('expanded');
      // Change icon to point left (to open)
      toggleBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12L15.41 7.41Z" fill="currentColor"/>
        </svg>
      `;
    } else {
      toggleBtn.classList.add('expanded');
      // Change icon to point right (to close)
      toggleBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8.59 16.59L10 18L16 12L10 6L8.59 7.41L13.17 12L8.59 16.59Z" fill="currentColor"/>
        </svg>
      `;
    }
  });

  // Copy text functionality
  if (copyTextBtn) {
    copyTextBtn.addEventListener('click', async () => {
      // Get content from tabbed editor
      const personalNotesEditor = document.getElementById('personal-notes-editor');
      const aiSummaryEditor = document.getElementById('ai-summary-editor');

      let notesContent = '';

      // Combine personal notes and AI summary
      if (personalNotesEditor && personalNotesEditor.value) {
        notesContent += personalNotesEditor.value;
      }

      if (aiSummaryEditor && aiSummaryEditor.value) {
        if (notesContent) notesContent += '\n\n---\n\n';
        notesContent += 'AI SUMMARY:\n\n' + aiSummaryEditor.value;
      }

      if (notesContent) {
        transcriptService.setNotes(notesContent);

        const success = await transcriptService.copyNotesToClipboard();
        if (success) {
          showToast('Notes copied to clipboard!');
        } else {
          showToast('Failed to copy notes', 'error');
        }
      }
    });
  }

  // Download transcript functionality
  if (downloadTranscriptBtn) {
    downloadTranscriptBtn.addEventListener('click', () => {
      const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === currentEditingMeetingId);
      if (meeting && meeting.title) {
        const filename = `transcript-${meeting.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
        transcriptService.downloadTranscript(filename);
        showToast('Transcript downloaded!');
      } else {
        transcriptService.downloadTranscript();
        showToast('Transcript downloaded!');
      }
    });
  }
}

// Update transcript buttons visibility
window.updateTranscriptButtons = function(hasTranscript) {
  const downloadBtn = document.getElementById('downloadTranscriptBtn');
  if (downloadBtn) {
    downloadBtn.style.display = hasTranscript ? 'flex' : 'none';
  }
};

// Toast notification helper
function showToast(message, type = 'success') {
  console.log('showToast called:', message, type);

  const existingToast = document.querySelector('.copy-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.style.background = type === 'error' ? '#f44336' : '#4caf50';
  toast.textContent = message;
  document.body.appendChild(toast);

  console.log('Toast element appended to body:', toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM content loaded, loading data from file...');

  // Check if debug panel should be shown
  const showDebugPanel = await window.electronAPI.settings.getDebugMode();
  const debugPanelToggle = document.getElementById('debugPanelToggle');
  const debugPanel = document.getElementById('debugPanel');

  if (!showDebugPanel) {
    // Hide debug panel and toggle button in production
    if (debugPanelToggle) {
      debugPanelToggle.style.display = 'none';
    }
    if (debugPanel) {
      debugPanel.style.display = 'none';
    }
  } else {
    // Keep the existing debug panel initialization
    console.log('Debug mode enabled');
  }

  // Initialize transcript service
  transcriptService = new TranscriptService();
  window.transcriptService = transcriptService; // Make globally accessible
  console.log('TranscriptService initialized');

  // Initialize sidebar
  initMeetingSidebar();

  // Initialize the tabbed editor
  initTabbedEditor();

  // Initialize the SDK Logger
  sdkLogger.init();

  // Initialize the debug panel
  initDebugPanel();

  // Try to load the latest data from file - this is the only data source
  await loadMeetingsDataFromFile();

  // Fetch calendar meetings
  await fetchCalendarMeetings();

  // Fetch past meetings for notes section
  await fetchPastMeetings();

  // Render meetings only after loading from file
  console.log('Data loaded, rendering meetings...');
  renderMeetings();

  // Initially show home view
  showHomeView();

  // Listen for calendar sync events
  window.electronAPI.calendar.onCalendarSynced((meetings) => {
    console.log('Calendar synced with', meetings.length, 'meetings');
    calendarMeetings = meetings;
    renderMeetings();
  });

  // Fetch calendar meetings initially and every 5 minutes
  setInterval(() => {
    fetchCalendarMeetings();
    fetchPastMeetings();
  }, 5 * 60 * 1000);

  // Track if we've shown notification for current meeting
  let lastNotificationShown = false;

  // Listen for meeting detection status updates
  window.electronAPI.onMeetingDetectionStatus((data) => {
    console.log('Meeting detection status update:', data);

    // Store the meeting detection state globally
    window.meetingDetected = data.detected;

    // In-app notification removed - using custom notification window instead
    // The custom notification window is created in the main process

    if (!data.detected) {
      // Reset notification flag when meeting is no longer detected
      lastNotificationShown = false;
    }

    // Only update button state if we're in the home view
    const inHomeView = document.getElementById('homeView').style.display !== 'none';
    if (inHomeView) {
      updateRecordButtonState();
    }
  });

  // Listen for requests to open a meeting note (from notification click)
  window.electronAPI.onOpenMeetingNote((meetingId) => {
    console.log('Received request to open meeting note:', meetingId);

    // Ensure we have the latest data before showing the note
    loadMeetingsDataFromFile().then(() => {
      console.log('Data refreshed, checking for meeting ID:', meetingId);

      // Log the list of available meeting IDs to help with debugging
      console.log('Available meeting IDs:', pastMeetings.map(m => m.id));

      // Verify the meeting exists in our data
      const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);

      if (meeting) {
        console.log('Found meeting to open:', meeting.title);
        setTimeout(() => {
          showEditorView(meetingId);
        }, 200); // Add a small delay to ensure UI is ready
      } else {
        console.error('Meeting not found with ID:', meetingId);
        // Attempt to reload data again after a delay
        setTimeout(() => {
          console.log('Retrying data load after delay...');
          loadMeetingsDataFromFile().then(() => {
            const retryMeeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
            if (retryMeeting) {
              console.log('Found meeting on second attempt:', retryMeeting.title);
              showEditorView(meetingId);
            } else {
              console.error('Meeting still not found after retry. Available meetings:',
                pastMeetings.map(m => `${m.id}: ${m.title}`));
            }
          });
        }, 1500);
      }
    });
  });

  // Listen for calendar meeting notifications (from "Start Recording" button on calendar notifications)
  window.electronAPI.onOpenCalendarMeeting(async (meetingData) => {
    console.log('Received request to open calendar meeting from notification:', meetingData);

    // Ensure we have the latest data
    await loadMeetingsDataFromFile();

    // Check if a note already exists for this meeting
    let existingNote = [...pastMeetings, ...upcomingMeetings].find(m =>
      m.id === meetingData.id || m.calendarEventId === meetingData.id
    );

    if (!existingNote) {
      // Create a new note for this meeting
      existingNote = {
        id: `meeting_${Date.now()}`,
        calendarEventId: meetingData.id,
        title: meetingData.title || 'Untitled Meeting',
        date: meetingData.startTime || meetingData.date,
        startTime: meetingData.startTime,
        endTime: meetingData.endTime,
        type: 'calendar',
        subtitle: meetingData.organizerEmail || '',
        content: '',
        attendees: meetingData.attendees || [],
        location: meetingData.location,
        videoMeetingUrl: meetingData.videoMeetingUrl,
        isFuture: true // Mark as future meeting
      };

      // Add to upcomingMeetings (not pastMeetings for future meetings)
      upcomingMeetings.push(existingNote);
      meetingsData.upcomingMeetings.push(existingNote);

      // Save to file
      await window.electronAPI.saveMeetingsData(meetingsData);
    }

    // Open the note (either existing or newly created)
    showEditorView(existingNote.id, true);

    // Only start recording if this meeting doesn't already have a completed recording
    if (!existingNote.recordingComplete && !existingNote.recordingId) {
      // Start recording immediately after a short delay to ensure editor is loaded
      setTimeout(() => {
        console.log('Starting recording for calendar meeting');
        const recordButton = document.getElementById('recordButton');
        if (recordButton && !window.isRecording) {
          // Trigger the record button click to start recording
          recordButton.click();
        }
      }, 500);
    } else {
      console.log('Meeting already has a recording, skipping auto-start');
    }
  });

  // Listen for recording completed events
  window.electronAPI.onRecordingCompleted((meetingId) => {
    console.log('Recording completed for meeting:', meetingId);

    // If this note is currently being edited, reload its content
    if (currentEditingMeetingId === meetingId) {
      loadMeetingsDataFromFile().then(() => {
        // Refresh the editor with the updated content
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
        if (meeting) {
          // Update personal notes if available
          const personalNotesEditor = document.getElementById('personal-notes-editor');
          if (personalNotesEditor && meeting.personalNotes) {
            personalNotesEditor.value = meeting.personalNotes;
          }

          // Update AI summary if available
          const aiSummaryEditor = document.getElementById('ai-summary-editor');
          if (aiSummaryEditor && meeting.aiSummary) {
            aiSummaryEditor.value = meeting.aiSummary;
          }

          // Refresh video player if recording is complete
          if (meeting.videoPath || meeting.recallVideoUrl) {
            loadMeetingVideo(meeting);
          }

          // Note: Tab switch and spinner are already handled by the stop button handler
          // Backend triggers summarization automatically
        }
      });
    }
  });

  // Listen for video URL updates from backend (when Recall upload completes)
  window.electronAPI.onVideoUrlUpdated((data) => {
    console.log('Video URL updated for meeting:', data.meetingId, 'URL:', data.videoUrl);

    // If this is the currently edited meeting, reload and refresh video
    if (currentEditingMeetingId === data.meetingId) {
      loadMeetingsDataFromFile().then(() => {
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === data.meetingId);
        if (meeting) {
          console.log('Refreshing video player with Recall URL');
          loadMeetingVideo(meeting);
        }
      });
    }
  });

  // Track summary generation timeout globally for cleanup
  let summaryGenerationTimeout = null;

  // Listen for summary streaming updates from backend
  window.electronAPI.onSummaryUpdate((data) => {
    console.log('Summary update received for meeting:', data.meetingId);

    // Only update if this is the currently edited meeting
    if (currentEditingMeetingId === data.meetingId) {
      const aiSummaryEditor = document.getElementById('ai-summary-editor');
      if (aiSummaryEditor) {
        aiSummaryEditor.value = data.aiSummary;
      }
    }
  });

  // Listen for summary generation completion
  window.electronAPI.onSummaryGenerated((meetingId) => {
    console.log('🔥 onSummaryGenerated EVENT FIRED for meeting:', meetingId);

    // Clear safety timeout if it exists
    if (summaryGenerationTimeout) {
      clearTimeout(summaryGenerationTimeout);
      summaryGenerationTimeout = null;
      console.log('Cleared summary generation timeout');
    }

    // Remove spinner from record button
    window.setRecordButtonLoading(false);

    // Expand sidebar when summary is generated - just click the toggle button if sidebar is hidden
    const meetingSidebar = document.getElementById('meetingSidebar');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

    if (meetingSidebar && sidebarToggleBtn && meetingSidebar.classList.contains('collapsed')) {
      console.log('✅ Clicking sidebar toggle to expand');
      sidebarToggleBtn.click();
    }

    // Only update meeting data if this is the currently edited meeting
    if (currentEditingMeetingId === meetingId) {

      // Reload the meeting data to get the final summary
      loadMeetingsDataFromFile().then(() => {
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
        if (meeting && meeting.aiSummary) {
          const aiSummaryEditor = document.getElementById('ai-summary-editor');
          if (aiSummaryEditor) {
            aiSummaryEditor.value = meeting.aiSummary;
          }
        }
      });
    }
  });

  // Listen for video frame events
  window.electronAPI.onVideoFrame((data) => {
    // Only handle video frames for the currently open meeting
    if (data.noteId === currentEditingMeetingId) {
      console.log(`Video frame received for participant: ${data.participantName}`);

      // Update the video preview in the debug panel
      updateDebugVideoPreview(data);
    }
  });

  // Listen for participants update events
  window.electronAPI.onParticipantsUpdated((meetingId) => {
    console.log('Participants updated for meeting:', meetingId);

    // If this note is currently being edited, refresh the data
    // and update the debug panel's participants section
    if (currentEditingMeetingId === meetingId) {
      loadMeetingsDataFromFile().then(() => {
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
        if (meeting && meeting.participants && meeting.participants.length > 0) {
          // Log the latest participant
          const latestParticipant = meeting.participants[meeting.participants.length - 1];
          console.log(`Participant updated: ${latestParticipant.name}`);

          // Update the participants area in the debug panel
          updateDebugParticipants(meeting.participants);

          // Show notification about new participant if debug panel is closed
          const debugPanel = document.getElementById('debugPanel');
          if (debugPanel && debugPanel.classList.contains('hidden')) {
            const debugPanelToggle = document.getElementById('debugPanelToggle');
            if (debugPanelToggle) {
              // Add pulse effect to show there's new content
              debugPanelToggle.classList.add('has-new-content');

              // Create a mini notification for participant join
              const miniNotification = document.createElement('div');
              miniNotification.className = 'debug-notification participant-notification';
              miniNotification.innerHTML = `
                <span class="debug-notification-title">New Participant:</span>
                <span class="debug-notification-name">${latestParticipant.name || 'Unknown'}</span>
              `;

              // Add to document
              document.body.appendChild(miniNotification);

              // Remove after a short time
              setTimeout(() => {
                miniNotification.classList.add('fade-out');
                setTimeout(() => {
                  document.body.removeChild(miniNotification);
                }, 500);
              }, 5000);
            }
          }
        }
      });
    }
  });

  // Listen for transcript update events
  window.electronAPI.onTranscriptUpdated((meetingId) => {
    console.log('Transcript updated for meeting:', meetingId);

    // If this note is currently being edited, we can refresh the data
    // and update the debug panel's transcript section
    if (currentEditingMeetingId === meetingId) {
      loadMeetingsDataFromFile().then(() => {
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
        if (meeting && meeting.transcript && meeting.transcript.length > 0) {
          // Log the latest transcript entry
          const latestEntry = meeting.transcript[meeting.transcript.length - 1];
          console.log(`Latest transcript: ${latestEntry.speaker}: "${latestEntry.text}"`);

          // Update the live transcript in the sidebar
          updateLiveTranscript(meeting.transcript);

          // Update the transcript area in the debug panel
          updateDebugTranscript(meeting.transcript);

          // Show notification about new transcript if debug panel is closed
          const debugPanel = document.getElementById('debugPanel');
          if (debugPanel && debugPanel.classList.contains('hidden')) {
            const debugPanelToggle = document.getElementById('debugPanelToggle');
            if (debugPanelToggle) {
              // Add pulse effect to show there's new content
              debugPanelToggle.classList.add('has-new-content');

              // Create a mini notification if we're recording
              if (window.isRecording) {
                const miniNotification = document.createElement('div');
                miniNotification.className = 'debug-notification transcript-notification';
                miniNotification.innerHTML = `
                  <span class="debug-notification-speaker">${latestEntry.speaker || 'Unknown'}</span>:
                  <span class="debug-notification-text">${latestEntry.text.slice(0, 40)}${latestEntry.text.length > 40 ? '...' : ''}</span>
                `;

                // Add to document
                document.body.appendChild(miniNotification);

                // Remove after a short time
                setTimeout(() => {
                  miniNotification.classList.add('fade-out');
                  setTimeout(() => {
                    document.body.removeChild(miniNotification);
                  }, 500);
                }, 5000);
              }
            }
          }
        }
      });
    }
  });

  // Listen for summary generation events
  window.electronAPI.onSummaryGenerated((meetingId) => {
    console.log('Summary generated for meeting:', meetingId);

    // If this note is currently being edited, refresh the content
    if (currentEditingMeetingId === meetingId) {
      // Expand sidebar when summary is generated
      const sidebar = document.getElementById('sidebar');
      const editorContent = document.querySelector('.editor-content');
      const chatInputContainer = document.querySelector('.chat-input-container');
      console.log('Sidebar expansion check (onSummaryGenerated 2):', {
        sidebar: !!sidebar,
        editorContent: !!editorContent,
        chatInputContainer: !!chatInputContainer,
        isHidden: sidebar?.classList.contains('hidden')
      });
      if (sidebar && sidebar.classList.contains('hidden')) {
        console.log('Expanding sidebar after summary generation');
        sidebar.classList.remove('hidden');
        if (editorContent) editorContent.classList.remove('full-width');
        if (chatInputContainer) chatInputContainer.style.display = 'block';
      }

      loadMeetingsDataFromFile().then(() => {
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === meetingId);
        if (meeting) {
          // Update the AI summary in the tabbed editor
          const aiSummaryEditor = document.getElementById('ai-summary-editor');
          if (aiSummaryEditor && meeting.aiSummary) {
            aiSummaryEditor.value = meeting.aiSummary;

            // Switch to summary tab to show the result
            const summaryTab = document.querySelector('.tab-btn[data-tab="ai-summary"]');
            if (summaryTab) {
              summaryTab.click();
            }
          }
        }
      });
    }
  });

  // Listen for streaming summary updates
  window.electronAPI.onSummaryUpdate((data) => {
    const { meetingId, content, aiSummary, completed } = data;

    // If this note is currently being edited, update the content immediately
    if (currentEditingMeetingId === meetingId) {
      // Support both legacy and new dual-section editor
      const legacyEditor = document.getElementById('simple-editor');
      const aiSummaryEditor = document.getElementById('ai-summary-editor');

      // Update the editor with the latest streamed content
      // Use requestAnimationFrame for smoother updates that don't block the main thread
      requestAnimationFrame(() => {
        if (aiSummary && aiSummaryEditor) {
          // New dual-section editor - update AI summary section
          aiSummaryEditor.value = aiSummary;

          // Scroll to bottom of AI summary to follow the streaming text
          aiSummaryEditor.scrollTop = aiSummaryEditor.scrollHeight;
        } else if (content && legacyEditor) {
          // Legacy editor - update the whole content
          legacyEditor.value = content;

          // Force the editor to scroll to the bottom to follow the new text
          legacyEditor.scrollTop = legacyEditor.scrollHeight;
        }
      });

      // If this is the final update, expand the sidebar
      if (completed) {
        console.log('✅ Summary generation completed, expanding sidebar');
        const sidebar = document.getElementById('sidebar');
        const editorContent = document.querySelector('.editor-content');
        const chatInputContainer = document.querySelector('.chat-input-container');
        console.log('Sidebar elements found:', {
          sidebar: !!sidebar,
          editorContent: !!editorContent,
          chatInputContainer: !!chatInputContainer,
          isHidden: sidebar?.classList.contains('hidden'),
          sidebarClasses: sidebar ? Array.from(sidebar.classList) : null
        });
        if (sidebar && sidebar.classList.contains('hidden')) {
          console.log('🔧 Expanding sidebar NOW');
          sidebar.classList.remove('hidden');
          if (editorContent) editorContent.classList.remove('full-width');
          if (chatInputContainer) chatInputContainer.style.display = 'block';
          console.log('✅ Sidebar expanded');
        } else {
          console.log('⚠️ Sidebar NOT hidden or not found:', {
            exists: !!sidebar,
            isHidden: sidebar?.classList.contains('hidden')
          });
        }
      }
    }
  });

  // Unified Record Meeting button handler
  const recordMeetingBtn = document.getElementById('recordMeetingBtn');
  if (recordMeetingBtn) {
    recordMeetingBtn.addEventListener('click', async () => {
      console.log('Record Meeting button clicked');

      if (window.meetingDetected) {
        // Meeting detected - join the meeting with video
        console.log('Joining detected meeting with video...');

        // Show loading state
        const originalHTML = recordMeetingBtn.innerHTML;
        recordMeetingBtn.disabled = true;
        recordMeetingBtn.innerHTML = `
          <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Joining...
        `;

        try {
          const hasDetectedMeeting = await window.electronAPI.checkForDetectedMeeting();
          if (hasDetectedMeeting) {
            console.log('Found detected meeting, joining...');
            await window.electronAPI.joinDetectedMeeting();
            // Keep button disabled as we're navigating to a different view
          } else {
            console.log('No active meeting detected');
            // Reset button state
            recordMeetingBtn.disabled = false;
            recordMeetingBtn.innerHTML = originalHTML;
            showToast('No active meeting detected');
          }
        } catch (error) {
          console.error('Error joining meeting:', error);
          // Reset button state
          recordMeetingBtn.disabled = false;
          recordMeetingBtn.innerHTML = originalHTML;
          showToast('Error joining meeting', 'error');
        }
      } else {
        // No meeting detected - create audio-only recording
        console.log('Creating new note for audio-only recording...');
        await createNewMeeting();
      }
    });
  }

  document.querySelector('.search-input').addEventListener('input', (e) => {
    console.log('Search query:', e.target.value);
    // TODO: Implement search functionality
  });

  // Add click event delegation for meeting cards and their actions
  document.querySelector('.main-content').addEventListener('click', (e) => {
    // Check if delete button was clicked
    if (e.target.closest('.delete-meeting-btn')) {
      e.stopPropagation(); // Prevent opening the note
      const deleteBtn = e.target.closest('.delete-meeting-btn');
      const meetingId = deleteBtn.dataset.id;

      if (confirm('Are you sure you want to delete this note? This cannot be undone.')) {
        console.log('Deleting meeting:', meetingId);

        // Show loading state
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = `<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`;

        // Use the main process deletion via IPC
        window.electronAPI.deleteMeeting(meetingId)
          .then(result => {
            if (result.success) {
              console.log('Meeting deleted successfully on server');

              // After successful server deletion, update local data
              // Remove from local pastMeetings array
              const pastMeetingIndex = pastMeetings.findIndex(meeting => meeting.id === meetingId);
              if (pastMeetingIndex !== -1) {
                pastMeetings.splice(pastMeetingIndex, 1);
              }

              // Remove from meetingsData as well
              const pastDataIndex = meetingsData.pastMeetings.findIndex(meeting => meeting.id === meetingId);
              if (pastDataIndex !== -1) {
                meetingsData.pastMeetings.splice(pastDataIndex, 1);
              }

              // Also check upcomingMeetings
              const upcomingMeetingIndex = upcomingMeetings.findIndex(meeting => meeting.id === meetingId);
              if (upcomingMeetingIndex !== -1) {
                upcomingMeetings.splice(upcomingMeetingIndex, 1);
              }

              const upcomingDataIndex = meetingsData.upcomingMeetings.findIndex(meeting => meeting.id === meetingId);
              if (upcomingDataIndex !== -1) {
                meetingsData.upcomingMeetings.splice(upcomingDataIndex, 1);
              }

              // Update the grouped meetings
              pastMeetingsByDate = {};
              meetingsData.pastMeetings.forEach(meeting => {
                const dateKey = formatDateHeader(meeting.date);
                if (!pastMeetingsByDate[dateKey]) {
                  pastMeetingsByDate[dateKey] = [];
                }
                pastMeetingsByDate[dateKey].push(meeting);
              });

              // Re-render the meetings list
              renderMeetings();
            } else {
              // Server side deletion failed
              console.error('Server deletion failed:', result.error);
              alert('Failed to delete note: ' + (result.error || 'Unknown error'));
            }
          })
          .catch(error => {
            console.error('Error deleting meeting:', error);
            alert('Failed to delete note: ' + (error.message || 'Unknown error'));
          })
          .finally(() => {
            // Reset button state whether success or failure
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
            </svg>`;
          });
      }
      return;
    }

    // Find the meeting card that was clicked (for opening)
    // Support both old-style meeting cards and new meeting cards with time
    const card = e.target.closest('.meeting-card, .meeting-card-with-time');
    if (card) {
      const meetingId = card.dataset.id;
      showEditorView(meetingId);
    }
  });

  // Back button event listener
  document.getElementById('backButton').addEventListener('click', async () => {
    // Save content before going back to home
    await saveCurrentNote();
    showHomeView();
    renderMeetings(); // Refresh the meeting list
  });

  // Set up the initial auto-save handler
  setupAutoSaveHandler();

  // Toggle sidebar button with initial state
  const toggleSidebarBtn = document.getElementById('toggleSidebar');
  const sidebar = document.getElementById('sidebar');
  const editorContent = document.querySelector('.editor-content');
  const chatInputContainer = document.querySelector('.chat-input-container');

  // Start with sidebar hidden
  sidebar.classList.add('hidden');
  editorContent.classList.add('full-width');
  chatInputContainer.style.display = 'none';

  toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
    editorContent.classList.toggle('full-width');

    // Show/hide chat input with sidebar
    if (sidebar.classList.contains('hidden')) {
      chatInputContainer.style.display = 'none';
    } else {
      chatInputContainer.style.display = 'block';
    }
  });

  // Chat input handling
  const chatInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('sendButton');

  // When send button is clicked
  sendButton.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message) {
      console.log('Sending message:', message);
      // Here you would handle the AI chat functionality
      // For now, just clear the input
      chatInput.value = '';
    }
  });

  // Send message on Enter key
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendButton.click();
    }
  });

  // Handle share buttons
  const shareButtons = document.querySelectorAll('.share-btn');
  shareButtons.forEach(button => {
    button.addEventListener('click', () => {
      const action = button.textContent.trim();
      console.log(`Share action: ${action}`);
      // Implement actual sharing functionality here
    });
  });

  // Handle AI option buttons
  const aiButtons = document.querySelectorAll('.ai-btn');
  aiButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const action = button.textContent.trim();
      console.log(`AI action: ${action}`);

      // Handle different AI actions
      if (action === 'Generate meeting summary') {
        if (!currentEditingMeetingId) {
          alert('No meeting is currently open');
          return;
        }

        // Show loading state
        const originalText = button.textContent;
        button.textContent = 'Generating summary...';
        button.disabled = true;

        try {
          // Use streaming version instead of standard version
          console.log('Starting streaming summary generation');

          // Log the summary generation request to the SDK logger
          sdkLogger.log('Requesting AI summary generation for meeting: ' + currentEditingMeetingId);

          window.electronAPI.generateMeetingSummaryStreaming(currentEditingMeetingId)
            .then(result => {
              if (result.success) {
                console.log('Summary generated successfully (streaming)');
              } else {
                console.error('Failed to generate summary:', result.error);
                alert('Failed to generate summary: ' + result.error);
              }
            })
            .catch(error => {
              console.error('Error generating summary:', error);
              alert('Error generating summary: ' + (error.message || error));
            })
            .finally(() => {
              // Reset button state
              button.textContent = originalText;
              button.disabled = false;
            });
        } catch (error) {
          console.error('Error starting streaming summary generation:', error);
          alert('Error starting summary generation: ' + (error.message || error));

          // Reset button state
          button.textContent = originalText;
          button.disabled = false;
        }
      } else if (action === 'List action items') {
        alert('List action items functionality coming soon');
      } else if (action === 'Write follow-up email') {
        alert('Write follow-up email functionality coming soon');
      } else if (action === 'List Q&A') {
        alert('List Q&A functionality coming soon');
      }
    });
  });

  // UI variables will be initialized when the recording button is set up

  // Listen for recording state change events
  window.electronAPI.onRecordingStateChange((data) => {
    console.log('Recording state change received:', data);

    // If this state change is for the current note, update the UI
    if (data.noteId === currentEditingMeetingId) {
      console.log('Updating recording button for current note');
      const isActive = data.state === 'recording' || data.state === 'paused';
      updateRecordingButtonUI(isActive, isActive ? data.recordingId : null);

      // Also update the future meeting indicator if it exists
      const futureMeetingIndicator = document.getElementById('futureMeetingIndicator');
      if (futureMeetingIndicator && futureMeetingIndicator.style.display !== 'none') {
        // Re-display the meeting to update the UI
        displayMeetingInEditor(currentEditingMeetingId);
      }
    }
  });

  // Setup record/stop button toggle
  const recordButton = document.getElementById('recordButton');
  if (recordButton) {

    let isProcessing = false; // Flag to prevent double-clicks

    recordButton.addEventListener('click', async () => {
      // Only allow recording if we're in a note
      if (!currentEditingMeetingId) {
        alert('You need to be in a note to start recording');
        return;
      }

      // Prevent double-clicks
      if (isProcessing) {
        console.log('Recording action already in progress, ignoring click');
        return;
      }
      isProcessing = true;

      window.isRecording = !window.isRecording;

      // Get the elements inside the button
      const recordIcon = recordButton.querySelector('.record-icon');
      const stopIcon = recordButton.querySelector('.stop-icon');

      if (window.isRecording) {
        try {
          // Start recording
          console.log('Starting manual recording for meeting:', currentEditingMeetingId);

          // Change to stop mode immediately for better feedback
          recordButton.classList.add('recording');
          recordIcon.style.display = 'none';
          stopIcon.style.display = 'block';

          // Call the API to start recording
          const result = await window.electronAPI.startManualRecording(currentEditingMeetingId);

          if (result.success) {
            console.log('Manual recording started with ID:', result.recordingId);
            window.currentRecordingId = result.recordingId;

            // Show a little toast message
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = 'Recording started...';
            document.body.appendChild(toast);

            // Remove toast after 3 seconds
            setTimeout(() => {
              toast.style.opacity = '0';
              setTimeout(() => {
                document.body.removeChild(toast);
              }, 300);
            }, 3000);
          } else {
            // If starting failed, revert UI
            console.error('Failed to start recording:', result.error);
            alert('Failed to start recording: ' + result.error);
            window.isRecording = false;
            recordButton.classList.remove('recording');
            recordIcon.style.display = 'block';
            stopIcon.style.display = 'none';
          }
          isProcessing = false; // Re-enable button clicks
        } catch (error) {
          // Handle errors
          console.error('Error starting recording:', error);
          alert('Error starting recording: ' + (error.message || error));

          // Reset UI state
          window.isRecording = false;
          recordButton.classList.remove('recording');
          recordIcon.style.display = 'block';
          stopIcon.style.display = 'none';
          isProcessing = false; // Re-enable button clicks
        }
      } else {
        // Stop recording
        if (window.currentRecordingId) {
          try {
            console.log('Stopping manual recording:', window.currentRecordingId);

            // Store the recording ID before stopping so it's available for the completion event
            window.lastRecordingId = window.currentRecordingId;

            // Update recording state immediately
            window.isRecording = false;
            recordButton.classList.remove('recording');

            // Switch to AI summary tab immediately
            const summaryTabBtn = document.querySelector('.tab-btn[data-tab="ai-summary"]');
            if (summaryTabBtn) summaryTabBtn.click();

            // Set loading state
            window.setRecordButtonLoading(true);

            // Add a safety timeout to prevent infinite spinner (30 seconds)
            summaryGenerationTimeout = setTimeout(() => {
              console.warn('Summary generation timeout - forcing spinner to stop');
              window.setRecordButtonLoading(false);
              isProcessing = false;
              summaryGenerationTimeout = null;
            }, 30000);

            // Call the API to stop recording
            const result = await window.electronAPI.generateSummary(window.currentRecordingId);

            if (result.success) {
              console.log('Manual recording stopped successfully');

              // Show a little toast message
              const toast = document.createElement('div');
              toast.className = 'toast';
              toast.textContent = 'Recording stopped. Generating summary...';
              document.body.appendChild(toast);

              // Remove toast after 3 seconds
              setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => {
                  document.body.removeChild(toast);
                }, 300);
              }, 3000);

              // The recording-completed event handler will take care of refreshing the content
              // and generating the summary when the recording finishes processing

            } else {
              console.error('Failed to stop recording:', result.error);
              alert('Failed to stop recording: ' + result.error);

              // Clear safety timeout
              if (summaryGenerationTimeout) {
                clearTimeout(summaryGenerationTimeout);
                summaryGenerationTimeout = null;
              }

              // Restore recording state if failed
              window.isRecording = true;
              recordButton.classList.add('recording');

              // Reset button states
              window.setRecordButtonLoading(false);
            }

            // Reset recording ID
            window.currentRecordingId = null;
            isProcessing = false; // Re-enable button clicks
          } catch (error) {
            console.error('Error stopping recording:', error);
            alert('Error stopping recording: ' + (error.message || error));

            // Restore recording state on error
            window.isRecording = true;
            recordButton.classList.add('recording');

            // Reset button states
            window.setRecordButtonLoading(false);
            isProcessing = false; // Re-enable button clicks
          }
        } else {
          console.warn('No active recording ID found');
          // Reset UI anyway
          recordButton.classList.remove('recording');
          recordIcon.style.display = 'block';
          stopIcon.style.display = 'none';
          isProcessing = false; // Re-enable button clicks
        }
      }
    });
  }

  // Setup summarize button
  const generateBtn = document.getElementById('generateBtn');
  console.log('Setting up summarize button, element found:', !!generateBtn);
  if (generateBtn) {
    let isGeneratingSummary = false;
    generateBtn.addEventListener('click', async () => {
      console.log('SUMMARIZE BUTTON CLICKED - disabled:', generateBtn.disabled, 'meetingId:', currentEditingMeetingId);

      // Prevent concurrent summary generation
      if (isGeneratingSummary) {
        console.log('Summary generation already in progress, ignoring click');
        return;
      }

      if (!currentEditingMeetingId) {
        console.log('No currentEditingMeetingId, returning');
        return;
      }

      isGeneratingSummary = true;

      try {
        console.log('Getting recording ID from meeting object for:', currentEditingMeetingId);

        // Get recordingId from the meeting object (works for both active and completed recordings)
        const meeting = [...upcomingMeetings, ...pastMeetings].find(m => m.id === currentEditingMeetingId);
        console.log('Found meeting:', meeting);

        if (!meeting || !meeting.recordingId) {
          console.log('No recordingId found for this meeting');
          alert('No recording found for this meeting. Please start a recording first.');
          isGeneratingSummary = false;
          return;
        }

        const recordingId = meeting.recordingId;
        console.log('Using stored recordingId from meeting:', recordingId);

        // EXACT same code as stop recording button
        window.lastRecordingId = recordingId;
        window.isRecording = false;
        recordButton.classList.remove('recording');

        const summaryTabBtn = document.querySelector('.tab-btn[data-tab="ai-summary"]');
        console.log('Switching to AI summary tab');
        if (summaryTabBtn) summaryTabBtn.click();

        console.log('Calling setRecordButtonLoading(true), function exists:', typeof window.setRecordButtonLoading);
        window.setRecordButtonLoading(true);
        console.log('setRecordButtonLoading(true) completed');

        console.log('Calling generateSummary API');
        const result = await window.electronAPI.generateSummary(recordingId);
        console.log('generateSummary result:', result);

        if (result.success) {
          console.log('Manual recording stopped successfully');

          const toast = document.createElement('div');
          toast.className = 'toast';
          toast.textContent = 'Recording stopped. Generating summary...';
          document.body.appendChild(toast);

          setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
              document.body.removeChild(toast);
            }, 300);
          }, 3000);
        } else {
          console.error('Failed to stop recording:', result.error);
          alert('Failed to stop recording: ' + result.error);
          window.isRecording = true;
          recordButton.classList.add('recording');
          window.setRecordButtonLoading(false);
        }

        window.currentRecordingId = null;
      } catch (error) {
        console.error('Error stopping recording:', error);
        alert('Error stopping recording: ' + (error.message || error));
        window.isRecording = true;
        recordButton.classList.add('recording');
        window.setRecordButtonLoading(false);
      } finally {
        isGeneratingSummary = false;
      }
    });
  }

  // Note: Removed duplicate .generate-btn listener to avoid double execution

  // Check authentication status and display user info (make it global)
  window.updateAuthStatus = async function() {
    const loginView = document.getElementById('loginView');
    const appContainer = document.querySelector('.app-container');

    try {
      const isAuthenticated = await window.electronAPI.auth.isAuthenticated();
      console.log('Authentication status:', isAuthenticated);

      if (isAuthenticated) {
        // Hide login view, show app
        if (loginView) loginView.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        const userResult = await window.electronAPI.auth.getUser();
        console.log('User data:', userResult);

        if (userResult.success && userResult.user) {
          // The user data might be in userResult.user.data.user structure from the API response
          const userData = userResult.user?.data?.user || userResult.user?.user || userResult.user?.data || userResult.user;
          console.log('Extracted user data:', userData);
          console.log('User data type:', typeof userData);
          console.log('User data keys:', userData ? Object.keys(userData) : 'no keys');

          const avatarElement = document.querySelector('.user-avatar');

          if (avatarElement) {
            // Handle both camelCase and snake_case field names from protobuf
            // The protobuf uses full_name (snake_case)
            // The storage now properly saves full_name from the API
            const email = userData.email || '';
            const fullName = (userData.full_name || userData.name || userData.fullName || '').trim();

            // Log to debug what we're getting
            console.log('User full_name:', userData.full_name);
            console.log('User fullName:', userData.fullName);
            console.log('User name:', userData.name);
            console.log('User email:', userData.email);
            console.log('Extracted fullName:', fullName);

            // Make sure fullName is not accidentally set to email
            const actualName = (fullName && fullName !== email) ? fullName : '';

            // Update avatar with user initials or image
            const initials = actualName ?
              actualName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) :
              email ? email[0].toUpperCase() : 'U';

            // Create a better avatar display with initials
            avatarElement.innerHTML = `
              <div class="avatar-circle" style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 500; font-size: 14px; cursor: pointer;" title="${email || 'User'}">
                ${initials}
              </div>
            `;

            // Add click handler to show user menu - use addEventListener instead of onclick
            avatarElement.style.cursor = 'pointer';

            // Remove any existing avatar click handlers first
            const oldHandler = avatarElement._avatarClickHandler;
            if (oldHandler) {
              avatarElement.removeEventListener('click', oldHandler);
            }

            // Create and store new handler
            const handleAvatarClick = function(e) {
              e.stopPropagation();
              e.preventDefault();

              console.log('Avatar clicked!');

              const displayName = actualName || email || 'Unknown User';
              const displayEmail = email || 'No email';

              // Remove existing menu if any
              const existingMenu = document.querySelector('.avatar-dropdown');
              if (existingMenu) {
                existingMenu.remove();
                return;
              }

              // Create dropdown menu
              const menu = document.createElement('div');
              menu.className = 'avatar-dropdown';
              menu.innerHTML = `
                <div class="avatar-info">
                  <div class="avatar-name">${displayName}</div>
                  <div class="avatar-email">${displayEmail}</div>
                </div>
                <div class="avatar-divider"></div>
                <button class="avatar-menu-item" id="logoutBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" fill="currentColor"/>
                  </svg>
                  Sign out
                </button>
              `;

              // Position the menu below the avatar
              const rect = avatarElement.getBoundingClientRect();
              menu.style.position = 'absolute';
              menu.style.top = `${rect.bottom + 5}px`;
              menu.style.right = `${window.innerWidth - rect.right}px`;

              document.body.appendChild(menu);

              // Handle logout click
              document.getElementById('logoutBtn').addEventListener('click', async () => {
                if (confirm('Are you sure you want to sign out?')) {
                  menu.remove();
                  await window.electronAPI.auth.logout();
                  window.updateAuthStatus();
                }
              });

              // Close menu when clicking outside
              setTimeout(() => {
                document.addEventListener('click', function closeMenu(e) {
                  if (!menu.contains(e.target) && e.target !== avatarElement) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                  }
                });
              }, 0);
            };

            // Store and add the handler
            avatarElement._avatarClickHandler = handleAvatarClick;
            avatarElement.addEventListener('click', handleAvatarClick);
          }
        }
      } else {
        // Not authenticated - show login view
        console.log('User not authenticated, showing login view');
        if (loginView) {
          loginView.style.display = 'flex';
          if (appContainer) appContainer.style.display = 'none';
          // Focus email input
          const emailInput = document.getElementById('emailInput');
          if (emailInput) emailInput.focus();
        }

        // Update avatar to show not logged in state
        const avatarElement = document.querySelector('.user-avatar');
        if (avatarElement) {
          avatarElement.innerHTML = `
            <div style="width: 32px; height: 32px; border-radius: 50%; background: #f0f0f0; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Not logged in">
              <svg width="20" height="20" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 20C22.7614 20 25 17.7614 25 15C25 12.2386 22.7614 10 20 10C17.2386 10 15 12.2386 15 15C15 17.7614 17.2386 20 20 20Z" fill="#a0a0a0"/>
                <path d="M12 31C12 26.0294 15.5817 22 20 22C24.4183 22 28 26.0294 28 31" stroke="#a0a0a0" stroke-width="4"/>
              </svg>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  }

  // Initialize login UI handlers
  initializeLoginUI();

  // Check auth status on load
  window.updateAuthStatus();

  // Listen for auth events
  window.electronAPI.auth.onAuthSuccess(() => {
    console.log('Auth success event received');
    window.updateAuthStatus();
  });

  window.electronAPI.auth.onAuthLogout(() => {
    console.log('Auth logout event received');
    window.updateAuthStatus();
  });

  // Listen for in-app notifications
  window.electronAPI.onInAppNotification((data) => {
    console.log('In-app notification received:', data);

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'in-app-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-text">
          <div class="notification-title">${data.title}</div>
          <div class="notification-body">${data.body}</div>
        </div>
        ${data.action ? `
          <button class="notification-action-btn" data-action="${data.type}">
            ${data.action}
          </button>
        ` : ''}
      </div>
      <button class="notification-close" data-action="close">×</button>
    `;

    // Add to document
    document.body.appendChild(notification);

    // Add event listeners for action buttons
    const actionBtn = notification.querySelector('.notification-action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => {
        const action = actionBtn.getAttribute('data-action');
        window.handleNotificationAction(action);
      });
    }

    // Add event listener for close button
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        notification.remove();
      });
    }

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
      }
    }, 10000);
  });

  // Handle notification action
  window.handleNotificationAction = async (type) => {
    if (type === 'meeting-detected') {
      // Check if we have a detected meeting and join it
      const hasDetectedMeeting = await window.electronAPI.checkForDetectedMeeting();
      if (hasDetectedMeeting) {
        console.log('Starting recording from notification...');
        await window.electronAPI.joinDetectedMeeting();

        // Close notification
        const notification = document.querySelector('.in-app-notification');
        if (notification) notification.remove();

        // Show toast
        showToast('Recording started');
      }
    } else if (type === 'test-action') {
      alert('Test action clicked!');
    }
  };
});
