import './ui/styles.css';
import { App } from './app';

const canvas = document.getElementById('gl');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('canvas #gl not found');
}
new App(canvas);
