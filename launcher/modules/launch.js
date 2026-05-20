function getEBD(id) { return document.getElementById(id); }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
    
    window.flakeAPI.onLog((data) => {
        let cleanData = data.toString();
        
        // Check if the incoming stream chunk contains the Log4j XML block structure
        if (cleanData.includes('<log4j:Message>')) {
            // Regex to extract the message inside <![CDATA[ ... ]]>
            const msgMatch = cleanData.match(/<log4j:Message><!\[CDATA\[(.*?)\]\]><\/log4j:Message>/s);
            
            if (msgMatch && msgMatch[1]) {
                // Try to extract the logger name and severity level to keep a clean format
                const logger = cleanData.match(/logger="(.*?)"/)?.[1] || "Log";
                const level = cleanData.match(/level="(.*?)"/)?.[1] || "INFO";
                
                // Format it nicely like a traditional terminal line (and add a newline)
                cleanData = `[${level}] [${logger}]: ${msgMatch[1]}\n`;
            }
        }
        
        // Append the cleaned line (or the normal line if it wasn't XML)
        consoleLogs.textContent += cleanData;
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