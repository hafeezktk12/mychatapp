// server.js (replace your file with this)
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const users = {}; // username -> socket.id

// MySQL connection
const db = mysql.createPool({
  host: process.env.DB_HOST,      // Railway host
  user: process.env.DB_USER,      // Railway username
  password: process.env.DB_PASSWORD, // Railway password
  database: process.env.DB_NAME,  // Railway database name
  port: process.env.DB_PORT       // Railway port
});


// Keep admin names lowercase for consistent checks
const admins = new Set(["hafeez", "adminUser"].map((s) => s.toLowerCase()));
const mutedUsers = new Set();

// Utility: check if admin (case-insensitive)
function isAdmin(username) {
  return !!(username && admins.has(username.toLowerCase()));
}

// Format timestamp
function formatTimestamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // ---- join
  socket.on("join", async (username) => {
    if (!username) return;
    username = String(username).trim();
    socket.username = username;
    users[username] = socket.id;
    console.log("JOIN:", username, "->", socket.id);

    io.emit("userList", Object.keys(users));
    socket.emit("yourId", socket.id);

    // admin status
    if (isAdmin(username)) {
      socket.emit("adminStatus", true);
    }

    // Load last 50 public messages (include id)
    try {
      const [rows] = await db.query(
        "SELECT id, sender AS `from`, text, time FROM messages WHERE type='public' ORDER BY id DESC LIMIT 50"
      );
      socket.emit("loadOldMessages", rows.reverse());
    } catch (err) {
      console.error("DB fetch error:", err);
    }
  });

  // ---- public message
  socket.on("publicMessage", async (data) => {
    if (!socket.username) return;
    if (mutedUsers.has(socket.username)) {
      socket.emit("muted", "You are muted by an admin.");
      return;
    }

    const msg = {
      from: socket.username,
      text: data.text,
      time: formatTimestamp(),
    };

    try {
      const [res] = await db.query(
        "INSERT INTO messages (type, sender, text, time) VALUES (?,?,?,?)",
        ["public", msg.from, msg.text, msg.time]
      );
      msg.id = res && res.insertId ? res.insertId : Date.now();
    } catch (err) {
      console.error("DB insert error:", err);
      msg.id = Date.now();
    }

    io.emit("publicMessage", msg);
  });

  // ---- private message
  socket.on("privateMessage", async ({ to, msg }) => {
    if (!socket.username) return;
    if (mutedUsers.has(socket.username)) {
      socket.emit("muted", "You are muted by an admin.");
      return;
    }

    const toSocketId = users[to];
    const payload = {
      from: socket.username,
      text: msg.text,
      time: formatTimestamp(),
      to,
    };

    try {
      await db.query(
        "INSERT INTO messages (type, sender, receiver, text, time) VALUES (?,?,?,?,?)",
        ["private", payload.from, to, payload.text, payload.time]
      );
    } catch (err) {
      console.error("DB insert error:", err);
    }

    if (toSocketId) {
      io.to(toSocketId).emit("privateMessage", payload);
      socket.emit("privateMessage", payload); // echo back to sender
    } else {
      socket.emit("userNotFound", to);
    }
  });

  // ---- load private messages
  socket.on("loadPrivateMessages", async (partner) => {
    if (!socket.username) return;
    try {
      const [rows] = await db.query(
        "SELECT id, sender AS `from`, receiver, text, time FROM messages WHERE type='private' AND ((sender=? AND receiver=?) OR (sender=? AND receiver=?)) ORDER BY id ASC",
        [socket.username, partner, partner, socket.username]
      );
      socket.emit("loadOldPrivateMessages", { partner, messages: rows });
    } catch (err) {
      console.error("DB fetch error (private):", err);
    }
  });

  // ---- ADMIN COMMANDS ----
  socket.on("kickUser", (target) => {
    if (!isAdmin(socket.username)) {
      socket.emit("actionResult", { ok: false, msg: "Not an admin." });
      return;
    }
    if (!target || !users[target]) {
      socket.emit("actionResult", { ok: false, msg: "Target not online." });
      return;
    }
    const targetSocketId = users[target];
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit("kicked", "You were kicked by an admin.");
      try {
        targetSocket.disconnect(true);
      } catch (e) {
        console.warn("disconnect error:", e);
      }
    }
    delete users[target];
    io.emit("userList", Object.keys(users));
    socket.emit("actionResult", { ok: true, msg: `Kicked ${target}` });
  });

  socket.on("muteUser", (target) => {
    if (!isAdmin(socket.username)) {
      socket.emit("actionResult", { ok: false, msg: "Not an admin." });
      return;
    }
    mutedUsers.add(target);
    if (users[target])
      io.to(users[target]).emit("muted", "You were muted by an admin.");
    socket.emit("actionResult", { ok: true, msg: `Muted ${target}` });
  });

  socket.on("unmuteUser", (target) => {
    if (!isAdmin(socket.username)) {
      socket.emit("actionResult", { ok: false, msg: "Not an admin." });
      return;
    }
    mutedUsers.delete(target);
    if (users[target])
      io.to(users[target]).emit("unmuted", "You were unmuted by an admin.");
    socket.emit("actionResult", { ok: true, msg: `Unmuted ${target}` });
  });

  socket.on("promoteUser", (target) => {
    if (!isAdmin(socket.username)) {
      socket.emit("actionResult", { ok: false, msg: "Not an admin." });
      return;
    }
    if (!target) {
      socket.emit("actionResult", { ok: false, msg: "No target provided." });
      return;
    }
    admins.add(target.toLowerCase());
    if (users[target]) {
      io.to(users[target]).emit("adminStatus", true);
    }
    socket.emit("actionResult", {
      ok: true,
      msg: `Promoted ${target} to admin`,
    });
  });

  socket.on("deletePublicMessage", async (msgId) => {
    if (!isAdmin(socket.username)) {
      socket.emit("actionResult", { ok: false, msg: "Not an admin." });
      return;
    }
    try {
      await db.query("DELETE FROM messages WHERE id=?", [msgId]);
      io.emit("deletePublicMessage", msgId);
      socket.emit("actionResult", {
        ok: true,
        msg: `Deleted message ${msgId}`,
      });
    } catch (err) {
      console.error("Delete error:", err);
      socket.emit("actionResult", { ok: false, msg: "DB delete failed." });
    }
  });

  // ✅ NEW: delete all public messages
  socket.on("deleteAllPublicMessages", async () => {
    if (!isAdmin(socket.username)) {
      socket.emit("actionResult", { ok: false, msg: "Not an admin." });
      return;
    }
    try {
      await db.query("DELETE FROM messages WHERE type='public'");
      io.emit("deletePublicMessage", "all"); // tell all clients to clear UI
      socket.emit("actionResult", {
        ok: true,
        msg: "All public messages deleted.",
      });
    } catch (err) {
      console.error("Delete all public messages error:", err);
      socket.emit("actionResult", {
        ok: false,
        msg: "Failed to delete all messages.",
      });
    }
  });

  socket.on("viewPrivateMessages", async ({ user1, user2 }) => {
    if (!isAdmin(socket.username)) {
      socket.emit("actionResult", { ok: false, msg: "Not an admin." });
      return;
    }
    try {
      const [rows] = await db.query(
        "SELECT id, sender, receiver, text, time FROM messages WHERE type='private' AND ((sender=? AND receiver=?) OR (sender=? AND receiver=?)) ORDER BY id ASC",
        [user1, user2, user2, user1]
      );
      socket.emit("privateMessagesView", { user1, user2, messages: rows });
    } catch (err) {
      console.error(err);
      socket.emit("actionResult", { ok: false, msg: "DB fetch failed." });
    }
  });

  // ---- disconnect
  socket.on("disconnect", () => {
    if (socket.username) {
      delete users[socket.username];
      io.emit("userList", Object.keys(users));
    }
  });
});

// Test DB connection
db.getConnection()
  .then((conn) => {
    console.log("✅ MySQL connected successfully");
    conn.release();
  })
  .catch((err) => {
    console.error("❌ MySQL connection failed:", err);
  });

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
