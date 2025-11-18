// signaling-server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// In-memory user presence tracker: userId => { online: true/false, lastSeen: <ISO string> }
const userPresence = {};

// --- SYSTEM MESSAGES: Helper to emit a call event to the chat room and also as a direct notification
function emitCallSystemMessage({ io, roomId, event, from, to, isVideo, timestamp }) {
  const systemMsg = {
    id: "sys-" + Date.now(),
    type: "system", // or "call"
    event, // "call-started", "call-accepted", "call-ended", "call-missed", etc.
    from: from ? { id: from.id, name: from.name } : undefined,
    to: to ? { id: to.id, name: to.name } : undefined,
    isVideo,
    timestamp: timestamp || new Date().toISOString(),
    text: generateCallEventText(event, from, to, isVideo)
  };
  io.to(roomId).emit("chat-system-message", { roomId, message: systemMsg });
}

function generateCallEventText(event, from, to, isVideo) {
  const callType = isVideo ? "video" : "audio";
  switch(event) {
    case "call-started": return `📞 ${from?.name || "Someone"} started a ${callType} call`;
    case "call-accepted": return `✅ ${to?.name || "Someone"} accepted the call`;
    case "call-ended": return `🚫 Call ended`;
    case "call-missed": return `❌ Missed ${callType} call from ${from?.name || "someone"}`;
    default: return "";
  }
}

function sendPresence(socket, userIds) {
  const res = {};
  userIds.forEach(uid => {
    res[uid] = userPresence[uid] || { online: false, lastSeen: null };
  });
  socket.emit("presence", res);
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // --- USER ROOMS: for notifications & presence
  socket.on("login", ({ userId }) => {
    if (userId) {
      socket.join("user-" + userId);
      socket.userId = userId;
      userPresence[userId] = { online: true, lastSeen: null };
      io.to("user-" + userId).emit("user-online", { userId });
      console.log(`User room joined: user-${userId}`);
    }
  });

  // --- PRESENCE: Respond to explicit presence queries
  socket.on("get-presence", ({ userIds }) => {
    if (Array.isArray(userIds)) sendPresence(socket, userIds);
  });

  // --- CHAT ROOMS
  socket.on("join-chat-room", ({ roomId, userId }) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined-chat", { userId });
    console.log(`Socket ${socket.id} joined chat room ${roomId} (user ${userId})`);
  });

  socket.on("leave-chat-room", ({ roomId, userId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit("user-left-chat", { userId });
    console.log(`Socket ${socket.id} left chat room ${roomId} (user ${userId})`);
  });

  // --- NEW CHAT (sidebar real-time)
  socket.on("new-chat", ({ userIds, chat }) => {
    if (Array.isArray(userIds)) {
      userIds.forEach((uid) => {
        io.to("user-" + uid).emit("new-chat", chat);
        console.log(`Notified user-${uid} about new chat ${chat?.id || ""}`);
      });
    }
  });

  // --- MESSAGES
  socket.on("chat-message", (msg) => {
    if (msg && msg.roomId) {
      io.to(msg.roomId).emit("chat-message", msg);
      console.log("Message sent to room", msg.roomId);

      // ✅ Notify other users in chat about unread increment
      if (msg.recipients && Array.isArray(msg.recipients)) {
        msg.recipients
          .filter((uid) => uid !== msg.senderId)
          .forEach((uid) => {
            io.to("user-" + uid).emit("update-unread", {
              chatId: msg.roomId,
              increment: 1,
            });
          });
      }
    }
  });

  socket.on("delete-message", ({ roomId, messageId, userId }) => {
    io.to(roomId).emit("delete-message", { roomId, messageId, userId });
    console.log("Message deleted", messageId, "in", roomId);
  });

  socket.on("typing", ({ roomId, userId }) => {
    socket.to(roomId).emit("typing", { userId });
  });

  socket.on("message-read", ({ roomId, userId, messageIds }) => {
    socket.to(roomId).emit("message-read", { userId, messageIds });
    io.to("user-" + userId).emit("update-unread", {
      chatId: roomId,
      unreadCount: 0,
    });
    console.log(`User ${userId} saw messages in room ${roomId}`);
  });

  // --- CALL SIGNALING (WhatsApp style)
  socket.on("call:request", ({ roomId, from, to, isVideo }) => {
    if (to && to.id) {
      io.to("user-" + to.id).emit("call:incoming", { from, isVideo, roomId });
      emitCallSystemMessage({ io, roomId, event: "call-started", from, to, isVideo });
      console.log(`User ${from?.id} is calling user ${to.id} (video: ${!!isVideo})`);
    }
  });

  socket.on("call:accept", ({ roomId, from, to, isVideo }) => {
    io.to(roomId).emit("call:accept", { from, isVideo });
    emitCallSystemMessage({ io, roomId, event: "call-accepted", from, to, isVideo });
    console.log(`Call accepted in room ${roomId}`);
  });

  socket.on("call:reject", ({ roomId, from, to, isVideo }) => {
    io.to(roomId).emit("call:reject", { from, isVideo });
    emitCallSystemMessage({ io, roomId, event: "call-missed", from, to, isVideo });
    console.log(`Call rejected in room ${roomId}`);
  });

  socket.on("call:end", ({ roomId, from, to, isVideo }) => {
    io.to(roomId).emit("call:end", { from, isVideo });
    emitCallSystemMessage({ io, roomId, event: "call-ended", from, to, isVideo });
    console.log(`Call ended in room ${roomId}`);
  });

  socket.on("call:missed", ({ roomId, from, to, isVideo }) => {
    emitCallSystemMessage({ io, roomId, event: "call-missed", from, to, isVideo });
    console.log(`Missed call in room ${roomId} (user ${to?.id || ''})`);
  });

  // --- VIDEO SIGNALING (WebRTC SDP/ICE)
  socket.on("join-room", ({ roomId, userId }) => {
    socket.join(roomId);
    socket.to(roomId).emit("signal", { type: "user-joined", userId });
  });

  socket.on("signal", ({ roomId, data }) => {
    socket.to(roomId).emit("signal", data);
  });

  socket.on("leave-room", ({ roomId, userId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit("signal", { type: "user-left", userId });
  });

  // --- EXPLICIT UNREAD COUNT UPDATE SUPPORT
  socket.on("update-unread", ({ chatId, userId, unreadCount }) => {
    io.to("user-" + userId).emit("update-unread", { chatId, unreadCount });
  });

  // --- CLEANUP / ONLINE-OFFLINE
  socket.on("disconnect", () => {
    if (socket.userId) {
      userPresence[socket.userId] = { online: false, lastSeen: new Date().toISOString() };
      io.to("user-" + socket.userId).emit("user-offline", {
        userId: socket.userId,
        lastSeen: userPresence[socket.userId].lastSeen
      });
    }
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on ${PORT}`);
});