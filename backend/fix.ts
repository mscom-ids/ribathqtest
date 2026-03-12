import fs from 'fs';
const path = 'D:/NewRQP/backend/src/controllers/academics.controller.ts';
let content = fs.readFileSync(path, 'utf8');

// The file currently has `${paramCount}` because of my previous script
content = content.replace(/= \$\{paramCount\}/g, "= $${paramCount}");
content = content.replace(/\$\{paramCount \+ i\}/g, "$${paramCount + i}");
fs.writeFileSync(path, content);
console.log("Fixed again!");
