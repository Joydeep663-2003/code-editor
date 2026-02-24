const BASE =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

const getToken = () => localStorage.getItem("codesync_token");

async function request(method, path, body) {
  const headers = {
    "Content-Type": "application/json",
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

export const api = {
  /* ================= AUTH ================= */

  register: (username, email, password) =>
    request("POST", "/api/auth/register", {
      username,
      email,
      password,
    }),

  login: (username, password) =>
    request("POST", "/api/auth/login", {
      username,
      password,
    }),

  me: () =>
    request("GET", "/api/me"),

  /* ================= ROOMS ================= */

  listRooms: () =>
    request("GET", "/api/rooms"),

  createRoom: () =>
    request("POST", "/api/rooms"),

  getRoom: (roomId) =>
    request("GET", `/api/rooms/${roomId}`),

  saveCode: (roomId, lang, code) =>
    request("POST", `/api/rooms/${roomId}/code`, {
      lang,
      code,
    }),

  /* ================= HEALTH ================= */

  health: () =>
    request("GET", "/api/health"),
};