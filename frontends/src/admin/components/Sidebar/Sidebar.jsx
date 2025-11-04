// src/components/Sidebar/Sidebar.jsx
import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Box,
  Card,
  CardHeader,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
} from "@mui/material";
import {
  AddBox as AddIcon,
  List as ListIcon,
  Book as BookingsIcon,
  DriveEta as DriverIcon,
  AssignmentTurnedIn as AssignIcon,
  AttachMoney as FinanceIcon,
  Notifications as PushTestIcon,
  Campaign as GlobalPushIcon,
  History as HistoryIcon,
  JoinFull as JobIcon,
  Settings as SettingsIcon,
  Dashboard as MetricsIcon,
} from "@mui/icons-material";
import { loadAllAssets } from "../../utils/loadImages";
import "./Sidebar.css";
import ToggleTheme from "../../../user/components/ToggleTheme/ToggleTheme";

const AUTH_LK = import.meta.env.VITE_AUTH_LINK1;
const AUTH_LK2 = import.meta.env.VITE_AUTH_LINK2;

const links = [{ to: `${AUTH_LK2}/dashboard`, text: "Dashboard", icon: <MetricsIcon /> }];

const links1 = [
  { to: `${AUTH_LK2}/add`, text: "Add Ride", icon: <AddIcon /> },
  { to: `${AUTH_LK2}/list`, text: "List Rides", icon: <ListIcon /> },
  { to: `${AUTH_LK2}/book`, text: "Booked Rides", icon: <BookingsIcon /> },
  { to: `${AUTH_LK2}/add-driver`, text: "Add Drivers", icon: <DriverIcon /> },
  { to: `${AUTH_LK2}/list-drivers`, text: "List Drivers", icon: <ListIcon /> },
  { to: `${AUTH_LK2}/assign-rides`, text: "Assign Rides", icon: <AssignIcon /> },
  { to: `${AUTH_LK2}/finance`, text: "Finance", icon: <FinanceIcon /> },
];

const links2 = [
  { to: `${AUTH_LK2}/push-test`, text: "Test Push", icon: <PushTestIcon /> },
  { to: `${AUTH_LK2}/push-global`, text: "Global Push", icon: <GlobalPushIcon /> },
  { to: `${AUTH_LK2}/push-history`, text: "Push History", icon: <HistoryIcon /> },
  { to: `${AUTH_LK2}/bull`, text: "Job History", icon: <JobIcon /> },
];

const links3 = [
  { to: `${AUTH_LK2}/settings`, text: "Profile Settings", icon: <SettingsIcon /> },
  { to: "", text: "Change Theme", icon: <ToggleTheme className="themeButton" /> },
];

export default function Sidebar() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const preload = async () => {
      if (!localStorage.getItem("adminAssetsLoaded")) {
        await loadAllAssets();
        localStorage.setItem("adminAssetsLoaded", "true");
      }
      sessionStorage.setItem("adminAssetsLoaded", "true");
      setLoading(false);
    };
    if (loading) preload();
  }, [loading]);

  // ✅ Fix duplicate keys: give each div a unique key per index
  if (loading) {
    const renderSkeletons = (count, sectionKey) =>
      Array.from({ length: count }).map((_, i) => (
        <Box key={`${sectionKey}-${i}`} sx={{ display: "flex", alignItems: "center" }}>
          <Skeleton variant="circular" height={45} width={30} sx={{ mb: 1, mr: 1 }} />
          <Skeleton variant="rectangular" height={48} sx={{ mb: 1, flexGrow: 1 }} />
        </Box>
      ));

    return (
      <Box>
        <Box sx={{ p: 2 }}>{renderSkeletons(links.length, "section-0")}</Box>
        <Box sx={{ p: 2, mt: 2 }}>{renderSkeletons(links1.length, "section-1")}</Box>
        <Box sx={{ p: 2, mt: 5 }}>{renderSkeletons(links2.length, "section-2")}</Box>
        <Box sx={{ p: 2, mt: 5 }}>{renderSkeletons(links3.length, "section-3")}</Box>
      </Box>
    );
  }

  return (
    <Box sx={{ width: 260, bgcolor: "background.paper", pt: 2 }}>
      <List>
        {links.map(({ to, text, icon }) => (
          <Card key={to} elevation={3}>
            <ListItemButton component={NavLink} to={to} sx={{ px: 3, py: 1.5 }}>
              <ListItemIcon>{icon}</ListItemIcon>
              <ListItemText primary={text} />
            </ListItemButton>
          </Card>
        ))}
      </List>

      <Divider sx={{ fontSize: 12 }} />

      <List>
        {links1.map(({ to, text, icon }) => (
          <ListItemButton key={to} component={NavLink} to={to} sx={{ px: 3, py: 1.5 }}>
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText primary={text} />
          </ListItemButton>
        ))}
      </List>

      <Divider />

      <List>
        <Card elevation={10}>
          <CardHeader sx={{ ml: 5 }} title="Notifications" />
        </Card>
        {links2.map(({ to, text, icon }) => (
          <ListItemButton key={to} component={NavLink} to={to} sx={{ px: 3, py: 1.5 }}>
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText primary={text} />
          </ListItemButton>
        ))}
      </List>

      <Divider />

      <List>
        <Card elevation={10}>
          <CardHeader sx={{ ml: 5 }} title="Settings" />
        </Card>
        {links3.map(({ to, text, icon }) => (
          <React.Fragment key={to || text}>
            <ListItemButton component={NavLink} to={to} sx={{ px: 3, py: 1.5 }}>
              <ListItemIcon>{icon}</ListItemIcon>
              <ListItemText primary={text} />
            </ListItemButton>
            <Divider />
          </React.Fragment>
        ))}
      </List>
    </Box>
  );
}
