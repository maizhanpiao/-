import * as fs from 'fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace('doc, getDoc, setDoc, onSnapshot', 'doc, getDoc, setDoc, onSnapshot, serverTimestamp');
content = content.replace(/updatedAt: new Date\(\)\.toISOString\(\)/g, 'updatedAt: serverTimestamp()');

fs.writeFileSync(filePath, content, 'utf8');

console.log("Successfully patched App.tsx timestamp");
