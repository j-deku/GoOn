import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { FaArrowAltCircleLeft } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

const BullBoard = () => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  return (
    <>
    <Box sx={{ p: 4, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <Typography variant="h4" gutterBottom fontWeight="bold">
          <FaArrowAltCircleLeft size={40} style={{margin:15, marginBottom:-5, cursor:"pointer"}} onClick={()=>navigate(-1)}/>
  📦 Job Queue Dashboard
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Monitor and manage your job queues via BullMQ.
      </Typography>

      {!loaded && !error && (
        <Box
          sx={{
            height: '75vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress />
          <Typography sx={{ ml: 2 }} color="text.secondary">
            Loading BullBoard...
          </Typography>
        </Box>
      )}

      {error && (
        <Alert
          severity="error"
          icon={<WarningAmberIcon />}
          sx={{ mt: 4, height: '75vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Box>
            <Typography variant="h6">Failed to load BullBoard interface.</Typography>
            <Typography variant="body2" color="text.secondary">
              Ensure your backend is running and CORS is correctly configured.
            </Typography>
          </Box>
        </Alert>
      )}

      <Paper
        elevation={3}
        sx={{
          mt: 3,
          display: loaded ? 'block' : 'none',
          height: '80vh',
          overflow: 'hidden',
          borderRadius: 2,
        }}
      >
        <iframe
          src="http://localhost:5000/api/admin/queues"
          title="BullBoard"
          style={{ width: '100%', height: '100%', border: 'none' }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      </Paper>
    </Box>
    </>
  );
};

export default BullBoard;
