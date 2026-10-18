const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
async function files(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
(async()=>{
 const paths=(await Promise.all(['logos','symbols','icons','favicons'].map(d=>files(path.join(root,d))))).flat().sort();
 assert.equal(paths.length,92);
 const counts={};let pngChecks=0,outlineChecks=0;
 for(const p of paths){const ext=path.extname(p);counts[ext]=(counts[ext]||0)+1;
  if(ext==='.svg'){const s=await fs.readFile(p,'utf8');assert(!/<text(?:\s|>)/.test(s),p);assert(!/Hintwell|hintwell/.test(s),p);outlineChecks++;}
  if(ext==='.png'){
   const meta=await sharp(p).metadata();const match=path.basename(p).match(/-(\d+)\.png$/);if(match){assert.equal(meta.width,Number(match[1]),p);assert.equal(meta.height,Number(match[1]),p);}
   if(p.includes('/logos/')||p.includes('/symbols/')){
    assert(meta.hasAlpha,p);const {data,info}=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=(x,y)=>data[(y*info.width+x)*4+3];
    for(let x=0;x<info.width;x++){assert.equal(alpha(x,0),0,p);assert.equal(alpha(x,info.height-1),0,p);}
    for(let y=0;y<info.height;y++){assert.equal(alpha(0,y),0,p);assert.equal(alpha(info.width-1,y),0,p);}
   }pngChecks++;
  }
 }
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.webmanifest'),'utf8'));
 for(const i of manifest.icons)await fs.access(path.join(root,i.src));
 const report={artworkCount:paths.length,counts,pngChecks,outlineChecks,transparentLogoBorders:true,manifestIconPathsExist:true};
 await fs.writeFile(path.join(root,'asset-verification.json'),JSON.stringify(report,null,2)+'\n');
 await fs.writeFile(path.join(root,'ASSET-INDEX.txt'),'Little Hint final identity · version 1\n\n92 artwork files. Open brand-preview.html, visual-guide.html, or README.txt first.\n\n'+paths.map(p=>path.relative(root,p)).join('\n')+'\n');
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1)});
