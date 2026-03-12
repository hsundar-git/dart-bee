/**
 * Voice Scoring Module
 * Uses Web Speech API for hands-free score entry
 */
const Voice = (() => {
    let recognition = null;
    let isListening = false;
    let onResultCallback = null;
    let isSpeaking = false;

    // Base word-to-number mappings (includes homophones & accent variations)
    const ONES = {
        'zero': 0, 'oh': 0, 'nil': 0, 'nothing': 0, 'no score': 0, 'miss': 0, 'nought': 0,
        'one': 1, 'won': 1, 'van': 1,
        'two': 2, 'to': 2, 'too': 2, 'tu': 2,
        'three': 3, 'tree': 3, 'free': 3,
        'four': 4, 'for': 4, 'fore': 4,
        'five': 5, 'fife': 5,
        'six': 6, 'sicks': 6,
        'seven': 7, 'saven': 7,
        'eight': 8, 'ate': 8, 'ait': 8,
        'nine': 9, 'nein': 9, 'nain': 9,
        'ten': 10, 'tan': 10,
        'eleven': 11, 'twelve': 12, 'thirteen': 13, 'turteen': 13,
        'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
        'eighteen': 18, 'nineteen': 19
    };
    const TENS = {
        'twenty': 20, 'thirty': 30, 'tirty': 30,
        'forty': 40, 'fourty': 40, 'faulty': 40, 'fawty': 40,
        'fifty': 50, 'fifti': 50,
        'sixty': 60, 'sexty': 60, 'siksti': 60,
        'seventy': 70, 'eighty': 80, 'ighty': 80,
        'ninety': 90, 'nainty': 90
    };

    // Dart-specific terms (longest first for matching)
    const DART_TERMS = {
        "bull's eye": 50, 'bulls eye': 50, 'bullseye': 50, 'full bull': 50, 'bull': 50,
        'outer bull': 25, 'single bull': 25,
        'ton eighty': 180, 'ton 80': 180,
        'ton forty': 140, 'ton 40': 140,
        'ton twenty': 120, 'ton 20': 120,
        'ton': 100, 'maximum': 180, 'max': 180
    };

    // Filler words to strip before parsing
    const FILLERS = /\b(i got|i scored|it's|its|that's|thats|score is|score|points|point|is|the|a|my|got|scored|it|that)\b/g;

    function isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    function init() {
        if (!isSupported()) return false;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-IN';
        recognition.maxAlternatives = 5;

        recognition.onresult = handleResult;
        recognition.onend = handleEnd;
        recognition.onerror = handleError;

        return true;
    }

    function parseScore(transcript) {
        let text = transcript.toLowerCase().trim()
            .replace(/[-–—]/g, ' ')   // "twenty-five" → "twenty five"
            .replace(/\s+/g, ' ');    // collapse spaces

        // 1. Direct digit match — also handle "1 80" → 180, "1 20" → 120
        const joinedDigits = text.replace(/(\d)\s+(\d)/g, '$1$2');
        const numMatch = joinedDigits.match(/\b(\d{1,3})\b/);
        if (numMatch) {
            const num = parseInt(numMatch[1], 10);
            if (num >= 0 && num <= 180) return num;
        }

        // 2. Dart-specific terms (check longest phrases first)
        const sortedDarts = Object.keys(DART_TERMS).sort((a, b) => b.length - a.length);
        for (const term of sortedDarts) {
            if (text.includes(term)) return DART_TERMS[term];
        }

        // 3. Strip filler words: "I got sixty" → "sixty"
        text = text.replace(FILLERS, '').replace(/\s+/g, ' ').trim();

        // 4. Compute from words: handles "sixty five", "one hundred and twenty", etc.
        const words = text.replace(/\band\b/g, '').trim().split(/\s+/);
        let total = 0;
        let found = false;

        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            const next = words[i + 1];
            const twoWord = next ? w + ' ' + next : '';

            // Check two-word phrases first (e.g. "no score")
            if (twoWord && ONES[twoWord] !== undefined) {
                total += ONES[twoWord];
                found = true;
                i++;
            } else if (w === 'hundred' || w === 'hundread') {
                if (total === 0) total = 100;
                else total *= 100;
                found = true;
            } else if (TENS[w] !== undefined) {
                total += TENS[w];
                found = true;
            } else if (ONES[w] !== undefined) {
                total += ONES[w];
                found = true;
            }
        }

        if (found && total >= 0 && total <= 180) return total;

        return null;
    }

    function handleResult(event) {
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript;
        const isFinal = result.isFinal;

        // Update visual feedback with interim results
        updateTranscript(transcript, isFinal);

        if (isFinal) {
            let score = null;
            for (let i = 0; i < result.length; i++) {
                score = parseScore(result[i].transcript);
                if (score !== null) break;
            }

            if (score !== null && score >= 0 && onResultCallback) {
                updateTranscript(`"${transcript}" → ${score}`, true);
                speak(String(score));
                onResultCallback(score);
                // Clear transcript after 1s
                setTimeout(() => clearTranscript(), 1000);
            } else if (score === null) {
                updateTranscript(`"${transcript}" → ???`, true);
                UI.showToast(`Didn't catch that: "${transcript}"`, 'warning');
                // Clear transcript after 1s so it's ready for next attempt
                setTimeout(() => clearTranscript(), 1000);
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
        if (event.error === 'no-speech') {
            // Timeout with no speech — clear transcript and let handleEnd restart
            clearTranscript();
            return;
        }
        if (event.error === 'aborted') return;

        if (event.error === 'not-allowed') {
            UI.showToast('Microphone access denied. Check browser permissions.', 'error');
            stop();
        }
    }

    function start(scoreCallback) {
        if (!recognition && !init()) {
            UI.showToast('Voice input not supported in this browser', 'error');
            return;
        }

        onResultCallback = scoreCallback;
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
        updateButton(false);
        clearTranscript();

        if (recognition) {
            try { recognition.stop(); } catch (e) { /* ignore */ }
        }
    }

    function toggle(scoreCallback) {
        if (isListening) {
            stop();
        } else {
            start(scoreCallback);
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
