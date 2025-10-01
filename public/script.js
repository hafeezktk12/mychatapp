// ---------------------- Full script.js (safe merged) ----------------------
let unseenPerChat = { public: 0 }; // track unseen messages per chat (public + private)
const socket = io();

let isAdmin = false;
let selectedUser = null; // user selected by admin menu
let myName = null;
let currentChat = null; // 'public' or username

// ---------------------- DOM references ----------------------
const sidebar = document.getElementById("sidebar");
const chatWindow = document.getElementById("chatWindow");
const chatList = document.getElementById("chatList");
const chatUserEl = document.getElementById("chatUser");
const headerAvatar = document.getElementById("headerAvatar");
const messagesEl = document.getElementById("messages");
const backBtn = document.getElementById("backBtn");
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");

// optional admin UI elements in HTML (script won't fail if absent)
const adminMenuEl = document.getElementById("adminMenu"); // static admin menu div (optional)
const adminControlsEl = document.getElementById("adminControls"); // static admin controls (optional)
const deleteUserMessagesBtn = document.getElementById("deleteUserMessagesBtn");
const deleteAllBtn = document.getElementById("deleteAllBtn");

// ---------------------- Local message store ----------------------
const store = {
  public: [],
  private: {}, // private[partner] = [{from,text,time,...}, ...]
};

// ---------------------- Helpers ----------------------
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleString("default", { month: "short" });
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

// ---------------------- Admin actions ----------------------
function kickUser(target) {
  if (!target) target = prompt("Kick who?");
  if (target) socket.emit("kickUser", target);
}
function muteUser(target) {
  if (!target) target = prompt("Mute who?");
  if (target) socket.emit("muteUser", target);
}
function unmuteUser(target) {
  if (!target) target = prompt("Unmute who?");
  if (target) socket.emit("unmuteUser", target);
}
function promoteUser(target) {
  if (!target) target = prompt("Promote who?");
  if (target) socket.emit("promoteUser", target);
}
function demoteUser(target) {
  if (!target) target = prompt("Demote who?");
  if (target) socket.emit("demoteUser", target);
}

// delete one public message by id (admin)
function deletePublic() {
  const msgId = prompt("Enter message ID to delete:");
  const id = parseInt(msgId);
  if (!isNaN(id)) socket.emit("deletePublicMessage", id);
}

// delete all public messages (admin)
function deleteAllPublicMessages() {
  if (!isAdmin) return alert("Not an admin.");
  if (confirm("Delete ALL public messages?")) {
    socket.emit("deleteAllPublicMessages");
    store.public = []; // optimistic UI update
    renderMessages();
  }
}

// delete all public messages from a user (admin)
function deleteUserMessages(targetUser) {
  const user =
    targetUser || selectedUser || prompt("Delete messages of which user?");
  if (!user) return;
  if (!isAdmin) return alert("Not an admin.");
  if (confirm(`Delete all public messages from ${user}?`)) {
    socket.emit("deleteUserMessages", user); // server may handle this if implemented
    if (store.public && Array.isArray(store.public)) {
      store.public = store.public.filter(
        (m) => String(m.from) !== String(user)
      );
      if (currentChat === "public") renderMessages();
    }
  }
}

function spyMessages() {
  const u1 = prompt("User 1?");
  const u2 = prompt("User 2?");
  socket.emit("viewPrivateMessages", { user1: u1, user2: u2 });
}

// ---------------------- Socket listeners for admin & messages ----------------------
socket.on("adminStatus", (status) => {
  isAdmin = !!status;
  updateAdminControls();
});

function updateAdminControls() {
  if (!adminControlsEl) return;

  if (isAdmin) {
    // Show admin controls only when toggle button clicked
    adminControlsEl.style.display = "none"; // hide by default

    // Show correct button depending on chat
    if (currentChat === "public") {
      deleteAllBtn.style.display = "inline-block";
      deleteUserMessagesBtn.style.display = "none";
    } else {
      deleteAllBtn.style.display = "none";
      deleteUserMessagesBtn.style.display = "inline-block";
    }
  } else {
    adminControlsEl.style.display = "none";
  }
}

socket.on("privateMessagesView", ({ user1, user2, messages }) => {
  console.log(`Private chat between ${user1} and ${user2}`, messages);
});

socket.on("kicked", (msg) => alert(msg));
socket.on("muted", (msg) => alert(msg));
socket.on("unmuted", (msg) => alert(msg));
socket.on("promoted", (msg) => alert(msg));

socket.on("deletePublicMessage", (msgId) => {
  const el = document.querySelector(`[data-id='${msgId}']`);
  if (el) el.remove();
  if (store.public && Array.isArray(store.public)) {
    store.public = store.public.filter((m) => String(m.id) !== String(msgId));
  }
  if (currentChat === "public") renderMessages();
});

socket.on("deleteAllPublicMessages", () => {
  store.public = [];
  renderMessages();
});

socket.on("actionResult", (res) => {
  if (!res) return;
  alert(res.msg || (res.ok ? "Done" : "Error"));
});

// ---------------------- Notifications & unlock audio ----------------------
const notificationSound = new Audio("notification.mp3");
let audioUnlocked = false;
function unlockAudio() {
  if (!audioUnlocked) {
    notificationSound.play().catch(() => {});
    notificationSound.pause();
    notificationSound.currentTime = 0;
    audioUnlocked = true;
  }
}
window.addEventListener("click", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

// ---------------------- UI: add message to DOM ----------------------
function addMessageToUI(msgObj, outgoing = false) {
  const div = document.createElement("div");
  div.className = "message " + (outgoing ? "outgoing" : "incoming");
  if (msgObj.id) div.dataset.id = msgObj.id;

  let adminControls = "";
  if (isAdmin && currentChat === "public") {
    adminControls = `<button class="delete-msg-btn" data-id="${msgObj.id}">🗑️</button>`;
  }

  div.innerHTML = `
    <div class="msg-header">
      <strong class="username">${escapeHtml(
        msgObj.from
      )}</strong>: ${escapeHtml(msgObj.text)}
    </div>
    <span class="meta">${escapeHtml(msgObj.time)}</span>
    ${adminControls}
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // per-message delete (admin)
  if (isAdmin && currentChat === "public" && msgObj.id) {
    const btn = div.querySelector(".delete-msg-btn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Delete this message?")) {
          socket.emit("deletePublicMessage", msgObj.id);
        }
      });
    }
  }

  // clicking username inside chat triggers admin options (if admin)
  if (isAdmin && msgObj.from !== myName) {
    const nameEl = div.querySelector(".username");
    if (nameEl) {
      nameEl.style.cursor = "pointer";
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        showUserOptions(msgObj.from, e.pageX, e.pageY);
      });
    }
  }
}

// ---------------------- Update chat badge ----------------------
function updateChatBadge(chat) {
  const item =
    chat === "public"
      ? chatList.querySelector(".chat-item[data-type='public']")
      : chatList.querySelector(`.chat-item[data-user='${chat}']`);
  if (!item) return;

  let badge = item.querySelector(".badge");
  if (unseenPerChat[chat] > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "badge";
      item.appendChild(badge);
    }
    badge.textContent = unseenPerChat[chat] > 99 ? "99+" : unseenPerChat[chat];
  } else {
    if (badge) badge.remove();
  }
}

// ---------------------- Show admin options (static adminMenu or dynamic popup) ----------------------
function showUserOptions(username, x, y) {
  selectedUser = username;

  if (!isAdmin || username === myName) return; // never show for self

  // Static adminMenu (if present)
  if (adminMenuEl) {
    adminMenuEl.style.top = y + "px";
    adminMenuEl.style.left = x + "px";
    adminMenuEl.style.display = "block";
    return;
  }

  // Fallback to dynamic popup
  const existing = document.querySelector(".popup-menu");
  if (existing) existing.remove();

  const options = document.createElement("div");
  options.className = "popup-menu";
  options.style.top = y + "px";
  options.style.left = x + "px";
  options.innerHTML = `
    <button class="popup-kick">Kick</button>
    <button class="popup-mute">Mute</button>
    <button class="popup-unmute">Unmute</button>
    <button class="popup-promote">Promote</button>
    <button class="popup-demote">Demote</button>
  `;
  document.body.appendChild(options);

  // attach events
  options.querySelector(".popup-kick").addEventListener("click", () => {
    kickUser(username);
    options.remove();
  });
  options.querySelector(".popup-mute").addEventListener("click", () => {
    muteUser(username);
    options.remove();
  });
  options.querySelector(".popup-unmute").addEventListener("click", () => {
    unmuteUser(username);
    options.remove();
  });
  options.querySelector(".popup-promote").addEventListener("click", () => {
    promoteUser(username);
    options.remove();
  });
  options.querySelector(".popup-demote").addEventListener("click", () => {
    demoteUser(username);
    options.remove();
  });

  // remove popup when clicking outside
  document.addEventListener(
    "click",
    (ev) => {
      if (!ev.target.closest(".popup-menu")) options.remove();
    },
    { once: true }
  );
}

// Hide static adminMenu when clicking outside
document.addEventListener("click", (e) => {
  if (adminMenuEl) {
    if (
      !e.target.closest("#adminMenu") &&
      !e.target.closest(".chat-item") &&
      !e.target.classList.contains("username")
    ) {
      adminMenuEl.style.display = "none";
    }
  }
});

// remove dynamic popups on scroll/resize
window.addEventListener("scroll", () => {
  const existing = document.querySelector(".popup-menu");
  if (existing) existing.remove();
});
window.addEventListener("resize", () => {
  const existing = document.querySelector(".popup-menu");
  if (existing) existing.remove();
  if (adminMenuEl) adminMenuEl.style.display = "none";
});

// If static admin menu buttons exist, wire them (they act on selectedUser)
if (adminMenuEl) {
  const kickBtn = document.getElementById("kickUserBtn");
  const muteBtn = document.getElementById("muteUserBtn");
  const promoteBtn = document.getElementById("promoteUserBtn");
  const demoteBtn = document.getElementById("demoteUserBtn");

  if (kickBtn)
    kickBtn.addEventListener("click", () => {
      if (selectedUser) kickUser(selectedUser);
      adminMenuEl.style.display = "none";
    });
  if (muteBtn)
    muteBtn.addEventListener("click", () => {
      if (selectedUser) muteUser(selectedUser);
      adminMenuEl.style.display = "none";
    });
  if (promoteBtn)
    promoteBtn.addEventListener("click", () => {
      if (selectedUser) promoteUser(selectedUser);
      adminMenuEl.style.display = "none";
    });
  if (demoteBtn)
    demoteBtn.addEventListener("click", () => {
      if (selectedUser) demoteUser(selectedUser);
      adminMenuEl.style.display = "none";
    });
}

// If adminControls static buttons exist, wire them
if (adminControlsEl) {
  if (deleteUserMessagesBtn) {
    deleteUserMessagesBtn.addEventListener("click", () => {
      if (!selectedUser)
        return alert("Click a user (in list or chat) first to select them.");
      deleteUserMessages(selectedUser);
    });
  }
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener("click", () => deleteAllPublicMessages());
  }
}
// ---------------------- Toggle Admin Controls Button ----------------------
const toggleBtn = document.getElementById("toggleAdminControlsBtn");
if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    if (!isAdmin) return;
    if (adminControlsEl.style.display === "block") {
      adminControlsEl.style.display = "none";
    } else {
      // Show correct buttons depending on chat type
      if (currentChat === "public") {
        deleteAllBtn.style.display = "inline-block";
        deleteUserMessagesBtn.style.display = "none";
      } else {
        deleteAllBtn.style.display = "none";
        deleteUserMessagesBtn.style.display = "inline-block";
      }
      adminControlsEl.style.display = "block";
    }
  });
}

// ---------------------- User list rendering ----------------------
socket.on("userList", (users) => {
  chatList.innerHTML = "";

  // Public Chat item
  const publicItem = document.createElement("div");
  publicItem.className = "chat-item";
  publicItem.dataset.type = "public";
  publicItem.innerHTML = `
    <div class="avatar public">🌍</div>
    <div class="chat-info"><p>Public Chat</p><span>Everyone</span></div>`;
  // clicking public item opens public chat
  publicItem.addEventListener("click", () => openChatType("public"));
  chatList.appendChild(publicItem);

  // Private users
  users.forEach((u) => {
    const isMe = u === myName;
    const item = document.createElement("div");
    item.className = "chat-item";
    item.dataset.type = "private";
    item.dataset.user = u;
    item.innerHTML = `
      <div class="avatar user">${escapeHtml(u[0])}</div>
      <div class="chat-info"><p class="chat-username">${escapeHtml(u)}${
      isMe ? " (Me)" : ""
    }</p>
      <span>${isMe ? "You" : "Online"}</span></div>`;

    // clicking username element (the <p>) shows admin menu (if admin) OR opens chat if not admin
    const usernameP = item.querySelector(".chat-username");
    if (usernameP) {
      usernameP.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isAdmin && !isMe) {
          showUserOptions(u, e.pageX, e.pageY);
        } else {
          openChatType("private", u);
        }
      });
    }

    // clicking anywhere else on item opens chat
    item.addEventListener("click", (e) => {
      // guard: if click originated on a username (which we handled above), this won't run due to stopPropagation
      if (item.dataset.type === "public") openChatType("public");
      else openChatType("private", u);
    });

    chatList.appendChild(item);
    if (!unseenPerChat[u]) unseenPerChat[u] = 0;
  });

  if (!unseenPerChat.public) unseenPerChat.public = 0;
});

// ---------------------- Render messages ----------------------
function renderMessages() {
  messagesEl.innerHTML = "";
  if (currentChat === "public") {
    (store.public || []).forEach((m) => addMessageToUI(m, m.from === myName));
  } else {
    const list = store.private[currentChat] || [];
    list.forEach((m) => addMessageToUI(m, m.from === myName));
  }
}

// ---------------------- Open chat ----------------------
function openChatType(type, user) {
  if (type === "public") {
    currentChat = "public";
    chatUserEl.textContent = "🌍 Public Chat";
    headerAvatar.textContent = "🌍";
    headerAvatar.className = "avatar public";
    unseenPerChat["public"] = 0;
    updateChatBadge("public");
  } else {
    currentChat = user;
    chatUserEl.textContent = user;
    headerAvatar.textContent = (user && user[0]) || "U";
    headerAvatar.className = "avatar user";
    unseenPerChat[user] = 0;
    updateChatBadge(user);
  }
  updateAdminControls();
  renderMessages();

  if (window.innerWidth <= 768) {
    sidebar.style.display = "none";
    chatWindow.classList.add("active");
    backBtn.style.display = "inline-block";
  } else {
    sidebar.style.display = "block";
    chatWindow.classList.add("active");
    backBtn.style.display = "none";
  }

  messageInput.focus();
}

// ---------------------- Back button ----------------------
backBtn.addEventListener("click", () => {
  chatWindow.classList.remove("active");
  sidebar.style.display = "block";
  backBtn.style.display = "none";
  currentChat = null;
});

// ---------------------- Send message ----------------------
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return alert("Type a message first.");
  if (!currentChat) return alert("Please open Public Chat or a user first.");

  const now = new Date();
  const msgPayload = { from: myName, text, time: formatDateTime(now) };

  if (currentChat === "public") {
    // server expects data.text — older code used the whole object; either works because server uses data.text
    socket.emit("publicMessage", { text: msgPayload.text });
  } else {
    socket.emit("privateMessage", {
      to: currentChat,
      msg: { text: msgPayload.text },
    });
    if (!store.private[currentChat]) store.private[currentChat] = [];
    // store a local copy immediately for sender
    store.private[currentChat].push({
      from: myName,
      text: msgPayload.text,
      time: msgPayload.time,
    });
    addMessageToUI(
      { from: myName, text: msgPayload.text, time: msgPayload.time },
      true
    );
  }

  messageInput.value = "";
}
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// ---------------------- Socket: load old messages + incoming ----------------------
socket.on("loadOldMessages", (msgs) => {
  console.log("🚀 loadOldMessages received:", msgs); // add this line
  msgs.forEach((m) => (m.time = formatDateTime(m.time)));
  store.public = msgs;

  if (!currentChat) openChatType("public");
  renderMessages();
});



socket.on("publicMessage", (msg) => {
  msg.time = formatDateTime(msg.time);
  store.public.push(msg);
  if (currentChat === "public") {
    addMessageToUI(msg, msg.from === myName);
  } else {
    unseenPerChat["public"]++;
    updateChatBadge("public");
    notificationSound.play().catch(() => {});
  }
});

socket.on("privateMessage", (payload) => {
  // payload = { from, text, time, to }
  const partner = payload.from === myName ? payload.to : payload.from;
  if (!store.private[partner]) store.private[partner] = [];
  if (!unseenPerChat[partner]) unseenPerChat[partner] = 0;

  payload.time = formatDateTime(payload.time);
  store.private[partner].push(payload);

  if (currentChat === partner) {
    addMessageToUI(payload, payload.from === myName);
  } else {
    unseenPerChat[partner]++;
    updateChatBadge(partner);
    notificationSound.play().catch(() => {});
  }
});

// ---------------------- Other socket handlers ----------------------
socket.on("userNotFound", (to) =>
  alert("User '" + to + "' is not online or not found.")
);

socket.on("actionResult", (res) => {
  if (!res) return;
  alert(res.msg || (res.ok ? "Done" : "Error"));
});


// ---------------------- Window resize handling ----------------------
window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    sidebar.style.display = "block";
    chatWindow.classList.add("active");
    backBtn.style.display = "none";
  } else {
    if (currentChat) {
      sidebar.style.display = "none";
      chatWindow.classList.add("active");
      backBtn.style.display = "inline-block";
    } else {
      sidebar.style.display = "block";
      chatWindow.classList.remove("active");
      backBtn.style.display = "none";
    }
  }
});

// ---------------------- Join on load ----------------------
window.addEventListener("load", () => {
  myName =
    prompt("Enter your name:") || "User" + Math.floor(Math.random() * 1000);
  socket.emit("join", myName);

  // auto-open public on desktop
  if (window.innerWidth > 768) {
    openChatType("public");
  } else {
    chatWindow.classList.remove("active");
    sidebar.style.display = "block";
    backBtn.style.display = "none";
  }
});

// ---------------------- End of script ----------------------
