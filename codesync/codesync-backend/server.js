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
   ENV SAFETY CHECK
========================= */

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing in environment variables");
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI is missing in environment variables");
  process.exit(1);
}

if (!process.env.CLIENT_URL) {
  console.error("❌ CLIENT_URL is missing in environment variables");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

/* =========================
   CORS CONFIG
========================= */

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (
      origin === process.env.CLIENT_URL ||
      origin === "http://localhost:3000" ||
      origin.includes("vercel.app")
    ) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.options("*", cors());
app.use(express.json());

/* =========================
   DATABASE CONNECTION
========================= */

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB error:", err.message);
  });

/* =========================
   USER MODEL
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

/* =========================
   JWT HELPER
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

/* =========================
   REGISTER
========================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const user = await User.create({ username, email, password });

    const token = signToken({
      id: user._id,
      username: user.username,
      email: user.email,
      color: user.color
    });

    res.status(201).json({ token, user });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "User already exists" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Fields required" });
    }

    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

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
  console.log("🟢 User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

/* =========================
   START SERVER
========================= */

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});