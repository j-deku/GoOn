import React, { useEffect, useState } from "react";
import axios from "axios";
import io from "socket.io-client";
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TablePagination,
  TextField,
  Button,
  Stack,
  MenuItem,
  Typography,
  Box,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

const socket = io(import.meta.env.VITE_BACKEND_URL, { withCredentials: true });

const ActivityLog = () => {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [newLog, setNewLog] = useState(null);

  // Filters
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("desc");

  // Modal
  const [openModal, setOpenModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = async () => {
    try {
      const res = await axios.get("/api/admin/activity-logs", {
        params: {
          page: page + 1,
          limit: rowsPerPage,
          user,
          action,
          from,
          to,
          sort,
        },
        withCredentials: true,
      });
      if (res.data.success) {
        setLogs(res.data.logs);
        setTotal(res.data.total);
      }
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  // ✅ Auto-refresh when filters or pagination change (with debounce)
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchLogs();
    }, 400);
    return () => clearTimeout(timeout);
  }, [page, rowsPerPage, user, action, from, to, sort]);

  // ✅ Real-time new log listener
  useEffect(() => {
    socket.on("new_activity_log", (log) => {
      setNewLog(log);
      setLogs((prev) => [log, ...prev]);
      setTotal((prev) => prev + 1);
    });
    return () => socket.off("new_activity_log");
  }, []);

  // ✅ Live user online/offline update
  useEffect(() => {
    socket.on("user_status_update", (update) => {
      setLogs((prev) =>
        prev.map((log) =>
          log.user?.id === update.userId
            ? { ...log, user: { ...log.user, isOnline: update.isOnline } }
            : log
        )
      );
    });
    return () => socket.off("user_status_update");
  }, []);

  const handleSearch = () => {
    setPage(0);
    fetchLogs();
  };

  const handleReset = () => {
    setUser("");
    setAction("");
    setFrom("");
    setTo("");
    setSort("desc");
    setPage(0);
    fetchLogs();
  };

  const handleRowClick = (log) => {
    setSelectedLog(log);
    setOpenModal(true);
  };

  return (
    <Box p={2}>
      <Typography variant="h5" gutterBottom>
        Admin Activity Logs
      </Typography>

      {newLog && (
        <Box mb={2}>
          <Chip
            label={`🔔 New log from ${newLog.user?.name || "System"}: ${newLog.action}`}
            color="success"
            onClick={() => setNewLog(null)}
          />
        </Box>
      )}

      <Stack direction="row" spacing={2} mb={3} flexWrap="wrap" sx={{ rowGap: 3 }}>
        <TextField label="User Name" size="small" value={user} onChange={(e) => setUser(e.target.value)} />
        <TextField label="Action" size="small" value={action} onChange={(e) => setAction(e.target.value)} />
        <TextField label="From" size="small" type="date" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" size="small" type="date" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} />
        <TextField select label="Sort" size="small" value={sort} onChange={(e) => setSort(e.target.value)}>
          <MenuItem value="desc">Newest First</MenuItem>
          <MenuItem value="asc">Oldest First</MenuItem>
        </TextField>
        <Button variant="contained" color="primary" onClick={handleSearch}>Apply</Button>
        <Button variant="outlined" color="secondary" onClick={handleReset}>Reset</Button>
      </Stack>

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Description</TableCell>
            <TableCell>IP</TableCell>
            <TableCell>Agent</TableCell>
            <TableCell>Time</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.map((log) => (
            <TableRow
              key={log.id}
              hover
              onClick={() => handleRowClick(log)}
              style={{ cursor: "pointer" }}
            >
              <TableCell>
                {log.user?.name || "System"}{" "}
                {log.user?.isOnline ? "🟢" : "⚪"}
              </TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>{log.description}</TableCell>
              <TableCell>{log.ipAddress}</TableCell>
              <TableCell style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                {log.userAgent}
              </TableCell>
              <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(e, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
      />

      {/* 🪟 Log Details Modal */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          Log Details
          <IconButton
            aria-label="close"
            onClick={() => setOpenModal(false)}
            sx={{ position: "absolute", right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedLog ? (
            <Box>
              <Typography><strong>User:</strong> {selectedLog.user?.name || "System"}</Typography>
              <Typography><strong>Email:</strong> {selectedLog.user?.email || "N/A"}</Typography>
              <Typography><strong>Action:</strong> {selectedLog.action}</Typography>
              <Typography><strong>Role:</strong> {selectedLog.role}</Typography>
              <Typography><strong>Description:</strong> {selectedLog.description}</Typography>
              <Typography><strong>IP Address:</strong> {selectedLog.ipAddress}</Typography>
              <Typography><strong>User Agent:</strong> {selectedLog.userAgent}</Typography>
              <Typography><strong>Online:</strong> {selectedLog.user?.isOnline ? "🟢 Online" : "⚪ Offline"}</Typography>
              <Typography><strong>Last Login:</strong> {selectedLog.user?.lastLoginAt ? new Date(selectedLog.user?.lastLoginAt).toLocaleString() : "N/A"}</Typography>
              <Typography><strong>Last Active:</strong> {selectedLog.user?.lastActiveAt ? new Date(selectedLog.user?.lastActiveAt).toLocaleString() : "N/A"}</Typography>
              <Typography><strong>Timestamp:</strong> {new Date(selectedLog.createdAt).toLocaleString()}</Typography>
            </Box>
          ) : (
            <Typography>No details available</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenModal(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ActivityLog;
