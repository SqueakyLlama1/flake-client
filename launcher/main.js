const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const { Launch, Microsoft } = require('minecraft-java-core');

let mainWindow;
let logWindow;
const activeAccount = {
    uuid: '',
    username: ''
};

const windowConfig = {
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'favicon.ico'),
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
    }
};

function createWindow() {
    try {
        mainWindow = new BrowserWindow({
            ...windowConfig,
            minWidth: 500,
            minHeight: 575
        });
        
        mainWindow.loadFile(path.join(__dirname, 'index.html')).catch(err => {
            console.error("Critical: Failed to load index.html:", err);
        });
        
        mainWindow.webContents.on('did-finish-load', async () => {
            try {
                const latestUUID = getLatestAccount();
                if (latestUUID === "none") {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('prompt-initial-login');
                    }
                }
                activeAccount.uuid = latestUUID;
                activeAccount.username = getLatestUsername();
            } catch (err) {
                console.error("Error during main window did-finish-load cycle:", err);
            }
        });
    } catch (err) {
        console.error("Critical: Failed to initialize main application window:", err);
    }
}

app.on('window-all-closed', () => {
    try {
        app.quit();
    } catch (err) {
        console.error("Failed to cleanly exit application:", err);
    }
});

app.whenReady().then(createWindow).catch(err => {
    console.error("Critical: Electron app failed ready initialization stage:", err);
});

function getGamePath() {
    try {
        return os.platform() === 'win32' 
        ? path.join(process.env.APPDATA || '', '.flakeclient') 
        : path.join(os.homedir() || '', '.flakeclient');
    } catch (err) {
        console.error("Failed to evaluate platform specific game paths:", err);
        return path.join('.', '.flakeclient');
    }
}

function getAccountsPath() {
    const p = path.join(getGamePath(), "accounts");
    try {
        fs.mkdirSync(p, { recursive: true });
    } catch (err) {
        console.error(`Failed to verify or create directory chain at ${p}:`, err);
    }
    return p;
}

function setLatestAccount(uuid) {
    try {
        fs.writeFileSync(path.join(getAccountsPath(), "latest.txt"), uuid || "none", 'utf8');
        activeAccount.uuid = uuid;
        activeAccount.username = getLatestUsername();
    } catch (err) {
        console.error("Failed writing changes to latest.txt configuration payload:", err);
    }
}

function getLatestAccount() {
    const metaPath = path.join(getAccountsPath(), "latest.txt");
    try {
        if (!fs.existsSync(metaPath)) {
            setLatestAccount("none");
            return "none";
        }
        return fs.readFileSync(metaPath, 'utf8').trim() || "none";
    } catch (err) {
        console.error("Error encountered reading latest.txt, defaulting to 'none':", err);
        return "none";
    }
}

function getAccountFilePath(uuid) {
    return path.join(getAccountsPath(), `${uuid}.json`);
}

function saveAccountFile(account) {
    if (!account || !account.uuid) {
        console.error("Aborting saveAccountFile: Received missing or invalid account layout.");
        return;
    }
    try {
        fs.writeFileSync(getAccountFilePath(account.uuid), JSON.stringify(account, null, 4), 'utf8');
    } catch (err) {
        console.error(`Failed writing localized user data structure for UUID ${account.uuid}:`, err);
    }
}

function getLatestUsername() {
    try {
        const latestAccount = getLatestAccount();
        if (latestAccount === "none") return "";
        
        const accountPath = getAccountFilePath(latestAccount);
        if (fs.existsSync(accountPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
                return meta.name ?? "";
            } catch (e) {
                console.error("Failed to parse account profile JSON:", e);
            }
        }
    } catch (err) {
        console.error("Failed to extract target reference inside getLatestUsername:", err);
    }
    return "";
}

function sendAccountInfo() {
    try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const latestUUID = getLatestAccount();
        
        mainWindow.webContents.send('account-info', { 
            login: latestUUID !== "none", 
            uuid: latestUUID, 
            username: getLatestUsername() 
        });
    } catch (err) {
        console.error("Failed emitting cross-process channel action 'account-info':", err);
    }
}

ipcMain.handle('get-latest-account', async () => {
    try {
        sendAccountInfo();
        return { uuid: getLatestAccount(), username: getLatestUsername() };
    } catch (err) {
        console.error("IPC Handler error within 'get-latest-account':", err);
        return { uuid: "none", username: "" };
    }
});

ipcMain.handle('switch-account', async (event, uuid) => {
    try {
        if (uuid === "none" || fs.existsSync(getAccountFilePath(uuid))) {
            setLatestAccount(uuid);
            sendAccountInfo();
            return { success: true };
        }
        return { success: false, error: "Account data file does not exist." };
    } catch (err) {
        console.error(`IPC Handler error within 'switch-account' for target ${uuid}:`, err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('sign-out', async (event, uuid) => {
    try {
        const accountsPath = getAccountsPath();
        
        if (uuid === "all") {
            try {
                if (fs.existsSync(accountsPath)) {
                    fs.readdirSync(accountsPath)
                    .filter(file => path.extname(file).toLowerCase() === '.json')
                    .forEach(file => {
                        try {
                            fs.unlinkSync(path.join(accountsPath, file));
                        } catch (ex) {
                            console.error(`Failed unlinking individual data structure ${file}:`, ex);
                        }
                    });
                }
            } catch (dirErr) {
                console.error("Failed while tracking operations inside directory cleanup:", dirErr);
            }
            setLatestAccount("none");
            sendAccountInfo();
            return { success: true, message: "All accounts cleared." };
        } 
        
        const accountPath = getAccountFilePath(uuid);
        if (fs.existsSync(accountPath)) {
            try {
                fs.unlinkSync(accountPath);
            } catch (unlinkErr) {
                console.error(`Failed attempting file system removal on target file ${uuid}.json:`, unlinkErr);
            }
        } else {
            console.warn(`Sign out target file not found: ${uuid}.json`);
        }
        
        if (getLatestAccount() === uuid) {
            let remainingAccounts = [];
            try {
                remainingAccounts = fs.readdirSync(accountsPath)
                .filter(file => path.extname(file).toLowerCase() === '.json');
            } catch (readErr) {
                console.error("Failed inspecting accounts directory for fallback indexing:", readErr);
            }
            
            if (remainingAccounts.length > 0) {
                setLatestAccount(path.basename(remainingAccounts[0], '.json'));
            } else {
                setLatestAccount("none");
            }
            sendAccountInfo();
        }
        
        return { success: true };
        
    } catch (error) {
        console.error(`Failed to execute sign out for target "${uuid}":`, error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('trigger-login', async () => {
    try {
        const authAccount = await new Microsoft().getAuth();
        
        if (authAccount?.uuid) {
            saveAccountFile(authAccount);
            setLatestAccount(authAccount.uuid);
            sendAccountInfo();
            return { success: true, username: authAccount.name };
        }
        throw new Error("Authentication failed or cancelled by user.");
    } catch (error) {
        console.error("IPC Handler failure inside 'trigger-login' execution flow:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('request-account-list', async () => {
    try {
        const accountsPath = getAccountsPath();
        if (!fs.existsSync(accountsPath)) return [];
        
        const accountList = fs.readdirSync(accountsPath)
        .filter(file => path.extname(file).toLowerCase() === '.json')
        .reduce((list, file) => {
            try {
                const profile = JSON.parse(fs.readFileSync(path.join(accountsPath, file), 'utf8'));
                list.push({
                    username: profile.name ?? "Unknown",
                    uuid: path.basename(file, '.json')
                });
            } catch (jsonError) {
                console.error(`Skipping invalid or corrupted account file: ${file}`, jsonError);
            }
            return list;
        }, []);
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('account-list', accountList);
        }
        
        return accountList;
    } catch (error) {
        console.error("Failed to retrieve account list:", error);
        return [];
    }
});

ipcMain.handle('open-logs', async () => {
    try {
        logWindow = new BrowserWindow(windowConfig);
        logWindow.loadFile(path.join(__dirname, 'log.html')).catch(err => {
            console.error("Failed to load log.html file asset UI frame:", err);
        });
        
        logWindow.on('closed', () => { logWindow = null; });
        logWindow.webContents.on('did-finish-load', () => {
            try {
                if (logWindow && !logWindow.isDestroyed()) {
                    logWindow.webContents.send('launcher-log', 'Log window initialized and listening...');
                }
            } catch (err) {
                console.error("Failed to send initialized event feedback log channel updates:", err);
            }
        });
    } catch (error) {
        console.error("Failing initialization process inside log window creation stream:", error);
    }
});

ipcMain.handle('launch-game', async (event, { version, isOffline }) => {
    try {
        const launcher = new Launch();
        const gamePath = getGamePath();
        const accountsPath = getAccountsPath();
        let UUID = getLatestAccount();
        
        launcher.on('progress', (progress, size) => {
            try {
                if (!mainWindow?.isDestroyed()) {
                    mainWindow.webContents.send('launcher-progress', ((progress / size) * 100).toFixed(2));
                }
            } catch (err) {
                console.error("Error signaling client rendering progress changes downstream:", err);
            }
        });
        launcher.on('patch', (patch) => {
            try {
                if (!logWindow?.isDestroyed()) logWindow.webContents.send('launcher-log', patch);
            } catch (err) {
                console.error("Error tracking runtime logs context on path configurations:", err);
            }
        });
        launcher.on('data', (rawLog) => {
            try {
                if (!logWindow?.isDestroyed()) logWindow.webContents.send('launcher-log', rawLog);
            } catch (err) {
                console.error("Error displaying incoming data pipeline logs:", err);
            }
        });
        launcher.on('close', (code) => {
            try {
                if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('launcher-closed', code);
            } catch (err) {
                console.error("Error monitoring shutdown cycle callbacks:", err);
            }
        });
        launcher.on('error', (err) => {
            try {
                if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('launcher-error', err ? err.message : "Unknown context error");
            } catch (errorContext) {
                console.error("Error handling internal dynamic runner runtime faults:", errorContext);
            }
        });
        
        let authAccount;
        const msAuthenticator = new Microsoft();
        
        if (isOffline) {
            let offlineUsername = 'FlakeTester';
            if (UUID !== "none") {
                const accountPath = getAccountFilePath(UUID);
                try {
                    if (fs.existsSync(accountPath)) {
                        offlineUsername = JSON.parse(fs.readFileSync(accountPath, 'utf-8')).name ?? offlineUsername;
                    }
                } catch (readProfileErr) {
                    console.error("Error mapping fallback offline credentials, continuing with baseline fallback names:", readProfileErr);
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
            if (UUID === "none") {
                authAccount = await msAuthenticator.getAuth();
                saveAccountFile(authAccount);
                setLatestAccount(authAccount.uuid);
                sendAccountInfo();
            } else {
                const accountPath = getAccountFilePath(UUID);
                if (fs.existsSync(accountPath)) {
                    let savedProfile;
                    try {
                        savedProfile = JSON.parse(fs.readFileSync(accountPath, 'utf-8'));
                    } catch (err) {
                        console.error("Corrupted authentication configuration structure detected, forcing full re-auth state:", err);
                    }
                    
                    if (savedProfile) {
                        try {
                            authAccount = await msAuthenticator.refresh(savedProfile);
                            if (authAccount.error) throw new Error("Invalid token payload");
                            saveAccountFile(authAccount);
                        } catch {
                            authAccount = await msAuthenticator.getAuth(); 
                            saveAccountFile(authAccount);
                            setLatestAccount(authAccount.uuid);
                            sendAccountInfo();
                        }
                    } else {
                        authAccount = await msAuthenticator.getAuth(); 
                        saveAccountFile(authAccount);
                        setLatestAccount(authAccount.uuid);
                        sendAccountInfo();
                    }
                } else {
                    authAccount = await msAuthenticator.getAuth(); 
                    saveAccountFile(authAccount);
                    setLatestAccount(authAccount.uuid);
                    sendAccountInfo();
                }
            }
        }
        
        launcher.Launch({
            path: gamePath,
            version,
            authenticator: authAccount,
            intelEnabledMac: true,
            memory: { min: '2G', max: '4G' },
            loader: { enable: true, type: 'forge', build: 'latest' }
        });
        
        return { success: true };
    } catch (error) {
        console.error("IPC Handler engine initialization issue tracking inside 'launch-game' process map:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('request-skin', async (_event, uuid, force) => {
    try {
        return await assembleSkin(uuid, force);
    } catch (err) {
        console.error(`IPC Handler error processing request-skin for target ${uuid}:`, err);
        return { error: err.message };
    }
});

async function assembleSkin(uuid, force) {
    try {
        const outputPath = path.join(getGamePath(), "cache", "skins");
        
        try {
            fs.mkdirSync(outputPath, { recursive: true });
        } catch (dirErr) {
            console.error("Failed creating nested cache folders maps for skins operations:", dirErr);
        }

        const rawCacheFile = path.join(outputPath, `${uuid}_raw.png`);
        let rawSkinBuffer;

        if (fs.existsSync(rawCacheFile) && !force) {
            console.log(`[SKINS] Loading raw skin from offline cache for ${uuid}`);
            rawSkinBuffer = fs.readFileSync(rawCacheFile);
        } else {
            console.log(`[SKINS] Downloading skin from Mojang servers for ${uuid}`);
            const skin = await getSkin(uuid);
            if (skin && skin.error) throw new Error(skin.error);
            
            if (Buffer.isBuffer(skin)) {
                rawSkinBuffer = skin;
            } else if (typeof skin === 'string' && skin.startsWith('data:')) {
                rawSkinBuffer = Buffer.from(skin.split(',')[1], 'base64');
            } else {
                const response = await axios.get(skin, { responseType: 'arraybuffer' });
                rawSkinBuffer = Buffer.from(response.data);
            }

            fs.writeFileSync(rawCacheFile, rawSkinBuffer);
        }

        const baseDataUrl = `data:image/png;base64,${rawSkinBuffer.toString('base64')}`;

        console.log(`[SKINS, ASSEMBLE] Drawing skin asset profile layout context targets...`);
        const skinImage = await loadImage(rawSkinBuffer);
        const canvas = createCanvas(16, 32);
        const ctx = canvas.getContext('2d');
        
        const skinLayers = [
            [8, 8, 8, 8, 4, 0, 8, 8],     
            [40, 8, 8, 8, 4, 0, 8, 8],    
            [20, 20, 8, 12, 4, 8, 8, 12],  
            [20, 36, 8, 12, 4, 8, 8, 12],  
            [44, 20, 4, 12, 0, 8, 4, 12],  
            [44, 36, 4, 12, 0, 8, 4, 12],  
            [36, 52, 4, 12, 12, 8, 4, 12], 
            [52, 52, 4, 12, 12, 8, 4, 12], 
            [4, 20, 4, 12, 4, 20, 4, 12],  
            [4, 36, 4, 12, 4, 20, 4, 12],  
            [20, 52, 4, 12, 8, 20, 4, 12], 
            [4, 52, 4, 12, 8, 20, 4, 12]   
        ];

        skinLayers.forEach(layer => ctx.drawImage(skinImage, ...layer));
        
        const finalCanvas = createCanvas(160, 320);
        const finalCtx = finalCanvas.getContext('2d');
        finalCtx.imageSmoothingEnabled = false;
        finalCtx.drawImage(canvas, 0, 0, 160, 320);
        
        return { 
            assembled: finalCanvas.toDataURL('image/png'), 
            base: baseDataUrl 
        };

    } catch (err) {
        console.error(`Failed complete skin structural aggregation steps for targeting identity ${uuid}:`, err);
        return "";
    }
}

async function getSkin(uuid) {
    try {
        const profileResponse = await axios.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
        const textureProperty = profileResponse.data?.properties?.find(prop => prop.name === 'textures');
        
        if (!textureProperty) throw new Error("[SKINS, GET] No textures found for this player.");
        
        const decodedJson = Buffer.from(textureProperty.value, 'base64').toString('utf-8');
        return JSON.parse(decodedJson).textures.SKIN.url;
    } catch (error) {
        console.error(`Failed to lookup Mojang texture maps profile API endpoint data for context identity ${uuid}:`, error);
        return { error: error.message };
    }
}

async function checkAuthServer() {
    try {
        await axios.get('https://api.minecraftservices.com/publickeys', { timeout: 7000 });
        return true;
    } catch (error) {
        console.log(`Failed to connect to the Mojang authentication servers: ${error}`);
        return false;
    }
}

ipcMain.handle('check-auth-servers', async () => {
    try {
        return await checkAuthServer();
    } catch (err) {
        console.error("IPC exception encountered monitoring check-auth-servers mapping:", err);
        return false;
    }
});

ipcMain.handle('get-active-account', async () => {
    try {
        return activeAccount;
    } catch (err) {
        console.error("IPC exception encountered processing get-active-account tracking information:", err);
        return null;
    }
});