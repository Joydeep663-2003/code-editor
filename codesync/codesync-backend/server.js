const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/codesync")
  .then(() => console.log("MongoDB connected"))
  .catch(e => console.warn("MongoDB error:", e.message));

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true, trim: true },
  email: { type: String, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  color: { type: String, default: "#6c63ff" },
  createdAt: { type: Date, default: Date.now },
});
UserSchema.pre("save", async function() {
  if (this.isModified("password")) this.password = await bcrypt.hash(this.password, 10);
});
const User = mongoose.model("User", UserSchema);

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, unique: true, required: true },
  name: { type: String, default: "" },
  owner: { type: String },
  code: { type: Map, of: String, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Room = mongoose.model("Room", RoomSchema);

const JWT_SECRET = process.env.JWT_SECRET || "codesync_secret";
const sign = p => jwt.sign(p, JWT_SECRET, { expiresIn: "7d" });
const verify = t => jwt.verify(t, JWT_SECRET);

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try { req.user = verify(token); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

const COLORS = ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f1c","#2ec4b6","#e71d36"];
function avatarColor(s) { let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))%COLORS.length; return COLORS[h]; }

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username||!email||!password) return res.status(400).json({ error: "All fields required" });
    if (password.length < 6) return res.status(400).json({ error: "Password min 6 chars" });
    const color = avatarColor(username);
    const user = await User.create({ username, email, password, color });
    const token = sign({ id: user._id, username: user.username, email: user.email, color });
    res.status(201).json({ token, user: { id: user._id, username: user.username, email: user.email, color } });
  } catch(e) {
    if (e.code === 11000) { const f = Object.keys(e.keyValue)[0]; return res.status(409).json({ error: f + " already taken" }); }
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username||!password) return res.status(400).json({ error: "Fields required" });
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ error: "Invalid credentials" });
    const token = sign({ id: user._id, username: user.username, email: user.email, color: user.color });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, color: user.color } });
  } catch { res.status(500).json({ error: "Server error" }); }
});

app.get("/api/auth/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ user });
});

app.post("/api/rooms", auth, async (req, res) => {
  try {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = await Room.create({ roomId, name: req.body.name || ("Room " + roomId), owner: req.user.username });
    res.status(201).json({ room });
  } catch { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/rooms", auth, async (req, res) => {
  const rooms = await Room.find({ owner: req.user.username }).sort({ updatedAt: -1 }).limit(10).select("-code");
  res.json({ rooms });
});

app.get("/api/rooms/:roomId", auth, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.roomId });
  if (!room) return res.status(404).json({ error: "Not found" });
  res.json({ room });
});

app.patch("/api/rooms/:roomId/code", auth, async (req, res) => {
  try {
    const { lang, code } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ error: "Not found" });
    room.code.set(lang, code);
    room.updatedAt = new Date();
    await room.save();
    res.json({ saved: true });
  } catch { res.status(500).json({ error: "Save failed" }); }
});

app.delete("/api/rooms/:roomId", auth, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.roomId });
  if (!room) return res.status(404).json({ error: "Not found" });
  if (room.owner !== req.user.username) return res.status(403).json({ error: "Owner only" });
  await room.deleteOne();
  res.json({ deleted: true });
});
app.get("/", (req, res) => {
  res.send("🚀 CodeSync Backend is Running");
});

app.get("/api/health", (_, res) => res.json({ status: "ok" }));

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:3000", methods: ["GET","POST"], credentials: true }
});

io.use((socket, next) => {
  try { socket.user = verify(socket.handshake.auth?.token); next(); }
  catch { next(new Error("Auth required")); }
});

const roomUsers = {};
const EV = { JOIN:"join", JOINED:"joined", USER_LEFT:"user_left", CODE_CHANGE:"code_change", LANG_CHANGE:"lang_change", ROOM_USERS:"room_users", ERROR:"error" };
const TPL = {
  javascript: "// JavaScript\nconsole.log('Hello, CodeSync!');",
  typescript: "// TypeScript\nconst greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet('CodeSync'));",
  python: "# Python\nprint('Hello, CodeSync!')",
  html: "<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello CodeSync!</h1>\n</body>\n</html>",
  css: "body {\n  background: #1a1a2e;\n  color: #eee;\n  font-family: sans-serif;\n}",
  json: '{\n  "name": "CodeSync",\n  "version": "2.0.0"\n}',
  sql: "SELECT * FROM users WHERE active = true;",
  markdown: "# Hello CodeSync\n\nStart collaborating!"
};

io.on("connection", socket => {
  console.log("Connected:", socket.user.username);
  socket.on(EV.JOIN, async ({ roomId, lang = "javascript" }) => {
    try {
      let room = await Room.findOne({ roomId });
      if (!room) room = await Room.create({ roomId, name: "Room " + roomId, owner: socket.user.username });
      socket.join(roomId);
      if (!roomUsers[roomId]) roomUsers[roomId] = {};
      roomUsers[roomId][socket.id] = { username: socket.user.username, color: socket.user.color, socketId: socket.id };
      const users = Object.values(roomUsers[roomId]);
      const code = room.code.get(lang) || TPL[lang] || "";
      socket.emit(EV.JOINED, { users, code, lang });
      socket.to(roomId).emit(EV.ROOM_USERS, { users });
    } catch { socket.emit(EV.ERROR, { message: "Join failed" }); }
  });
  socket.on(EV.CODE_CHANGE, ({ roomId, lang, code }) => socket.to(roomId).emit(EV.CODE_CHANGE, { lang, code }));
  socket.on(EV.LANG_CHANGE, async ({ roomId, lang }) => {
    try {
      const room = await Room.findOne({ roomId });
      const code = room?.code.get(lang) || TPL[lang] || "";
      socket.to(roomId).emit(EV.LANG_CHANGE, { lang, code });
    } catch {}
  });
  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      if (roomUsers[roomId]) {
        delete roomUsers[roomId][socket.id];
        const users = Object.values(roomUsers[roomId]);
        socket.to(roomId).emit(EV.USER_LEFT, { username: socket.user.username, users });
        if (!users.length) delete roomUsers[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("CodeSync backend running on http://localhost:" + PORT));
