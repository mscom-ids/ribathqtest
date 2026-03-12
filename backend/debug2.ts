import fs from 'fs';
const path = 'D:/NewRQP/backend/src/controllers/academics.controller.ts';
let content = fs.readFileSync(path, 'utf8');

let out = "";
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('paramCount')) {
        out += `Line ${i+1}: ${line.trim()}\n`;
    }
});
fs.writeFileSync('D:/NewRQP/backend/debug.txt', out);
