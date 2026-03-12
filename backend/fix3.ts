import fs from 'fs';
const path = 'D:/NewRQP/backend/src/controllers/academics.controller.ts';
let content = fs.readFileSync(path, 'utf8');

// The file has \${standardColumn} in template literals. We want ${standardColumn} so it evaluates the JS variable
content = content.replace(/\\\$\{standardColumn\}/g, "${standardColumn}");
content = content.replace(/\\\$\{placeholders\}/g, "${placeholders}");
fs.writeFileSync(path, content);
console.log("Unescaped JS variables!");
