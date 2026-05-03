import { loadCSS, unloadCSS } from './file-loader.js'

function getEBD(id) {return document.getElementById(id)}

export function init() {
    const load_stylesheet = loadCSS('sheets/load.css');
    const load_menu = getEBD('load_menu');
    setTimeout(() => {unloadCSS(load_stylesheet)}, 5000);
}