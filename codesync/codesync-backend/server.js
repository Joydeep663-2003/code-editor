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
const PORT = process.env.PORT || 5000;

/* =========================
   ENV CHECK
========================= */

if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

/* =========================
   CORS (PRODUCTION SAFE)
========================= */

app.use(cors({
  origin: true, // allow all origins (safe for Vercel + Render)
  credentials: true
}));

app.options("*", cors());
app.use(express.json());

/* =========================
   DATABASE
========================= */

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err.message));

/* =========================
   MODELS
========================= */

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true, trim: true },
  email: { type: String, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  color: { type: String, default: "#6c63ff" }
});

UserSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

const User = mongoose.model("User", UserSchema);

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, unique: true },
  name: { type: String, default: "" },
  code: { type: Object, default: {} },
  updatedAt: { type: Date, default: Date.now }
});

const Room = mongoose.model("Room", RoomSchema);

/* =========================
   JWT
========================= */

const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

/* =========================
   ROUTES
========================= */

app.get("/", (_, res) => {
  res.send("🚀 CodeSync Backend Running");
});

app.get("/api/health", (_, res) => {
  res.json({ status: "ok" });
});

/* ---------- GET CURRENT USER ---------- */

app.get("/api/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    res.json({ user });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

/* ---------- AUTH ---------- */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: "All fields required" });

    const user = await User.create({ username, email, password });

    const token = signToken({ id: user._id });

    res.status(201).json({ token, user });

  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ error: "User already exists" });

    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Fields required" });

    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ id: user._id });

    res.json({ token, user });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- ROOMS ---------- */

app.get("/api/rooms", async (_, res) => {
  const rooms = await Room.find().sort({ updatedAt: -1 });
  res.json({ rooms });
});

app.post("/api/rooms", async (_, res) => {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = await Room.create({ roomId });
  res.status(201).json({ room });
});

app.get("/api/rooms/:roomId", async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.roomId });
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({ room });
});

app.post("/api/rooms/:roomId/code", async (req, res) => {
  const { lang, code } = req.body;

  const room = await Room.findOne({ roomId: req.params.roomId });
  if (!room) return res.status(404).json({ error: "Room not found" });

  room.code[lang] = code;
  room.updatedAt = new Date();
  await room.save();

  res.json({ success: true });
});

/* =========================
   SOCKET.IO
========================= */

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.on("join", ({ roomId }) => {
    socket.join(roomId);
  });

  socket.on("code_change", ({ roomId, code }) => {
    socket.to(roomId).emit("code_change", { code });
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
  });
});

/* =========================
   START SERVER
========================= */

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
}); 