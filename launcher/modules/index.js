import * as load from './load.js';
import * as skins from './skin_grabber.js';

load.init();
async function testSkin() {
    const skinURL = await skins.get('turtlefopy').then(result => {
        if (result.error) {
            console.error("Error:", result.error);
            return;
        }
        return { url: result.skinUrl, uuid: result.uuid };
    });
    skins.assemble(skinURL.url, skinURL.uuid, false);
}
testSkin();