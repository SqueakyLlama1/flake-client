import { loadCSS, unloadCSS } from './file_loader.js';
import { visualSettings } from './settings.js';
import * as dashboard from './dashboard.js';
import * as tabs from './tabs.js';

function getEBD(id) {return document.getElementById(id);}
function wait(ms) {return new Promise(resolve => setTimeout(resolve, ms));}

const menuDelay = visualSettings.menuDelay || 1250;
const load_menu = getEBD('load_menu');
let load_stylesheet;

const svgSnowflake = `data:image/svg+xml;utf8,<svg width="60" height="60" viewBox="0 0 3 3" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="1" height="1" fill="%23FFFFFF" />
  <rect x="2" y="0" width="1" height="1" fill="%23FFFFFF" />
  <rect x="1" y="1" width="1" height="1" fill="%23FFFFFF" />
  <rect x="0" y="2" width="1" height="1" fill="%23FFFFFF" />
  <rect x="2" y="2" width="1" height="1" fill="%23FFFFFF" />
</svg>`;

let snowInterval = null;
let animationFrame = null;
let activeSnowflakes = [];
let isFinishing = false;

export function startSnowEmitter(intervalMs = 300, entity_quantity = 1) {
    stopSnowEmitter();
    
    const recentXPositions = [];
    
    snowInterval = setInterval(() => {
        for (let i = 0; i < entity_quantity; i++) {
            const snow = document.createElement('img');
            snow.src = svgSnowflake;
            
            Object.assign(snow.style, {
                position: 'absolute',
                left: '0px',
                top: '0px',
                pointerEvents: 'none'
            });
            
            let x;
            let attempts = 0;
            do {
                x = Math.random() * (window.innerWidth - 80);
                if (++attempts > 10) break;
            } while (recentXPositions.some(pos => Math.abs(pos - x) < 80));
            
            recentXPositions.push(x);
            if (recentXPositions.length > 5) {
                recentXPositions.shift();
            }
            
            const scale = Math.random() * 1.0 + 0.4;
            const vy = Math.random() * 2.5 + 1;
            
            Object.assign(snow.style, {
                width: `${60 * scale}px`,
                height: `${60 * scale}px`,
                opacity: `${Math.random() * 0.5 + 0.5}`
            });
            
            load_menu.appendChild(snow);
            
            activeSnowflakes.push({
                element: snow,
                x,
                y: -80,
                vy,
                rotation: Math.random() * 360,
                rotationVelocity: (Math.random() - 0.5) * 4,
                scale
            });
        }
    }, intervalMs);
    
    function animate() {
        for (let i = activeSnowflakes.length - 1; i >= 0; i--) {
            const flake = activeSnowflakes[i];
            
            flake.y += flake.vy;
            flake.rotation += flake.rotationVelocity;
            
            flake.element.style.transform = `translate(${flake.x}px, ${flake.y}px) rotate(${flake.rotation}deg) scale(${flake.scale})`;
            
            if (flake.y > window.innerHeight) {
                flake.element.remove();
                activeSnowflakes.splice(i, 1);
            }
        }
        
        animationFrame = requestAnimationFrame(animate);
    }
    
    animate();
}

export function stopSnowEmitter() {
    if (snowInterval) {
        clearInterval(snowInterval);
        snowInterval = null;
    }
    
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    
    activeSnowflakes.forEach(flake => {
        if (flake.element.parentNode) {
            flake.element.remove();
        }
    });
    
    activeSnowflakes = [];
}

export function init() {
    load_stylesheet = loadCSS('sheets/load.css');
    startSnowEmitter(600, 1);
}

async function finish_loading() {
    if (isFinishing) return;
    isFinishing = true;
    
    stopSnowEmitter();
    await tabs.remove('load_menu');
    unloadCSS(load_stylesheet);
}

window.addEventListener('load', async () => {
    await wait(menuDelay);
    await finish_loading();
    dashboard.init();
});