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

/* =========================
   ✅ FIXED CORS CONFIG
========================= */

const allowedOrigins = [
  "http://localhost:3000",
  "https://code-editor-seven-tawny.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow Postman / server requests

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS: " + origin));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors()); // handle preflight

app.use(express.json());

/* =========================
   DATABASE
========================= */

mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/codesync")
  .then(() => console.log("MongoDB connected"))
  .catch(e => console.warn("MongoDB error:", e.message));

/* =========================
   MODELS
========================= */

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true, trim: true },
  email: { type: String, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  color: { type: String, default: "#6c63ff" },
  createdAt: { type: Date, default: Date.now },
});

UserSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
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

/* =========================
   AUTH
========================= */

const JWT_SECRET = process.env.JWT_SECRET || "codesync_secret";
const sign = (p) => jwt.sign(p, JWT_SECRET, { expiresIn: "7d" });
const verify = (t) => jwt.verify(t, JWT_SECRET);

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    req.user = verify(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/* =========================
   ROUTES
========================= */

app.get("/", (_, res) => {
  res.send("🚀 CodeSync Backend is Running");
});

app.get("/api/health", (_, res) => {
  res.json({ status: "ok" });
});

/* REGISTER */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: "All fields required" });

    if (password.length < 6)
      return res.status(400).json({ error: "Password min 6 chars" });

    const user = await User.create({ username, email, password });

    const token = sign({
      id: user._id,
      username: user.username,
      email: user.email,
      color: user.color,
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        color: user.color,
      },
    });

  } catch (e) {
    if (e.code === 11000) {
      const f = Object.keys(e.keyValue)[0];
      return res.status(409).json({ error: f + " already taken" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

/* LOGIN */

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Fields required" });

    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: "Invalid credentials" });

    const token = sign({
      id: user._id,
      username: user.username,
      email: user.email,
      color: user.color,
    });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        color: user.color,
      },
    });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   SOCKET.IO (FIXED CORS)
========================= */

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log("CodeSync backend running on http://localhost:" + PORT)
);