function getEBD(id) { return document.getElementById(id); }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function init() {
    const launchBtn = getEBD('game-launch');
    const logsButton = getEBD('game-logs');
    
    if (!launchBtn || !logsButton) {
        console.error("FlakeClient Module Error: DOM elements could not be found.");
        return;
    }

    logsButton.addEventListener('click', window.flakeAPI.openLogs);
    
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
        launchBtn.disabled = false;
    });
    
    window.flakeAPI.onError((errMessage) => {
        launchBtn.disabled = false;
    });

    let isOffline = await !window.flakeAPI.checkAuthServers();
    
    // --- Interaction Hook ---
    launchBtn.addEventListener('click', async () => {
        launchBtn.disabled = true;
        
        await wait(200);
        console.log(await window.flakeAPI.checkAuthServers());
        
        // Securely pass values through the IPC bridge layer
        const response = await window.flakeAPI.triggerLaunch({
            version: '1.8.9',
            isOffline: isOffline
        });
    });
}