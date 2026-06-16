const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

const srcDir = path.join(__dirname, '..', 'src');
console.log(`Scanning directory: ${srcDir}\n`);

let filesWithIssues = [];

walkDir(srcDir, (filePath) => {
  const ext = path.extname(filePath);
  if (ext !== '.js' && ext !== '.jsx') return;

  const content = fs.readFileSync(filePath, 'utf8');

  // Check if file uses "React." or "<React."
  const usesReactKeyword = content.includes('React.') || content.includes('<React.');
  
  if (usesReactKeyword) {
    // Check if React is imported
    const hasImport = content.includes("import React") || content.includes("const React");
    
    if (!hasImport) {
      console.log(`❌ Missing React import in: ${path.relative(srcDir, filePath)}`);
      filesWithIssues.push(filePath);
    }
  }
});

if (filesWithIssues.length === 0) {
  console.log("✅ No files found with missing React imports!");
} else {
  console.log(`\nFound ${filesWithIssues.length} file(s) with missing React imports.`);
}
