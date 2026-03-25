// Input handler for keyboard and touch
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

        // Touch state
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchStartTime = 0;

        this._bindKeyboard();
        this._bindTouch();
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

    _bindTouch() {
        const canvas = document.getElementById('game-canvas');

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this._touchStartX = touch.clientX;
            this._touchStartY = touch.clientY;
            this._touchStartTime = performance.now();
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (e.changedTouches.length === 0) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - this._touchStartX;
            const dy = touch.clientY - this._touchStartY;
            const dt = performance.now() - this._touchStartTime;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 30 && dt < 300) {
                // Tap - jump
                const screenHalf = window.innerWidth / 2;
                if (touch.clientX < screenHalf) {
                    // Left tap = reverse
                    this.actions.reverse = true;
                } else {
                    // Right tap = jump
                    this.actions.jump = true;
                }
            } else if (dist > 30) {
                if (Math.abs(dy) > Math.abs(dx)) {
                    if (dy < -40) {
                        // Swipe up = high jump
                        this.actions.highJump = true;
                    } else if (dy > 40) {
                        // Swipe down = duck
                        this.actions.duck = true;
                    }
                } else {
                    // Horizontal swipe = reverse
                    this.actions.reverse = true;
                }
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
    }

    update() {
        // Reset one-shot actions
        this.actions.jump = false;
        this.actions.highJump = false;
        this.actions.reverse = false;
        this.actions.dash = false;
        this.actions.duck = false;

        // Keyboard: jump
        if (this.keys['Space'] && !this._jumpPressed) {
            this.actions.jump = true;
            this._jumpPressed = true;
        }

        // Keyboard: high jump
        if (this.keys['KeyW'] && !this._highJumpPressed) {
            this.actions.highJump = true;
            this._highJumpPressed = true;
        }

        // Keyboard: reverse direction
        if ((this.keys['KeyA'] || this.keys['KeyD']) && !this._reversePressed) {
            this.actions.reverse = true;
            this._reversePressed = true;
        }

        // Keyboard: duck
        this.actions.duck = this.keys['KeyS'] || false;

        // Keyboard: dash
        if ((this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !this._dashPressed) {
            this.actions.dash = true;
            this._dashPressed = true;
        }
    }
}
