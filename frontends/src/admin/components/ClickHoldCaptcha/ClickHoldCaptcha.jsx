import { useState, useRef } from "react";
import { Box, Button, LinearProgress, Typography } from "@mui/material";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin"; // adjust path if needed

const HOLD_DURATION = 2500; // ms

const ClickHoldCaptcha = ({ onSuccess, disabled }) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdStart = useRef(null);
  const intervalRef = useRef(null);

  const handleMouseDown = () => {
    if (disabled) return;
    setIsHolding(true);
    holdStart.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStart.current;
      const percent = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setProgress(percent);

      if (percent >= 100) {
        clearInterval(intervalRef.current);
        setIsHolding(false);
        setProgress(100);

        // Send to server via axiosInstance
        axiosInstanceAdmin
          .post("/api/admin/verify-captcha-hold", {
            holdDuration: elapsed,
            startedAt: holdStart.current,
          })
          .then((res) => {
            if (res.data?.success) {
              onSuccess();
            } else {
              throw new Error("CAPTCHA failed");
            }
          })
          .catch(() => {
            alert("CAPTCHA verification failed. Try again.");
            setProgress(0);
          });
      }
    }, 20);
  };

  const handleMouseUp = () => {
    clearInterval(intervalRef.current);
    if (progress < 100) {
      setIsHolding(false);
      setProgress(0);
    }
  };

  return (
    <Box sx={{ textAlign: "center", mt: 2 }}>
      <Typography variant="caption" sx={{ mb: 1, display: "block" }}>
        Click and hold the button to verify you're human
      </Typography>
      <Button
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        disabled={disabled}
        variant="outlined"
        fullWidth
        sx={{ minHeight: 50 }}
      >
        {isHolding ? "Verifying..." : "Click & Hold to Verify"}
      </Button>
        <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ maxHeight:"100%", borderRadius: 1 }}
      />
    </Box>
  );
};

export default ClickHoldCaptcha;
