function getEBD(id) { return document.getElementById(id); }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function init() {
    const playBtn = getEBD('play_button');
    const launcherProgress = getEBD('launcher_progress');

    if (!playBtn || !launcherProgress) {
        console.error("FlakeClient Module Error: DOM elements could not be found.");
        return;
    }
    
    window.flakeAPI.onClosed((code) => {
        playBtn.textContent = "PLAY";
        playBtn.disabled = false;
    });
    
    window.flakeAPI.onError((errMessage) => {
        playBtn.textContent = "PLAY";
        playBtn.disabled = false;
        console.error(errMessage);
    });
    
    window.flakeAPI.onProgress((percentage) => {
        if (percentage >= 100) {
            launcherProgress.classList.add('hidden');
            playBtn.textContent = "LAUNCHED";
            percentage = 0;
            return;
        };
        launcherProgress.classList.remove('hidden');
        playBtn.textContent = "INSTALLING";
        launcherProgress.textContent = `${percentage}%`;
        launcherProgress.style.width = `${percentage}%`;
    });
    
    // --- Interaction Hook ---
    playBtn.addEventListener('click', async () => {
        playBtn.disabled = true;
        playBtn.textContent = "LAUNCHED";
        
        const response = await window.flakeAPI.triggerLaunch({
            version: '1.8.9'
        });
    });
}