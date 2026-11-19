// Keyboard input: held keys (drive/walk directions, run, handbrake) plus one-shot
// actions (confirm, pause, enter/exit car) queued as bit flags and consumed once
// per frame, so a press between frames is never lost or double-counted.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const BRAKE = new Set(['Space']);
const CONFIRM = new Set(['Enter', 'NumpadEnter']);
const PAUSE = new Set(['Escape', 'KeyP']);
const ENTER = new Set(['KeyE']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, run: false, brake: false };
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (RUN.has(event.code)) held.run = true;
    else if (BRAKE.has(event.code)) held.brake = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (ENTER.has(event.code)) { if (!event.repeat) actions |= ACTION_ENTER; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (RUN.has(event.code)) held.run = false;
    else if (BRAKE.has(event.code)) held.brake = false;
  });
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.run = held.brake = false;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    held,
    /** -1 left, 1 right, 0 neither/both. */
    steer() { return (held.right ? 1 : 0) - (held.left ? 1 : 0); },
    /** -1 back, 1 forward, 0 neither/both. */
    throttle() { return (held.up ? 1 : 0) - (held.down ? 1 : 0); },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
