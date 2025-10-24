// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

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

  socket.on("disconnect", () => console.log("disconnected:", socket.id));
});

// ... EXISTING CODE above ...

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  // -- Existing video signaling events here --

  // -- New: join chat room (can reuse join-room) --
  socket.on("join-chat-room", ({ roomId, userId }) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined-chat", { userId });
  });

  // -- New: chat message event --
  socket.on("chat-message", ({ roomId, message, userId, type }) => {
    // message: text or file info, type: 'text'/'image'/'video'/'audio'
    io.to(roomId).emit("chat-message", { userId, message, type, time: Date.now() });
  });

  // -- Typing indicator --
  socket.on("typing", ({ roomId, userId }) => {
    socket.to(roomId).emit("typing", { userId });
  });

  // -- Delete message --
  socket.on("delete-message", ({ roomId, messageId, userId }) => {
    io.to(roomId).emit("delete-message", { messageId, userId });
  });

  socket.on("disconnect", () => console.log("disconnected:", socket.id));
});



const PORT = process.env.PORT;
server.listen(PORT, () => console.log(`Signaling server running on ${PORT}`));
