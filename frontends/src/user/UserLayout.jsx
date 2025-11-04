import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

import Home from "./pages/Home/Home";
import PlaceBookings from "./pages/PlaceBookings/PlaceBookings";
import Verify from "./pages/Verify/Verify";
import NewsFeed from "./components/NewsFeed/NewsFeed";
import LoadingPage from "./components/LoadingPage/LoadingPage";
import ProfileDetails from "./components/ProfileDetails/ProfileDetails";
import PrivacyPolicy from "./components/Policy/PrivacyPolicy";
import Faq from "./components/FAQ/Faq";
import DeliveryInfo from "./components/DeliveryInfo/DeliveryInfo";
import AboutUs from "./components/AboutUs/AboutUs";
import VerifyOTP from "./components/VerifyOTP/VerifyOTP";
import Fleets from "./components/Fleets/Fleets";
import SearchInput from "./pages/SearchInput/SearchInput";
import ForgotPassword from "./components/ForgotPassword/ForgotPassword";
import PasswordReset from "./components/PasswordReset/PasswordReset";
import FirstQuestion from "./components/FirstQuestion/FirstQuestion";
import BookingDashboard from "./pages/BookingDashboard/BookingDashboard";
import TrackRide from "./pages/TrackRide/TrackRide";
import UserSocketProvider from "./Provider/UserSocketProvider";

import { 
  selectUser, 
  recoverSession,
  selectShouldRefreshUser,
  fetchUserInfo
} from "../features/user/userSlice";
import { loadAllAssets } from "./utils/loadImages";
import NotFound from "../admin/Pages/NotFound/NotFound";
import MainLayout from "./components/AuthLayout/AuthLayout";
import MyBookings from "./Pages/MyBookings/MyBookings";
import NotificationSetup from "../features/NotificationSetup/NotificationSetup";
import Cart from "./Pages/Cart/Cart";
import AuthGuard from "./Guard/AuthGuard/AuthGuard";
import { Typography } from "antd";
import store from "../app/store";
import SearchAvailable from "./components/SearchAvailable/SearchAvailable";

export default function UserLayout() {
  const user = useSelector(selectUser);
  const [login, setLogin] = useState(false);
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(() => !sessionStorage.getItem("assetsLoaded"));

  useEffect(() => {
    const preload = async () => {
      try {
        if (!localStorage.getItem("assetsLoaded")) {
          console.log("🎨 Loading application assets...");
          await loadAllAssets();
          localStorage.setItem("assetsLoaded", "true");
          console.log("✅ Assets loaded successfully");
        }
        sessionStorage.setItem("assetsLoaded", "true");
      } catch (error) {
        console.warn("⚠️ Asset loading failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isLoading) {
      preload();
    }
  }, [isLoading]);

useEffect(() => {
  const interval = setInterval(() => {
    if (selectShouldRefreshUser(store.getState())) {
      dispatch(recoverSession());
    }
  }, 10 * 60 * 1000);

  return () => clearInterval(interval);
}, [dispatch]);

useEffect(() => {
  dispatch(fetchUserInfo());
}, [dispatch]);

  if (isLoading) {
    return <LoadingPage />;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <AuthGuard>
        <UserSocketProvider>
          {user && <NotificationSetup />}
          <div className="app">
            <Routes>
              <Route element={<MainLayout login={login} setLogin={setLogin} />}>
                <Route path="/" element={<Home />} />
                <Route path="/newsFeed" element={<NewsFeed />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/deliveryInfo" element={<DeliveryInfo />} />
                <Route path="/aboutUs" element={<AboutUs />} />
                <Route path="/message-us" element={<Faq />} />
                <Route path="/fleets" element={<Fleets />} />
                <Route path="/searchRides" element={<BookingDashboard />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/verify" element={<Verify />} />
                <Route path="/profile" element={<ProfileDetails />} />
                <Route path="/checkout" element={<PlaceBookings />} />
                <Route path="/myBookings" element={<MyBookings />} />
                <Route path="/track-ride/:rideId" element={<TrackRide />} />
                <Route path="/verify-otp" element={<VerifyOTP setLogin={setLogin} />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password/:token" element={<PasswordReset />} />
                <Route path="/driveNuser" element={<FirstQuestion />} />
              </Route>
              <Route path="/search" element={<SearchAvailable/>}/>
              <Route path="/searchInput" element={<SearchInput />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </UserSocketProvider>
      </AuthGuard>
    </LocalizationProvider>
  );
}