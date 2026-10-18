// Rebuild SVG wrappers from accepted canonical PNG previews; no browser or rasterizer needed.
const fs = require('node:fs');
const path = require('node:path');
for (const name of ['default', 'default-stacked']) {
  const png = fs.readFileSync(path.join(__dirname, name + '.png'));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><title>Iteration 3 — ' + name + ': verified UI, accepted 2026-10-18</title><image width="' + width + '" height="' + height + '" href="data:image/png;base64,' + png.toString('base64') + '"/></svg>\n';
  fs.writeFileSync(path.join(__dirname, name + '.svg'), svg);
}
