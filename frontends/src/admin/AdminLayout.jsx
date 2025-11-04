// src/admin/AdminLayout.jsx
import { Routes, Route, Navigate } from "react-router-dom";

import PrivateRoute from "./utils/PrivateRoute";

import Add from "./Pages/Add/Add";
import Lists from "./Pages/Lists/Lists";
import Bookings from "./Pages/Bookings/Bookings";
import AddDriver from "./Pages/AddDriver/AddDriver";
import ListDrivers from "./Pages/ListDrivers/ListDrivers";
import AssignRides from "./Pages/AssignRides/AssignRides";
import UpdateRides from "./Pages/UpdateRides/UpdateRides";
import UpdateDrivers from "./Pages/UpdateDrivers/UpdateDrivers";
import Finance from "./Pages/Finance/Finance";
import AuthLayout from "./components/AuthLayout/AuthLayout";
import AdminSocketProvider from "./provider/AdminSocketProvider";
import Dashboard from "./Pages/Dashboard/Dashboard";
import Settings from "./Pages/Settings/Settings";
import NotFound from "./Pages/NotFound/NotFound";
import TestPush from "./Pages/TestPush/TestPush";
import AdminPushForm from "./components/Global/News/AdminPushForm/AdminPushForm";
import NotificationsHistory from "./components/Global/News/NotificationHistory/NotificationHistory";
import BullBoard from "./components/Global/News/BullBoard/BullBoard";
import ActivityLog from "./Pages/ActivityLog/ActivityLog";

export default function AdminLayout() {

  return (
    <div>
      <Routes>
        <Route
          path="dashboard"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <Dashboard />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
         <Route
          path="activity-logs"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <ActivityLog />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route
          path="add"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <Add />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route
          path="list"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <Lists />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route
          path="book"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <Bookings />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route
          path="add-driver"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <AddDriver />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route
          path="list-drivers"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <ListDrivers />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route
          path="assign-rides"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <AssignRides />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route
          path="update-ride/:id"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <UpdateRides />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route
          path="update-driver/:id"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={[ "ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <UpdateDrivers />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />

        {/* "/admin/finance" */}
        <Route
          path="finance"
          element={
            <AdminSocketProvider> 
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AuthLayout>
                  <Finance />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route path="settings" element={
          <AdminSocketProvider>
            <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
              <Settings/>
            </PrivateRoute>
          </AdminSocketProvider>
          }
          />
          <Route path="push-test" allowedRoles={["SUPER_ADMIN"]} element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["SUPER_ADMIN"]}>
                <TestPush/>
              </PrivateRoute>            
            </AdminSocketProvider>
          }/>
          <Route path="push-global" allowedRoles={["SUPER_ADMIN"]} element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <AdminPushForm/>
              </PrivateRoute>            
            </AdminSocketProvider>
          }/>
            <Route path="push-history" allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]} element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["SUPER_ADMIN"]}>
                <NotificationsHistory/>
              </PrivateRoute>            
            </AdminSocketProvider>
          }/>
          <Route path="bull" allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]} element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"]}>
                <BullBoard/>
              </PrivateRoute>            
            </AdminSocketProvider>
          }/>
        <Route path="*" element={<NotFound/>} />
      </Routes>
      </div>
  );
}
