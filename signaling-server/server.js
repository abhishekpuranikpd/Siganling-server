// signaling-server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  //
  // --- USER ROOMS (for direct notifications, e.g., new-chat, online status) ---
  //
  socket.on("login", ({ userId }) => {
    if (userId) {
      socket.join("user-" + userId);
      socket.userId = userId;  // track for cleanup if needed
      // Optionally emit online status etc.
      io.to("user-" + userId).emit("user-online", { userId });
      console.log(`User room joined: user-${userId}`);
    }
  });

  //
  // --- CHAT ROOMS: join/leave for all participants in a given chat (group or 1:1) ---
  //
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

  //
  // --- NEW CHAT (for sidebar real-time update) ---
  //
  socket.on("new-chat", ({ userIds, chat }) => {
    // Notify all users (except sender if desired) about the new chat
    if (Array.isArray(userIds)) {
      userIds.forEach(uid => {
        io.to("user-" + uid).emit("new-chat", chat);
        console.log(`Notified user-${uid} about new chat ${chat?.id || ""}`);
      });
    }
  });

  //
  // --- CHAT MESSAGES ---
  //
  socket.on("chat-message", (msg) => {
    // msg: { roomId, ... } (should include roomId at minimum)
    if (msg && msg.roomId) {
      io.to(msg.roomId).emit("chat-message", msg);
      console.log("Message sent to room", msg.roomId);
    }
  });

  socket.on("delete-message", ({ roomId, messageId, userId }) => {
    // Broadcast deleted message in room
    io.to(roomId).emit("delete-message", { roomId, messageId, userId });
    console.log("Message deleted", messageId, "in", roomId);
  });

  socket.on("typing", ({ roomId, userId }) => {
    socket.to(roomId).emit("typing", { userId });
  });

  //
  // --- VIDEO CALL SIGNALING ---
  //
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

  //
  // --- OPTIONAL: Clean up or notify online/offline ---
  //
  socket.on("disconnect", () => {
    // Optionally use socket.userId if you want to broadcast "user-offline"
    if (socket.userId) {
      io.to("user-" + socket.userId).emit("user-offline", { userId: socket.userId });
    }
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on ${PORT}`);
});