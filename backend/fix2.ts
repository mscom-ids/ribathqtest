import fs from 'fs';
const path = 'D:/NewRQP/backend/src/controllers/academics.controller.ts';
let content = fs.readFileSync(path, 'utf8');

// The file has $\${paramCount+1} inside template literals. We want $${paramCount+1}
content = content.replace(/\$\\\$\{/g, "$${");
content = content.replace(/\(\{paramCount\},/g, "($${paramCount},"); 
fs.writeFileSync(path, content);
console.log("Global replace complete!");
