// src/components/AdminVerifyQR/AdminVerifyQR.jsx
import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.warn("parseJwt(): failed to decode token:", e);
    return null;
  }
}

const AdminVerifyQR = () => {
  // Always read from sessionStorage (pending2FA) and localStorage (temp2FAToken)
  const adminEmail = sessionStorage.getItem("pending2FA");
  const pre2FAToken = localStorage.getItem("temp2FAToken");

  // Extract adminId from the pre2FAToken
  let adminId = null;
  if (pre2FAToken) {
    const payload = parseJwt(pre2FAToken);
    if (payload && payload.id) {
      adminId = payload.id;
    }
  }

  const [qrDataURL, setQrDataURL] = useState("");
  const [loadingQR, setLoadingQR] = useState(true);
  const [totpCode, setTotpCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorObj, setErrorObj] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    // 1) If any required data is missing, show an error
    if (!adminEmail || !pre2FAToken || !adminId) {
      setErrorObj({
        status: "missing",
        data: { message: "Missing required 2FA data. Please log in again." },
      });
      setLoadingQR(false);
      return;
    }

    // 2) Otherwise, fetch the QR code
    const fetchQRCode = async () => {
      setLoadingQR(true);
      setErrorObj(null);
      try {
        const resp = await axiosInstanceAdmin.get(
          `/api/admin/2fa/qrcode/${adminId}`,
          {
            headers: { Authorization: `Bearer ${pre2FAToken}` },
            withCredentials: true,
          }
        );
        if (resp.data.success) {
          setQrDataURL(resp.data.qrDataURL);
        } else {
          setErrorObj({ status: resp.status, data: resp.data });
        }
      } catch (err) {
        setErrorObj({
          status: err.response?.status || "network",
          data: err.response?.data || err.message,
        });
      } finally {
        setLoadingQR(false);
      }
    };

    fetchQRCode();
  }, [adminEmail, adminId, pre2FAToken]);

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorObj(null);
    setSuccessMsg("");

    if (!totpCode || totpCode.length !== 6) {
      setErrorObj({
        status: "validation",
        data: "Please enter a valid 6-digit code.",
      });
      setSubmitting(false);
      return;
    }

    try {
      const resp = await axiosInstanceAdmin.post(
        "/api/admin/verify-2fa",
        {
          pre2FAToken,
          totpCode,
        },
        { withCredentials: true }
      );

      if (resp.data.success && resp.data.token) {
        const { token: realAccessToken, role } = resp.data;

        // 1) Remove temp2FAToken and pending2FA
        localStorage.removeItem("temp2FAToken");
        sessionStorage.removeItem("pending2FA");

        // 2) Store the real access token + role + email
        localStorage.setItem("token", realAccessToken);
        localStorage.setItem("role", role);
        localStorage.setItem("adminEmail", adminEmail);

        setSuccessMsg("✅ 2FA verified successfully. Redirecting…");
        setTimeout(() => {
          window.location.href = `${import.meta.env.VITE_AUTH_LINK2}/dashboard`;
        }, 1000);
      } else {
        setErrorObj({ status: resp.status, data: resp.data });
      }
    } catch (err) {
      setErrorObj({
        status: err.response?.status || "network",
        data: err.response?.data || err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── RENDER ───
  if (loadingQR) {
    return (
      <Box sx={{ textAlign: "center", mt: 4 }}>
        <CircularProgress />
        <Typography sx={{ mt: 1 }}>Loading QR code…</Typography>
      </Box>
    );
  }

  if (errorObj) {
    return (
      <Box sx={{ maxWidth: 480, mx: "auto", mt: 8, p: 3 }}>
        <Typography variant="h4" sx={{ textAlign: "center", mb: 2 }}>
          Two-Factor Authentication Required
        </Typography>
        <Alert severity="error" sx={{ mb: 2, whiteSpace: "pre-wrap" }}>
          {`Error ${errorObj.status}: ${JSON.stringify(errorObj.data, null, 2)}`}
        </Alert>
        <Button variant="contained" onClick={() => (window.location.href = "/admin/login")}>
          Go Back to Login
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 480, mx: "auto", mt: 8, p: 3 }}>
      <Typography variant="h4" sx={{ textAlign: "center", mb: 2 }}>
        Two-Factor Authentication
      </Typography>
      <Typography sx={{ textAlign: "center", mb: 2 }}>
        Scan this QR code with your Authenticator App (Google Authenticator, Authy, etc.),
        then enter the 6-digit code below:
        <div style={{fontSize:18,color:"#444"}}><b>{adminEmail}</b></div>
      </Typography>
      <Box sx={{ textAlign: "center", mb: 3 }}>
        <img
          src={qrDataURL}
          alt="2FA QR Code"
          style={{ maxWidth: "200px", maxHeight: "200px" }}
        />
      </Box>

      {successMsg && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMsg}
        </Alert>
      )}

      <form onSubmit={handleVerify2FA} noValidate>
        <TextField
          label="6-digit code from Authenticator"
          fullWidth
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value.trim())}
          inputProps={{
            maxLength: 6,
            inputMode: "numeric",
            pattern: "\\d{6}",
            style:{wordSpacing:20},
          }}
          sx={{ mb: 2 }}
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={submitting || totpCode.length !== 6}
        >
          {submitting ? <CircularProgress size={20} /> : "Verify & Complete 2FA"}
        </Button>
      </form>
    </Box>
  );
};

export default AdminVerifyQR;
