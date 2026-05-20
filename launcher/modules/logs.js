window.flakeAPI.onLog((data) => {
    let cleanData = data.toString();
    
    if (cleanData.includes('<log4j:Message>')) {
        const msgMatch = cleanData.match(/<log4j:Message><!\[CDATA\[(.*?)\]\]><\/log4j:Message>/s);
        
        if (msgMatch && msgMatch[1]) {
            const logger = cleanData.match(/logger="(.*?)"/)?.[1] || "Log";
            const level = cleanData.match(/level="(.*?)"/)?.[1] || "INFO";
            
            cleanData = `[${level}] [${logger}]: ${msgMatch[1]}`;
        }
    }
    
    const html = document.documentElement;
    const currentScroll = window.scrollY || window.pageYOffset;
    
    const isAtBottom = (html.scrollHeight - html.clientHeight - currentScroll) <= 50;
    
    const container = document.getElementById('log-container');
    const logLine = document.createElement('div');
    
    logLine.style.whiteSpace = 'pre-wrap'; 
    logLine.textContent = cleanData;
    container.appendChild(logLine);
    
    if (isAtBottom) {
        window.scrollTo({
            top: html.scrollHeight,
            behavior: 'smooth'
        });
    }
});