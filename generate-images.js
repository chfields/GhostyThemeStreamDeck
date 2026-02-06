#!/usr/bin/env node

/**
 * Generate Stream Deck button images for each Claude state.
 * Creates 144x144 PNG images with colored backgrounds and small icons.
 * Icons are small and at top to maximize text space.
 */

const fs = require('fs');
const path = require('path');

const imagesDir = path.join(__dirname, 'com.chfields.ghostty-claude.sdPlugin', 'images');
const iconsDir = path.join(__dirname, 'com.chfields.ghostty-claude.sdPlugin', 'icons');

// Ensure directories exist
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Image configurations
const images = {
  'waiting': {
    background: '#F59E0B', // Amber/yellow
    icon: 'question',
    iconColor: '#FFFFFF'
  },
  'working': {
    background: '#3B82F6', // Blue
    icon: 'gear',
    iconColor: '#FFFFFF'
  },
  'running': {
    background: '#10B981', // Green
    icon: 'terminal',
    iconColor: '#FFFFFF'
  },
  'not-running': {
    background: '#6B7280', // Gray
    icon: 'terminal',
    iconColor: '#FFFFFF'
  },
  'action': {
    background: '#1F2937', // Dark gray
    icon: 'terminal',
    iconColor: '#10B981' // Green icon
  }
};

// SVG icon paths - very small icons at top of button
// Icons are ~32x32, positioned near top to maximize text area
const iconPaths = {
  question: `
    <circle cx="72" cy="36" r="18" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M65 30 Q65 22 72 22 Q79 22 79 30 Q79 36 72 39 L72 44" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <circle cx="72" cy="50" r="2.5" fill="currentColor"/>
  `,
  gear: `
    <circle cx="72" cy="36" r="8" fill="none" stroke="currentColor" stroke-width="3"/>
    <circle cx="72" cy="36" r="3" fill="currentColor"/>
    <line x1="72" y1="18" x2="72" y2="24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="72" y1="48" x2="72" y2="54" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="54" y1="36" x2="60" y2="36" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="84" y1="36" x2="90" y2="36" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="59" y1="23" x2="63" y2="27" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="81" y1="45" x2="85" y2="49" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="59" y1="49" x2="63" y2="45" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="81" y1="27" x2="85" y2="23" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  `,
  terminal: `
    <rect x="52" y="20" width="40" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="3"/>
    <path d="M60 30 L68 36 L60 42" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="72" y1="42" x2="84" y2="42" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  `
};

function generateSVG(config, size = 144) {
  const { background, icon, iconColor } = config;
  const iconSVG = iconPaths[icon].replace(/currentColor/g, iconColor);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 144 144" xmlns="http://www.w3.org/2000/svg">
  <rect width="144" height="144" rx="16" fill="${background}"/>
  <g>
    ${iconSVG}
  </g>
</svg>`;
}

// Generate state images
for (const [name, config] of Object.entries(images)) {
  const svg = generateSVG(config);
  const svgPath = path.join(imagesDir, `${name}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`Created: ${svgPath}`);
}

// Generate plugin icons
const categoryIconSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="6" width="20" height="16" rx="2" fill="none" stroke="#10B981" stroke-width="1.5"/>
  <path d="M8 11 L12 14 L8 17" fill="none" stroke="#10B981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="14" y1="17" x2="19" y2="17" stroke="#10B981" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const pluginIconSVG = generateSVG({
  background: '#1F2937',
  icon: 'terminal',
  iconColor: '#10B981'
}, 144);

fs.writeFileSync(path.join(iconsDir, 'category.svg'), categoryIconSVG);
fs.writeFileSync(path.join(iconsDir, 'plugin.svg'), pluginIconSVG);

console.log('\nSVG images generated successfully!');
