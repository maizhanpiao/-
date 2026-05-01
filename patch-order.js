import * as fs from 'fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const hookTemplate = `
  useEffect(() => {
    if (!user) return;
    const path = \`users/\${user.uid}/punchRecords/\${dateKey}\`;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'punchRecords', dateKey), (docSnap) => {
      if (docSnap.exists()) {
        try {
          const data = docSnap.data();
          if (data.records) {
             setPunchRecords(JSON.parse(data.records));
          }
        } catch (e) {
             handleFirestoreError(e, OperationType.GET, path);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsub();
  }, [user, dateKey]);

  useEffect(() => {
    if (!user) return;
    const path = \`users/\${user.uid}/lineStates/\${dateKey}\`;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'lineStates', dateKey), (docSnap) => {
      if (docSnap.exists()) {
        try {
          const data = docSnap.data();
          if (data.lineConfigs) setLineConfigs(JSON.parse(data.lineConfigs));
          if (data.activeSplicing) setActiveSplicing(JSON.parse(data.activeSplicing));
          if (data.lastWashes) setLastWashes(JSON.parse(data.lastWashes));
        } catch(e) {
          handleFirestoreError(e, OperationType.GET, path);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsub();
  }, [user, dateKey]);

  // debounce writes to firestore for lineState
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
       firstRenderRef.current = false;
       return;
    }
    if (!user) return;
    const saveState = async () => {
      const path = \`users/\${user.uid}/lineStates/\${dateKey}\`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'lineStates', dateKey), {
          userId: user.uid,
          dateKey,
          lineConfigs: JSON.stringify(lineConfigs),
          activeSplicing: JSON.stringify(activeSplicing),
          lastWashes: JSON.stringify(lastWashes),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
    };
    const timer = setTimeout(saveState, 500);
    return () => clearTimeout(timer);
  }, [lineConfigs, activeSplicing, lastWashes, user, dateKey]);

  // debounce writes to firestore for punchRecords
  useEffect(() => {
    if (!user) return;
    // Don't save on initial empty state if we haven't loaded yet
    if (Object.keys(punchRecords).length === 0) return;
    
    const savePunch = async () => {
      const path = \`users/\${user.uid}/punchRecords/\${dateKey}\`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'punchRecords', dateKey), {
          userId: user.uid,
          dateKey,
          records: JSON.stringify(punchRecords),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
    };
    const timer = setTimeout(savePunch, 500);
    return () => clearTimeout(timer);
  }, [punchRecords, user, dateKey]);
`;

// Extract the exact block spanning from useEffect(() => { \n if (!user) return; ... to }, [punchRecords, user, dateKey]);

// Let's find index
const startIdx = content.indexOf('  useEffect(() => {\n    if (!user) return;\n    const path = `users/${user.uid}/punchRecords/${dateKey}`;');
const endStr = '  }, [punchRecords, user, dateKey]);\n';
const endIdx = content.indexOf(endStr, startIdx) + endStr.length;

if (startIdx !== -1 && endIdx !== -1) {
   content = content.substring(0, startIdx) + content.substring(endIdx);
} else {
   console.log("Could not find the block to remove.");
}

// Now insert it after setMealConfig
const mealConfigTarget = '    dinnerEnd: 17 + 50 / 60,\n  });\n';
const insertIdx = content.indexOf(mealConfigTarget) + mealConfigTarget.length;

if (insertIdx !== -1 + mealConfigTarget.length) {
   content = content.substring(0, insertIdx) + hookTemplate + content.substring(insertIdx);
} else {
   console.log("Could not find mealConfig target.");
}

fs.writeFileSync(filePath, content, 'utf8');

console.log("Successfully patched App.tsx order");
