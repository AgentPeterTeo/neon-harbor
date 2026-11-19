// Neon Harbor — keyboard. WASD or arrows to drive, P pauses, Enter confirms.
const MAP = {
  w: 'up', arrowup: 'up',
  s: 'down', arrowdown: 'down',
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
  p: 'pause',
  enter: 'enter',
  ' ': 'action',
};

export function createInput() {
  const held = new Set();
  const edges = [];

  const norm = (k) => MAP[String(k).toLowerCase()] || null;

  window.addEventListener('keydown', (e) => {
    const n = norm(e.key);
    if (n === null) return;
    if (n === 'up' || n === 'down' || n === 'left' || n === 'right' || n === 'action') {
      e.preventDefault();
    }
    if (!e.repeat) edges.push(n);
    held.add(n);
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    const n = norm(e.key);
    if (n !== null) held.delete(n);
  });
  window.addEventListener('blur', () => held.clear());

  return {
    up: () => held.has('up'),
    down: () => held.has('down'),
    left: () => held.has('left'),
    right: () => held.has('right'),
    consumeEdges() {
      return edges.splice(0, edges.length);
    },
  };
}
