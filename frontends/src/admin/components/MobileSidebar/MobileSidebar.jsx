import React from 'react';
import { Toolbar, useTheme } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '../Sidebar/Sidebar';
const drawerWidth = 260;

export default function MobileSidebar({ open, onClose }) {
  const theme = useTheme();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: theme.zIndex.drawer + 1
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Sliding drawer */}
          <motion.aside
          role="dialog"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              height: '100vh',
              width: drawerWidth,
              zIndex: theme.zIndex.drawer + 2,
              background: theme.palette.background.paper,
              boxShadow: theme.shadows[6],
              overflowY: 'auto'
            }}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <Toolbar />
            <Sidebar />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
