import { createGame } from './game';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');
const game = createGame(root);
void game.start();
