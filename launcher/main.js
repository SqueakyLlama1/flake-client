const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Launch, Microsoft } = require('minecraft-java-core');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 500,
        minHeight: 575,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'favicon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Back to standard .js extension
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.on('window-all-closed', () => { app.quit(); });
app.whenReady().then(createWindow);

// --- Custom Path Helper ---
function getGamePath() {
    return os.platform() === 'win32' 
        ? path.join(process.env.APPDATA, '.flakeclient') 
        : path.join(os.homedir(), '.flakeclient');
}

// --- IPC Handler for Launching ---
ipcMain.handle('launch-game', async (event, { version, isOffline }) => {
    try {
        const launcher = new Launch();
        const gamePath = getGamePath();

        if (!fs.existsSync(gamePath)) {
            fs.mkdirSync(gamePath, { recursive: true });
        }

        // Stream data down to the interface window
        launcher.on('progress', (progress, size) => {
            const percent = ((progress / size) * 100).toFixed(2);
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-progress', percent);
        });

        launcher.on('patch', (patch) => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-log', patch);
        });

        launcher.on('data', (rawLog) => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-log', rawLog);
        });

        launcher.on('close', (code) => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-closed', code);
        });

        launcher.on('error', (err) => {
            if (!mainWindow.isDestroyed()) mainWindow.webContents.send('launcher-error', err.message);
        });

        let authAccount;

        if (isOffline) {
            authAccount = {
                name: 'FlakeTester',
                user_properties: '{}',
                access_token: 'null',
                uuid: '00000000-0000-0000-0000-000000000000', 
                meta: { type: 'mojang', demo: false }
            };
        } else {
            const accountPath = path.join(gamePath, 'account.json');
            const msAuthenticator = new Microsoft();

            if (fs.existsSync(accountPath)) {
                const savedProfile = JSON.parse(fs.readFileSync(accountPath, 'utf-8'));
                try {
                    authAccount = await msAuthenticator.refresh(savedProfile);
                    if (authAccount.error) throw new Error("Invalid token payload");
                    fs.writeFileSync(accountPath, JSON.stringify(authAccount, null, 4));
                } catch {
                    authAccount = await msAuthenticator.getAuth(); 
                    fs.writeFileSync(accountPath, JSON.stringify(authAccount, null, 4));
                }
            } else {
                authAccount = await msAuthenticator.getAuth(); 
                fs.writeFileSync(accountPath, JSON.stringify(authAccount, null, 4));
            }
        }

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