const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],

    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => console.error("MongoDB connection error:", error));

// Define User Schema
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, uniqe: true },
  socketId: { type: String, required: true },
});

// Define Message Schema
const messageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true },
  text: { type: String, required: true },
  images: [String], // Array to store image URLs or paths
  seen: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Create Mongoose Models
const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

// Routes
app.get("/", (req, res) => {
  res.send("hello");
});

app.post("/msg", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    const msg = await Message.find({
      $or: [
        { senderId: senderId, receiverId: receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    });
    res.status(200).json({ status: 200, success: true, data: msg });
  } catch (error) {
    console.log(error);
  }
});

app.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.body.userId });
    if (!user) return res.status(404).json({ status: 404, success: false, message: "User Not Found" });
    res.status(200).json({ status: 200, success: true, data: user });
  } catch (error) {
    console.log(error);
  }
});

app.get("/getuser", async (req, res) => {
  try {
    const user = await User.find();
    res.status(200).json({ status: 200, success: true, data: user });
  } catch (error) {
    console.log(error);
  }
});
// Socket.IO logic
io.on("connection", (socket) => {
  console.log(`A user connected with socket ID: ${socket.id}`);

  //#region this code for add user
  socket.on("addUser", async (userId) => {
    try {
      const existingUser = await User.findOne({ userId });

      if (!existingUser) {
        const newUser = new User({ userId, socketId: socket.id });
        await newUser.save();
      } else {
        existingUser.socketId = socket.id;

        await existingUser.save();
      }
      const users = await User.find();
      io.emit("getUsers", users);
    } catch (error) {
      console.error("Error adding user:", error);
    }
  });
  //#endregion

  //#region This code for the send message
  socket.on("sendMessage", async (data) => {
    const { senderId, receiverId, text, images } = data;

    if (!senderId || !receiverId || !text) {
      console.log("Missing required fields:", { senderId, receiverId, text });
      return;
    }

    const message = new Message({ senderId, receiverId, text, images });
    try {
      await message.save();
      const user = await User.findOne({ userId: receiverId });

      if (user) {
        console.log(`Sending message to user with socket ID: ${user.socketId}`);
        io.to(user.socketId).emit("getMessage", message);
      } else {
        console.log(`User with ID ${receiverId} not found.`);
      }
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });
  //#endregion

  socket.on("messageSeen", async (data) => {
    const { senderId, receiverId, messageId } = data;

    try {
      const message = await Message.findById(messageId);

      if (message) {
        message.seen = true;
        await message.save();

        const user = await User.findOne({ userId: senderId });
        if (user) {
          io.to(user.socketId).emit("messageSeen", { senderId, receiverId, messageId });
        }
      } else {
        console.log(`Message with ID ${messageId} not found for receiver ${receiverId}.`);
      }
    } catch (error) {
      console.error("Error marking message as seen:", error);
    }
  });

  socket.on("updateLastMessage", async ({ lastMessage, lastMessagesId }) => {
    io.emit("getLastMessage", {
      lastMessage,
      lastMessagesId,
    });
  });

  socket.on("log", (data) => {
    console.log(data);
    if (data == "as") {
      io.emit("datas", data);
    }
  });
  socket.on("disconnect", async () => {
    try {
      const users = await User.find();
      io.emit("getUsers", users);
    } catch (error) {
      console.error("Error removing user:", error);
    }
  });
});

// Start server
server.listen(process.env.PORT || 4000, () => {
  console.log(`Server is running on port ${process.env.PORT || 4000}`);
});
