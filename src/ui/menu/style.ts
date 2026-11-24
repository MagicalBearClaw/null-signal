/** Menu styling: the Sim Grid look (teal on near-black, monospace, faint grid). */
export const MENU_STYLE = `
.ns-menu {
  position: absolute; inset: 0; display: none; overflow: auto;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; color: #bfeee2;
  background:
    linear-gradient(rgba(29, 233, 182, 0.05) 1px, transparent 1px) 0 0 / 40px 40px,
    linear-gradient(90deg, rgba(29, 233, 182, 0.05) 1px, transparent 1px) 0 0 / 40px 40px,
    radial-gradient(ellipse at 30% 20%, rgba(6, 40, 34, 0.92), rgba(2, 5, 6, 0.97));
  backdrop-filter: blur(3px);
}
.ns-menu.open { display: block; }
.ns-menu section { display: none; box-sizing: border-box; min-height: 100%; padding: clamp(24px, 6vh, 72px) clamp(16px, 8vw, 120px); }
.ns-menu section.active { display: flex; flex-direction: column; gap: 28px; }
.ns-menu h1 {
  margin: 0; font-size: clamp(40px, 9vw, 96px); font-weight: 600; letter-spacing: 0.18em; color: #1de9b6;
  text-shadow: 0 0 14px rgba(29, 233, 182, 0.7), 0 0 40px rgba(29, 233, 182, 0.25);
}
.ns-menu h2 { margin: 0; font-size: 22px; letter-spacing: 0.3em; color: #1de9b6; font-weight: 600; }
.ns-menu h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: 0.25em; color: #6fbfa9; font-weight: 600; }
.ns-menu .tagline { margin: -16px 0 0; letter-spacing: 0.4em; font-size: 13px; color: #6fbfa9; }
.ns-menu .items { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 4vh; }
.ns-menu button {
  font: inherit; color: inherit; background: none; border: 1px solid transparent; cursor: pointer;
  letter-spacing: 0.2em; text-transform: uppercase;
}
.ns-menu .items button { font-size: 20px; padding: 8px 18px 8px 28px; position: relative; }
.ns-menu .items button::before { content: ''; position: absolute; left: 8px; top: 50%; width: 8px; height: 8px; margin-top: -4px; }
.ns-menu .items button:hover, .ns-menu .items button:focus { outline: none; color: #021210; background: #1de9b6; box-shadow: 0 0 16px rgba(29, 233, 182, 0.5); }
.ns-menu .items button:hover::before, .ns-menu .items button:focus::before { background: #021210; }
.ns-menu .back, .ns-menu .action {
  align-self: flex-start; font-size: 14px; padding: 8px 18px; border-color: #1de9b6; color: #1de9b6;
}
.ns-menu .back:hover, .ns-menu .back:focus, .ns-menu .action:hover, .ns-menu .action:focus {
  outline: none; background: #1de9b6; color: #021210;
}
.ns-menu .tiers { display: flex; flex-direction: column; gap: 22px; }
.ns-menu .tier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; max-width: 900px; }
.ns-menu .tile {
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 14px; text-align: left;
  border-color: rgba(29, 233, 182, 0.45); background: rgba(4, 24, 20, 0.7); min-height: 92px;
}
.ns-menu .tile .num { font-size: 26px; color: #1de9b6; }
.ns-menu .tile .name { font-size: 11px; color: #6fbfa9; text-transform: uppercase; }
.ns-menu .tile .rank { margin-top: auto; font-size: 12px; color: #6fbfa9; }
.ns-menu .tile .rank b { font-size: 18px; color: #ffd166; }
.ns-menu .tile.completed { border-color: #1de9b6; }
.ns-menu .tile:hover:not([disabled]), .ns-menu .tile:focus { outline: none; background: rgba(29, 233, 182, 0.18); box-shadow: 0 0 16px rgba(29, 233, 182, 0.4); }
.ns-menu .tile[disabled] { cursor: default; border-style: dashed; border-color: rgba(111, 191, 169, 0.25); background: rgba(2, 8, 8, 0.5); }
.ns-menu .tile[disabled] .num { color: #2d5148; }
.ns-menu .records { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
.ns-menu .record { border: 1px solid rgba(29, 233, 182, 0.35); padding: 14px 18px; background: rgba(4, 24, 20, 0.6); }
.ns-menu .record header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; }
.ns-menu .record header b { font-size: 28px; color: #ffd166; }
.ns-menu table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ns-menu td { padding: 3px 0; color: #9fd8c8; }
.ns-menu td:last-child { text-align: right; }
.ns-menu .muted { color: #6fbfa9; font-size: 14px; letter-spacing: 0.08em; line-height: 1.6; max-width: 640px; }
.ns-menu .panel { border: 1px solid rgba(29, 233, 182, 0.35); padding: 18px; max-width: 640px; display: flex; flex-direction: column; gap: 12px; background: rgba(4, 24, 20, 0.6); }
.ns-menu .row { display: flex; gap: 12px; flex-wrap: wrap; }
.ns-menu .status { min-height: 1.4em; font-size: 13px; color: #ffd166; }
.ns-menu .credits p { margin: 0; color: #9fd8c8; line-height: 1.7; }
.ns-menu .confirm { align-items: flex-start; justify-content: center; }
.ns-menu .warn { color: #ff7a59; }
`;
