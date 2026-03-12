import fs from 'fs';
const path = 'D:/NewRQP/backend/src/controllers/academics.controller.ts';
let content = fs.readFileSync(path, 'utf8');

// The file has \${department.toLowerCase()} in template literals. We want ${department.toLowerCase()}
content = content.replace(/\\\$\{department\.toLowerCase\(\)\}/g, "${department.toLowerCase()}");
fs.writeFileSync(path, content);
console.log("Unescaped parent variable!");
