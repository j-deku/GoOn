import { useEffect } from "react";
import { io } from "socket.io-client";
import PropTypes from "prop-types";

const socket = io(import.meta.env.VITE_API_BASE_URL, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 500,
});

const DriverSocketProvider = ({ children }) => {
  useEffect(() => {
    const driverId = localStorage.getItem("driverId");
    
    if (driverId) {
      socket.emit("joinDriverRoom", driverId);
      console.log(`✅ Driver ${driverId} joined room`);
    } else {
      console.warn("❌ driverId missing in localStorage");
      return; // Don't set up listeners if no driverId
    }

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      // Re-join room on reconnection
      socket.emit("joinDriverRoom", driverId);
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Socket connection error:", err);
    });

    socket.on("disconnect", (reason) => {
      console.log("⚠️ Socket disconnected:", reason);
    });

    // Debug: Log all events
    socket.onAny((event, ...args) => {
      console.log(`📡 Socket event: ${event}`, args);
    });

    return () => {
      // ❌ REMOVED: socket.off("rideRequest");
      //socket.off("connect_error");
      //socket.off("disconnect");
      socket.offAny(); // Remove the debug listener
      //socket.disconnect();
    };
  }, []);

  return <>{children}</>;
};

DriverSocketProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export { socket };
export default DriverSocketProvider;