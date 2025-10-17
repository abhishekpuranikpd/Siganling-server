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

const PORT = 4000;
server.listen(PORT, () => console.log(`Signaling server running on ${PORT}`));
