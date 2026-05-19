// --- Your Provided Helper Tools ---
function getEBD(id) { 
    return document.getElementById(id); 
}

function wait(ms) { 
    return new Promise(resolve => setTimeout(resolve, ms)); 
}

export function init() {
    const launchBtn = getEBD('game-launch');
    const statusText = getEBD('game-launch-status');
    const consoleLogs = getEBD('game-logs');
    
    if (!launchBtn || !statusText || !consoleLogs) {
        console.error("FlakeClient Module Error: DOM elements could not be found.");
        return;
    }

    // --- Wire Up IPC Signal Channels ---
    window.flakeAPI.onProgress((percent) => {
        statusText.textContent = `Status: Downloading assets... (${percent}%)`;
    });

    window.flakeAPI.onLog((data) => {
        consoleLogs.textContent += data;
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
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

        const isOffline = getEBD('game-cracked').checked;

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