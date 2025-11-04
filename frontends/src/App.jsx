import "./App.css";
import React, { lazy, useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

// Admin imports
import AdminLogin from "./admin/Pages/AdminLogin/AdminLogin";
import ForgotPasswordAdmin from "./admin/components/ForgotPassword/ForgotPassword";
import PasswordResetAdmin from "./admin/components/PasswordReset/PasswordReset";
import Setup2FA from "./admin/Pages/Setup2FA/Setup2FA";
import AcceptInvite from "./admin/Pages/AcceptInvite/AcceptInvite";
import VerifyBackupCode from "./admin/Pages/VerifyBackupCode/VerifyBackupCode";
import Unauth from "./admin/Pages/Unauth/Unauth";
import GlobalAdminAuth from "./shared/context/GlobalAdminAuth";
import PublicRouteAdmin from "./admin/utils/PublicRouteAdmin";

// Lazy loaded layouts
const UserLayout = lazy(() => import("./user/UserLayout"));
const AdminLayout = lazy(() => import("./admin/AdminLayout"));
const DriverLayout = lazy(() => import("./driver/DriverLayout"));

// Driver imports
import DriverAuthProvider from "./driver/provider/DriverAuthProvider";
import PublicRouteDriver from "./driver/utils/PublicRouteDriver";
import PrivateRouteDriver from "./driver/utils/PrivateRouteDriver";
import LoginForm from "./driver/Pages/LoginForm/LoginForm";
import RegisForm from "./driver/Pages/RegisForm/RegisForm";
import ForgotPasswordDriver from "./driver/components/ForgotPasswordDriver/ForgotPasswordDriver";
import PasswordResetDriver from "./driver/components/PasswordResetDriver/PasswordResetDriver";
import FormSubmitted from "./driver/pages/FormSubmitted/FormSubmitted";
import {
  recoverSession,
  restoreUserState,
  selectAuthStatus,
  selectIsAuthenticated,
  selectUserRoles,
} from "./features/user/userSlice";
import { useDispatch, useSelector } from "react-redux";
import NotFound from "./admin/Pages/NotFound/NotFound";
import LoadingPage from "./user/components/LoadingPage/LoadingPage";
import AccessCheck from "./guards/AccessCheck/AccessCheck";

export default function App() {
  const AUTH = import.meta.env.VITE_AD_AUTH;
  const AUTH_LK = import.meta.env.VITE_AUTH_LINK1;
  const AUTH_LK2 = import.meta.env.VITE_AUTH_LINK2;
  const dispatch = useDispatch();
  // Service Worker Sound Notifications
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "PLAY_SOUND") {
          const audio = new Audio("/sounds/apple-toast.mp3");
          audio
            .play()
            .catch((err) => console.warn("Audio playback blocked:", err));
        }
      });
    }
  }, []);

  useEffect(() => {
  dispatch(restoreUserState());
  dispatch(recoverSession());
}, [dispatch]);


  function AdminGuard({ allowedRoles = [], children }) {
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const roles = useSelector(selectUserRoles);
    const authChecked = useSelector(selectAuthStatus);

    if (!authChecked) {
      return <LoadingPage />;
    }

    if (!isAuthenticated) {
      return <NotFound />;
    }

    if (
      allowedRoles.length > 0 &&
      !roles.some((role) => allowedRoles.includes(role))
    ) {
      return <NotFound />;
    }

    return <>{children}</>;
  }

  const ProtectedAdmin = () => {
    return (
      <GlobalAdminAuth>
        <AdminLayout />
      </GlobalAdminAuth>
    );
  };
  
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Routes>
        {/* User routes */}
        <Route path="/*" element={<UserLayout />} />

        {/* Public Admin routes */}
        <Route
          path={`${AUTH_LK}/login`}
          element={
            <AccessCheck>
              <PublicRouteAdmin>
                <AdminLogin />
              </PublicRouteAdmin>
            </AccessCheck>
          }
        />
        <Route
          path={`${AUTH_LK}/forgot-password`}
          element={
            <AccessCheck>
              <PublicRouteAdmin>
                <ForgotPasswordAdmin />
              </PublicRouteAdmin>
            </AccessCheck>
          }
        />
        <Route
          path={`${AUTH_LK}/reset-password/:token`}
          element={
            <AccessCheck>
              <PublicRouteAdmin>
                <PasswordResetAdmin />
              </PublicRouteAdmin>
            </AccessCheck>
          }
        />
        <Route
          path={`${AUTH_LK}/accept-invite`}
          element={
            <AccessCheck>
              <PublicRouteAdmin>
                <AcceptInvite />
              </PublicRouteAdmin>
            </AccessCheck>
          }
        />
        <Route
          path={`${AUTH_LK}/setup-2fa`}
          element={
            <AccessCheck>
              <PublicRouteAdmin>
                <Setup2FA />
              </PublicRouteAdmin>
            </AccessCheck>
          }
        />
        <Route
          path={`${AUTH_LK}/verify-backup-code`}
          element={
            <AccessCheck>
              <PublicRouteAdmin>
                <VerifyBackupCode />
              </PublicRouteAdmin>
            </AccessCheck>
          }
        />
        <Route
          path={`${AUTH_LK}/unauthorized`}
          element={
            <AccessCheck>
              <PublicRouteAdmin>
                <Unauth />
              </PublicRouteAdmin>
            </AccessCheck>
          }
        />

        <Route
          path={`${AUTH_LK2}/*`}
          element={
            <AccessCheck>
              <ProtectedAdmin />
            </AccessCheck>
          }
        />

        {/* Driver routes */}
        <Route
          path="/driver/*"
          element={
            <DriverAuthProvider>
              <Outlet />
            </DriverAuthProvider>
          }
        >
          <Route
            index
            element={
              <PublicRouteDriver>
                <Navigate to="login" replace />
              </PublicRouteDriver>
            }
          />
          {/* Public driver routes */}
          <Route
            path="login"
            element={
              <PublicRouteDriver>
                <LoginForm />
              </PublicRouteDriver>
            }
          />
          <Route
            path="register"
            element={
              <PublicRouteDriver>
                <RegisForm />
              </PublicRouteDriver>
            }
          />
          <Route
            path="forgot-password"
            element={
              <PublicRouteDriver>
                <ForgotPasswordDriver />
              </PublicRouteDriver>
            }
          />
          <Route
            path="reset-password/:token"
            element={
              <PublicRouteDriver>
                <PasswordResetDriver />
              </PublicRouteDriver>
            }
          />
          <Route
            path="form-submitted"
            element={
              <PublicRouteDriver>
                <FormSubmitted />
              </PublicRouteDriver>
            }
          />

          {/* Protected driver routes */}
          <Route
            path="*"
            element={
              <PrivateRouteDriver>
                <DriverLayout />
              </PrivateRouteDriver>
            }
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LocalizationProvider>
  );
}
