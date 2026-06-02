import { loadCSS, unloadCSS } from './file_loader.js';
import * as tabs from './tabs.js';
import * as dashboard from './dashboard.js';

const getEBD = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let initialized = false;
let profiles_stylesheet;

const dashboardBtn = getEBD('profiles_dashboard_button');

export async function init() {
    if (initialized) return;
    console.log('Loading stylsheet');
    profiles_stylesheet = loadCSS('sheets/profiles.css');

    dashboardBtn.addEventListener('click', () => {tabs.goto('dashboard')});

    initialized = true;
}