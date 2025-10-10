import React, { useState } from "react";
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from "@mui/material";
import { FaUser, FaLock } from "react-icons/fa";
import { useNavigate, useSearchParams } from "react-router-dom";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";

const AcceptInvite = () => {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSubmitting(true);
    try {
      const resp = await axiosInstanceAdmin.post("/api/admin/accept-invite", {
        token,
        name,
        password,
      });
      if (resp.data.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate("/admin/login");
        }, 2000);
      } else {
        setErrorMsg(resp.data.message || "Unknown error");
      }
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message ||
        "Server/network error. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, p: 4, boxShadow: 3, borderRadius: 2, bgcolor: "#fff" }}>
        <Typography variant="h4" align="center" sx={{ mb: 3, fontWeight: 600 }}>
          Accept Admin Invitation
        </Typography>
        {success ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            Account created! Redirecting you to login…
          </Alert>
        ) : (
          <>
            <Typography sx={{ mb: 3, color: "text.secondary" }}>
              Set up your admin account by choosing a name and password. You’ll configure 2FA after logging in.
            </Typography>
            <form onSubmit={handleSubmit}>
              <TextField
                label="Full Name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                fullWidth
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: <FaUser style={{ marginRight: 8 }} />,
                }}
              />
              <TextField
                label="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                required
                fullWidth
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: <FaLock style={{ marginRight: 8 }} />,
                }}
                helperText="Minimum 8 characters, strong password recommended."
              />
              {errorMsg && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {errorMsg}
                </Alert>
              )}
              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                disabled={submitting}
                sx={{ py: 1.2, fontWeight: "bold" }}
              >
                {submitting ? <CircularProgress size={24} /> : "Set Up Account"}
              </Button>
            </form>
          </>
        )}
      </Box>
    </Container>
  );
};

export default AcceptInvite;