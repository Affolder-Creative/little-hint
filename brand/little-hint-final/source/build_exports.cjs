// Run after build_vectors.py. Requires sharp. All PNGs derive from SVG masters.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
async function render(src,dest,width){
  await fs.mkdir(path.dirname(path.join(root,dest)),{recursive:true});
  await sharp(path.join(root,src),{density:288}).resize({width}).png().toFile(path.join(root,dest));
}
async function main(){
  for(const folder of ['logos','symbols']){
    for(const file of await fs.readdir(path.join(root,folder))){
      if(!file.endsWith('.svg')||file.includes('adaptive'))continue;
      const width=folder==='symbols'?1024:file.includes('stacked')?1040:file.includes('wordmark')?1240:1520;
      await render(folder+'/'+file,folder+'/png/'+file.replace('.svg','.png'),width);
    }
  }
  for(const theme of ['color','dark']){
    for(const size of [64,128,192,256,512,1024])
      await render(`icons/little-hint-app-${theme}.svg`,`icons/little-hint-app-${theme}-${size}.png`,size);
    for(const size of [192,512])
      await render(`icons/little-hint-maskable-${theme}.svg`,`icons/little-hint-maskable-${theme}-${size}.png`,size);
    await render(`icons/little-hint-app-${theme}.svg`,`icons/apple-touch-icon-${theme}-180.png`,180);
    for(const size of [16,32,48])
      await render(`favicons/little-hint-favicon-${theme}.svg`,`favicons/favicon-${theme}-${size}.png`,size);
    // ICO entries contain the exact reviewed PNGs rather than separately resampled art.
    const files=await Promise.all([16,32,48].map(size=>fs.readFile(path.join(root,`favicons/favicon-${theme}-${size}.png`))));
    const header=Buffer.alloc(6+16*files.length);header.writeUInt16LE(1,2);header.writeUInt16LE(files.length,4);
    let offset=header.length;
    files.forEach((data,i)=>{const at=6+16*i;const size=[16,32,48][i];header[at]=size;header[at+1]=size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(data.length,at+8);header.writeUInt32LE(offset,at+12);offset+=data.length;});
    await fs.writeFile(path.join(root,`favicons/favicon-${theme}.ico`),Buffer.concat([header,...files]));
  }
  await fs.copyFile(path.join(root,'favicons/favicon-color.ico'),path.join(root,'favicons/favicon.ico'));
  await fs.copyFile(path.join(root,'favicons/little-hint-favicon-adaptive.svg'),path.join(root,'favicons/favicon.svg'));
  console.log('PNG and ICO exports complete.');
}
main().catch(e=>{console.error(e);process.exit(1)});
