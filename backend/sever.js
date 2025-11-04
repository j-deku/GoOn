// sever.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url"; 
import { exec } from 'child_process';
import http from "http"; 
import { Server as IOServer } from "socket.io";
import fs from "fs";                             
import helmet from "helmet";
import compression from "compression";
import corsMiddleware from "./middlewares/cors.js";
import userRouter from "./routes/UserRoute.js";
import cartRouter from "./routes/CartRoute.js";
import bookRouter from "./routes/BookingRoute.js";
import permissionRouter from "./routes/PermissionRoute.js";
import adminRouter from "./routes/AdminRoute.js";
import driverRouter from "./routes/DriverRoute.js";
import rideRouter from "./routes/RideRoute.js";
import fareRouter from "./routes/FareRoute.js";
import notificationRouter from "./routes/NotificationRoute.js";
import BotRouter from "./routes/BotRoute.js";

import {limiter} from "./middlewares/rateLimiter.js";
import authMiddleware from "./middlewares/auth.js";
import securityMiddleware from "./middlewares/security.js";
import logger from "./middlewares/logger.js";
import errorHandler from "./middlewares/errorHandler.js";

import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "./config/passport.js";

import prisma, { connectDB } from "./config/Db.js";
import "./cron/cleanUpLogs.js";
import './workers/notificationWorker.js';
import "./patchBullBoard.js";
import { ensureSuperAdminExists } from "./controllers/AdminController.js";
import dotenv from "dotenv";
import DeviceRouter from "./routes/DeviceRoute.js";
import TestPushRouter from "./routes/TestPushRoute.js";
import debugRouter from "./routes/QueueRoute.js";
import { serverAdapter as BullBoardAdapter } from "./bullBoard.js";
import { verifyAdmin } from "./middlewares/adminAuth.js";
import connectionRoute from "./routes/ConnectionRoute.js";
import { nonceMiddleware } from "./middlewares/nonce.js";

dotenv.config();

// ── ESM __dirname Derivation ───────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── App & Server Setup ─────────────────────────────────────────────────────────
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
const port = process.env.PORT || 5000;

// Create HTTP server & attach Socket.IO
const server = http.createServer(app);
export const io = new IOServer(server, { 
  path: '/socket.io',
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
     /* if (
        [
          process.env.FRONTEND_URL,
          process.env.BACKEND_URL,
          "http://localhost:5173",
        ].includes(origin) ||
        /\.ngrok-free\.app$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by Socket.IO CORS"), false);
      } */
    },
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS', 'UPDATE'],
    credentials: true,
  },
  transports: ['websocket','polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
});

app.set("io", io);
// ── 1) Serve Vite Build Output ─────────────────────────────────────────────────
app.use(
  express.static(path.join(__dirname, "dist"), {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".js") || filePath.endsWith(".jsx") || filePath.endsWith(".mjs")) {
        res.setHeader("Content-Type", "application/javascript");
      }
    },
  })
);

// ── 2) Core Middleware ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);
app.options("*", corsMiddleware);
app.use(cookieParser());
app.use(
  session({
    name: "RTT.sid",
    secret: process.env.SESSION_SECRET || "secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "None"
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(compression());
app.use(limiter);
app.use(nonceMiddleware);
app.use(helmet()); 
const isProd = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`,],
        styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, "https://fonts.googleapis.com",],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.BACKEND_URL, 
         // /\.ngrok-free\.app$/
           ],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    noSniff: true,
    xssFilter: false, 
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Automatically run migrations and seed on startup (for dev only)
if (process.env.NODE_ENV !== 'production') {
  exec('npx prisma migrate deploy && npx prisma db seed', (err, stdout, stderr) => {
    if (err) console.error('Migration/Seed error:', stderr);
    else console.log(stdout);
  });
}

// ── 3) API Route Mounts ─────────────────────────────────────────────────────────
app.use("/api/user", userRouter);
app.use("/api/devices", DeviceRouter);
app.use("/api/rides", rideRouter);
app.use("/api/cart", cartRouter);
app.use("/api/booking", bookRouter);
app.use("/api/permission", permissionRouter);
app.use("/api/admin", adminRouter);
app.use("/api/driver", driverRouter);
app.use("/api/fare", fareRouter);
app.use("/api/notification", notificationRouter);
app.use("/api/placeApi", userRouter);
app.use("/api/auth", userRouter);
app.use("/api/chat", BotRouter);
app.use("/api/connection", connectionRoute);
app.use("/api/debug", debugRouter);
try {
  app.use("/api/admin/queues", verifyAdmin, BullBoardAdapter.getRouter());
} catch (err) {
  console.warn("⚠️ BullBoard disabled due to Redis INFO restrictions:", err.message);
}
app.use("/api", TestPushRouter);

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/assets/") ||
    req.path.startsWith("/admin") ||
    !req.accepts("html")
  ) {
    return next();
  }
  const nonce = res.locals.cspNonce;
  const indexPath = path.join(__dirname, "../frontends/dist", "index.html");
  let html = fs.readFileSync(indexPath, "utf8");

  //CSP nonce into a bootstrapping script
  const bootSnippet = `
    <script nonce="${nonce}">
      window.__CSP_NONCE__ = "${nonce}";
    </script>
  `;

  html = html.replace("</head>", `${bootSnippet}\n</head>`);

  //automatically add nonce to inline scripts
  html = html.replace(/<script(?![^>]*src)/g, `<script nonce="${nonce}"`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
});

// ── 5) Additional Middleware & Error Handling ───────────────────────────────────
app.use(securityMiddleware);
app.use(errorHandler);
app.use((req, res) => {
  logger.info(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ message: "Endpoint not found" });
});

// 10) Global error handler
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ message: "Invalid CSRF token." });
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error." });
});

// ── 6) Socket.IO Integration ───────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

    // 1) Join search room(s)
    socket.on("joinSearchRoom", ({ pickupNorm, destinationNorm, date }) => {
      const room = `search_${pickupNorm}_${destinationNorm}_${date}`;
      socket.join(room);
      console.log(`Socket ${socket.id} joined ${room}`);
    });

    // Optional: leave room
    socket.on("leaveSearchRoom", ({ pickupNorm, destinationNorm, date }) => {
      const room = `search_${pickupNorm}_${destinationNorm}_${date}`;
      socket.leave(room);
      console.log(`Socket ${socket.id} left ${room}`);
    });

  socket.on("joinDriverRoom", (driverId) => {
    socket.join(driverId);
    console.log(`✅ Driver ${driverId} joined room successfully.`);
    console.log(`Socket ${socket.id} is now in driver room: ${driverId}`);
  });

  socket.on("joinUserRoom", (userId) => {
    socket.join(userId);
    console.log(`✅ User ${userId} joined room successfully.`);
    console.log(`Socket ${socket.id} is now in user room: ${userId}`);
  });

  io.on("connection", (socket) => {
  console.log("🟢 Admin connected:", socket.id);
  socket.on("disconnect", () => console.log("🔴 Admin disconnected:", socket.id));
})
  socket.on("joinAdminRoom", (adminId) => {
    socket.join(adminId);
    console.log(`✅ Admin ${adminId} joined room successfully.`);
  });

  const userId = socket.handshake.auth.userId;
  if (userId) {
    prisma.user.update({
      where: { id: userId },
      data: { isOnline: true, lastActiveAt: new Date() },
    }).then(() => {
      io.emit("user_status_update", { userId, isOnline: true });
    });

    socket.on("disconnect", async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: false, lastActiveAt: new Date() },
      });
      io.emit("user_status_update", { userId, isOnline: false });
    });
  }

  socket.on("declineBooking", ({ bookingId, rideId, userId }) => {
    console.log(`Emitting bookingDeclined to user room: ${userId}`);
    io.to(userId).emit("bookingDeclined", { bookingId, rideId });
  });

  socket.on("startRide", ({ bookingId, rideId, userId }) => {
    console.log(`Emitting rideStarted to user room: ${userId}`);
    io.to(userId).emit("rideStarted", { bookingId, rideId });
  });

  socket.on("completeRide", ({ bookingId, rideId, fare, userId }) => {
    console.log(`Emitting rideCompleted to user room: ${userId}`);
    io.to(userId).emit("rideCompleted", { bookingId, rideId, fare });
  });

  socket.on("driverLocationUpdate", (data) => {
    io.emit("updateDriverLocation", data);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ── 7)Super‑Admin Setup ─────────────────────────────────────────────
connectDB().then(() => ensureSuperAdminExists());

// ── Start Server ───────────────────────────────────────────────────────────────
server.listen(port, () => {
  console.log(`Server running on port http://localhost:${port}`);
});