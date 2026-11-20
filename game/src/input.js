// Neon Harbor — keyboard: WASD or arrows to drive, Enter to confirm, P to pause,
// C to continue a banked run straight from the title screen.

export const input = {
  up: false, down: false, left: false, right: false,
  enterPressed: false, pausePressed: false, cPressed: false,
};

const KEYMAP = {
  arrowup: 'up', w: 'up',
  arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left',
  arrowright: 'right', d: 'right',
};

export function initInput() {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'enter' && !e.repeat) input.enterPressed = true;
    if ((k === 'p' || k === 'escape') && !e.repeat) input.pausePressed = true;
    if (k === 'c' && !e.repeat) input.cPressed = true;
    const m = KEYMAP[k];
    if (m) input[m] = true;
    if (k.startsWith('arrow') || k === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const m = KEYMAP[e.key.toLowerCase()];
    if (m) input[m] = false;
  });
}
