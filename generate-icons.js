// Generate simple PWA icons as PNG using canvas
// Run: node generate-icons.js

const fs = require('fs');
const path = require('path');

// Create a simple SVG and save it — browsers will accept SVG icons
const sizes = [192, 512];

for (const size of sizes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#6C5CE7"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="${size * 0.5}" fill="white">📅</text>
</svg>`;

  fs.writeFileSync(path.join(__dirname, 'public', 'icons', `icon-${size}.svg`), svg);
  console.log(`Created icon-${size}.svg`);
}

// Also create a simple PNG fallback using a 1x1 approach isn't ideal,
// so let's just update manifest to use SVG
console.log('Done! Update manifest.json to use .svg extension');
