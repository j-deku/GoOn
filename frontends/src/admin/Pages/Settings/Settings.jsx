import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Card, CardHeader, CardContent, Divider, TextField, Button,
  Avatar, Typography, Switch, FormControlLabel, List, ListItem,
  ListItemAvatar, ListItemText, Chip, CircularProgress, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, FormGroup,
  Alert, Snackbar
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import * as Yup from 'yup';
import { Formik, Form } from 'formik';
import { FaUsers, FaKey, FaUser, FaBell, FaTimes, FaCog, FaArrowLeft } from 'react-icons/fa';
import InviteAdminButton from '../../components/InviteAdminButton/InviteAdminButton';
import axiosInstanceAdmin from '../../../../axiosInstanceAdmin';
import './Settings.css';
import { adminLogout, clearAdmin } from '../../../features/admin/adminSlice';
import persistStore from 'redux-persist/es/persistStore';
import store from '../../../app/store';
import { useDispatch } from 'react-redux';
import { Helmet } from 'react-helmet-async';

const passwordSchema = Yup.object().shape({
  current: Yup.string()
    .required('Current password is required'),
  newPassword: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .matches(/(?=.*[0-9])/, 'Must contain a number')
    .matches(/(?=.*[A-Z])/, 'Must contain an uppercase letter')
    .matches(/(?=.*[!@#$%^&*])/, 'Must contain a special character')
    .required('New password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('newPassword'), null], 'Passwords must match')
    .required('Please confirm your new password'),
});

const Settings = () => {
  // State for invites, profile, avatar, password & UI feedback
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState(null);
  const dispatch = useDispatch();

  const [profile, setProfile] = useState({ name: '', email: '', avatar: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [showPwd, setShowPwd] = useState({ current: false, newPassword: false, confirmPassword: false });
  const [pwLoading, setPwLoading] = useState(false);

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchInvites();
    fetchProfile();
    // eslint-disable-next-line
  }, []);

  // Helpers for Snackbar
  const showSnackbar = (msg, severity = 'success') =>
    setSnackbar({ open: true, message: msg, severity });
  const closeSnackbar = () =>
    setSnackbar((prev) => ({ ...prev, open: false }));

  // Fetch pending invites
  const fetchInvites = async () => {
    setLoadingInvites(true);
    try {
      const { data } = await axiosInstanceAdmin.get('/api/admin/pending-invites', { withCredentials: true });
      if (data.success) setPendingInvites(data.invites);
    } catch {
      showSnackbar('Failed to load invites', 'error');
    } finally {
      setLoadingInvites(false);
    }
  };

  // Fetch admin profile
  const fetchProfile = async () => {
    try {
      const { data } = await axiosInstanceAdmin.get('/api/admin/me', { withCredentials: true });
      setProfile(data);
    } catch {
      showSnackbar('Failed to load profile', 'error');
    }
  };

  // Invite controls
  const handleAfterInvite = () => fetchInvites();
  const openConfirm = (invite) => {
    setSelectedInvite(invite);
    setConfirmOpen(true);
  };
  const closeConfirm = () => {
    setSelectedInvite(null);
    setConfirmOpen(false);
  };
  const handleConfirmCancel = async () => {
    try {
      await axiosInstanceAdmin.delete(`/api/admin/invite/${selectedInvite.id}`, { withCredentials: true });
      setPendingInvites((inv) => inv.filter((i) => i.id !== selectedInvite.id));
      showSnackbar('Invite cancelled');
    } catch {
      showSnackbar('Failed to cancel invite', 'error');
    } finally {
      closeConfirm();
    }
  };

  // Avatar upload handlers
  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setProfile((prev) => ({ ...prev, avatar: URL.createObjectURL(file) }));
    }
  };
  const uploadAvatar = async () => {
    if (!avatarFile) return;
    setUploading(true);
    const form = new FormData();
    form.append('avatar', avatarFile);
    try {
      const { data } = await axiosInstanceAdmin.post('/api/admin/profile/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }, withCredentials: true
      });
      if (data.success) {
        setProfile((prev) => ({ ...prev, avatar: data.user.avatar }));
        setAvatarFile(null);
        showSnackbar('Avatar updated ✅');
      }
    } catch {
      showSnackbar('Avatar upload failed ❌', 'error');
    } finally {
      setUploading(false);
    }
  };

  const toggleShow = (field) => {
    setShowPwd((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  // Password change handler using Formik values
  const changePassword = async (values, { resetForm }) => {
    setPwLoading(true);
    try {
      const { data } = await axiosInstanceAdmin.post(
        '/api/admin/profile/password',
        {
          current: values.current,
          newPassword: values.newPassword,
          confirmPassword: values.confirmPassword,
        },
        { withCredentials: true }
      );
      if (data.success) {
        showSnackbar('Password changed');
        resetForm();
            await dispatch(adminLogout());
            dispatch(clearAdmin());
            persistStore(store).purge();
            window.location.href = `${import.meta.env.VITE_AUTH_LINK1}/login`;
      }
    } catch (err) {
      showSnackbar(err.response?.data?.message || 'Password change failed', 'error');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <>
    <Helmet>
      <title>Settings - TOLI-Admin</title>
    </Helmet>
    <Box p={4} className="settings-root">
      <Typography
        variant="h4"
        gutterBottom
        sx={{
          bgcolor: 'rgb(9, 51, 65)',
          color: 'white',
          p: 2,
          borderRadius: 2,
        }}
      >
        <IconButton sx={{ cursor: 'pointer', fontSize:16, color:"#ccc" }} onClick={() => window.history.back()}>
          <FaArrowLeft style={{ marginRight: 8 }} />
          Back
        </IconButton>|  
        <FaCog style={{ marginRight: 8, marginLeft:8 }} /> Settings
      </Typography>

      <Grid container spacing={4}>
        {/* Team Management */}
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardHeader avatar={<FaUsers />} title="Team Management" />
            <Divider />
            <CardContent>
              <InviteAdminButton afterInvite={handleAfterInvite} />
              <Box mt={2}>
                {loadingInvites ? (
                  <CircularProgress />
                ) : pendingInvites.length ? (
                  <List dense>
                    {pendingInvites.map((i) => (
                      <ListItem
                        key={i.id}
                        secondaryAction={
                          <IconButton onClick={() => openConfirm(i)}>
                            <FaTimes />
                          </IconButton>
                        }
                      >
                        <ListItemAvatar>
                          <Avatar>{i.email[0]}</Avatar>
                        </ListItemAvatar>
                        <ListItemText primary={i.email} secondary={i.role} />
                        <Chip label="Pending" color="warning" />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Alert severity="info">No pending invites</Alert>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Profile Photo */}
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardHeader avatar={<FaUser />} title="Profile Photo" />
            <Divider />
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar src={profile.avatar} sx={{ width: 80, height: 80, mx: 'auto' }} />
              <Box mt={1}>
                <Button component="label">
                  Choose Photo
                  <input type="file" hidden onChange={onFileChange} accept="image/*" />
                </Button>
                {avatarFile && (
                  <Button sx={{ ml: 1 }} disabled={uploading} onClick={uploadAvatar}>
                    {uploading ? 'Uploading...' : 'Upload'}
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Change Password */}
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardHeader avatar={<FaKey />} title="Change Password" />
            <Divider />
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Formik
                initialValues={{ current: '', newPassword: '', confirmPassword: '' }}
                validationSchema={passwordSchema}
                onSubmit={changePassword}
              >
                {({
                  values,
                  errors,
                  touched,
                  handleChange,
                  handleBlur,
                  isValid,
                  dirty,
                }) => (
                  <Form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {['current', 'newPassword', 'confirmPassword'].map((field) => (
                      <Box key={field} sx={{ position: 'relative' }}>
                        <TextField
                          fullWidth
                          name={field}
                          label={
                            field === 'current'
                              ? 'Current Password'
                              : field === 'newPassword'
                              ? 'New Password'
                              : field === 'confirmPassword'
                              ? 'Confirm Password'
                              : ''
                          }
                          type={showPwd[field] ? 'text' : 'password'}
                          value={values[field]}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={touched[field] && Boolean(errors[field])}
                          helperText={touched[field] && errors[field]}
                          autoComplete={
                            field === 'current'
                              ? 'current-password'
                              : field === 'newPassword'
                              ? 'new-password'
                              : field === 'confirmPassword'
                              ? 'new-password'
                              : undefined
                          }
                        />
                        <IconButton
                          onClick={() => toggleShow(field)}
                          sx={{
                            position: 'absolute',
                            top: '50%',
                            right: 8,
                            transform: 'translateY(-50%)',
                          }}
                          edge="end"
                          tabIndex={-1}
                        >
                          {showPwd[field] ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </Box>
                    ))}
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={pwLoading || !isValid || !dirty}
                    >
                      {pwLoading ? <CircularProgress size={24} /> : 'Update Password'}
                    </Button>
                  </Form>
                )}
              </Formik>
            </CardContent>
          </Card>
        </Grid>

        {/* Notifications */}
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardHeader avatar={<FaBell />} title="Notifications" />
            <Divider />
            <CardContent>
              <FormGroup>
                {['Email', 'SMS', 'Push', 'Sounds'].map((label) => (
                  <FormControlLabel key={label} control={<Switch defaultChecked />} label={label} />
                ))}
              </FormGroup>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2">Do Not Disturb</Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1 }}>
                <TextField label="Start" type="time" />
                <TextField label="End" type="time" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Cancel Dialog */}
      <Dialog open={confirmOpen} onClose={closeConfirm}>
        <DialogTitle>Cancel Invite</DialogTitle>
        <DialogContent>
          <Typography>
            Cancel invite for <strong>{selectedInvite?.email}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirm}>No</Button>
          <Button color="error" variant="contained" onClick={handleConfirmCancel}>
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        message={snackbar.message}
        autoHideDuration={5000}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
    </>
  );
};

export default Settings;