import type { System } from '../sim';
import { deriveFacts } from './blackboard';
import type { Action, ActionName, Agent, DecisionLayer, Sensor } from './types';

export interface AiSystemConfig {
  readonly sensors: readonly Sensor[];
  readonly decision: DecisionLayer;
  readonly actions: Readonly<Record<ActionName, Action>>;
}

/**
 * Runs the AI pipeline for every entity with an `ai` component, before movement:
 *
 *   sensors → blackboard (+ derived facts) → decision layer → action tick
 *
 * When the decision changes state (or restarts it), the running action is interrupted
 * and the new one started fresh with empty memory. A finished action is not ticked again;
 * the guard stands still until a transition picks something new.
 */
export function createAiSystem({ sensors, decision, actions }: AiSystemConfig): System {
  const start = (agent: Agent, state: string, ctx: Parameters<System['update']>[0]) => {
    const ai = agent.ai;
    ai.state = state;
    ai.memory = {};
    ai.status = 'running';
    ai.blackboard.facts.actionDone = false;
    actions[decision.actionOf(state)].start(agent, ctx);
  };

  return {
    name: 'ai',
    update(ctx, dt) {
      for (const agent of ctx.world.with('ai', 'transform', 'velocity')) {
        const ai = agent.ai;
        for (const sensor of sensors) sensor.sense(agent, ctx);
        deriveFacts(ai.blackboard, ctx.squad);

        if (ai.state === null) {
          start(agent, decision.initial, ctx);
        } else {
          const next = decision.decide(ai.state, ai.blackboard.facts);
          if (next.state !== ai.state || next.restart) {
            if (ai.status === 'running') actions[decision.actionOf(ai.state)].interrupt(agent, ctx);
            start(agent, next.state, ctx);
          }
        }

        if (ai.status !== 'running') continue;
        ai.status = actions[decision.actionOf(ai.state ?? decision.initial)].tick(agent, ctx, dt);
        ai.blackboard.facts.actionDone = ai.status !== 'running';
        if (ai.status !== 'running') {
          agent.velocity.x = 0;
          agent.velocity.z = 0;
        }
      }
    },
  };
}
