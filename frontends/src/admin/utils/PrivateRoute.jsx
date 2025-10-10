import React from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import {
  selectIsAdminAuthenticated,
  selectAdminRoles,
  selectAdminAuthChecked,
} from "../../features/admin/adminSlice";
import { Box, CircularProgress } from "@mui/material";

export default function PrivateRoute({ allowedRoles = [], children }) {
  const isAuthenticated = useSelector(selectIsAdminAuthenticated);
  const roles = useSelector(selectAdminRoles);
  const authChecked = useSelector(selectAdminAuthChecked);
  const location = useLocation();

  const AUTH_LK = import.meta.env.VITE_AUTH_LINK1;
  const AUTH_LK2 = import.meta.env.VITE_AUTH_LINK2;


  if (!authChecked) {
    return (
      <Box sx={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`${AUTH_LK}/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (
    allowedRoles.length > 0 &&
    !roles.some(role => allowedRoles.includes(role))
  ) {
    return <Navigate to=  {`${AUTH_LK}/unauthorized`} replace />;
  }

  return <>{children}</>;
}