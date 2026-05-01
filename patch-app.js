import * as fs from 'fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const hookTemplate = `
  const { user } = useAuth();
  
  const dateKey = format(currentTime, "yyyy-MM-dd");

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
          updatedAt: new Date().toISOString()
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
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
      }
    };
    const timer = setTimeout(savePunch, 500);
    return () => clearTimeout(timer);
  }, [punchRecords, user, dateKey]);
`;

// Insert the hook inside App component right after const [punchRecords... lines
content = content.replace(
  '  const [punchRecords, setPunchRecords] = useState<\n    Record<string, { in: boolean; out: boolean }>\n  >({});',
  '  const [punchRecords, setPunchRecords] = useState<\n    Record<string, { in: boolean; out: boolean }>\n  >({});\n' + hookTemplate
);

// We should also add login functionality somewhere. 
// Just a simple login button at the top header.
const headTarget = `            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-blue-500/20">`;
const loginButton = `
            {user ? (
               <button onClick={logOut} className="mr-2 text-xs text-blue-200">登出 ({user.email})</button>
            ) : (
               <button onClick={signIn} className="mr-2 text-xs text-white bg-blue-600 px-2 py-1 rounded">登录以保存数据</button>
            )}
`;

content = content.replace(headTarget, loginButton + headTarget);

// Wait, getting logOut and signIn from useAuth().
// I already have const { user } = useAuth();
// So let's change it to const { user, signIn, logOut } = useAuth();
content = content.replace('const { user } = useAuth();', 'const { user, signIn, logOut } = useAuth();');


fs.writeFileSync(filePath, content, 'utf8');

console.log("Successfully patched App.tsx");
