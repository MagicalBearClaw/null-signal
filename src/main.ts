import { createBootScene } from './render/bootScene';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing from index.html');

createBootScene(root);
