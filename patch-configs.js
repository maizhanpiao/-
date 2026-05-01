import * as fs from 'fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /const \[lineConfigs, setLineConfigs\] = useState<\s*Record<LineId, LinePlanConfig>\s*>.*?\}\);/s;

const emptyConfigs = `const [lineConfigs, setLineConfigs] = useState<
    Record<LineId, LinePlanConfig>
  >({
    "24": { cTotal: 0, cUsed: 0, cPrevUsed: 0, fProduced: 0, fPrevProduced: 0, batchNo: "", speed: 1.35, futureRolls: [], rolls: [], completedRolls: [] },
    "25": { cTotal: 0, cUsed: 0, cPrevUsed: 0, fProduced: 0, fPrevProduced: 0, batchNo: "", speed: 1.30, futureRolls: [], rolls: [], completedRolls: [] },
    "26": { cTotal: 0, cUsed: 0, cPrevUsed: 0, fProduced: 0, fPrevProduced: 0, batchNo: "", speed: 1.38, futureRolls: [], rolls: [], completedRolls: [] }
  });`;

content = content.replace(regex, emptyConfigs);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Patched App.tsx lineConfigs");
