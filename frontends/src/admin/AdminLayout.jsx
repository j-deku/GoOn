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

export default function AdminLayout() {

  return (
    <div>
      <Routes>
        <Route
          path="dashboard"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["admin", "super-admin", "admin-manager"]}>
                <AuthLayout>
                  <Dashboard />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route
          path="add"
          element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["super-admin", "admin-manager"]}>
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
              <PrivateRoute allowedRoles={["admin", "super-admin", "admin-manager"]}>
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
              <PrivateRoute allowedRoles={["admin", "super-admin", "admin-manager"]}>
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
              <PrivateRoute allowedRoles={["super-admin", "admin-manager"]}>
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
              <PrivateRoute allowedRoles={["admin", "super-admin", "admin-manager"]}>
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
              <PrivateRoute allowedRoles={["super-admin", "admin-manager"]}>
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
              <PrivateRoute allowedRoles={["super-admin", "admin-manager"]}>
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
              <PrivateRoute allowedRoles={[ "super-admin", "admin-manager"]}>
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
              <PrivateRoute allowedRoles={["super-admin", "admin-manager"]}>
                <AuthLayout>
                  <Finance />
                </AuthLayout>
              </PrivateRoute>
            </AdminSocketProvider>
          }
        />
        <Route path="settings" element={
          <AdminSocketProvider>
            <PrivateRoute allowedRoles={["admin-manager", "super-admin"]}>
              <Settings/>
            </PrivateRoute>
          </AdminSocketProvider>
          }
          />
          <Route path="push-test" allowedRoles={["super-admin"]} element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["super-admin"]}>
                <TestPush/>
              </PrivateRoute>            
            </AdminSocketProvider>
          }/>
          <Route path="push-global" allowedRoles={["super-admin"]} element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["super-admin", "admin-manager"]}>
                <AdminPushForm/>
              </PrivateRoute>            
            </AdminSocketProvider>
          }/>
            <Route path="push-history" allowedRoles={["super-admin", "admin-manager"]} element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["super-admin"]}>
                <NotificationsHistory/>
              </PrivateRoute>            
            </AdminSocketProvider>
          }/>
          <Route path="bull" allowedRoles={["super-admin", "admin-manager"]} element={
            <AdminSocketProvider>
              <PrivateRoute allowedRoles={["super-admin", "admin-manager"]}>
                <BullBoard/>
              </PrivateRoute>            
            </AdminSocketProvider>
          }/>
        <Route path="*" element={<NotFound/>} />
      </Routes>
      </div>
  );
}
