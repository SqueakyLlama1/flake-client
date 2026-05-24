import { loadCSS, unloadCSS } from './file_loader.js';
import { visualSettings } from './settings.js';
import * as tabs from './tabs.js';
import * as launch from './launch.js';

function getEBD(id) {return document.getElementById(id)};
function wait(ms) {return new Promise((resolve) => {setTimeout(resolve, ms)})}

const dashboard = getEBD('dashboard');
let dashboard_stylesheet;

const skinDownloadBtn = getEBD('player_skin_download');
const skinRefreshBtn = getEBD('player_skin_refresh');
const skinResetBtn = getEBD('player_skin_reset');

export async function init() {
    dashboard_stylesheet = loadCSS('sheets/dashboard.css');
    await launch.init();
    skinDownloadBtn.addEventListener('click', downloadSkin);
    skinRefreshBtn.addEventListener('click', refreshSkinPreview);
    skinResetBtn.addEventListener('click', () => {refreshSkinPreview(true)});
    tabs.show('dashboard');
    loadSkinPreview();
}

async function refreshSkinPreview(force) {
    const skinContainer = getEBD('player_skin_container');
    const centerElement = document.createElement('div');
    const loaderElement = document.createElement('div');
    
    loaderElement.classList.add('flake_ui_loader');
    
    centerElement.classList.add('center');
    centerElement.appendChild(loaderElement);
    
    skinContainer.innerHTML = '';
    skinContainer.appendChild(centerElement);
    
    await wait(200);
    loadSkinPreview(force);
}

let playerBaseSkin;

async function loadSkinPreview(force) {
    const skinContainer = getEBD('player_skin_container');
    const centerLayoutElement1 = document.createElement('div');
    const centerLayoutElement2 = document.createElement('div');
    const imageElementContainer = document.createElement('div');
    const nameplateElement = document.createElement('span');
    const imageElement = document.createElement('img');
    const activeAccount = await window.flakeAPI.getActiveAccount();
    
    const playerSkin = await window.flakeAPI.requestSkin(activeAccount.uuid, force);
    imageElement.src = playerSkin.assembled;
    playerBaseSkin = playerSkin.base;
    
    nameplateElement.classList.add('nameplate');
    nameplateElement.textContent = activeAccount.username;
    
    centerLayoutElement2.classList.add('horizontal_layout');
    centerLayoutElement2.appendChild(imageElement);
    
    imageElementContainer.classList.add('player_plate');
    imageElementContainer.appendChild(nameplateElement);
    imageElementContainer.appendChild(centerLayoutElement2);
    
    centerLayoutElement1.classList.add('horizontal_center');
    centerLayoutElement1.appendChild(imageElementContainer);
    
    skinContainer.innerHTML = '';
    skinContainer.appendChild(centerLayoutElement1);
}

async function downloadSkin() {
    const activeAccount = await window.flakeAPI.getActiveAccount();
    const parts = playerBaseSkin.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const rawBase64 = parts[1];
    
    const decodedData = window.atob(rawBase64);
    
    const uInt8Array = new Uint8Array(decodedData.length);
    for (let i = 0; i < decodedData.length; ++i) {
        uInt8Array[i] = decodedData.charCodeAt(i);
    }
    
    const blob = new Blob([uInt8Array], { type: contentType });
    
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${activeAccount.username}-skin`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(blobUrl);
}

window.flakeAPI.getLatestAccount();
window.flakeAPI.onAccountInfo((data) => {
    if (!data.login) { console.log("Not logged in."); window.flakeAPI.triggerLogin(); return; }
    console.log(`Logged in as: ${data.username}, with UUID: ${data.uuid}`);
    window.flakeAPI.getAccounts();
    window.flakeAPI.onAccountList((data) => {
        if (data.length) {
            console.log(`Authenticated Players: ${JSON.stringify(data)}`);
            refreshSkinPreview();
            return;
        }
        window.flakeAPI.triggerLogin();
    });
});