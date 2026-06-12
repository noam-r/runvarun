export type SpeechCueResult = { success: boolean; error?: string };

export const speechService = {
  isSupported(): boolean {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  },

  async speak(text: string, lang?: string): Promise<SpeechCueResult> {
    if (!this.isSupported()) {
      return { success: false, error: 'Speech synthesis not supported' };
    }

    return new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (lang && lang !== 'system') {
          utterance.lang = lang === 'he' ? 'he-IL' : 'en-US';
        }
        utterance.onend = () => resolve({ success: true });
        utterance.onerror = (e) => resolve({ success: false, error: e.error });

        // Timeout fallback in case speech never fires events
        const timeout = setTimeout(() => resolve({ success: true }), 5000);
        utterance.onend = () => {
          clearTimeout(timeout);
          resolve({ success: true });
        };
        utterance.onerror = (e) => {
          clearTimeout(timeout);
          resolve({ success: false, error: e.error });
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        resolve({ success: false, error: 'Speech failed' });
      }
    });
  },

  async test(): Promise<SpeechCueResult> {
    return this.speak('Voice cues are ready');
  },

  cancel(): void {
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
  },
};
