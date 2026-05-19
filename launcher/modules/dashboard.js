import { loadCSS, unloadCSS } from './file_loader.js';
import { visualSettings } from './settings.js';
import * as tabs from './tabs.js';
import * as launch from './launch.js';

function getEBD(id) {return document.getElementById(id)};
function wait(ms) {return new Promise((resolve) => {setTimeout(resolve, ms)})}

const dashboard = getEBD('dashboard');
let dashboard_stylesheet;

export function init() {
    dashboard_stylesheet = loadCSS('sheets/dashboard.css');
    launch.init();
    tabs.show('dashboard');
}