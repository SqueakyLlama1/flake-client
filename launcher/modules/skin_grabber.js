const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

export async function assemble(skinUrl, uuid, force) {
    const outputPath = path.join("cache", "skins");
    console.log(`[SKINS, ASSEMBLE] Output Path: ${outputPath}`);
    if (!fs.existsSync(outputPath)) {
        console.log(`[SKINS, ASSEMBLE] Output Path doesn't exist, creating now..`);
        fs.mkdirSync(outputPath, {recursive: true});
        console.log(`[SKINS, ASSEMBLE] Output Path Created.`);
    }
    const file = path.join(outputPath, `${uuid}.png`);
    if (fs.existsSync(file) && !force) {
        console.log(`[SKINS, ASSEMBLE] File already exists in cache... aborting download & assemble.`);
        return file;
    }
    if (force) {
        console.log(`[SKINS, ASSEMBLE] Forcing Re-Draw of skin...`);
    }
    console.log(`[SKINS, ASSEMBLE] Downloading Skin..`);
    const skinImage = await loadImage(skinUrl);
    const canvas = createCanvas(16, 32);
    const ctx = canvas.getContext('2d');
    
    console.log(`[SKINS, ASSEMBLE] Assembling Skin..`);
    
    // --- HEAD ---
    ctx.drawImage(skinImage, 8, 8, 8, 8, 4, 0, 8, 8);         // Base
    ctx.drawImage(skinImage, 40, 8, 8, 8, 4, 0, 8, 8);        // Outer (Hat)
    
    // --- TORSO ---
    ctx.drawImage(skinImage, 20, 20, 8, 12, 4, 8, 8, 12);     // Base
    ctx.drawImage(skinImage, 20, 36, 8, 12, 4, 8, 8, 12);     // Outer (Jacket)
    
    // --- RIGHT ARM ---
    ctx.drawImage(skinImage, 44, 20, 4, 12, 0, 8, 4, 12);     // Base
    ctx.drawImage(skinImage, 44, 36, 4, 12, 0, 8, 4, 12);     // Outer (Sleeve)
    
    // --- LEFT ARM ---
    ctx.drawImage(skinImage, 36, 52, 4, 12, 12, 8, 4, 12);    // Base
    ctx.drawImage(skinImage, 52, 52, 4, 12, 12, 8, 4, 12);    // Outer (Sleeve)
    
    // --- RIGHT LEG ---
    ctx.drawImage(skinImage, 4, 20, 4, 12, 4, 20, 4, 12);     // Base
    ctx.drawImage(skinImage, 4, 36, 4, 12, 4, 20, 4, 12);     // Outer (Pant Leg)
    
    // --- LEFT LEG ---
    ctx.drawImage(skinImage, 20, 52, 4, 12, 8, 20, 4, 12);    // Base
    ctx.drawImage(skinImage, 4, 52, 4, 12, 8, 20, 4, 12);     // Outer (Pant Leg)
    
    const finalCanvas = createCanvas(160, 320);
    const finalCtx = finalCanvas.getContext('2d');
    finalCtx.imageSmoothingEnabled = false;
    console.log(`[SKINS, ASSEMBLE] Creating Final Image`);
    finalCtx.drawImage(canvas, 0, 0, 160, 320);
    
    const buffer = finalCanvas.toBuffer('image/png');
    fs.writeFileSync(file, buffer, {recursive: true});
    console.log(`[SKINS, ASSEMBLE] Skin assembled and cached! File path: ${file}`);
    return file;
}

export async function get(username) {
    try {
        console.log(`[SKINS, GET] Searching for UUID for: ${username}...`);
        const uuidResponse = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        
        if (!uuidResponse.data || !uuidResponse.data.id) {
            throw new Error("[SKINS, GET] User not found.");
        }
        
        const uuid = uuidResponse.data.id;
        const profileResponse = await axios.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
        
        const textureProperty = profileResponse.data.properties.find(prop => prop.name === 'textures');
        
        if (!textureProperty) {
            throw new Error("[SKINS, GET] No textures found for this player.");
        }
        
        const decodedJson = Buffer.from(textureProperty.value, 'base64').toString('utf-8');
        const textureData = JSON.parse(decodedJson);
        const skinUrl = textureData.textures.SKIN.url;
        
        return {
            username: profileResponse.data.name,
            uuid: uuid,
            skinUrl: skinUrl
        };
        
    } catch (error) {
        return { error: error.message };
    }
}