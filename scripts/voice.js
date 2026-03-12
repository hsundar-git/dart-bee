/**
 * Voice Scoring Module
 * Uses Web Speech API for hands-free score entry
 */
const Voice = (() => {
    let recognition = null;
    let isListening = false;
    let onResultCallback = null;
    let onCommandCallback = null;
    let isSpeaking = false;

    // Voice commands mapped to actions
    const COMMANDS = {
        'undo': ['undo', 'undo dart', 'undo that', 'take it back', 'go back', 'redo', 'redo dart'],
        'submit': ['submit', 'submit turn', 'done', 'next', 'next player', 'send it', 'confirm'],
        'clear': ['clear', 'clear all', 'reset', 'start over', 'wipe']
    };

    // Word-to-number mapping for spoken scores
    const WORD_NUMBERS = {
        'zero': 0, 'oh': 0, 'nil': 0, 'nothing': 0, 'no score': 0, 'miss': 0,
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
        'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
        'twenty': 20, 'twenty one': 21, 'twenty two': 22, 'twenty three': 23,
        'twenty four': 24, 'twenty five': 25, 'twenty six': 26, 'twenty seven': 27,
        'twenty eight': 28, 'twenty nine': 29,
        'thirty': 30, 'thirty one': 31, 'thirty two': 32, 'thirty three': 33,
        'thirty four': 34, 'thirty five': 35, 'thirty six': 36, 'thirty seven': 37,
        'thirty eight': 38, 'thirty nine': 39,
        'forty': 40, 'forty one': 41, 'forty two': 42, 'forty three': 43,
        'forty four': 44, 'forty five': 45, 'forty six': 46, 'forty seven': 47,
        'forty eight': 48, 'forty nine': 49,
        'fifty': 50, 'fifty one': 51, 'fifty two': 52, 'fifty three': 53,
        'fifty four': 54, 'fifty five': 55, 'fifty six': 56, 'fifty seven': 57,
        'fifty eight': 58, 'fifty nine': 59, 'sixty': 60,
        'seventy': 70, 'eighty': 80, 'eighty one': 81, 'eighty five': 85,
        'ninety': 90, 'ninety five': 95, 'ninety nine': 99,
        'hundred': 100, 'one hundred': 100,
        'one twenty': 120, 'one hundred twenty': 120, 'one hundred and twenty': 120,
        'one forty': 140, 'one hundred forty': 140, 'one hundred and forty': 140,
        'one sixty': 160, 'one hundred sixty': 160, 'one hundred and sixty': 160,
        'one eighty': 180, 'one hundred eighty': 180, 'one hundred and eighty': 180,
        'bust': -1, 'busted': -1
    };

    function isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    function init() {
        if (!isSupported()) return false;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 3;

        recognition.onresult = handleResult;
        recognition.onend = handleEnd;
        recognition.onerror = handleError;

        return true;
    }

    function parseCommand(transcript) {
        const text = transcript.toLowerCase().trim();
        for (const [action, phrases] of Object.entries(COMMANDS)) {
            for (const phrase of phrases) {
                if (text.includes(phrase)) return action;
            }
        }
        return null;
    }

    function parseScore(transcript) {
        const text = transcript.toLowerCase().trim();

        // Direct number match
        const numMatch = text.match(/\b(\d{1,3})\b/);
        if (numMatch) {
            const num = parseInt(numMatch[1], 10);
            if (num >= 0 && num <= 180) return num;
        }

        // Word match - try longest phrases first
        const sorted = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length);
        for (const phrase of sorted) {
            if (text.includes(phrase)) {
                return WORD_NUMBERS[phrase];
            }
        }

        return null;
    }

    function handleResult(event) {
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript;
        const isFinal = result.isFinal;

        // Update visual feedback with interim results
        updateTranscript(transcript, isFinal);

        if (isFinal) {
            // Check for commands first (across all alternatives)
            let command = null;
            let score = null;
            for (let i = 0; i < result.length; i++) {
                command = parseCommand(result[i].transcript);
                if (command) break;
            }

            if (command && onCommandCallback) {
                onCommandCallback(command);
                return;
            }

            // Then try score parsing
            for (let i = 0; i < result.length; i++) {
                score = parseScore(result[i].transcript);
                if (score !== null) break;
            }

            if (score !== null && score >= 0 && onResultCallback) {
                onResultCallback(score);
            } else if (score === null) {
                UI.showToast(`Didn't catch that: "${transcript}"`, 'warning');
            }
        }
    }

    function handleEnd() {
        // Don't restart while speaking — avoid picking up our own announcement
        if (isSpeaking) return;

        // If still in listening mode, restart (continuous listening)
        if (isListening) {
            try {
                recognition.start();
            } catch (e) {
                // Already started, ignore
            }
        } else {
            updateButton(false);
        }
    }

    function handleError(event) {
        if (event.error === 'no-speech') return; // Normal timeout
        if (event.error === 'aborted') return;

        if (event.error === 'not-allowed') {
            UI.showToast('Microphone access denied. Check browser permissions.', 'error');
            stop();
        }
    }

    function start(scoreCallback, commandCallback) {
        if (!recognition && !init()) {
            UI.showToast('Voice input not supported in this browser', 'error');
            return;
        }

        onResultCallback = scoreCallback;
        onCommandCallback = commandCallback;
        isListening = true;
        updateButton(true);

        try {
            recognition.start();
        } catch (e) {
            // Already running
        }
    }

    function stop() {
        isListening = false;
        onResultCallback = null;
        onCommandCallback = null;
        updateButton(false);
        clearTranscript();

        if (recognition) {
            try { recognition.stop(); } catch (e) { /* ignore */ }
        }
    }

    function toggle(scoreCallback, commandCallback) {
        if (isListening) {
            stop();
        } else {
            start(scoreCallback, commandCallback);
        }
    }

    function updateButton(active) {
        const btn = document.getElementById('voice-score-btn');
        if (!btn) return;
        btn.classList.toggle('voice-active', active);
        btn.setAttribute('aria-label', active ? 'Stop voice input' : 'Start voice input');
    }

    function updateTranscript(text, isFinal) {
        let el = document.getElementById('voice-transcript');
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('voice-transcript-final', isFinal);
        el.classList.remove('hidden');
    }

    function clearTranscript() {
        const el = document.getElementById('voice-transcript');
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    function speak(text) {
        if (!isListening) return;
        if (!window.speechSynthesis) return;

        // Block recognition restart while speaking
        isSpeaking = true;

        if (recognition) {
            try { recognition.stop(); } catch (e) { /* ignore */ }
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;

        utterance.onend = () => {
            isSpeaking = false;
            // Resume listening after announcement
            if (isListening && recognition) {
                try { recognition.start(); } catch (e) { /* ignore */ }
            }
        };

        utterance.onerror = () => {
            isSpeaking = false;
            if (isListening && recognition) {
                try { recognition.start(); } catch (e) { /* ignore */ }
            }
        };

        window.speechSynthesis.speak(utterance);
    }

    // Speak and then stop listening when done (for game-ending announcements)
    function speakAndStop(text) {
        if (!window.speechSynthesis) { stop(); return; }
        if (!isListening) return;

        isSpeaking = true;
        if (recognition) {
            try { recognition.stop(); } catch (e) { /* ignore */ }
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;

        utterance.onend = () => {
            isSpeaking = false;
            stop();
        };
        utterance.onerror = () => {
            isSpeaking = false;
            stop();
        };

        window.speechSynthesis.speak(utterance);
    }

    return {
        isSupported,
        start,
        stop,
        toggle,
        speak,
        speakAndStop,
        parseScore,
        isListening: () => isListening
    };
})();

window.Voice = Voice;
