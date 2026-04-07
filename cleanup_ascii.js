const fs = require('fs');
const path = require('path');

const replacements = [
  { pattern: /â‚¹|₹/g, replacement: 'Rs.' },
  { pattern: /â€¢|•|â•™|â•/g, replacement: '*' },
  { pattern: /â”€|â•|â•¦|â•©|â–‘|â–’|â–“|═|─|━/g, replacement: '-' },
  { pattern: /â€”|—/g, replacement: '-' },
  { pattern: /â€¦|…/g, replacement: '...' },
  { pattern: /â†’/g, replacement: '->' },
  { pattern: /&rarr;/g, replacement: '->' }
];

const templateFixes = [
  { pattern: /\?\{/g, replacement: '${' },
  { pattern: /\?event/g, replacement: '$event' },
  { pattern: /\?index/g, replacement: '$index' },
  { pattern: /\?0/g, replacement: '$0' },
  { pattern: /\?1/g, replacement: '$1' }
];

function walk(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', '.angular'].includes(file)) {
        walk(filePath);
      }
    } else if (['.ts', '.html', '.scss'].includes(path.extname(filePath))) {
      processFile(filePath);
    }
  });
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  replacements.forEach(r => {
    content = content.replace(r.pattern, r.replacement);
  });

  templateFixes.forEach(f => {
    content = content.replace(f.pattern, f.replacement);
  });

  if (content !== original) {
    console.log(`Updating ${filePath}`);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

walk(path.join(process.cwd(), 'src', 'app'));
console.log('Cleanup complete.');
