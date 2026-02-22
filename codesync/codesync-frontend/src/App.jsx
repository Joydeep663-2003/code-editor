import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api";
import { initSocket, disconnectSocket, EVENTS } from "./socket";

// ─── Themes ────────────────────────────────────────────────────────────────────
const THEMES = {
  "Dracula":       { bg: "#282a36", line: "#44475a", text: "#f8f8f2", keyword: "#ff79c6", string: "#f1fa8c", comment: "#6272a4", number: "#bd93f9", func: "#50fa7b", accent: "#bd93f9", border: "#44475a" },
  "Monokai":       { bg: "#272822", line: "#3e3d32", text: "#f8f8f2", keyword: "#f92672", string: "#e6db74", comment: "#75715e", number: "#ae81ff", func: "#a6e22e", accent: "#a6e22e", border: "#49483e" },
  "Nord":          { bg: "#2e3440", line: "#3b4252", text: "#eceff4", keyword: "#81a1c1", string: "#a3be8c", comment: "#616e88", number: "#b48ead", func: "#88c0d0", accent: "#88c0d0", border: "#3b4252" },
  "One Dark":      { bg: "#21252b", line: "#2c313a", text: "#abb2bf", keyword: "#c678dd", string: "#98c379", comment: "#5c6370", number: "#d19a66", func: "#61afef", accent: "#61afef", border: "#181a1f" },
  "Solarized Dark":{ bg: "#002b36", line: "#073642", text: "#839496", keyword: "#859900", string: "#2aa198", comment: "#586e75", number: "#d33682", func: "#268bd2", accent: "#b58900", border: "#073642" },
};

const LANGUAGES = {
  javascript: { name: "JavaScript", icon: "JS", template: `// JavaScript\nconsole.log("Hello, CodeSync!");\n\nconst add = (a, b) => a + b;\nconsole.log("2 + 3 =", add(2, 3));`, run: runJS },
  typescript: { name: "TypeScript", icon: "TS", template: `// TypeScript\ninterface User { name: string; age: number; }\nconst greet = (u: User): string => \`Hello, \${u.name}!\`;\nconsole.log(greet({ name: "CodeSync", age: 1 }));`, run: runTS },
  python:     { name: "Python",     icon: "PY", template: `# Python\nprint("Hello, CodeSync!")\n\ndef add(a, b):\n    return a + b\n\nprint("2 + 3 =", add(2, 3))`, run: runPython },
  html:       { name: "HTML",       icon: "HT", template: `<!DOCTYPE html>\n<html>\n<head>\n  <style>body{font-family:sans-serif;background:#1a1a2e;color:#eee;padding:40px} h1{color:#6c63ff}</style>\n</head>\n<body>\n  <h1>Hello, CodeSync!</h1>\n  <p>Edit me and click Run.</p>\n</body>\n</html>`, run: (c) => ({ output: c, isHTML: true, error: null }) },
  css:        { name: "CSS",        icon: "CS", template: `/* CSS Preview */\nbody {\n  font-family: sans-serif;\n  background: #1a1a2e;\n  color: #eee;\n  padding: 40px;\n}\n\nh1 { color: #6c63ff; }`, run: (c) => ({ output: `<html><head><style>${c}</style></head><body><h1>CSS Preview</h1><p>Your styles are applied here.</p></body></html>`, isHTML: true, error: null }) },
  json:       { name: "JSON",       icon: "{}", template: `{\n  "name": "CodeSync",\n  "version": "2.0.0",\n  "features": ["real-time", "multi-language", "auth"]\n}`, run: (c) => { try { return { output: JSON.stringify(JSON.parse(c), null, 2), error: null }; } catch (e) { return { output: "", error: e.message }; } } },
  sql:        { name: "SQL",        icon: "SQ", template: `-- SQL Demo\nSELECT u.id, u.name, COUNT(p.id) AS posts\nFROM users u\nLEFT JOIN posts p ON p.user_id = u.id\nWHERE u.active = true\nGROUP BY u.id\nORDER BY posts DESC\nLIMIT 10;`, run: () => ({ output: "id | name  | posts\n---|-------|------\n1  | Alice | 12\n2  | Bob   | 8\n3  | Carol | 5\n\n3 rows returned.", error: null }) },
  java:{ name:"Java", icon:"JV", color:"#b07219",
    template:`// Java\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, CodeSync!");\n        int sum = 0;\n        for (int i = 1; i <= 5; i++) sum += i;\n        System.out.println("Sum 1-5: " + sum);\n    }\n}`,
    run(code){
      const logs=[];
      const re=/System\.out\.println\(([^)]+)\)/g;
      let m;
      while((m=re.exec(code))!==null){
        let val=m[1].replace(/^"|"$/g,"").replace(/^'|'$/g,"");
        logs.push(val);
      }
      if(!logs.length) logs.push("// Java needs a real compiler to run\n// Showing simulation only");
      return{output:logs.join("\n"),error:null};
    }
  },
  cpp:{ name:"C++", icon:"C+", color:"#f34b7d",
    template:`// C++\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, CodeSync!" << endl;\n    int sum = 0;\n    for (int i = 1; i <= 5; i++) sum += i;\n    cout << "Sum 1-5: " << sum << endl;\n    return 0;\n}`,
    run(code){
      const logs=[];
      const re=/cout\s*<<\s*"([^"]+)"/g;
      let m;
      while((m=re.exec(code))!==null){ logs.push(m[1]); }
      if(!logs.length) logs.push("// C++ needs a real compiler to run\n// Showing simulation only");
      return{output:logs.join("\n"),error:null};
    }
  },
  markdown:   { name: "Markdown",   icon: "MD", template: `# Hello CodeSync\n\n## Features\n- Real-time collaboration\n- **Multi-language** support\n- Code execution\n\n> Build together, ship faster.`, run: (c) => ({ output: `<html><head><style>body{font-family:sans-serif;padding:24px;color:#333}h1,h2{color:#2d5be3}code{background:#f0f0f0;padding:2px 6px;border-radius:3px}blockquote{border-left:4px solid #2d5be3;margin:0;padding-left:16px;color:#666}</style></head><body>${c.replace(/^### (.+)/gm,"<h3>$1</h3>").replace(/^## (.+)/gm,"<h2>$1</h2>").replace(/^# (.+)/gm,"<h1>$1</h1>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/^- (.+)/gm,"<li>$1</li>").replace(/> (.+)/gm,"<blockquote>$1</blockquote>").replace(/\n/g,"<br>")}</body></html>`, isHTML: true, error: null }) },
};

// ─── Code Runners ──────────────────────────────────────────────────────────────
function runJS(code) {
  const logs = [];
  const sc = { log: (...a) => logs.push(a.map(x => typeof x === "object" ? JSON.stringify(x, null, 2) : String(x)).join(" ")), error: (...a) => logs.push("❌ " + a.join(" ")), warn: (...a) => logs.push("⚠️ " + a.join(" ")), info: (...a) => logs.push("ℹ️ " + a.join(" ")) };
  try { const fn = new Function("console", code); const r = fn(sc); if (r !== undefined) logs.push("→ " + String(r)); return { output: logs.join("\n") || "✓ Done (no output)", error: null }; }
  catch (e) { return { output: "", error: e.message }; }
}
function runTS(code) {
  const stripped = code.replace(/:\s*[\w|&<>[\]]+(?=[,)\s=;{])/g, "").replace(/interface\s+\w+\s*{[^}]*}/g, "").replace(/<[\w,\s]+>/g, "").replace(/as\s+\w+/g, "");
  return runJS(stripped);
}
function runPython(code) {
  const logs = [];
  for (const line of code.split("\n")) {
    const t = line.trim();
    if (t.startsWith("print(")) {
      const inner = t.slice(6, -1).replace(/^["']|["']$/g, "").replace(/f"([^"]*)"/, (_, s) => s.replace(/\{([^}]+)\}/g, "..."));
      logs.push(inner);
    }
  }
  return { output: logs.join("\n") || "✓ Python (limited browser simulation)", error: null };
}

// ─── Syntax Highlighter ────────────────────────────────────────────────────────
const KW_JS = ["const","let","var","function","return","if","else","for","while","class","new","this","import","export","default","from","async","await","try","catch","throw","typeof","true","false","null","undefined","switch","case","break","continue","interface","type","extends","void","static","readonly","enum"];
const KW_PY = ["def","class","if","elif","else","for","while","in","not","and","or","return","import","from","as","with","try","except","finally","pass","break","continue","True","False","None","lambda","yield","async","await","print"];

function highlight(code, lang, T) {
  if (!code) return "";
  let h = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (lang === "json") return h.replace(/"([^"]+)"(\s*:)/g, `<span style="color:${T.func}">"$1"</span>$2`).replace(/:\s*"([^"]*)"/g, `: <span style="color:${T.string}">"$1"</span>`).replace(/\b(-?\d+\.?\d*)\b/g, `<span style="color:${T.number}">$1</span>`).replace(/\b(true|false|null)\b/g, `<span style="color:${T.keyword}">$1</span>`);
  if (lang === "html" || lang === "markdown" || lang === "css") return h;
  const kws = lang === "python" ? KW_PY : KW_JS;
  return h
    .replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g, `<span style="color:${T.comment}">$1</span>`)
    .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, `<span style="color:${T.string}">$1</span>`)
    .replace(/\b(-?\d+\.?\d*)\b/g, `<span style="color:${T.number}">$1</span>`)
    .replace(new RegExp(`\\b(${kws.join("|")})\\b`, "g"), `<span style="color:${T.keyword}">$1</span>`)
    .replace(/\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, `<span style="color:${T.func}">$1</span>`);
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
let _addToast = () => {};
function toast(msg, type = "success") { _addToast(msg, type); }
function Toaster() {
  const [toasts, setToasts] = useState([]);
  _addToast = useCallback((msg, type) => { const id = Date.now(); setToasts(p => [...p, { id, msg, type }]); setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500); }, []);
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: t.type === "error" ? "#ff4757" : t.type === "info" ? "#2d5be3" : "#2ecc71", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", animation: "slideIn 0.2s ease", display: "flex", alignItems: "center", gap: 8 }}>
          {t.type === "error" ? "⚠" : t.type === "info" ? "ℹ" : "✓"} {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      const data = mode === "login"
        ? await api.login(form.username, form.password)
        : await api.register(form.username, form.email, form.password);
      localStorage.setItem("codesync_token", data.token);
      onAuth(data.user);
      toast(`Welcome${mode === "login" ? " back" : ""}, ${data.user.username}!`);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f0c29,#302b63,#24243e)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}.ai{width:100%;background:#1a1a2e;border:1.5px solid #2a2a4a;color:#e0e0ff;padding:12px 16px;border-radius:10px;font-size:14px;font-family:inherit;outline:none;transition:all 0.2s}.ai:focus{border-color:#6c63ff;box-shadow:0 0 0 3px rgba(108,99,255,0.15)}.ai::placeholder{color:#444}.ab{width:100%;background:linear-gradient(135deg,#6c63ff,#2d5be3);color:#fff;border:none;padding:13px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s}.ab:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 25px rgba(108,99,255,0.4)}.ab:disabled{opacity:0.6;cursor:not-allowed}@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
      <div style={{ width: 420, animation: "slideIn 0.4s ease" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, animation: "float 3s ease-in-out infinite", marginBottom: 12 }}>⚡</div>
          <h1 style={{ color: "#fff", fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>CodeSync</h1>
          <p style={{ color: "#555", fontSize: 13, marginTop: 4 }}>Real-time collaborative code editor</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "32px 36px" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #2a2a4a", marginBottom: 28 }}>
            {["login","signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{ flex: 1, padding: "10px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", color: mode === m ? "#6c63ff" : "#555", borderBottom: `2px solid ${mode === m ? "#6c63ff" : "transparent"}`, transition: "all 0.2s" }}>
                {m === "login" ? "→ Sign In" : "+ Sign Up"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input className="ai" placeholder="Username" value={form.username} onChange={set("username")} onKeyDown={e => e.key === "Enter" && submit()} />
            {mode === "signup" && <input className="ai" placeholder="Email" type="email" value={form.email} onChange={set("email")} onKeyDown={e => e.key === "Enter" && submit()} />}
            <input className="ai" placeholder="Password" type="password" value={form.password} onChange={set("password")} onKeyDown={e => e.key === "Enter" && submit()} />
            {error && <div style={{ background: "rgba(255,71,87,0.15)", border: "1px solid rgba(255,71,87,0.3)", color: "#ff6b6b", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>{error}</div>}
            <button className="ab" onClick={submit} disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Sign In →" : "Create Account →"}</button>
          </div>
          <p style={{ color: "#444", fontSize: 12, textAlign: "center", marginTop: 18 }}>
            {mode === "login" ? "No account? " : "Have an account? "}
            <span style={{ color: "#6c63ff", cursor: "pointer" }} onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
              {mode === "login" ? "Sign up free" : "Sign in"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Lobby ─────────────────────────────────────────────────────────────────────
function Lobby({ user, onJoin, onLogout }) {
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listRooms().then(d => setRooms(d.rooms || [])).catch(() => {});
  }, []);

  const createRoom = async () => {
    setLoading(true);
    try {
      const { room } = await api.createRoom();
      toast(`Room ${room.roomId} created!`);
      onJoin(room.roomId);
    } catch (e) { toast(e.message, "error"); }
    setLoading(false);
  };

  const joinRoom = () => {
    if (!roomId.trim()) return toast("Enter a room code", "error");
    onJoin(roomId.trim().toUpperCase());
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f0c29,#302b63,#24243e)", fontFamily: "'Space Grotesk',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`.lc{background:rgba(255,255,255,0.04);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px 24px;transition:all 0.2s;cursor:pointer}.lc:hover{border-color:rgba(108,99,255,0.3);background:rgba(108,99,255,0.06)}.ri{width:100%;background:#1a1a2e;border:1.5px solid #2a2a4a;color:#e0e0ff;padding:13px 18px;border-radius:12px;font-size:14px;font-family:'Fira Code',monospace;outline:none;transition:all 0.2s;letter-spacing:2px;text-transform:uppercase}.ri:focus{border-color:#6c63ff}.ri::placeholder{letter-spacing:1px;text-transform:none;color:#444}.pb{background:linear-gradient(135deg,#6c63ff,#2d5be3);color:#fff;border:none;padding:13px 24px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;white-space:nowrap}.pb:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 25px rgba(108,99,255,0.4)}.pb:disabled{opacity:0.6}`}</style>
      <header style={{ padding: "16px 32px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>CodeSync</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: user.color || "#6c63ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>{user.username[0].toUpperCase()}</div>
          <span style={{ color: "#999", fontSize: 14 }}>{user.username}</span>
          <button onClick={onLogout} style={{ background: "transparent", border: "1px solid #333", color: "#666", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Sign out</button>
        </div>
      </header>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: "100%", maxWidth: 540 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ color: "#fff", fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>Start Coding Together</h2>
            <p style={{ color: "#555", marginTop: 8 }}>Create a room or join with a code</p>
          </div>
          {/* Join */}
          <div className="lc" style={{ marginBottom: 16, cursor: "default" }}>
            <p style={{ color: "#666", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Join a Room</p>
            <div style={{ display: "flex", gap: 12 }}>
              <input className="ri" placeholder="Room code (e.g. AB1C2D)" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && joinRoom()} />
              <button className="pb" onClick={joinRoom}>Join →</button>
            </div>
          </div>
          <div style={{ textAlign: "center", color: "#333", fontSize: 13, margin: "14px 0" }}>— or —</div>
          <button className="pb" style={{ width: "100%", padding: 15, fontSize: 15 }} onClick={createRoom} disabled={loading}>
            {loading ? "Creating..." : "+ Create New Room"}
          </button>
          {/* My rooms */}
          {rooms.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <p style={{ color: "#444", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>My Rooms</p>
              {rooms.map(r => (
                <div key={r.roomId} className="lc" onClick={() => onJoin(r.roomId)} style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px" }}>
                  <div>
                    <span style={{ color: "#e0e0ff", fontFamily: "'Fira Code',monospace", fontSize: 15, fontWeight: 700 }}>{r.roomId}</span>
                    {r.name && r.name !== `Room ${r.roomId}` && <span style={{ color: "#555", fontSize: 12, marginLeft: 10 }}>{r.name}</span>}
                    <span style={{ color: "#333", fontSize: 11, marginLeft: 10 }}>{new Date(r.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <span style={{ color: "#6c63ff" }}>→</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Editor Page ───────────────────────────────────────────────────────────────
function EditorPage({ user, roomId, onLeave }) {
  const [lang, setLang] = useState("javascript");
  const [code, setCode] = useState(LANGUAGES.javascript.template);
  const [theme, setTheme] = useState("Dracula");
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(false);
  const [outputTab, setOutputTab] = useState("console");
  const [collaborators, setCollaborators] = useState([{ ...user, socketId: "me" }]);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  const socketRef = useRef(null);
  const textareaRef = useRef(null);
  const saveTimer = useRef(null);
  const codeRef = useRef(code); // keep live ref for socket callbacks
  const T = THEMES[theme];

  // ── Connect socket + load room ──────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("codesync_token");
    const socket = initSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit(EVENTS.JOIN, { roomId, lang });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => { setConnected(false); toast("Connection lost — retrying...", "error"); });

    // Joined: receive current code + users
    socket.on(EVENTS.JOINED, ({ users, code: serverCode, lang: serverLang }) => {
      if (serverCode) { setCode(serverCode); codeRef.current = serverCode; }
      if (serverLang) setLang(serverLang);
      setCollaborators(users);
    });

    // Another user's code change
    socket.on(EVENTS.CODE_CHANGE, ({ lang: changedLang, code: newCode }) => {
      if (changedLang === lang || !changedLang) {
        setCode(newCode);
        codeRef.current = newCode;
      }
    });

    // Another user changed language
    socket.on(EVENTS.LANG_CHANGE, ({ lang: newLang, code: newCode }) => {
      setLang(newLang);
      if (newCode) { setCode(newCode); codeRef.current = newCode; }
    });

    // User list updates
    socket.on(EVENTS.ROOM_USERS, ({ users }) => setCollaborators(users));
    socket.on(EVENTS.USER_LEFT, ({ username, users }) => { toast(`${username} left`, "info"); setCollaborators(users); });

    socket.on(EVENTS.ERROR, ({ message }) => toast(message, "error"));

    return () => { disconnectSocket(); };
  }, [roomId]);

  // ── Code change handler ─────────────────────────────────────────────────────
  const handleCodeChange = (e) => {
    const val = e.target.value;
    setCode(val);
    codeRef.current = val;
    setSaved(false);

    // Broadcast to collaborators
    socketRef.current?.emit(EVENTS.CODE_CHANGE, { roomId, lang, code: val });

    // Auto-save to DB after 1s idle
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveCode(lang, val), 1000);
  };

  const saveCode = async (l, c) => {
    setSaving(true);
    try {
      await api.saveCode(roomId, l, c);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    setSaving(false);
  };

  const changeLang = (newLang) => {
    saveCode(lang, codeRef.current);
    // Fetch saved code for new lang from server via socket
    socketRef.current?.emit(EVENTS.LANG_CHANGE, { roomId, lang: newLang });
    setLang(newLang);
    // Load template until server responds
    api.getRoom(roomId).then(({ room }) => {
      const saved = room.code?.[newLang];
      const newCode = saved || LANGUAGES[newLang].template;
      setCode(newCode); codeRef.current = newCode;
    }).catch(() => { const t = LANGUAGES[newLang].template; setCode(t); codeRef.current = t; });
    setOutput(null);
  };

  const runCode = () => {
    setRunning(true);
    setTimeout(() => {
      const result = LANGUAGES[lang].run(codeRef.current);
      setOutput(result);
      setOutputTab(result.isHTML ? "preview" : "console");
      setRunning(false);
      toast(result.error ? "Execution error" : "Code executed!", result.error ? "error" : "success");
    }, 250);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current, s = ta.selectionStart, en = ta.selectionEnd;
      const nc = codeRef.current.substring(0, s) + "  " + codeRef.current.substring(en);
      setCode(nc); codeRef.current = nc;
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2; }, 0);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveCode(lang, codeRef.current); toast("Saved!"); }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCode(); }
  };

  const copyRoom = () => {
    navigator.clipboard?.writeText(roomId).catch(() => {});
    setCopied(true); toast(`Room ${roomId} copied!`, "info");
    setTimeout(() => setCopied(false), 2000);
  };

  const lineNums = code.split("\n").map((_, i) => i + 1);
  const highlighted = highlight(code, lang, T);

  return (
    <div style={{ height: "100vh", background: "#0d0d14", display: "flex", flexDirection: "column", fontFamily: "'Space Grotesk',sans-serif", overflow: "hidden" }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}.lb{background:transparent;border:none;color:#666;padding:6px 10px;cursor:pointer;font-size:11px;font-weight:700;font-family:'Fira Code',monospace;border-radius:6px;transition:all 0.15s;white-space:nowrap}.lb:hover{color:#aaa;background:rgba(255,255,255,0.05)}.lb.active{color:#6c63ff;background:rgba(108,99,255,0.12)}.ib{background:transparent;border:none;color:#555;padding:7px 10px;cursor:pointer;border-radius:6px;transition:all 0.15s;font-size:13px;font-family:inherit;font-weight:600}.ib:hover{color:#aaa;background:rgba(255,255,255,0.07)}.rb{background:linear-gradient(135deg,#6c63ff,#2d5be3);color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s}.rb:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(108,99,255,0.4)}.rb:disabled{opacity:0.6;cursor:not-allowed}.ot{background:transparent;border:none;color:#555;padding:8px 14px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;border-bottom:2px solid transparent;transition:all 0.15s}.ot.active{color:#6c63ff;border-bottom-color:#6c63ff}@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite;display:inline-block}`}</style>

      {/* ── Header ── */}
      <header style={{ background: "#0d0d14", borderBottom: "1px solid #1a1a2a", padding: "0 16px", height: 50, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 18 }}>⚡</span>
        <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>CodeSync</span>
        {/* Room ID */}
        <button onClick={copyRoom} style={{ background: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.25)", color: "#6c63ff", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontFamily: "'Fira Code',monospace", cursor: "pointer", fontWeight: 700, letterSpacing: 1 }}>
          {copied ? "✓ Copied!" : `# ${roomId}`}
        </button>
        {/* Connection status */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#2ecc71" : "#ff4757", transition: "background 0.3s" }} />
          <span style={{ color: "#444", fontSize: 11 }}>{connected ? "Live" : "Connecting..."}</span>
        </div>
        {/* Save status */}
        <span style={{ color: saving ? "#ffd93d" : saved ? "#2ecc71" : "#333", fontSize: 11, fontWeight: 600, transition: "color 0.3s" }}>
          {saving ? "⟳ Saving..." : saved ? "✓ Saved" : "●"}
        </span>
        <div style={{ flex: 1 }} />
        {/* Collaborators */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {collaborators.slice(0, 5).map((c, i) => (
            <div key={c.socketId || i} title={c.username} style={{ width: 28, height: 28, borderRadius: "50%", background: c.color || "#6c63ff", border: "2px solid #0d0d14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", marginLeft: i > 0 ? -8 : 0, zIndex: collaborators.length - i }}>
              {c.username[0].toUpperCase()}
            </div>
          ))}
          {collaborators.length > 1 && <span style={{ color: "#555", fontSize: 11, marginLeft: 10 }}>{collaborators.length} online</span>}
        </div>
        <div style={{ width: 1, height: 20, background: "#1a1a2a" }} />
        <select value={theme} onChange={e => setTheme(e.target.value)} style={{ background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#888", padding: "5px 8px", borderRadius: 6, fontSize: 11, fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
          {Object.keys(THEMES).map(t => <option key={t}>{t}</option>)}
        </select>
        <button className="ib" onClick={onLeave}>← Leave</button>
      </header>

      {/* ── Language bar ── */}
      <div style={{ background: "#0a0a12", borderBottom: "1px solid #1a1a2a", padding: "0 16px", display: "flex", alignItems: "center", gap: 2, overflowX: "auto", flexShrink: 0, height: 38 }}>
        {Object.entries(LANGUAGES).map(([key, info]) => (
          <button key={key} className={`lb${lang === key ? " active" : ""}`} onClick={() => changeLang(key)}>
            {info.icon} {info.name}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="ib" style={{ fontSize: 11 }} onClick={() => setFontSize(f => Math.max(10, f - 1))}>A-</button>
        <span style={{ color: "#444", fontSize: 11, minWidth: 22, textAlign: "center" }}>{fontSize}</span>
        <button className="ib" style={{ fontSize: 11 }} onClick={() => setFontSize(f => Math.min(24, f + 1))}>A+</button>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Code area ── */}
        <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", borderRight: "1px solid #1a1a2a", overflow: "hidden" }}>
          <div style={{ flex: 1, position: "relative", background: T.bg, overflow: "auto" }}>
            <div style={{ display: "flex", minHeight: "100%" }}>
              {/* Line numbers */}
              <div style={{ flexShrink: 0, background: T.bg, padding: "14px 0", userSelect: "none", borderRight: `1px solid ${T.border}`, position: "sticky", left: 0 }}>
                {lineNums.map(n => (
                  <div key={n} style={{ color: T.comment, fontSize: fontSize - 1, lineHeight: 1.6, textAlign: "right", padding: "0 12px", fontFamily: "'Fira Code',monospace", opacity: 0.5 }}>{n}</div>
                ))}
              </div>
              {/* Highlight + Textarea */}
              <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
                <pre style={{ position: "absolute", inset: 0, padding: "14px 16px", margin: 0, fontSize: fontSize, lineHeight: 1.6, fontFamily: "'Fira Code',monospace", color: T.text, background: "transparent", whiteSpace: wordWrap ? "pre-wrap" : "pre", pointerEvents: "none", overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: highlighted + "\n" }} />
                <textarea
                  ref={textareaRef}
                  value={code}
                  onChange={handleCodeChange}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: "14px 16px", fontSize: fontSize, lineHeight: 1.6, fontFamily: "'Fira Code',monospace", color: "transparent", background: "transparent", border: "none", outline: "none", resize: "none", caretColor: T.accent, whiteSpace: wordWrap ? "pre-wrap" : "pre", zIndex: 1 }}
                />
              </div>
            </div>
          </div>
          {/* Editor footer */}
          <div style={{ background: "#0a0a12", borderTop: "1px solid #1a1a2a", padding: "6px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#444", fontSize: 11 }}>{LANGUAGES[lang].name} · {code.split("\n").length} lines · {code.length} chars</span>
            <div style={{ flex: 1 }} />
            <label style={{ color: "#555", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              <input type="checkbox" checked={wordWrap} onChange={e => setWordWrap(e.target.checked)} /> Wrap
            </label>
            <button className="rb" onClick={runCode} disabled={running}>
              {running ? <span className="spin">⟳</span> : "▶"} {running ? "Running..." : "Run"}
            </button>
          </div>
        </div>

        {/* ── Output panel ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0a12", overflow: "hidden" }}>
          <div style={{ borderBottom: "1px solid #1a1a2a", padding: "0 16px", display: "flex", alignItems: "center", height: 38 }}>
            <button className={`ot${outputTab === "console" ? " active" : ""}`} onClick={() => setOutputTab("console")}>Console</button>
            <button className={`ot${outputTab === "preview" ? " active" : ""}`} onClick={() => setOutputTab("preview")}>Preview</button>
            <div style={{ flex: 1 }} />
            {output && <button className="ib" style={{ fontSize: 11 }} onClick={() => setOutput(null)}>✕ Clear</button>}
          </div>
          <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
            {!output && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#2a2a3a", gap: 12, textAlign: "center" }}>
                <span style={{ fontSize: 36 }}>▶</span>
                <p style={{ fontSize: 13 }}>Run code to see output</p>
                <p style={{ fontSize: 11, color: "#1a1a2a" }}>Ctrl+Enter to run · Ctrl+S to save</p>
              </div>
            )}
            {output && outputTab === "console" && (
              <div style={{ padding: 16, fontFamily: "'Fira Code',monospace", fontSize: 13, lineHeight: 1.7 }}>
                {output.error
                  ? <div><div style={{ fontSize: 10, fontWeight: 700, color: "#ff4757", letterSpacing: 1, marginBottom: 8 }}>ERROR</div><pre style={{ color: "#ff6b6b", whiteSpace: "pre-wrap" }}>{output.error}</pre></div>
                  : <div><div style={{ fontSize: 10, fontWeight: 700, color: "#2ecc71", letterSpacing: 1, marginBottom: 8 }}>OUTPUT</div>
                      {output.isHTML
                        ? <span style={{ color: "#555", fontSize: 12 }}>← Switch to Preview tab</span>
                        : <pre style={{ color: "#a0ffa0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{output.output || "(no output)"}</pre>}
                    </div>}
              </div>
            )}
            {output && outputTab === "preview" && (
              output.isHTML
                ? <iframe srcDoc={output.output} style={{ width: "100%", height: "100%", border: "none", background: "#fff" }} sandbox="allow-scripts" title="preview" />
                : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#333", fontSize: 13 }}>No visual preview for {LANGUAGES[lang].name}</div>
            )}
          </div>
          <div style={{ borderTop: "1px solid #1a1a2a", padding: "6px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#2a2a3a", fontSize: 11, fontFamily: "'Fira Code',monospace" }}>room/{roomId}</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: "#2a2a3a", fontSize: 11 }}>auto-save: 1s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from token
    const token = localStorage.getItem("codesync_token");
    if (token) {
      api.me().then(({ user }) => { setUser(user); setLoading(false); }).catch(() => { localStorage.removeItem("codesync_token"); setLoading(false); });
    } else {
      setLoading(false);
    }
  }, []);

  const logout = () => { localStorage.removeItem("codesync_token"); setUser(null); setRoomId(null); disconnectSocket(); };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0f0c29", display: "flex", alignItems: "center", justifyContent: "center", color: "#6c63ff", fontSize: 36 }}>⚡</div>
  );

  return (
    <>
      <Toaster />
      {!user   && <AuthScreen onAuth={setUser} />}
      {user && !roomId && <Lobby user={user} onJoin={setRoomId} onLogout={logout} />}
      {user && roomId  && <EditorPage user={user} roomId={roomId} onLeave={() => setRoomId(null)} />}
    </>
  );
}
