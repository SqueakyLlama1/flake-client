import { loadCSS, unloadCSS } from './file_loader.js';
import { visualSettings } from './settings.js';
import * as tabs from './tabs.js';
import * as launch from './launch.js';
import * as profiles from './profiles.js';

const getEBD = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dashboard = getEBD('dashboard');
const appQuitBtn = getEBD('app_quit_button');
const appReloadBtn = getEBD('app_reload_button');
const appSettingsBtn = getEBD('app_setting_button')
const skinDownloadBtn = getEBD('player_skin_download');
const skinRefreshBtn = getEBD('player_skin_refresh');
const skinResetBtn = getEBD('player_skin_reset');
const accountListAdd = getEBD('account_list_add');
const accountListRefresh = getEBD('account_list_refresh');
const profilesBtn = getEBD('profiles_button');
const logsBtn = getEBD('logs_button');

let dashboard_stylesheet;
let profiles_stylesheet;
let playerBaseSkin;

const LOGOUT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z"/></svg>`;
const SWITCH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="m482-200 114-113-114-113-42 42 43 43q-28 1-54.5-9T381-381q-20-20-30.5-46T340-479q0-17 4.5-34t12.5-33l-44-44q-17 25-25 53t-8 57q0 38 15 75t44 66q29 29 65 43.5t74 15.5l-38 38 42 42Zm165-170q17-25 25-53t8-57q0-38-14.5-75.5T622-622q-29-29-65.5-43T482-679l38-39-42-42-114 113 114 113 42-42-44-44q27 0 55 10.5t48 30.5q20 20 30.5 46t10.5 52q0 17-4.5 34T603-414l44 44ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>`;

const handleSkinReset = () => loadSkinPreview(true, true);
const handleSkinRefresh = () => loadSkinPreview(false, true);
const handleProfilesRedirect = () => { tabs.goto('profiles'); profiles.init(); };
const handleAccountLogin = () => window.flakeAPI.triggerLogin();

export async function init() {
    dashboard_stylesheet = loadCSS('sheets/dashboard.css');
    await launch.init();
    
    appQuitBtn.addEventListener('click', () => {window.close()});
    appReloadBtn.addEventListener('click', () => {window.location.reload()});
    skinDownloadBtn.addEventListener('click', downloadSkin);
    skinRefreshBtn.addEventListener('click', handleSkinRefresh);
    skinResetBtn.addEventListener('click', handleSkinReset);
    profilesBtn.addEventListener('click', handleProfilesRedirect);
    accountListAdd.addEventListener('click', handleAccountLogin);
    accountListRefresh.addEventListener('click', populateAccountList);
    logsBtn.addEventListener('click', window.flakeAPI.openLogs);
    
    tabs.show('dashboard');
    loadSkinPreview();
    populateAccountList();
}

async function loadSkinPreview(force, addDelay = false) {
    const skinContainer = getEBD('player_skin_container');
    
    skinContainer.innerHTML = `
        <div class="center">
            <div class="flake_ui_loader"></div>
        </div>
    `;
    
    if (addDelay) await wait(50);
    
    try {
        const [activeAccount] = await Promise.all([
            window.flakeAPI.getActiveAccount()
        ]);
        
        if (!activeAccount || activeAccount.uuid === 'none') {
            skinContainer.innerHTML = `
                <div class="center">
                    <span>No accounts currently logged in.</span>
                </div>
            `;
            return;
        }
        
        const playerSkin = await window.flakeAPI.requestSkin(activeAccount.uuid, force);
        playerBaseSkin = playerSkin.base;
        
        const assembledSkinPreview = `
            <div class="preview_container">
                <div class="center">
                    <span class="nameplate">${activeAccount.username}</span>
                    <img src="${playerSkin.assembled}"></img>
                </div>
            </div>
        `;
        
        skinContainer.innerHTML = assembledSkinPreview;
    } catch (error) {
        console.error("Failed to load skin preview:", error);
        skinContainer.innerHTML = '<div class="error">Failed to load skin preview.</div>';
    }
}

async function downloadSkin() {
    const activeAccount = await window.flakeAPI.getActiveAccount();
    const [header, rawBase64] = playerBaseSkin.split(';base64,');
    const contentType = header.split(':')[1];
    
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

async function populateAccountList() {
    const playerListContainer = getEBD('player_list_container');
    const accounts = await window.flakeAPI.getAccounts();
    
    playerListContainer.innerHTML = `
        <div class="center">
            <div class="flake_ui_loader"></div>
        </div>
    `;
    
    if (!accounts || accounts.length === 0) {
        await wait(50);
        playerListContainer.innerHTML = `
            <div class="center">
                <span>No accounts currently logged in.</span>
            </div>
        `;
        return;
    }
    
    try {
        const [activeAccount] = await Promise.all([
            window.flakeAPI.getActiveAccount(),
            wait(50)
        ]);
        
        const sortedAccounts = [...accounts].sort((a, b) => {
            if (a.uuid === activeAccount?.uuid) return -1;
            if (b.uuid === activeAccount?.uuid) return 1;
            return 0;
        });
        
        const fragment = document.createDocumentFragment();
        
        const nameplates = await Promise.all(
            sortedAccounts.map(account => {
                const isActive = account.uuid === activeAccount?.uuid;
                return createAccountNameplate(account, isActive);
            })
        );
        
        nameplates.forEach(nameplate => fragment.appendChild(nameplate));
        
        const logoutAllBtn = document.createElement('button');
        logoutAllBtn.className = 'logout_all_btn'; 
        logoutAllBtn.textContent = 'Logout All Accounts'; 
        logoutAllBtn.addEventListener('click', async () => {
            await window.flakeAPI.signOut('all');
            populateAccountList();
            loadSkinPreview();
        });
        fragment.appendChild(logoutAllBtn);
        
        playerListContainer.replaceChildren(fragment);
    } catch (error) {
        console.error("Failed to populate account list:", error);
        playerListContainer.innerHTML = '<div class="error">Failed to load accounts.</div>';
    }
}

async function createAccountNameplate(account, isActive) {
    const nameplate = document.createElement('div');
    nameplate.className = isActive ? 'nameplate selected' : 'nameplate';
    
    const nameplateContent = document.createElement('div');
    nameplateContent.className = 'nameplate_content';
    
    const nameplateControls = document.createElement('div');
    nameplateControls.className = 'nameplate_controls';
    
    const playerHead = await window.flakeAPI.requestSkin(account.uuid, undefined, 'head');
    const nameplateIcon = document.createElement('img');
    nameplateIcon.src = playerHead.assembled;
    
    const nameplateLabel = document.createElement('span');
    nameplateLabel.textContent = account.username;
    
    nameplateContent.appendChild(nameplateIcon);
    nameplateControls.appendChild(nameplateLabel);
    
    if (!isActive) {
        const nameplateSwitchBtn = document.createElement('button');
        nameplateSwitchBtn.innerHTML = `${SWITCH_ICON} Switch To`;
        nameplateSwitchBtn.addEventListener('click', async () => {
            await window.flakeAPI.switchAccount(account.uuid);
        });
        nameplateControls.appendChild(nameplateSwitchBtn);
    }
    
    const nameplateLogoutBtn = document.createElement('button');
    nameplateLogoutBtn.innerHTML = `${LOGOUT_ICON} Logout`;
    nameplateLogoutBtn.addEventListener('click', async () => {
        await window.flakeAPI.signOut(account.uuid);
    });
    nameplateControls.appendChild(nameplateLogoutBtn);
    
    nameplate.appendChild(nameplateContent);
    nameplate.appendChild(nameplateControls);
    
    return nameplate;
}

window.flakeAPI.getLatestAccount();
window.flakeAPI.onAccountInfo((data) => {
    if (!data.login) { 
        window.flakeAPI.triggerLogin(); 
        return; 
    }
    console.log(`Logged in as: ${data.username}, with UUID: ${data.uuid}`);
    loadSkinPreview();
    populateAccountList(data);
});