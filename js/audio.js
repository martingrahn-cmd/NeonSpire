// Web Audio synthesized sounds and music
export class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this._musicOscillators = [];
        this._musicPlaying = false;
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.15;
        this.musicGain.connect(this.masterGain);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.4;
        this.sfxGain.connect(this.masterGain);
    }

    // Synthwave music generator
    startMusic(bpm = 120) {
        if (this._musicPlaying) return;
        this._musicPlaying = true;

        const t = this.ctx.currentTime;
        const beatLen = 60 / bpm;

        // Bass line (sub bass)
        const bassNotes = [55, 55, 65.41, 65.41, 49, 49, 55, 55]; // A1, C2, G1, A1
        this._playBassLoop(bassNotes, t, beatLen);

        // Pad chord
        this._playPad(t);

        // Arpeggio
        const arpNotes = [220, 277.18, 329.63, 440, 329.63, 277.18];
        this._playArpLoop(arpNotes, t, beatLen / 2);
    }

    _playBassLoop(notes, startTime, beatLen) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        gain.gain.value = 0.3;

        // Low pass filter for bass
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);

        const loopLen = notes.length * beatLen;
        const now = startTime;

        // Schedule notes repeating
        for (let rep = 0; rep < 50; rep++) {
            for (let i = 0; i < notes.length; i++) {
                const time = now + rep * loopLen + i * beatLen;
                osc.frequency.setValueAtTime(notes[i], time);
            }
        }

        osc.start(now);
        osc.stop(now + 50 * loopLen);
        this._musicOscillators.push(osc);
    }

    _playPad(startTime) {
        const chords = [
            [220, 277.18, 329.63],  // Am
            [196, 246.94, 293.66],  // G
            [174.61, 220, 261.63],  // F
            [196, 246.94, 293.66],  // G
        ];

        chords.forEach((chord) => {
            chord.forEach((freq) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                gain.gain.value = 0.06;
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(this.musicGain);
                osc.start(startTime);
                osc.stop(startTime + 200);
                this._musicOscillators.push(osc);
            });
        });
    }

    _playArpLoop(notes, startTime, noteLen) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        gain.gain.value = 0.05;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);

        const loopLen = notes.length * noteLen;

        for (let rep = 0; rep < 100; rep++) {
            for (let i = 0; i < notes.length; i++) {
                const time = startTime + rep * loopLen + i * noteLen;
                osc.frequency.setValueAtTime(notes[i], time);
                gain.gain.setValueAtTime(0.05, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + noteLen * 0.8);
            }
        }

        osc.start(startTime);
        osc.stop(startTime + 100 * loopLen);
        this._musicOscillators.push(osc);
    }

    stopMusic() {
        this._musicOscillators.forEach((osc) => {
            try { osc.stop(); } catch (e) { /* already stopped */ }
        });
        this._musicOscillators = [];
        this._musicPlaying = false;
    }

    // SFX methods
    playJump() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.15);
    }

    playLand() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.15);
    }

    playReverse() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.08);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.1);
    }

    playCollectible() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 arpeggio
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.2, t + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.15);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.05);
            osc.stop(t + i * 0.05 + 0.15);
        });
    }

    playDeath() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.6);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

        // Add some noise/static
        const noise = this.ctx.createOscillator();
        const noiseGain = this.ctx.createGain();
        noise.type = 'square';
        noise.frequency.value = 47;
        noiseGain.gain.setValueAtTime(0.1, t + 0.3);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        noise.connect(noiseGain);
        noiseGain.connect(this.sfxGain);
        noise.start(t + 0.3);
        noise.stop(t + 0.7);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.7);
    }

    playDash() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(1000, t + 0.15);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.3);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.35);
    }

    playCrumble() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        for (let i = 0; i < 5; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = 80 + Math.random() * 200;
            gain.gain.setValueAtTime(0.08, t + i * 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.03 + 0.08);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.03);
            osc.stop(t + i * 0.03 + 0.08);
        }
    }

    playZoneTransition() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.6);
    }
}
