#!/usr/bin/env node
/**
 * Decode a FLEXI1 share string or .flexi file to JSON
 * 
 * Usage:
 *   node scripts/decode-flexi.js "FLEXI1:..."
 *   node scripts/decode-flexi.js presets/default.flexi
 */

import fs from 'fs';
import pako from 'pako';

function decode(input) {
  let b64;
  
  // Check if it's a file path
  if (!input.includes('FLEXI1:') && !input.includes('ACTFLEXI1:') && fs.existsSync(input)) {
    const content = fs.readFileSync(input, 'utf8');
    if (content.startsWith('FLEXI1:')) {
      b64 = content.slice(7);
    } else if (content.startsWith('ACTFLEXI1:')) {
      b64 = content.slice(9);
    } else {
      throw new Error('Unknown format in file');
    }
  } else if (input.includes('FLEXI1:')) {
    b64 = input.slice(7);
  } else if (input.includes('ACTFLEXI1:')) {
    b64 = input.slice(9);
  } else {
    throw new Error('Invalid input - provide a FLEXI1: string or path to .flexi file');
  }
  
  const buf = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const decompressed = pako.inflate(buf);
  const json = new TextDecoder().decode(decompressed);
  return JSON.parse(json);
}

const input = process.argv[2];
if (!input) {
  console.log('Usage: node scripts/decode-flexi.js "FLEXI1:..." or "path/to/file.flexi"');
  process.exit(1);
}

try {
  const data = decode(input);
  console.log(JSON.stringify(data, null, 2));
} catch (e) {
  console.error('Decode error:', e.message);
  process.exit(1);
}