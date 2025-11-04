/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Divider,
  ListItemIcon,
} from '@mui/material';
import { motion } from 'framer-motion';
import { MdEmail, MdLogout, MdSettings } from 'react-icons/md';
import { useDispatch, useSelector } from 'react-redux';
import { adminLogout, clearAdmin, selectIsAdminAuthenticated } from '../../../features/admin/adminSlice';
import persistStore from 'redux-persist/es/persistStore';
import store from '../../../app/store';
import AnimatedMenu from '../../../shared/components/common/AnimatedMenu/AnimatedMenu';
import { MotionMenuItem } from '../../../shared/components/common/MotionMenuItem/MotionMenuItem';
import axiosInstanceAdmin from '../../../../axiosInstanceAdmin';

export default function Navbar({ onMenuClick, isMenuOpen }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const isAdminAuthenticated = useSelector(selectIsAdminAuthenticated);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const AUTH_LK = import.meta.env.VITE_AUTH_LINK1;
  const AUTH_LK2 = import.meta.env.VITE_AUTH_LINK2;


  useEffect(() => {
    axiosInstanceAdmin
      .get('/api/admin/me', { withCredentials: true })
      .then((res) => setAvatarUrl(res.data.avatar))
      .catch(console.error);
  }, []);

  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  useEffect(() => {
    if (!isAdminAuthenticated) {
      navigate('/login');
    }
  }, [isAdminAuthenticated, navigate]);

  const handleLogout = async () => {
    await dispatch(adminLogout());
  };

  return (
    <AppBar
      position="fixed"
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, background: 'linear-gradient(90deg, black, #504e4eff)' }}
    >
      <Toolbar> 
        {/* Animated Hamburger Icon */}
        <IconButton
          color="inherit"
          edge="start"
          onClick={onMenuClick}
          sx={{ mr: 1, display: { lg: 'none' } }}
          aria-label="open drawer"
        >
          <motion.div
            initial={false}
            animate={isMenuOpen ? 'open' : 'closed'}
            variants={{
              open: { rotate: 45 },
              closed: { rotate: 0 },
            }}
            transition={{ duration: 0.3 }}
            style={{
              width: 24,
              height: 24,
              position: 'relative',
            }}
          >
            {/* Top Line */}
            <motion.span
              style={{
                position: 'absolute',
                top: 6,
                left: 0,
                width: '100%',
                height: 2,
                background: '#fff',
                borderRadius: 2,
              }}
              variants={{
                open: { rotate: 90, top: 11 },
                closed: { rotate: 0, top: 6 },
              }}
              transition={{ duration: 0.3 }}
            />
            {/* Middle Line */}
            <motion.span
              style={{
                position: 'absolute',
                top: 11,
                left: 0,
                width: '100%',
                height: 2,
                background: '#fff',
                borderRadius: 2,
              }}
              variants={{
                open: { opacity: 0 },
                closed: { opacity: 1 },
              }}
              transition={{ duration: 0.3 }}
            />
            {/* Bottom Line */}
            <motion.span
              style={{
                position: 'absolute',
                top: 16,
                left: 0,
                width: '100%',
                height: 2,
                background: '#fff',
                borderRadius: 2,
              }}
              variants={{
                open: { rotate: -90, top: 11 },
                closed: { rotate: 0, top: 16 },
              }}
              transition={{ duration: 0.3 }}
            />
          </motion.div>
        </IconButton>

        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
          <Link to={`${AUTH_LK2}/dashboard`}>
            <img src="/GN-logo.png" alt="Logo" height={50} />
          </Link>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {/* Welcome */}
        <Typography variant="h6" sx={{ mr: 3, display: { xs: 'none', sm: 'block' } }}>
          Welcome, {localStorage.getItem('adminEmail')}
        </Typography>

        {/* Avatar & Menu */}
        <IconButton onClick={handleMenuOpen} size="large" edge="end" color="inherit">
          {avatarUrl ? <Avatar src={avatarUrl} /> : <Avatar />}
        </IconButton>
              
        <AnimatedMenu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
          <MotionMenuItem onClick={handleMenuClose} component={Link} to={`${AUTH_LK2}/settings`}>
            <ListItemIcon><MdSettings /></ListItemIcon>
            Settings
          </MotionMenuItem>

          <MotionMenuItem component={Link} to="mailto:jdeku573@gmail.com">
            <ListItemIcon><MdEmail /></ListItemIcon>
            Email: {localStorage.getItem('adminEmail')}
          </MotionMenuItem>

          <Divider />

          <MotionMenuItem onClick={handleLogout}>
            <ListItemIcon><MdLogout /></ListItemIcon>
            Logout
          </MotionMenuItem>
        </AnimatedMenu>
      </Toolbar>
    </AppBar>
  );
}
