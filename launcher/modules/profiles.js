import { loadCSS, unloadCSS } from './file_loader.js';
import * as tabs from './tabs.js';
import * as dashboard from './dashboard.js';

const getEBD = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let profiles_stylesheet;

export async function init() {
    await wait(5000);
    console.log('Loading stylsheet');
    profiles_stylesheet = loadCSS('sheets/profiles.css');
}