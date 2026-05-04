const svgSnowflake = `data:image/svg+xml;utf8,<svg width="60" height="60" viewBox="0 0 3 3" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="1" height="1" fill="%23FFFFFF" />
  <rect x="2" y="0" width="1" height="1" fill="%23FFFFFF" />
  <rect x="1" y="1" width="1" height="1" fill="%23FFFFFF" />
  <rect x="0" y="2" width="1" height="1" fill="%23FFFFFF" />
  <rect x="2" y="2" width="1" height="1" fill="%23FFFFFF" />
</svg>`;

export function startSnowEmitter(intervalMs = 300, entity_quantity = 1) {
  const snowflakes = [];
  const recentXPositions = [];

  setInterval(() => {
    for (let i = 0; i < entity_quantity; i++) {
      const snow = document.createElement('img');
      snow.src = svgSnowflake;
      snow.style.position = 'absolute';
      snow.style.left = '0px';
      snow.style.top = '0px';
      snow.style.pointerEvents = 'none';

      let x;
      let attempts = 0;
      do {
        x = Math.random() * (window.innerWidth - 80);
        attempts++;
        if (attempts > 10) break;
      } while (recentXPositions.some(pos => Math.abs(pos - x) < 80));

      recentXPositions.push(x);
      if (recentXPositions.length > 5) {
        recentXPositions.shift();
      }

      const scale = Math.random() * 1.0 + 0.4; 
      const y = -80; 
      const vy = Math.random() * 2.5 + 1;
      const rotation = Math.random() * 360;
      const rotationVelocity = (Math.random() - 0.5) * 4;
      const opacity = Math.random() * 0.5 + 0.5;

      snow.style.width = `${60 * scale}px`;
      snow.style.height = `${60 * scale}px`;
      snow.style.opacity = opacity;

      document.body.appendChild(snow);

      snowflakes.push({
        element: snow,
        x: x,
        y: y,
        vy: vy,
        rotation: rotation,
        rotationVelocity: rotationVelocity,
        scale: scale
      });
    }
  }, intervalMs);

  function animate() {
    for (let i = snowflakes.length - 1; i >= 0; i--) {
      const flake = snowflakes[i];
      
      flake.y += flake.vy;
      flake.rotation += flake.rotationVelocity;

      flake.element.style.transform = `translate(${flake.x}px, ${flake.y}px) rotate(${flake.rotation}deg) scale(${flake.scale})`;

      if (flake.y > window.innerHeight) {
        flake.element.remove();
        snowflakes.splice(i, 1);
      }
    }
    
    requestAnimationFrame(animate);
  }

  animate();
}