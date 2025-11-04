import { useEffect, useState } from "react";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";
import { CheckBox, CheckBoxRounded } from "@mui/icons-material";

export default function AdminCommission() {
  const [ratePct, setRatePct] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Load current rate on mount
  useEffect(() => {
    axiosInstanceAdmin
      .get(`/api/admin/commission`)
      .then(({ data }) => {
        setRatePct((data.rate * 100).toFixed(1));
      })
      .catch(() => {
        setError("Failed to load commission rate.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = () => {
    const numeric = parseFloat(ratePct) / 100;
    if (isNaN(numeric) || numeric < 0 || numeric > 1) {
      setError("Enter a valid percentage between 0 and 100.");
      return;
    }
    setSaving(true);
    setError("");

    axiosInstanceAdmin.post(
      `/api/admin/commission`,
      { rate: numeric }
    ).then(() => {
      alert("Commission rate updated");
      setMessage("Rate updated");
    }).catch(() => {
      setError("Update failed.");
    }).finally(() => setSaving(false));
  };

  if (loading) return <CircularProgress size={50} style={{textAlign:"center", marginTop:150, marginLeft:180, justifyContent:"center"}}/>;

  return (
    <Box height={350} sx={{ maxWidth: 400, placeSelf:"center", mx: 'auto', mt: 5, p: 3, boxShadow: 2, borderRadius: 2 }}>
      
      <Typography variant="h6" gutterBottom>
        Platform Commission Rate
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}{message && <Alert severity="success">{message}</Alert>}
      <TextField
        label="Commission (%)"
        type="number"
        inputProps={{ min:0, max:100, step:0.1 }}
        value={ratePct}
        onChange={e => setRatePct(e.target.value)}
        fullWidth
        sx={{ my: 2 }}
      />
      <Button
        variant="contained"
        onClick={handleSave}
        disabled={saving}
        fullWidth
      >
        {saving ? <CircularProgress size={20} /> : "Update Rate"}
      </Button>

      <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
        <Typography component="span" fontWeight="bold">
          Note:
      </Typography>
        This rate determines the commission percentage taken from each transaction on the platform.
      </Typography>
    </Box>
  );
}