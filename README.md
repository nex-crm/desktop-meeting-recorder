# Nex Meeting Recorder

A desktop application for recording meetings locally using the Recall.ai Desktop SDK. This provides a discreet, universal solution for meeting recording that works across all meeting platforms.

## Overview

This desktop recorder complements the Nex CRM meeting bot by:
- Recording meetings discreetly without visible bot participation
- Working with any meeting application (Zoom, Teams, Google Meet, etc.)
- Capturing screen content and audio directly from the user's machine
- Providing real-time transcription via Deepgram
- Generating AI-powered summaries and insights

Based on the [Recall.ai Desktop Recording SDK](https://www.recall.ai/product/desktop-recording-sdk) and forked from [muesli-public](https://github.com/recallai/muesli-public).

# Setup

Modify `.env` to include your Recall.ai API key:

```
RECALLAI_API_KEY=<your key>
```

Additionally, this project by default tries to do live transcription using Deepgram; you'll need to configure your Deepgram credential on the [Recall.ai dashboard!](https://www.recall.ai/login)

If you want to enable the AI summary after a recording is finished, you can specify an OpenRouter API key.

```
OPENROUTER_KEY=<your key>
```

To launch:

```sh
npm install
npm start
```

# Screenshots

![Screenshot 2025-06-16 at 10 10 57 PM](https://github.com/user-attachments/assets/9df12246-b5be-466d-958e-e09ff0b4b3cb)
![Screenshot 2025-06-16 at 10 22 44 PM](https://github.com/user-attachments/assets/685f13ab-7c02-4f29-a987-830d331c4d36)
![Screenshot 2025-06-16 at 10 14 38 PM](https://github.com/user-attachments/assets/75817823-084c-46b0-bbe8-e0195a3f9051)
