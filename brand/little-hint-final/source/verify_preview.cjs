// Optional browser verification. Requires playwright and an installed Chromium browser.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
async function main(){
 const browser=await chromium.launch({headless:true,...(process.env.LITTLE_HINT_BROWSER?{executablePath:process.env.LITTLE_HINT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:1000},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(root,'visual-guide.html')).href);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  assert.equal(await page.locator('img').evaluateAll(images=>images.filter(i=>!i.naturalWidth).length),0);
  await fs.mkdir(path.join(root,'previews'),{recursive:true});
  await page.screenshot({path:path.join(root,'previews/visual-guide.png'),fullPage:true});
  await page.locator('main > .grid').first().screenshot({path:path.join(root,'previews/logo-overview.png')});
  const dimensions=await page.locator('.sizes img').evaluateAll(images=>images.map(i=>({declared:i.getAttribute('width'),actual:i.getBoundingClientRect().width})));
  for(const d of dimensions)assert.equal(d.actual,Number(d.declared));
  await page.setViewportSize({width:375,height:900});
  const narrow=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));
  assert.equal(narrow.content,narrow.viewport);
  await page.screenshot({path:path.join(root,'previews/mobile-guide.png'),fullPage:true});
  const adaptive=[];
  for(const theme of ['light','dark']){
   await page.emulateMedia({colorScheme:theme});
   for(const file of ['logos/little-hint-horizontal-adaptive.svg','logos/little-hint-tagline-adaptive.svg','favicons/favicon.svg']){
    await page.goto(pathToFileURL(path.join(root,file)).href);
    const mark=await page.locator('.mark').first().evaluate(n=>getComputedStyle(n).fill);
    const expected=file.startsWith('logos')?(theme==='light'?'rgb(170, 77, 55)':'rgb(241, 190, 173)'):(theme==='light'?'rgb(255, 248, 240)':'rgb(241, 190, 173)');
    assert.equal(mark,expected);
    adaptive.push({file,theme,mark});
   }
  }
  // Verify theme propagation when an adaptive SVG is used through an HTML img.
  const svg=await fs.readFile(path.join(root,'favicons/favicon.svg'));
  const imageUrl='data:image/svg+xml;base64,'+svg.toString('base64');
  const embedded=[];
  await page.goto('about:blank');
  for(const theme of ['light','dark']){
   await page.emulateMedia({colorScheme:theme});
   await page.setContent('<img id="adaptive-test" src="'+imageUrl+'" width="32" height="32" alt="Little Hint">');
   await page.locator('#adaptive-test').evaluate(i=>i.decode());
   const pixel=await page.locator('#adaptive-test').evaluate(i=>{const c=document.createElement('canvas');c.width=32;c.height=32;const g=c.getContext('2d');g.drawImage(i,0,0,32,32);return Array.from(g.getImageData(16,1,1,1).data)});
   assert.deepEqual(pixel,theme==='light'?[170,77,55,255]:[43,32,29,255]);
   embedded.push({theme,pixel});
  }
  const report={checked:'2026-10-18',browser:await browser.version(),previewImagesLoaded:true,actualIconDimensions:dimensions,narrowLayout:narrow,adaptiveSVG:adaptive,embeddedAdaptiveFavicon:embedded,limits:'Local rendering and file checks. Installed PWA behavior has not been tested on physical devices.'};
  await fs.writeFile(path.join(root,'verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exit(1)});
