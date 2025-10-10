import React, { useState } from "react";
import {
  Box,
  Button,
  Typography,
  Paper,
  Grid,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from "@mui/material";
import { FaRedo } from "react-icons/fa";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";

const RegenerateBackupCodes = () => {
  const [codes, setCodes] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegenerate = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const resp = await axiosInstanceAdmin.post("/api/admin/regenerate-backup-codes");
      if (resp.data.backupCodes) {
        setCodes(resp.data.backupCodes);
        setSuccess(true);
      }
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message ||
        "Could not regenerate codes. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        startIcon={<FaRedo />}
        color="secondary"
        variant="outlined"
        onClick={() => setOpen(true)}
      >
        Regenerate Backup Codes
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Regenerate Backup Codes</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            <b>Warning:</b> This will invalidate all previous backup codes.
            Save the new codes securely!
          </Typography>
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              New backup codes generated!
            </Alert>
          )}
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}
          {loading ? (
            <Box sx={{ textAlign: "center", mt: 2 }}>
              <CircularProgress />
            </Box>
          ) : codes.length > 0 ? (
            <Paper elevation={1} sx={{ p: 2, bgcolor: "#f8f8f8" }}>
              <Grid container spacing={1}>
                {codes.map((code, i) => (
                  <Grid item xs={6} md={4} key={i}>
                    <Box
                      sx={{
                        p: 1,
                        bgcolor: "#e3f2fd",
                        borderRadius: 1,
                        textAlign: "center",
                        fontFamily: "monospace",
                        fontWeight: "bold",
                        fontSize: 16,
                        letterSpacing: 1,
                      }}
                    >
                      {code}
                    </Box>
                  </Grid>
                ))}
              </Grid>
              <Typography sx={{ mt: 1, fontSize: 13, color: "gray" }}>
                Save these new codes securely now.
              </Typography>
            </Paper>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} color="primary">
            Close
          </Button>
          {!success && (
            <Button
              onClick={handleRegenerate}
              color="secondary"
              variant="contained"
              startIcon={<FaRedo />}
              disabled={loading}
            >
              {loading ? <CircularProgress size={20} /> : "Regenerate"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};
export default RegenerateBackupCodes;