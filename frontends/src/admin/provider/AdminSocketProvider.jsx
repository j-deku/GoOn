// src/admin/provider/AdminSocketProvider.jsx
import React, { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { toast } from "react-toastify";
import PropTypes from "prop-types";
import {jwtDecode} from "jwt-decode";

const AdminSocketProvider = ({ children }) => {
  const socketRef = useRef(null);

  useEffect(() => {
    // 1) Read token from localStorage
    const token = localStorage.getItem("token");
    if (!token) {
      // No token → do nothing (skip socket logic)
      return;
    }

    let decoded;
    try {
      decoded = jwtDecode(token);
    } catch (err) {
      console.error("Error decoding token:", err);
      return;
    }

    const adminId = decoded.id || decoded.adminId;
    if (!adminId) {
      console.warn("Admin ID not found inside token payload.");
      return;
    }

    // 2) Initialize socket and join the appropriate room
    const socket = io(import.meta.env.VITE_API_BASE_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
      auth: { token }, // pass token if your server needs it for auth
    });
    socketRef.current = socket;

    // Join the admin room
    socket.emit("joinAdminRoom", adminId);
    console.log(`Admin ${adminId} joined room.`);

    // 3) Listen for rideResponseUpdate
    socket.on("rideResponseUpdate", (data) => {
      console.log("Received rideResponseUpdate event:", data);
      if (data.response === "approved") {
        toast.success("Your ride has been approved!");
      } else if (data.response === "declined") {
        toast.error("Your ride has been declined.");
      }
      // You could also update any local state here if needed
    });

    // 4) Cleanup on unmount
    return () => {
      socket.off("rideResponseUpdate");
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // run once on mount

  return <>{children}</>;
};

AdminSocketProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AdminSocketProvider;
