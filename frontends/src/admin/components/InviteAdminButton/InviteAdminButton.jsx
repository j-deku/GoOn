import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Box,
  Typography,
  IconButton,
  Tooltip
} from "@mui/material";
import { FaUserPlus } from "react-icons/fa";
import axios from "../../../../axiosInstanceAdmin";

// The roles you want to allow inviting for:
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "super-admin", label: "Super Admin" },
  { value: "admin-manager", label: "Admin Manager" }
];

export default function InviteAdminButton({ afterInvite }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleOpen = () => {
    setOpen(true);
    setEmail("");
    setRole("admin");
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleClose = () => setOpen(false);

  const handleInvite = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const resp = await axios.post("/api/admin/invite", {
        email,
        roles: [role]
      });
      if (resp.data.success) {
        setSuccessMsg("Invitation sent! The user will receive an email with setup instructions.");
        if (afterInvite) afterInvite();
      } else {
        setErrorMsg(resp.data.message || "Failed to send invite.");
      }
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Network/server error."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip title="Invite New Admin">
        <Button
          variant="contained"
          color="primary"
          startIcon={<FaUserPlus />}
          onClick={handleOpen}
        >
          Invite Admin
        </Button>
      </Tooltip>
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>Invite New Admin</DialogTitle>
        <form onSubmit={handleInvite}>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>
              Enter the email address and role for the new admin. They will receive a secure invite link.
            </Typography>
            {errorMsg && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errorMsg}
              </Alert>
            )}
            {successMsg && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {successMsg}
              </Alert>
            )}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              fullWidth
              sx={{ mb: 2 }}
            />
            <TextField
              label="Role"
              select
              value={role}
              onChange={e => setRole(e.target.value)}
              required
              fullWidth
              sx={{ mb: 2 }}
            >
              {ROLE_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} color="inherit" disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={loading || !email}
              startIcon={loading ? <CircularProgress size={20} /> : <FaUserPlus />}
            >
              {loading ? "Sending..." : "Send Invite"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}