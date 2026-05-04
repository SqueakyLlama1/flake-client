import { loadCSS, unloadCSS } from './file-loader.js';
import { startSnowEmitter } from './particles.js';

function getEBD(id) {return document.getElementById(id)}

export function init() {
    const load_stylesheet = loadCSS('sheets/load.css');
    background_effect();
}

function background_effect() {
    startSnowEmitter(300, 1);
}