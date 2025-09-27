export class TranscriptService {
  constructor() {
    this.currentTranscript = [];
    this.currentNotes = '';
  }

  setTranscript(transcript) {
    this.currentTranscript = transcript || [];
  }

  setNotes(notes) {
    this.currentNotes = notes || '';
  }

  formatTranscriptClean() {
    if (!this.currentTranscript || this.currentTranscript.length === 0) {
      return '';
    }

    return this.currentTranscript.map(entry => {
      const speaker = entry.speaker || 'Unknown Speaker';
      const text = entry.text || '';
      return `${speaker}: ${text}`;
    }).join('\n\n');
  }

  async copyToClipboard() {
    try {
      const formattedTranscript = this.formatTranscriptClean();
      if (!formattedTranscript) {
        console.warn('No transcript to copy');
        return false;
      }

      await navigator.clipboard.writeText(formattedTranscript);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }

  async copyNotesToClipboard() {
    try {
      if (!this.currentNotes) {
        console.warn('No notes to copy');
        return false;
      }

      await navigator.clipboard.writeText(this.currentNotes);
      return true;
    } catch (error) {
      console.error('Failed to copy notes to clipboard:', error);
      return false;
    }
  }

  downloadTranscript(filename = null) {
    const cleanTranscript = this.formatTranscriptClean();
    if (!cleanTranscript) {
      console.warn('No transcript to download');
      return;
    }

    const defaultFilename = filename || `transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    const blob = new Blob([cleanTranscript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}