import fs from 'fs';
const path = 'D:/NewRQP/backend/src/controllers/academics.controller.ts';
let content = fs.readFileSync(path, 'utf8');

const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('paramCount')) {
        console.log(`Line ${i+1}: ${line.trim()}`);
    }
});
