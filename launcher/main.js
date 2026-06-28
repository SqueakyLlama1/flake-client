const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs').promises; // Fully utilized throughout the script
const axios = require('axios');
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

// --- Helper Utilities ---

function getGamePath() {
    try {
        const home = os.homedir() || '';
        return os.platform() === 'win32' 
            ? path.join(process.env.APPDATA || '', '.flakeclient') 
            : path.join(home, '.flakeclient');
    } catch (err) {
        console.error("Failed to evaluate platform specific game paths:", err);
        return path.join('.', '.flakeclient');
    }
}

function getAccountsPath() {
    return path.join(getGamePath(), "accounts");
}

function getAccountFilePath(uuid) {
    return path.join(getAccountsPath(), `${uuid}.json`);
}

/**
 * Ensures a directory path exists using non-blocking promises.
 */
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}

/**
 * Checks if a file exists asynchronously without relying on the deprecated fs.exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// --- State Management Logic ---

async function setLatestAccount(uuid) {
    try {
        const accountsPath = getAccountsPath();
        await ensureDir(accountsPath);
        
        const targetUUID = uuid || "none";
        await fs.writeFile(path.join(accountsPath, "latest.txt"), targetUUID, 'utf8');
        
        activeAccount.uuid = targetUUID;
        activeAccount.username = await getLatestUsername();
    } catch (err) {
        console.error("Failed writing changes to latest.txt configuration payload:", err);
    }
}

async function getLatestAccount() {
    const metaPath = path.join(getAccountsPath(), "latest.txt");
    try {
        if (!(await fileExists(metaPath))) {
            await setLatestAccount("none");
            return "none";
        }
        const data = await fs.readFile(metaPath, 'utf8');
        return data.trim() || "none";
    } catch (err) {
        console.error("Error encountered reading latest.txt, defaulting to 'none':", err);
        return "none";
    }
}

async function getLatestUsername() {
    try {
        const latestAccount = await getLatestAccount();
        if (latestAccount === "none") return "";
        
        const accountPath = getAccountFilePath(latestAccount);
        if (await fileExists(accountPath)) {
            try {
                const data = await fs.readFile(accountPath, 'utf8');
                const meta = JSON.parse(data);
                return meta.name ?? meta.username ?? "";
            } catch (e) {
                console.error("Failed to parse account profile JSON:", e);
            }
        }
    } catch (err) {
        console.error("Failed to extract target reference inside getLatestUsername:", err);
    }
    return "";
}

async function saveAccountFile(account) {
    if (!account || !account.uuid) {
        console.error("Aborting saveAccountFile: Received missing or invalid account layout.");
        return;
    }
    try {
        await ensureDir(getAccountsPath());
        await fs.writeFile(
            getAccountFilePath(account.uuid), 
            JSON.stringify(account, null, 4), 
            'utf8'
        );
    } catch (err) {
        console.error(`Failed writing localized user data structure for UUID ${account.uuid}:`, err);
    }
}

async function sendAccountInfo() {
    try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const latestUUID = await getLatestAccount();
        const username = await getLatestUsername();
        
        mainWindow.webContents.send('account-info', { 
            login: latestUUID !== "none", 
            uuid: latestUUID, 
            username 
        });
    } catch (err) {
        console.error("Failed emitting cross-process channel action 'account-info':", err);
    }
}

// --- Application Windows ---

function createWindow() {
    try {
        mainWindow = new BrowserWindow({
            ...windowConfig,
            minWidth: 800,
            minHeight: 600
        });
        
        mainWindow.loadFile(path.join(__dirname, 'index.html')).catch(err => {
            console.error("Critical: Failed to load index.html:", err);
        });
        
        mainWindow.webContents.on('did-finish-load', async () => {
            try {
                const latestUUID = await getLatestAccount();
                if (latestUUID === "none" && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('prompt-initial-login');
                }
                activeAccount.uuid = latestUUID;
                activeAccount.username = await getLatestUsername();
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

// --- IPC Interface Handlers ---

ipcMain.handle('get-latest-account', async () => {
    try {
        await sendAccountInfo();
        return { uuid: await getLatestAccount(), username: await getLatestUsername() };
    } catch (err) {
        console.error("IPC Handler error within 'get-latest-account':", err);
        return { uuid: "none", username: "" };
    }
});

ipcMain.handle('switch-account', async (event, uuid) => {
    try {
        if (uuid === "none" || (await fileExists(getAccountFilePath(uuid)))) {
            await setLatestAccount(uuid);
            await sendAccountInfo();
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
            if (await fileExists(accountsPath)) {
                const files = await fs.readdir(accountsPath);
                const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
                
                await Promise.all(jsonFiles.map(async (file) => {
                    try {
                        await fs.unlink(path.join(accountsPath, file));
                    } catch (ex) {
                        console.error(`Failed unlinking individual data structure ${file}:`, ex);
                    }
                }));
            }
            await setLatestAccount("none");
            await sendAccountInfo();
            return { success: true, message: "All accounts cleared." };
        } 
        
        const accountPath = getAccountFilePath(uuid);
        if (await fileExists(accountPath)) {
            await fs.unlink(accountPath);
        } else {
            console.warn(`Sign out target file not found: ${uuid}.json`);
        }
        
        if ((await getLatestAccount()) === uuid) {
            let remainingAccounts = [];
            if (await fileExists(accountsPath)) {
                const files = await fs.readdir(accountsPath);
                remainingAccounts = files.filter(file => path.extname(file).toLowerCase() === '.json');
            }
            
            if (remainingAccounts.length > 0) {
                await setLatestAccount(path.basename(remainingAccounts[0], '.json'));
            } else {
                await setLatestAccount("none");
            }
            await sendAccountInfo();
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
            await saveAccountFile(authAccount);
            await setLatestAccount(authAccount.uuid);
            await sendAccountInfo();
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
        if (!(await fileExists(accountsPath))) return [];
        
        const files = await fs.readdir(accountsPath);
        const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
        
        const accountList = [];
        for (const file of jsonFiles) {
            try {
                const data = await fs.readFile(path.join(accountsPath, file), 'utf8');
                const profile = JSON.parse(data);
                accountList.push({
                    username: profile.name ?? profile.username ?? "Unknown",
                    uuid: path.basename(file, '.json')
                });
            } catch (jsonError) {
                console.error(`Skipping invalid or corrupted account file: ${file}`, jsonError);
            }
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
                if (logWindow && !logWindow.isDestroyed() && logWindow.webContents) {
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

ipcMain.handle('launch-game', async (event, { version }) => {
    try {
        const isOffline = !await checkAuthServer();
        const launcher = new Launch();
        const gamePath = getGamePath();
        const UUID = await getLatestAccount();
        
        launcher.on('progress', (progress, size) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('launcher-progress', ((progress / size) * 100).toFixed(2));
            }
        });
        launcher.on('patch', (patch) => {
            if (logWindow && !logWindow.isDestroyed() && logWindow.webContents) logWindow.webContents.send('launcher-log', patch);
        });
        launcher.on('data', (rawLog) => {
            if (logWindow && !logWindow.isDestroyed() && logWindow.webContents) logWindow.webContents.send('launcher-log', rawLog);
        });
        launcher.on('close', (code) => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-closed', code);
        });
        launcher.on('error', (err) => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-error', err ? err.message : "Unknown context error");
        });
        
        if (UUID === "none") {
            if (isOffline) {
                throw new Error("No cached account found. You must log in online at least once before playing offline.");
            }
            const msAuthenticator = new Microsoft();
            const authAccount = await msAuthenticator.getAuth();
            await saveAccountFile(authAccount);
            await setLatestAccount(authAccount.uuid);
            await sendAccountInfo();
            
            return launchWithProfile(launcher, gamePath, version, authAccount);
        }
        
        const accountPath = getAccountFilePath(UUID);
        if (!(await fileExists(accountPath))) {
            throw new Error("Account profile data missing. Please log in again.");
        }
        
        let savedProfile;
        try {
            const data = await fs.readFile(accountPath, 'utf-8');
            savedProfile = JSON.parse(data);
        } catch (err) {
            if (isOffline) throw new Error("Cached account file is corrupted. Cannot launch offline.");
            console.error("Corrupted authentication profile, forcing re-auth:", err);
        }
        
        let authAccount;
        if (isOffline) {
            authAccount = {
                name: savedProfile?.name || savedProfile?.username || "Player",
                user_properties: savedProfile?.user_properties || '{}',
                access_token: '',
                uuid: UUID,
                meta: savedProfile?.meta || { type: 'mojang', demo: false }
            };
        } else {
            const msAuthenticator = new Microsoft();
            if (savedProfile) {
                try {
                    authAccount = await msAuthenticator.refresh(savedProfile);
                    if (authAccount.error) throw new Error("Invalid token payload");
                    await saveAccountFile(authAccount);
                } catch {
                    authAccount = await msAuthenticator.getAuth(); 
                    await saveAccountFile(authAccount);
                    await setLatestAccount(authAccount.uuid);
                    await sendAccountInfo();
                }
            } else {
                authAccount = await msAuthenticator.getAuth(); 
                await saveAccountFile(authAccount);
                await setLatestAccount(authAccount.uuid);
                await sendAccountInfo();
            }
        }
        
        return launchWithProfile(launcher, gamePath, version, authAccount);
        
    } catch (error) {
        console.error("Launch handler initialization failure:", error);
        return { success: false, error: error.message };
    }
});

function launchWithProfile(launcher, gamePath, version, authAccount) {
    launcher.Launch({
        path: gamePath,
        version,
        authenticator: authAccount,
        intelEnabledMac: true,
        memory: { min: '2G', max: '4G' },
        loader: { enable: true, type: 'forge', build: 'latest' }
    });
    return { success: true };
}

ipcMain.handle('request-skin', async (_event, uuid, force) => {
    try {
        return await getSkin(uuid, force);
    } catch (err) {
        console.error(`IPC Handler error processing request-skin for target ${uuid}:`, err);
        return { error: err.message };
    }
});

async function getSkin(uuid, force) {
    try {
        const outputPath = path.join(getGamePath(), "cache", "skins");
        const rawCacheFile = path.join(outputPath, `${uuid}_raw.png`);

        await ensureDir(outputPath);
        
        let isCached = false;
        if (!force) {
            isCached = await fileExists(rawCacheFile);
        }

        const profileResponse = await axios.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
        const textureProperty = profileResponse.data?.properties?.find(prop => prop.name === 'textures');
        
        if (!textureProperty) {
            throw new Error("[SKINS, GET] No textures found for this player.");
        }
        
        const decodedJson = Buffer.from(textureProperty.value, 'base64').toString('utf-8');
        const skinUrl = JSON.parse(decodedJson).textures?.SKIN?.url;

        if (!skinUrl) {
            throw new Error("[SKINS, GET] Player has no skin URL.");
        }

        if (force || !isCached) {
            const response = await axios.get(skinUrl, { responseType: 'arraybuffer' });
            const rawSkinBuffer = Buffer.from(response.data);
            
            await ensureDir(outputPath);
            await fs.writeFile(rawCacheFile, rawSkinBuffer);
        }

        return skinUrl;
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