// Entrypoint

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const { Launch, Microsoft } = require('minecraft-java-core');

let mainWindow;
let logWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 500,
        minHeight: 575,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'favicon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    
    // Handle initial auto-login trigger once frontend is ready
    mainWindow.webContents.on('did-finish-load', async () => {
        const latestUUID = getLatestAccount();
        if (latestUUID === "none") {
            // No saved account. Tell frontend to show an optional login prompt or fallback
            mainWindow.webContents.send('prompt-initial-login');
        } else {
            // Send existing profile info immediately
            sendAccountInfo();
        }
    });
}

app.on('window-all-closed', () => { app.quit(); });
app.whenReady().then(createWindow);


// Directory & File Management Helpers

function getGamePath() {
    return os.platform() === 'win32' 
    ? path.join(process.env.APPDATA, '.flakeclient') 
    : path.join(os.homedir(), '.flakeclient');
}

function getAccountsPath() {
    const p = path.join(getGamePath(), "accounts");
    if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
    }
    return p;
}

function setLatestAccount(uuid) {
    const metaPath = path.join(getAccountsPath(), "latest.txt");
    fs.writeFileSync(metaPath, uuid, 'utf8');
}

function getLatestAccount() {
    const metaPath = path.join(getAccountsPath(), "latest.txt");
    if (!fs.existsSync(metaPath)) {
        setLatestAccount("none");
        return "none";
    }
    return fs.readFileSync(metaPath, 'utf8').trim();
}

function getLatestUsername() {
    const latestAccount = getLatestAccount();
    if (latestAccount === "none") return "";
    
    const accountPath = path.join(getAccountsPath(), `${latestAccount}.json`);
    if (fs.existsSync(accountPath)) {
        try {
            const meta = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
            return meta.name || "";
        } catch (e) {
            console.error("Failed to parse account profile JSON:", e);
        }
    }
    return "";
}

// Helper to bundle account status updates
function sendAccountInfo() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const latestUUID = getLatestAccount();
    const isLoggedIn = latestUUID !== "none";
    
    mainWindow.webContents.send('account-info', { 
        login: isLoggedIn, 
        uuid: latestUUID, 
        username: getLatestUsername() 
    });
}

// IPC Communications

// Explicit UI request to fetch current account details
ipcMain.handle('getLatestAccount', async () => {
    sendAccountInfo();
    return { uuid: getLatestAccount(), username: getLatestUsername() };
});

// Switch active account profile seamlessly
ipcMain.handle('switch-account', async (event, uuid) => {
    const accountPath = path.join(getAccountsPath(), `${uuid}.json`);
    if (uuid === "none" || fs.existsSync(accountPath)) {
        setLatestAccount(uuid);
        sendAccountInfo();
        return { success: true };
    }
    return { success: false, error: "Account data file does not exist." };
});

ipcMain.handle('sign-out', async (event, uuid) => {
    try {
        const accountsPath = getAccountsPath();
        
        if (uuid === "all") {
            if (fs.existsSync(accountsPath)) {
                const files = fs.readdirSync(accountsPath);
                for (const file of files) {
                    if (path.extname(file).toLowerCase() === '.json') {
                        fs.unlinkSync(path.join(accountsPath, file));
                    }
                }
            }
            setLatestAccount("none");
            sendAccountInfo();
            return { success: true, message: "All accounts cleared." };
            
        } else {
            const accountPath = path.join(accountsPath, `${uuid}.json`);
            
            if (fs.existsSync(accountPath)) {
                fs.unlinkSync(accountPath);
            } else {
                console.warn(`Sign out target file not found: ${uuid}.json`);
            }
            
            const currentLatest = getLatestAccount();
            if (currentLatest === uuid) {
                const files = fs.readdirSync(accountsPath);
                const remainingAccounts = files.filter(file => path.extname(file).toLowerCase() === '.json');
                
                if (remainingAccounts.length > 0) {
                    const fallbackUuid = path.basename(remainingAccounts[0], '.json');
                    setLatestAccount(fallbackUuid);
                } else {
                    setLatestAccount("none");
                }
                sendAccountInfo();
            }
            
            return { success: true };
        }
        
    } catch (error) {
        console.error(`Failed to execute sign out for target "${uuid}":`, error);
        return { success: false, error: error.message };
    }
});

// Explicit handle to trigger Microsoft Auth on-demand
ipcMain.handle('trigger-login', async () => {
    try {
        const msAuthenticator = new Microsoft();
        const authAccount = await msAuthenticator.getAuth(); // Opens native login flow window
        
        if (authAccount && authAccount.uuid) {
            const fileSaveName = `${authAccount.uuid}.json`;
            fs.writeFileSync(path.join(getAccountsPath(), fileSaveName), JSON.stringify(authAccount, null, 4), 'utf8');
            setLatestAccount(authAccount.uuid);
            sendAccountInfo();
            return { success: true, username: authAccount.name };
        }
        throw new Error("Authentication failed or cancelled by user.");
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('request-account-list', async () => {
    try {
        const accountsPath = path.join(getGamePath(), "accounts");
        
        // Ensure the directory exists so it doesn't throw an immediate error
        if (!fs.existsSync(accountsPath)) {
            return [];
        }
        
        const files = fs.readdirSync(accountsPath);
        const accountList = [];
        
        for (const file of files) {
            // Filter: Only process files ending with '.json' (ignores latest.txt, folders, etc.)
            if (path.extname(file).toLowerCase() === '.json') {
                const uuid = path.basename(file, '.json'); // Drops the '.json' extension to extract UUID
                const filePath = path.join(accountsPath, file);
                
                try {
                    const fileData = fs.readFileSync(filePath, 'utf8');
                    const profile = JSON.parse(fileData);
                    
                    // Grab the username property safely (default to 'Unknown' if corrupted or missing)
                    const username = profile.name || "Unknown";
                    
                    accountList.push({
                        username: username,
                        uuid: uuid
                    });
                } catch (jsonError) {
                    console.error(`Skipping invalid or corrupted account file: ${file}`, jsonError);
                    // Skip individual unparseable files seamlessly without crashing the whole process
                }
            }
        }
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('account-list', accountList);
        }
        
        return accountList;
        
    } catch (error) {
        console.error("Failed to retrieve account list:", error);
        return [];
    }
});

ipcMain.handle('open-logs', async (event) => {
    logWindow = new BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'favicon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    
    logWindow.loadFile(path.join(__dirname, 'log.html'));
    
    logWindow.on('closed', () => {
        logWindow = null;
    });
    
    logWindow.webContents.on('did-finish-load', () => {
        logWindow.webContents.send('launcher-log', 'Log window initialized and listening...');
    });
});

// Launch Strategy
ipcMain.handle('launch-game', async (event, { version, isOffline }) => {
    try {
        const launcher = new Launch();
        const gamePath = getGamePath();
        const accountsPath = getAccountsPath();
        let UUID = getLatestAccount();
        
        // 1. Progress / Logging Events
        launcher.on('progress', (progress, size) => {
            const percent = ((progress / size) * 100).toFixed(2);
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-progress', percent);
        });
        launcher.on('patch', (patch) => {
            if (!logWindow.isDestroyed()) logWindow.webContents.send('launcher-log', patch);
        });
        launcher.on('data', (rawLog) => {
            if (!logWindow.isDestroyed()) logWindow.webContents.send('launcher-log', rawLog);
        });
        launcher.on('close', (code) => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-closed', code);
        });
        launcher.on('error', (err) => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-error', err.message);
        });
        
        let authAccount;
        const msAuthenticator = new Microsoft();
        
        // 2. Authentication Logic
        if (isOffline) {
            let offlineUsername = 'FlakeTester';
            if (UUID !== "none") {
                const accountPath = path.join(accountsPath, `${UUID}.json`);
                if (fs.existsSync(accountPath)) {
                    const savedProfile = JSON.parse(fs.readFileSync(accountPath, 'utf-8'));
                    offlineUsername = savedProfile.name || offlineUsername;
                }
            }
            
            authAccount = {
                name: offlineUsername,
                user_properties: '{}',
                access_token: 'null',
                uuid: '00000000-0000-0000-0000-000000000000', 
                meta: { type: 'mojang', demo: false }
            };
        } else {
            // Online Mode
            if (UUID === "none") {
                // Prompt user to log in if they try to start online with no account
                authAccount = await msAuthenticator.getAuth();
                fs.writeFileSync(path.join(accountsPath, `${authAccount.uuid}.json`), JSON.stringify(authAccount, null, 4), 'utf8');
                setLatestAccount(authAccount.uuid);
                sendAccountInfo();
            } else {
                const accountPath = path.join(accountsPath, `${UUID}.json`);
                if (fs.existsSync(accountPath)) {
                    const savedProfile = JSON.parse(fs.readFileSync(accountPath, 'utf-8'));
                    try {
                        authAccount = await msAuthenticator.refresh(savedProfile);
                        if (authAccount.error) throw new Error("Invalid token payload");
                        fs.writeFileSync(accountPath, JSON.stringify(authAccount, null, 4), 'utf8');
                    } catch {
                        // Refresh token expired; Force interactive re-auth
                        authAccount = await msAuthenticator.getAuth(); 
                        fs.writeFileSync(path.join(accountsPath, `${authAccount.uuid}.json`), JSON.stringify(authAccount, null, 4), 'utf8');
                        setLatestAccount(authAccount.uuid);
                        sendAccountInfo();
                    }
                } else {
                    // Fallback if file was deleted
                    authAccount = await msAuthenticator.getAuth(); 
                    fs.writeFileSync(path.join(accountsPath, `${authAccount.uuid}.json`), JSON.stringify(authAccount, null, 4), 'utf8');
                    setLatestAccount(authAccount.uuid);
                    sendAccountInfo();
                }
            }
        }
        
        // 3. Execution Options
        const launchOptions = {
            path: gamePath,
            version: version,
            authenticator: authAccount,
            intelEnabledMac: true,
            memory: { min: '2G', max: '4G' },
            loader: { enable: true, type: 'forge', build: 'latest' }
        };
        
        launcher.Launch(launchOptions);
        return { success: true };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Skin

ipcMain.handle('request-skin', async (uuid, force) => {
    assembleSkin(uuid, force);
});

export async function assembleSkin(uuid, force) {
    const skin = getSkin(uuid);
    const outputPath = path.join("cache", "skins");
    console.log(`[SKINS, ASSEMBLE] Output Path: ${outputPath}`);
    if (!fs.existsSync(outputPath)) {
        console.log(`[SKINS, ASSEMBLE] Output Path doesn't exist, creating now..`);
        fs.mkdirSync(outputPath, {recursive: true});
        console.log(`[SKINS, ASSEMBLE] Output Path Created.`);
    }
    const file = path.join(outputPath, `${uuid}.png`);
    if (fs.existsSync(file) && !force) {
        console.log(`[SKINS, ASSEMBLE] File already exists in cache... aborting download & assemble.`);
        return file;
    }
    if (force) {
        console.log(`[SKINS, ASSEMBLE] Forcing Re-Draw of skin...`);
    }
    console.log(`[SKINS, ASSEMBLE] Downloading Skin..`);
    const skinImage = await loadImage(skin);
    const canvas = createCanvas(16, 32);
    const ctx = canvas.getContext('2d');
    
    console.log(`[SKINS, ASSEMBLE] Assembling Skin..`);
    
    // --- HEAD ---
    ctx.drawImage(skinImage, 8, 8, 8, 8, 4, 0, 8, 8);         // Base
    ctx.drawImage(skinImage, 40, 8, 8, 8, 4, 0, 8, 8);        // Outer (Hat)
    
    // --- TORSO ---
    ctx.drawImage(skinImage, 20, 20, 8, 12, 4, 8, 8, 12);     // Base
    ctx.drawImage(skinImage, 20, 36, 8, 12, 4, 8, 8, 12);     // Outer (Jacket)
    
    // --- RIGHT ARM ---
    ctx.drawImage(skinImage, 44, 20, 4, 12, 0, 8, 4, 12);     // Base
    ctx.drawImage(skinImage, 44, 36, 4, 12, 0, 8, 4, 12);     // Outer (Sleeve)
    
    // --- LEFT ARM ---
    ctx.drawImage(skinImage, 36, 52, 4, 12, 12, 8, 4, 12);    // Base
    ctx.drawImage(skinImage, 52, 52, 4, 12, 12, 8, 4, 12);    // Outer (Sleeve)
    
    // --- RIGHT LEG ---
    ctx.drawImage(skinImage, 4, 20, 4, 12, 4, 20, 4, 12);     // Base
    ctx.drawImage(skinImage, 4, 36, 4, 12, 4, 20, 4, 12);     // Outer (Pant Leg)
    
    // --- LEFT LEG ---
    ctx.drawImage(skinImage, 20, 52, 4, 12, 8, 20, 4, 12);    // Base
    ctx.drawImage(skinImage, 4, 52, 4, 12, 8, 20, 4, 12);     // Outer (Pant Leg)
    
    const finalCanvas = createCanvas(160, 320);
    const finalCtx = finalCanvas.getContext('2d');
    finalCtx.imageSmoothingEnabled = false;
    console.log(`[SKINS, ASSEMBLE] Creating Final Image`);
    finalCtx.drawImage(canvas, 0, 0, 160, 320);
    
    const buffer = finalCanvas.toBuffer('image/png');
    fs.writeFileSync(file, buffer, {recursive: true});
    console.log(`[SKINS, ASSEMBLE] Skin assembled and cached! File path: ${file}`);
    return file;
}

export async function getSkin(username) {
    try {
        console.log(`[SKINS, GET] Searching for UUID for: ${username}...`);
        const uuidResponse = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        
        if (!uuidResponse.data || !uuidResponse.data.id) {
            throw new Error("[SKINS, GET] User not found.");
        }
        
        const uuid = uuidResponse.data.id;
        const profileResponse = await axios.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
        
        const textureProperty = profileResponse.data.properties.find(prop => prop.name === 'textures');
        
        if (!textureProperty) {
            throw new Error("[SKINS, GET] No textures found for this player.");
        }
        
        const decodedJson = Buffer.from(textureProperty.value, 'base64').toString('utf-8');
        const textureData = JSON.parse(decodedJson);
        const skinUrl = textureData.textures.SKIN.url;
        
        return skinUrl;
    } catch (error) {
        return { error: error.message };
    }
}