import fs from 'fs';
const path = 'D:/NewRQP/src/components/admin/student-profile/tabs/progress-tab.tsx';
let content = fs.readFileSync(path, 'utf8');

// The broken details replacement chunk
const targetDetails = `                    details: log.mode === 'New Verses' || log.mode === 'Recent Revision'
                        ? (log.surah_name 
                            ? \`\${getArabic(log.surah_name)} \${log.start_v ? \\\`(\${log.start_v}-\${log.end_v})\\\` : ''}\` 
                            : \`Pages \${log.start_page}-\${log.end_page}\`)
                        : \`Juz \${log.juz_number || '?'} (\${log.juz_portion || 'Full'})\``;

const perfectDetails = `                    details: log.mode === 'New Verses' || log.mode === 'Recent Revision'
                        ? (log.surah_name 
                            ? \`\${getArabic(log.surah_name)} \${log.start_v ? \`(\${log.start_v}-\${log.end_v})\` : ''}\` 
                            : \`Pages \${log.start_page}-\${log.end_page}\`)
                        : \`Juz \${log.juz_number || '?'} (\${log.juz_portion || 'Full'})\``;

// Let's just find "details:" and end at "}))" and replace the block cleanly using regex.
const regex = /details: log\.mode === 'New Verses' \|\| log\.mode === 'Recent Revision'[\s\S]*?: `Juz \${log\.juz_number \|\| '\?'} \(\${log\.juz_portion \|\| 'Full'}\)`/;

content = content.replace(regex, perfectDetails);

fs.writeFileSync(path, content);
console.log("Fixed progress-tab.tsx details logic via script!");
