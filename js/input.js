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

        // Touch queued actions — survive until consumed by update()
        this._touchQueue = [];

        // Touch state
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchStartTime = 0;
        this._touching = false;

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
        // Bind to document so touches work even over HUD elements
        document.addEventListener('touchstart', (e) => {
            // Don't hijack button taps on menu/death/victory screens
            if (e.target.closest('.screen-btn')) return;

            e.preventDefault();
            const touch = e.touches[0];
            this._touchStartX = touch.clientX;
            this._touchStartY = touch.clientY;
            this._touchStartTime = performance.now();
            this._touching = true;
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (!this._touching) return;
            e.preventDefault();
            this._touching = false;

            if (e.changedTouches.length === 0) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - this._touchStartX;
            const dy = touch.clientY - this._touchStartY;
            const dt = performance.now() - this._touchStartTime;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 40 && dt < 400) {
                // Tap — anywhere on screen = jump (simplest mobile control)
                this._touchQueue.push('jump');
            } else if (dist >= 40) {
                if (Math.abs(dy) > Math.abs(dx)) {
                    if (dy < -50) {
                        this._touchQueue.push('highJump');
                    } else if (dy > 50) {
                        this._touchQueue.push('duck');
                    }
                } else {
                    // Horizontal swipe = reverse direction
                    this._touchQueue.push('reverse');
                }
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (this._touching) e.preventDefault();
        }, { passive: false });
    }

    update() {
        // Reset one-shot actions
        this.actions.jump = false;
        this.actions.highJump = false;
        this.actions.reverse = false;
        this.actions.dash = false;
        this.actions.duck = false;

        // Process touch queue FIRST — these are one-shot events
        while (this._touchQueue.length > 0) {
            const action = this._touchQueue.shift();
            this.actions[action] = true;
        }

        // Keyboard: jump (only if touch didn't already set it)
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
