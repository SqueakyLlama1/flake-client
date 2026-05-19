import * as load from './load.js';

load.init();
// Example skin loading functionality. Do not use yet, it's resource heavy

/* async function testSkin() {
    const skinURL = await skins.get('SqueakyLlama_').then(result => {
        if (result.error) {
            console.error("Error:", result.error);
            return;
        }
        return { url: result.skinUrl, uuid: result.uuid };
    });
    skins.assemble(skinURL.url, skinURL.uuid, false);
}
testSkin(); */