import fs from 'fs';
const code = fs.readFileSync('src/App.tsx', 'utf-8');

const target = `<span className={cn("text-sm font-black flex flex-col items-end", roll.isCompleted ? "text-slate-500" : "text-blue-600")}>
                                       <span>{roll.isCompleted ? roll.actualLength?.toFixed(1) : roll.targetFormedLength.toFixed(1)} m</span>
                                       {roll.index === 0 && !roll.isCompleted && lineConfigs[lineId].fProduced > 0 && (
                                         <span className="text-[10px] font-medium text-slate-500 mt-0.5 font-sans">
                                           ({lineConfigs[lineId].fProduced.toFixed(1)}m 为接班已收, 本班产 {(roll.targetFormedLength - lineConfigs[lineId].fProduced).toFixed(1)}m)
                                         </span>
                                       )}
                                     </span>`;

const replacement = `<span className={cn("text-sm font-black flex flex-col items-end", roll.isCompleted ? "text-slate-500" : "text-blue-600")}>
                                       <span>{roll.isCompleted ? roll.actualLength?.toFixed(1) : roll.targetFormedLength.toFixed(1)} m</span>
                                       {!roll.isCompleted && (() => {
                                         const isFirst = roll.index === 0 && lineConfigs[lineId].fProduced > 0;
                                         const fProd = isFirst ? lineConfigs[lineId].fProduced : 0;
                                         
                                         const endMs = roll.endT ? roll.endT.getTime() : 0;
                                         const shiftEndMs = shiftEnd.getTime();
                                         const spillMins = (endMs - shiftEndMs) / 60000;
                                         
                                         const cConsum = isFirst ? Math.max(0, roll.targetFormedLength - fProd) : roll.targetFormedLength;
                                         const spillLength = Math.max(0, spillMins * config.speed);
                                         const nextShiftLength = Math.min(cConsum, spillLength);
                                         const thisShiftLength = cConsum - nextShiftLength;

                                         if (isFirst && nextShiftLength < 1) {
                                           return (
                                             <span className="text-[10px] font-medium text-slate-500 mt-0.5 font-sans">
                                               ({fProd.toFixed(1)}m 为接班已收, 本班产 {thisShiftLength.toFixed(1)}m)
                                             </span>
                                           );
                                         } else if (isFirst && nextShiftLength >= 1) {
                                           return (
                                              <span className="text-[10px] font-bold text-amber-600 mt-0.5 font-sans leading-tight text-right flex flex-col items-end">
                                                <span>{fProd.toFixed(1)}m 为接班已收</span>
                                                <span>本班产 {thisShiftLength.toFixed(1)}m, 下班产 {nextShiftLength.toFixed(1)}m</span>
                                              </span>
                                           );
                                         } else if (!isFirst && nextShiftLength >= 1 && thisShiftLength >= 1) {
                                           return (
                                             <span className="text-[10px] font-bold text-amber-600 mt-0.5 font-sans leading-tight text-right">
                                               (本班产 {thisShiftLength.toFixed(1)}m, 下班产 {nextShiftLength.toFixed(1)}m)
                                             </span>
                                           );
                                         } else if (!isFirst && nextShiftLength >= 1 && thisShiftLength < 1) {
                                           return (
                                             <span className="text-[10px] font-bold text-amber-600 mt-0.5 font-sans leading-tight text-right">
                                               (全在下班产)
                                             </span>
                                           );
                                         }
                                         return null;
                                       })()}
                                     </span>`;

const patched = code.replace(target, replacement);
if (code === patched) {
  console.log("NOT REPLACED");
} else {
  fs.writeFileSync('src/App.tsx', patched);
  console.log("SUCCESS");
}
