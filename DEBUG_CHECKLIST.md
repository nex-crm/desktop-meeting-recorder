# Debugging Audio Recording Transcript Issues

## Steps to Test

1. **Start the app**:
   ```bash
   npm run start
   ```

2. **Test Audio Recording**:
   - Click "Start Meeting with Audio"
   - Start speaking or play audio
   - Watch the console for these log messages:

### Expected Log Output

#### When Recording Starts:
```
[AUDIO RECORDING] Registered window ID for transcript tracking: <key>
[AUDIO RECORDING] Note ID: meeting-<timestamp>
[AUDIO RECORDING] All active meeting IDs: [<key>]
[AUDIO RECORDING] Starting recording with config: { windowId: '<key>', ... }
[AUDIO RECORDING] RecallAiSdk.startRecording() called successfully
```

#### When Transcript Events Fire:
```
Received realtime event: transcript.data
Event window ID: <should match key>
Active meeting IDs: [<should include key>]
[TRANSCRIPT] Received transcript.data event for window: <key>
Transcript from <speaker>: "<text>"
```

## What to Check

### Scenario 1: No transcript events received
- **Problem**: SDK not firing transcript events for desktop audio
- **Check**: Look for ANY realtime events (not just transcript)
- **Possible causes**:
  - Upload token issue
  - API key/permissions issue  
  - Deepgram configuration issue

### Scenario 2: Transcript events received but wrong window ID
- **Problem**: Window ID mismatch
- **Look for**: Event window ID doesn't match the registered key
- **Log output will show**: "No active meeting found for window ID: <id>"

### Scenario 3: No audio being captured
- **Problem**: System audio permissions or audio routing
- **Check**: macOS System Preferences > Security & Privacy > Privacy > Microphone/Screen Recording

## Compare with Video Recording

To confirm the issue is specific to audio recording:

1. Join a Zoom meeting
2. Click "Record Meeting with Video"
3. Check if transcript appears in real-time
4. Compare the console logs between audio and video flows

## Key Differences

**Video Flow**:
- Window ID comes from detected video meeting
- SDK automatically recognizes video platform windows
- Transcript events tied to actual meeting window

**Audio Flow**:
- Window ID is synthetic from `prepareDesktopAudioRecording()`
- No actual video meeting window detected
- Transcript events should still fire with synthetic ID

## If Transcripts Still Don't Work

Possible root causes:
1. **Deepgram API issue**: Try switching to AssemblyAI
2. **SDK version bug**: Check if desktop audio recording transcripts work in SDK v1.1.0
3. **Upload token not properly associated**: Verify the upload token is valid
4. **Realtime endpoints not supported for desktop audio**: May be an SDK limitation

Contact Recall.ai support with:
- SDK version: 1.1.0
- Issue: Transcripts work for video meetings but not desktop audio recordings
- Configuration: deepgram_streaming with interim_results: true
