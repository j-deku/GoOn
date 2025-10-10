import React, { useEffect } from 'react';
import { Box, CssBaseline, Drawer, Toolbar, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import Navbar from '../Navbar/Navbar';
import Sidebar from '../Sidebar/Sidebar';
import MobileSidebar from '../MobileSidebar/MobileSidebar';
import { Helmet } from 'react-helmet-async';

const drawerWidth = 260;

export default function AuthLayout({ children }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [mobileOpen, setMobileOpen] = React.useState(() => {
    const saved = localStorage.getItem('drawerOpen');
    return saved === 'true';
  });

  const handleDrawerToggle = () => {
    const newState = !mobileOpen;
    setMobileOpen(newState);
    localStorage.setItem('drawerOpen', newState);
  };

  const location = useLocation();

  // Auto-close on route change for mobile/tablet
  useEffect(() => {
    if (!isDesktop) {
      setMobileOpen(false);
      localStorage.setItem('drawerOpen', 'false');
    }
  }, [location, isDesktop]);

  return (
    <>
    <Helmet>
      <title>GoOn-Admin</title>
    </Helmet>
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <Navbar onMenuClick={handleDrawerToggle} isMenuOpen={mobileOpen} />

      {/* Mobile / Tablet: Framer Motion sidebar */}
      {!isDesktop && (
        <MobileSidebar open={mobileOpen} onClose={() => handleDrawerToggle()} />
      )}

      {/* Desktop: Permanent MUI drawer */}
      {isDesktop && (
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', lg: 'block' },
            '& .MuiDrawer-paper': { width: drawerWidth },
          }}
          open
        >
          <Toolbar />
          <Sidebar />
        </Drawer>
      )}

      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, ml: { lg: `${drawerWidth}px` } }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
        </>
  );
}
