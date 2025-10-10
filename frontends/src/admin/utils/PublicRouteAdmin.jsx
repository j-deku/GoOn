import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import {
  selectIsAdminAuthenticated,
  selectAdminAuthChecked,
  fetchAdminInfo,
} from "../../features/admin/adminSlice";
import { Box, CircularProgress } from "@mui/material";

export default function PublicRouteAdmin({ children }) {
  const isAuthenticated = useSelector(selectIsAdminAuthenticated);
  const authChecked = useSelector(selectAdminAuthChecked);
  const dispatch = useDispatch();

  const AUTH_LK = import.meta.env.VITE_AUTH_LINK1;
  const AUTH_LK2 = import.meta.env.VITE_AUTH_LINK2;

  useEffect(() => {
    if (!authChecked) {
      dispatch(fetchAdminInfo());
    }
  }, [authChecked, dispatch]);

  if (!authChecked) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
        }}
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={`${AUTH_LK2}/dashboard`} replace />;
  }

  return <>{children}</>;
}