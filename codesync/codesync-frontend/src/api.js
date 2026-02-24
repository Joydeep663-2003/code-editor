const BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

const tok = () => localStorage.getItem("codesync_token");

async function req(method, path, body) {
  const headers = {
    "Content-Type": "application/json",
  };

  const t = tok();
  if (t) headers["Authorization"] = "Bearer " + t;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || "Request failed");

  return data;
}

export const api = {
  register: (username, email, password) =>
    req("POST", "/api/auth/register", { username, email, password }),

  login: (username, password) =>
    req("POST", "/api/auth/login", { username, password }),

  me: () =>
    req("GET", "/api/auth/me"),

  createRoom: (name) =>
    req("POST", "/api/rooms", { name: name || "" }),

  getRoom: (roomId) =>
    req("GET", "/api/rooms/" + roomId),

  listRooms: () =>
    req("GET", "/api/rooms"),

  saveCode: (roomId, lang, code) =>
    req("PATCH", "/api/rooms/" + roomId + "/code", { lang, code }),
};