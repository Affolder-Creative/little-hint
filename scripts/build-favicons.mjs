// Export only favicons; installed app icons retain their platform-safe tiles.
import { writeFile, copyFile } from "node:fs/promises";
import sharp from "sharp";
const master = "brand/little-hint-final/favicons";
const publicDir = "public/brand/little-hint/favicons";
for (const theme of ["color", "dark"]) {
  const svg = `${master}/little-hint-favicon-${theme}.svg`;
  const sizes = [16, 32, 48];
  const images = [];
  for (const size of sizes) {
    const png = await sharp(svg, { density: 288 })
      .resize(size, size)
      .png()
      .toBuffer();
    images.push(png);
    for (const folder of [master, publicDir]) {
      await writeFile(`${folder}/favicon-${theme}-${size}.png`, png);
    }
  }
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((data, i) => {
    const at = 6 + 16 * i;
    header[at] = sizes[i];
    header[at + 1] = sizes[i];
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  for (const folder of [master, publicDir]) {
    await writeFile(
      `${folder}/favicon-${theme}.ico`,
      Buffer.concat([header, ...images]),
    );
  }
}
for (const theme of ["color", "dark", "adaptive"]) {
  await copyFile(
    `${master}/little-hint-favicon-${theme}.svg`,
    `${publicDir}/little-hint-favicon-${theme}.svg`,
  );
}
for (const folder of [master, publicDir]) {
  await copyFile(
    `${folder}/little-hint-favicon-adaptive.svg`,
    `${folder}/favicon.svg`,
  );
  await copyFile(`${folder}/favicon-color.ico`, `${folder}/favicon.ico`);
}
console.log("Exported transparent light/dark SVG, PNG, and ICO favicons.");
