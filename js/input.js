// Input handler for keyboard and touch (iOS Safari compatible)
export class InputManager {
    constructor() {
        this.keys = {};
        this.actions = {
            jump: false,
            highJump: false,
            reverse: false,
            duck: false,
            dash: false,
        };
        this._jumpPressed = false;
        this._highJumpPressed = false;
        this._reversePressed = false;
        this._dashPressed = false;

        // Touch queued actions
        this._touchQueue = [];

        // Swipe tracking
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchStartTime = 0;

        this._bindKeyboard();
        // Defer touch binding until canvas is ready
        this._touchBound = false;
    }

    bindTouch() {
        if (this._touchBound) return;
        this._touchBound = true;

        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;

        // === TOUCH on canvas directly (iOS Safari compatible) ===
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const touch = e.touches[0];
            this._touchStartX = touch.clientX;
            this._touchStartY = touch.clientY;
            this._touchStartTime = performance.now();

            // Immediate jump
            this._touchQueue.push('jump');
        }, { passive: false, capture: true });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.changedTouches.length === 0) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - this._touchStartX;
            const dy = touch.clientY - this._touchStartY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist >= 50) {
                if (Math.abs(dy) > Math.abs(dx)) {
                    if (dy < -60) {
                        this._touchQueue.push('jump');
                    } else if (dy > 60) {
                        this._touchQueue.push('duck');
                    }
                } else {
                    this._touchQueue.push('reverse');
                }
            }
        }, { passive: false, capture: true });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

        // === CLICK fallback — iOS Safari sometimes uses click instead of touch ===
        canvas.addEventListener('click', (e) => {
            e.preventDefault();
            this._touchQueue.push('jump');
        });

        // === Also capture touches on HUD (which overlays the canvas) ===
        const hud = document.getElementById('hud');
        if (hud) {
            hud.style.pointerEvents = 'none'; // ensure touches pass through
        }
    }

    _bindKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            if (e.code === 'Space') this._jumpPressed = false;
            if (e.code === 'KeyW') this._highJumpPressed = false;
            if (e.code === 'KeyA' || e.code === 'KeyD') this._reversePressed = false;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._dashPressed = false;
        });
    }

    update() {
        // Reset one-shot actions
        this.actions.jump = false;
        this.actions.highJump = false;
        this.actions.reverse = false;
        this.actions.dash = false;
        this.actions.duck = false;

        // Process touch queue FIRST
        while (this._touchQueue.length > 0) {
            const action = this._touchQueue.shift();
            this.actions[action] = true;
        }

        // Keyboard: jump
        if (this.keys['Space'] && !this._jumpPressed) {
            this.actions.jump = true;
            this._jumpPressed = true;
        }

        // Keyboard: W acts as jump so double-jump uses same action
        if (this.keys['KeyW'] && !this._highJumpPressed) {
            this.actions.jump = true;
            this._highJumpPressed = true;
        }

        // Keyboard: reverse direction
        if ((this.keys['KeyA'] || this.keys['KeyD']) && !this._reversePressed) {
            this.actions.reverse = true;
            this._reversePressed = true;
        }

        // Keyboard: duck
        if (this.keys['KeyS']) {
            this.actions.duck = true;
        }

        // Keyboard: dash
        if ((this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !this._dashPressed) {
            this.actions.dash = true;
            this._dashPressed = true;
        }
    }
}
