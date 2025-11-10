// signaling-server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // --- USER ROOMS: for notifications & presence
  socket.on("login", ({ userId }) => {
    if (userId) {
      socket.join("user-" + userId);
      socket.userId = userId;
      io.to("user-" + userId).emit("user-online", { userId });
      console.log(`User room joined: user-${userId}`);
    }
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
      userIds.forEach(uid => {
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
    console.log(`User ${userId} saw messages in room ${roomId}`);
  });

  // --- VIDEO SIGNALING
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

  // --- CLEANUP / ONLINE-OFFLINE
  socket.on("disconnect", () => {
    if (socket.userId) {
      io.to("user-" + socket.userId).emit("user-offline", { userId: socket.userId });
    }
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on ${PORT}`);
});