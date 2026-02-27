/**
 * SoundFX Module
 * Web Audio API synthesized sound effects (no audio files needed)
 */

const SoundFX = (() => {
    let audioCtx = null;
    const STORAGE_KEY = 'dart_bee_sound_enabled';

    function isEnabled() {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    }

    function setEnabled(val) {
        localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false');
    }

    function toggle() {
        const next = !isEnabled();
        setEnabled(next);
        return next;
    }

    function getContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function playTone(freq, duration, waveform = 'sine', volume = 0.3, startTime = 0) {
        const ctx = getContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = waveform;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
        gain.gain.setValueAtTime(volume, ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + startTime);
        osc.stop(ctx.currentTime + startTime + duration);
    }

    function playFreqSweep(fromFreq, toFreq, duration, waveform = 'sawtooth', volume = 0.25) {
        const ctx = getContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = waveform;
        osc.frequency.setValueAtTime(fromFreq, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(toFreq, ctx.currentTime + duration);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    }

    const sounds = {
        submit() {
            playTone(800, 0.08, 'sine', 0.2);
        },
        bust() {
            playFreqSweep(150, 100, 0.3, 'sawtooth', 0.25);
        },
        highScore() {
            playTone(880, 0.12, 'sine', 0.25, 0);
            playTone(1100, 0.15, 'sine', 0.25, 0.12);
        },
        highScore140() {
            playTone(880, 0.1, 'sine', 0.25, 0);
            playTone(1047, 0.1, 'sine', 0.25, 0.1);
            playTone(1319, 0.15, 'sine', 0.25, 0.2);
        },
        maxScore() {
            // C-E-G-C major chord arpeggio
            playTone(523, 0.15, 'sine', 0.2, 0);
            playTone(659, 0.15, 'sine', 0.2, 0.1);
            playTone(784, 0.15, 'sine', 0.2, 0.2);
            playTone(1047, 0.25, 'sine', 0.25, 0.3);
        },
        playerFinish() {
            // E-G-C rising chime
            playTone(659, 0.12, 'sine', 0.25, 0);
            playTone(784, 0.12, 'sine', 0.25, 0.12);
            playTone(1047, 0.2, 'sine', 0.3, 0.24);
        },
        gameComplete() {
            // 5-note ascending fanfare
            playTone(523, 0.1, 'triangle', 0.2, 0);
            playTone(659, 0.1, 'triangle', 0.2, 0.1);
            playTone(784, 0.1, 'triangle', 0.2, 0.2);
            playTone(1047, 0.1, 'triangle', 0.25, 0.3);
            playTone(1319, 0.3, 'triangle', 0.3, 0.4);
        }
    };

    function play(soundName) {
        if (!isEnabled()) return;
        try {
            if (sounds[soundName]) {
                sounds[soundName]();
            }
        } catch (e) {
            console.warn('SoundFX: failed to play', soundName, e);
        }
    }

    return {
        play,
        isEnabled,
        setEnabled,
        toggle
    };
})();
