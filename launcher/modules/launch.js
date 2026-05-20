function getEBD(id) { return document.getElementById(id); }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export function init() {
    const launchBtn = getEBD('game-launch');
    const statusText = getEBD('game-launch-status');
    const logsButton = getEBD('game-logs');
    
    if (!launchBtn || !statusText || !logsButton) {
        console.error("FlakeClient Module Error: DOM elements could not be found.");
        return;
    }

    logsButton.addEventListener('click', window.flakeAPI.openLogs)
    
    // --- Wire Up IPC Signal Channels ---
    window.flakeAPI.onProgress((percent) => {
        statusText.textContent = `Status: Downloading assets... (${percent}%)`;
    });
    
    window.flakeAPI.getLatestAccount();
    window.flakeAPI.onAccountInfo((data) => {
        if (!data.login) { console.log("Not logged in."); window.flakeAPI.triggerLogin(); return; }
        console.log(`Logged in as: ${data.username}, with UUID: ${data.uuid}`);
        window.flakeAPI.getAccounts();
        window.flakeAPI.onAccountList((data) => {
            if (data.length) {
                console.log(`Logged in Users: ${JSON.stringify(data)}`);
                return;
            }
            window.flakeAPI.triggerLogin();
        });
    });
    
    window.flakeAPI.onClosed((code) => {
        statusText.textContent = code !== 0 
        ? `Status: Game crashed (Exit Code: ${code})` 
        : 'Status: Game closed cleanly.';
        launchBtn.disabled = false;
    });
    
    window.flakeAPI.onError((errMessage) => {
        statusText.textContent = `Status: Launcher Error - ${errMessage}`;
        launchBtn.disabled = false;
    });
    
    // --- Interaction Hook ---
    launchBtn.addEventListener('click', async () => {
        launchBtn.disabled = true;
        statusText.textContent = "Status: Transmitting launch token...";
        
        await wait(200);
        
        const isOffline = getEBD('game-offline').checked;
        
        // Securely pass values through the IPC bridge layer
        const response = await window.flakeAPI.triggerLaunch({
            version: '1.8.9',
            isOffline: isOffline
        });
        
        if (!response.success) {
            statusText.textContent = `Status: Launch Failed - ${response.error}`;
            launchBtn.disabled = false;
        } else {
            statusText.textContent = "Status: Launcher process spawned successfully!";
        }
    });
}