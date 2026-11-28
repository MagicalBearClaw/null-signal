import { raycast } from '../grid/raycast';
import { Block } from '../grid/tiles';
import { PLAYER } from '../player/tuning';
import type { System } from '../sim';

/**
 * Knock on a wall (DESIGN.md §7): pressing the context action while facing a wall within
 * reach makes a `knock` noise that draws nearby guards over to investigate. Not while
 * crawling. Once wall-press lands, knocking will also require pressing against the wall.
 */
export const knockSystem: System = {
  name: 'knock',
  update({ world, grid, input, events }, dt) {
    for (const p of world.with('player', 'transform', 'collider').without('dead')) {
      p.knockCooldown = Math.max(0, (p.knockCooldown ?? 0) - dt);
      if (!grid || p.knockCooldown > 0 || !input.pressed.has('action') || p.stance === 'crawl') continue;
      const { x, z, yaw } = p.transform;
      const dir = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const reach = Math.max(p.collider.halfWidth, p.collider.halfDepth) + PLAYER.knock.reach;
      const hit = raycast(grid, { x, z }, dir, reach, Block.Stand);
      if (!hit || grid.tileAt(hit.tileX, hit.tileZ) !== 'wall') continue;
      p.knockCooldown = PLAYER.knock.cooldown;
      const id = world.id(p);
      events.emit({
        type: 'noise',
        kind: 'knock',
        at: { x: hit.point.x, z: hit.point.z },
        radius: PLAYER.knock.radius,
        ...(id === undefined ? {} : { source: id }),
      });
    }
  },
};
