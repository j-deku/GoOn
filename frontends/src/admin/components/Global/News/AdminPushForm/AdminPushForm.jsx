import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  TextField,
  Typography,
  Stack,
  CircularProgress, 
} from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'; 
import utc from 'dayjs/plugin/utc'; 
import axiosInstanceAdmin from '../../../../../../axiosInstanceAdmin';
import { Helmet } from 'react-helmet-async';
import { FaArrowCircleLeft, FaBackward } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

dayjs.extend(isSameOrAfter);
dayjs.extend(utc); 

const initialFormState = {
  title: '',
  body: '',
  imageUrl: '',
  url: '',
  sendAt: null, 
};

const AdminPushForm = () => {
  const [form, setForm] = useState(initialFormState);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(false); 
  const [errors, setErrors] = useState({}); 
  const navigate = useNavigate();

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  }, []);

  const handleDateChange = useCallback((newValue) => {
    setForm((prev) => ({ ...prev, sendAt: newValue }));
    setErrors((prev) => ({ ...prev, sendAt: '' })); 
  }, []);

  // Client-side validation logic
  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!form.title.trim()) {
      newErrors.title = 'Title is required.';
    }
    if (!form.body.trim()) {
      newErrors.body = 'Body is required.';
    }
    if (form.sendAt && dayjs(form.sendAt).isBefore(dayjs())) {
      newErrors.sendAt = 'Scheduled time must be in the future.';
    }
    if (form.url && !/^(ftp|http|https):\/\/[^ "]+$/.test(form.url)) {
      newErrors.url = 'Invalid URL format.';
    }
    if (form.imageUrl && !/^(ftp|http|https):\/\/[^ "]+$/.test(form.imageUrl)) {
      newErrors.imageUrl = 'Invalid Image URL format.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) {
      toast.error('Please correct the highlighted errors.');
      return;
    }

    setLoading(true);
    try {
      const dataToSend = {
        ...form,
        sendAt: form.sendAt ? dayjs(form.sendAt).utc().toISOString() : null, 
      };

      const response = await axiosInstanceAdmin.post('/api/admin/global-update', dataToSend, { withCredentials: true });

      toast.success(response.data.message || 'Notification sent/scheduled successfully! 🎉');
      setForm(initialFormState); 
      setPreview(false);
      setErrors({}); 

    } catch (err) {
      console.error('Failed to send global update:', err);
      const errorMessage = err.response?.data?.message || 'Failed to send notification. Please try again.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [form, validateForm]); 

  const MemoizedPreview = useMemo(() => {
    if (!preview) return null;

    const formattedScheduledAt = form.sendAt
      ? dayjs(form.sendAt).format('YYYY-MM-DD HH:mm')
      : 'Immediately';

    return (
      <Box mt={4}>
        <Typography variant="h6" gutterBottom>
          Notification Preview 📱
        </Typography>
        <Card sx={{ bgcolor: '#f4f6f8', p: 2, borderRadius: 2, boxShadow: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {form.title || 'Untitled Notification'}
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            {form.body || 'No content provided.'}
          </Typography>
          {form.imageUrl && (
            <Box mt={1} mb={2}>
              <img
                src={form.imageUrl}
                alt="Preview"
                style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, objectFit: 'cover' }}
                onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/150?text=Image+Load+Error'; }} // Fallback for broken image
              />
            </Box>
          )}
          {form.url && (
            <Typography mt={1} variant="body2" color="primary" sx={{ wordBreak: 'break-all' }}>
              ➤ <a href={form.url} target="_blank" rel="noopener noreferrer">{form.url}</a>
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            Scheduled: {formattedScheduledAt}
          </Typography>
        </Card>
      </Box>
    );
  }, [preview, form]); 

  return (
    <>
    <Helmet>
      <title>Admin - Global Push Notification</title>
      <meta name="description" content="Admin panel for managing global push notifications." />
    </Helmet>
    <FaArrowCircleLeft size={40} style={{margin:10, cursor:"pointer"}} onClick={()=>navigate(-1)}/>
    <Box maxWidth="md" mx="auto" p={3}>
      <Card elevation={4}> 
        <CardHeader title="Global Push Notification Management" />
        <CardContent>
          <Stack spacing={3}> 
            <TextField
              label="Notification Title"
              name="title"
              value={form.title}
              onChange={handleChange}
              fullWidth
              required
              error={!!errors.title}
              helperText={errors.title}
            />
            <TextField
              label="Notification Body"
              name="body"
              value={form.body}
              onChange={handleChange}
              fullWidth
              multiline
              rows={4}
              required
              error={!!errors.body}
              helperText={errors.body}
            />
            <TextField
              label="Image URL (optional)"
              name="imageUrl"
              value={form.imageUrl}
              onChange={handleChange}
              fullWidth
              type="url" 
              error={!!errors.imageUrl}
              helperText={errors.imageUrl}
            />
            <TextField
              label="Redirect URL (optional)"
              name="url"
              value={form.url}
              onChange={handleChange}
              fullWidth
              type="url" 
              error={!!errors.url}
              helperText={errors.url}
            />
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DateTimePicker
                label="Schedule Date & Time (optional)"
                value={form.sendAt}
                onChange={handleDateChange}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    error: !!errors.sendAt,
                    helperText: errors.sendAt,
                  }
                }}
                minDateTime={dayjs()} 
                timezone="UTC" 
              />
            </LocalizationProvider>

            <Stack direction="row" spacing={2} justifyContent="flex-end"> 
              <Button
                variant="outlined"
                onClick={() => setPreview((prev) => !prev)}
                disabled={loading}
              >
                {preview ? 'Hide Preview' : 'Show Preview'}
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={loading}
                startIcon={loading && <CircularProgress size={20} color="inherit" />} 
              >
                {loading ? 'Sending...' : 'Send Notification'}
              </Button>
            </Stack>
          </Stack>

          {MemoizedPreview} 

        </CardContent>
      </Card>
    </Box>
    </>
  );
};

export default AdminPushForm;