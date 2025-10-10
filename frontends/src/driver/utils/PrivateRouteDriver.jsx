import React from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import {
  selectIsDriverAuthenticated,
  selectDriverRoles,
  selectDriverAuthChecked,
} from "../../features/driver/driverSlice";
import { Box, CircularProgress } from "@mui/material";

export default function PrivateRoute({ allowedRoles = [], children }) {
  const isAuthenticated = useSelector(selectIsDriverAuthenticated);
  const roles = useSelector(selectDriverRoles);
  const authChecked = useSelector(selectDriverAuthChecked);
  const location = useLocation();

  if (!authChecked) {
    return (
      <Box sx={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <CircularProgress size={60} />
      </Box>
    );
  } 

  if (!isAuthenticated) {
    return <Navigate to={`/driver/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (
    allowedRoles.length > 0 &&
    !roles.some(role => allowedRoles.includes(role))
  ) {
    return <Navigate to="/driver/unauthorized" replace />;
  }

  return <>{children}</>;
}