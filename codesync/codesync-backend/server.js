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

if (!process.env.JWT_SECRET || !process.env.MONGODB_URI || !process.env.CLIENT_URL) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

/* =========================
   MIDDLEWARE
========================= */

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));

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

// User
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

// Room
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

/* ---------- AUTH ---------- */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: "All fields required" });

    const user = await User.create({ username, email, password });

    const token = signToken({
      id: user._id,
      username: user.username,
      email: user.email,
      color: user.color
    });

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

    const token = signToken({
      id: user._id,
      username: user.username,
      email: user.email,
      color: user.color
    });

    res.json({ token, user });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- ROOMS ---------- */

// Get all rooms
app.get("/api/rooms", async (_, res) => {
  try {
    const rooms = await Room.find().sort({ updatedAt: -1 });
    res.json({ rooms });
  } catch {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// Create room
app.post("/api/rooms", async (_, res) => {
  try {
    const roomId = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    const room = await Room.create({
      roomId,
      name: `Room ${roomId}`
    });

    res.status(201).json({ room });

  } catch {
    res.status(500).json({ error: "Failed to create room" });
  }
});

/* =========================
   SOCKET.IO
========================= */

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true
  }
});

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

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