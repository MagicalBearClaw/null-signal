import { describe, expect, it } from 'vitest';
import { BrowserInput } from './browserInput';

/** Minimal stand-ins: Node has EventTarget/Event but no DOM elements or KeyboardEvent. */
class FakeView extends EventTarget {
  getBoundingClientRect() {
    return { left: 100, top: 50, width: 400, height: 200 } as DOMRect;
  }
}
const ev = (type: string, props: Record<string, unknown> = {}) =>
  Object.assign(new Event(type, { cancelable: true }), props);

function setup(pads: (Gamepad | null)[] = []) {
  const keyTarget = new EventTarget();
  const view = new FakeView();
  const input = new BrowserInput({
    keyTarget,
    view: view as unknown as HTMLElement,
    getGamepads: () => pads,
  });
  return { keyTarget, view, input };
}

describe('BrowserInput', () => {
  it('tracks held keys until released', () => {
    const { keyTarget, input } = setup();
    keyTarget.dispatchEvent(ev('keydown', { code: 'KeyW' }));
    expect(input.sample().keys.has('KeyW')).toBe(true);
    expect(input.sample().keys.has('KeyW')).toBe(true);
    keyTarget.dispatchEvent(ev('keyup', { code: 'KeyW' }));
    expect(input.sample().keys.has('KeyW')).toBe(false);
  });

  it('latches a tap that starts and ends between two samples, for exactly one sample', () => {
    const { keyTarget, view, input } = setup();
    keyTarget.dispatchEvent(ev('keydown', { code: 'KeyE' }));
    keyTarget.dispatchEvent(ev('keyup', { code: 'KeyE' }));
    view.dispatchEvent(ev('mousedown', { button: 0 }));
    keyTarget.dispatchEvent(ev('mouseup', { button: 0 }));
    const s = input.sample();
    expect(s.keys.has('KeyE')).toBe(true);
    expect(s.mouseButtons.has(0)).toBe(true);
    const next = input.sample();
    expect(next.keys.has('KeyE')).toBe(false);
    expect(next.mouseButtons.has(0)).toBe(false);
  });

  it('ignores key auto-repeat and prevents browser defaults for game keys', () => {
    const { keyTarget, input } = setup();
    const space = ev('keydown', { code: 'Space' });
    keyTarget.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    keyTarget.dispatchEvent(ev('keyup', { code: 'Space' }));
    input.sample();
    keyTarget.dispatchEvent(ev('keydown', { code: 'Space', repeat: true }));
    expect(input.sample().keys.has('Space')).toBe(false);
  });

  it('releases everything when the window loses focus', () => {
    const { keyTarget, input } = setup();
    keyTarget.dispatchEvent(ev('keydown', { code: 'KeyD' }));
    keyTarget.dispatchEvent(ev('blur'));
    expect(input.sample().keys.size).toBe(0);
  });

  it('reports the pointer relative to the view centre in half-view units', () => {
    const { view, input } = setup();
    expect(input.sample().pointer).toBeNull();
    // centre is (300, 150); half of the shorter side is 100
    view.dispatchEvent(ev('mousemove', { clientX: 400, clientY: 100 }));
    expect(input.sample().pointer).toEqual({ x: 1, y: -0.5 });
  });

  it('suppresses the context menu so right-click can aim', () => {
    const { view } = setup();
    const e = ev('contextmenu');
    view.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('polls connected standard-mapping gamepads only', () => {
    const pad = (mapping: string, connected = true) =>
      ({
        connected,
        mapping,
        buttons: [{ value: 1 }, { value: 0.3 }],
        axes: [0.5, -0.5, 0, 0],
      }) as unknown as Gamepad;
    const { input } = setup([pad('standard'), pad(''), pad('standard', false), null]);
    expect(input.sample().pads).toEqual([{ buttons: [1, 0.3], axes: [0.5, -0.5, 0, 0] }]);
  });

  it('removes its listeners on dispose', () => {
    const { keyTarget, input } = setup();
    input.dispose();
    keyTarget.dispatchEvent(ev('keydown', { code: 'KeyW' }));
    expect(input.sample().keys.size).toBe(0);
  });
});
