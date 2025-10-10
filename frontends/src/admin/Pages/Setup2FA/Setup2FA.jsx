import React, { useEffect, useState } from "react";
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Divider,
  IconButton,
  Tooltip,
} from "@mui/material";
import { FaShieldAlt } from "react-icons/fa";
import { MdFileDownload } from "react-icons/md";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";

const Setup2FA = () => {
  const [qrDataURL, setQrDataURL] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [totpCode, setTotpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const AUTH_LK = import.meta.env.VITE_AUTH_LINK1;
  const AUTH_LK2 = import.meta.env.VITE_AUTH_LINK2;

  // Download backup codes as .txt file
  const downloadBackupCodes = () => {
    const content =
      "TOLI-TOLI Backup Codes\n\n" +
      backupCodes.join("\n") +
      "\n\nEach code can be used once. Keep this file safe!";
    const element = document.createElement("a");
    const file = new Blob([content], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "toli-toli-backup-codes.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  useEffect(() => {
    const fetchQR = async () => {
      try {
        const pre2FAToken = localStorage.getItem("temp2FAToken");
        const resp = await axiosInstanceAdmin.get("/api/admin/setup-2fa", {
          headers: {
            Authorization: `Bearer ${pre2FAToken}`,
          },
        });
        setQrDataURL(resp.data.qrDataURL);
        if (resp.data.backupCodes) setBackupCodes(resp.data.backupCodes);
      } catch (err) {
        setErrorMsg(
          err.response?.data?.message || "Failed to load 2FA setup. Try again."
        );
      } finally {
        setLoading(false);
      }
    };
    fetchQR();
  }, []);

  const handleVerify = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setVerifying(true);
    try {
      const resp = await axiosInstanceAdmin.post("/api/admin/verify-2fa", {
        totpCode,
      },{
        headers:{
          Authorization: `Bearer ${localStorage.getItem("temp2FAToken")}`,
        }
      });
      if (resp.data.success) {
        setSuccessMsg("2FA setup complete! Redirecting…");
        localStorage.removeItem("temp2FAToken");
        sessionStorage.removeItem("pending2FA");
        setTimeout(() => {
          window.location.href = `${AUTH_LK2}/dashboard`;
        }, 1200);
      } else {
        setErrorMsg(resp.data.message || "Verification failed.");
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
    <Container maxWidth="sm" sx={{ minHeight: "100vh", display: "flex", alignItems: "center" }}>
      <Box
        sx={{
          mt: 6,
          mb: 6,
          p: { xs: 2, sm: 4 },
          boxShadow: 6,
          borderRadius: 3,
          bgcolor: "#fafbfc",
          width: "100%",
        }}
      >
        <Stack alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Box sx={{
            bgcolor: "#e3f2fd",
            borderRadius: "50%",
            width: 66,
            height: 66,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: 2,
            mb: 1,
          }}>
            <FaShieldAlt size={36} color="#1e88e5" />
          </Box>
          <Typography variant="h5" fontWeight={700}>
            Secure Your Account
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 16, textAlign: "center" }}>
            Set up two-factor authentication (2FA) to protect your admin account.
          </Typography>
        </Stack>

        <Divider sx={{ mb: 3 }} />

        {loading ? (
          <Box sx={{ textAlign: "center", mt: 2 }}>
            <CircularProgress size={40} />
          </Box>
        ) : (
          <>
            {successMsg && (
              <Alert severity="success" sx={{ mb: 2, fontWeight: 500 }}>
                {successMsg}
              </Alert>
            )}
            {errorMsg && (
              <Alert severity="error" sx={{ mb: 2, fontWeight: 500 }}>
                {errorMsg}
              </Alert>
            )}

            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={600}>
                1. Scan QR Code
              </Typography>
              <Typography sx={{ color: "text.secondary" }}>
                Scan this QR code using Google Authenticator, Authy, or any TOTP app:
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                {qrDataURL && (
                  <img
                    src={qrDataURL}
                    alt="2FA QR"
                    style={{
                      maxWidth: 180,
                      maxHeight: 180,
                      border: "6px solid #f5f5f5",
                      borderRadius: 8,
                      background: "#fff",
                    }}
                  />
                )}
              </Box>
            </Stack>

            {backupCodes.length > 0 && (
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  my: 3,
                  bgcolor: "#f1f8e9",
                  border: "1px solid #c5e1a5",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                  <Typography fontWeight={700} flex={1}>
                    Backup Codes
                  </Typography>
                  <Tooltip title="Download backup codes">
                    <IconButton onClick={downloadBackupCodes} color="primary" size="large">
                      <MdFileDownload />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Grid container spacing={1}>
                  {backupCodes.map((code, i) => (
                    <Grid item xs={6} md={4} key={i}>
                      <Box
                        sx={{
                          p: 1,
                          bgcolor: "#fffde7",
                          borderRadius: 1,
                          textAlign: "center",
                          fontFamily: "monospace",
                          fontWeight: "bold",
                          fontSize: 16,
                          letterSpacing: 1,
                          border: "1px dashed #c5e1a5",
                        }}
                      >
                        {code}
                      </Box>
                    </Grid>
                  ))}
                </Grid>
                <Typography sx={{ mt: 2, fontSize: 13, color: "#33691e" }}>
                  Save these codes in a secure place. Each code can be used once if you lose access to your authenticator app.
                </Typography>
              </Paper>
            )}

            <Divider sx={{ mb: 2, mt: 3 }} />
            <form onSubmit={handleVerify}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    2. Enter 6-digit Code
                  </Typography>
                  <Typography sx={{ color: "text.secondary", fontSize: 15, mb: 1 }}>
                    Enter the 6-digit code from your authenticator app.
                  </Typography>
                  <TextField
                    label="Authenticator Code"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.trim())}
                    required
                    fullWidth
                    autoFocus
                    inputProps={{
                      maxLength: 6,
                      inputMode: "numeric",
                      pattern: "\\d{6}",
                      style: { letterSpacing: 4, fontSize: 22, textAlign: "center" },
                    }}
                    sx={{ mb: 0.5 }}
                  />
                </Box>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="large"
                  disabled={verifying || totpCode.length !== 6}
                  sx={{ fontWeight: 700, py: 1.3, letterSpacing: 1, fontSize: 17 }}
                >
                  {verifying ? <CircularProgress size={22} /> : "Verify & Enable 2FA"}
                </Button>
              </Stack>
            </form>

            <Divider sx={{ my: 3 }} />

            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ mb: 1, color: "text.secondary" }}>
                Can't access your authenticator app?
              </Typography>
              <Button
                color="secondary"
                variant="outlined"
                onClick={() => (window.location.href = "/admin/verify-backup-code")}
                sx={{
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  px: 3,
                  borderRadius: 2,
                }}
              >
                Use a Backup Code
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Container>
  );
};

export default Setup2FA;