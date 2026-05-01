import { loadCSS } from './file-loader.js'

function getEBD(id) {return document.getElementById(id)}

export function init() {
    loadCSS('sheets/load.css');
    const load_menu = getEBD('load_menu');
}