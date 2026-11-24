/**
 * Credits screen content. Third-party assets must match ASSETS.md (every shipped asset
 * with its attribution); open-source libraries are the runtime dependencies in the build.
 */
export interface CreditSection {
  readonly title: string;
  readonly lines: readonly string[];
}

export const CREDITS: readonly CreditSection[] = [
  { title: 'NULL SIGNAL', lines: ['An original stealth-action game set inside a VR training simulator.'] },
  {
    title: 'Open-source software',
    lines: ['three.js (MIT License)', 'miniplex (MIT License)', 'Zod (MIT License)'],
  },
  { title: 'Third-party assets', lines: ['None in this build. Level art is generated procedurally.'] },
];
