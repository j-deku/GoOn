import React, { useState } from "react";
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Skeleton,
} from "@mui/material";
import { FaKey } from "react-icons/fa";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";

const VerifyBackupCode = () => {
  const [backupCode, setBackupCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const AUTH_LK = import.meta.env.VITE_AUTH_LINK1;
  const AUTH_LK2 = import.meta.env.VITE_AUTH_LINK2;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setVerifying(true);
    try {
      const pre2FAToken = localStorage.getItem("temp2FAToken");
      const resp = await axiosInstanceAdmin.post("/api/admin/verify-backup-code", {
        backupCode,
      },
    {
      headers: {
        Authorization: `Bearer ${pre2FAToken}`,
      },
    });
      if (resp.data.success) {
        setSuccessMsg("Backup code accepted! Redirecting…");
          <div>
        <Skeleton variant="text" width={300} />
        <Skeleton variant="text" width={200} />
        <Skeleton variant="rectangular" width={300} height={100} />
        <Skeleton variant="text" width={150} />
        <Skeleton variant="circular" width={40} height={40} />
        </div>
        localStorage.removeItem("temp2FAToken");
        sessionStorage.removeItem("pending2FA");
        setTimeout(() => {
          window.location.href = `${AUTH_LK2}/dashboard`;
        }, 1200);
      } else {
        setErrorMsg(resp.data.message || "Invalid backup code.");
      }
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Verification failed. Try again."
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, p: 4, boxShadow: 3, borderRadius: 2, bgcolor: "#fff" }}>
        <Box sx={{ textAlign: "center", mb: 2 }}>
          <FaKey size={40} color="#1e88e5" />
          <Typography variant="h5" fontWeight={600} sx={{ mt: 1 }}>
            Use Backup Code
          </Typography>
        </Box>
        <Typography sx={{ mb: 2 }}>
          If you cannot access your authenticator app, enter one of your backup codes below.
        </Typography>
        {successMsg && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {successMsg}
          </Alert>
        )}
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <TextField
            label="Backup Code"
            value={backupCode}
            onChange={e => setBackupCode(e.target.value.trim())}
            required
            fullWidth
            inputProps={{
              maxLength: 8,
              style: { fontFamily: "monospace", letterSpacing: 2 },
            }}
            sx={{ mb: 2 }}
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            disabled={verifying}
            sx={{ py: 1.2, fontWeight: "bold" }}
          >
            {verifying ? <CircularProgress size={22} /> : "Verify Backup Code"}
          </Button>
        </form>
      </Box>
    </Container>
  );
};

export default VerifyBackupCode;