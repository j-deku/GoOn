// MyBookings.jsx
import React, { useEffect, useState, useCallback } from "react";
import PropTypes from "prop-types";
import {
  Box,
  Typography,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  Skeleton,
  Alert,
} from "@mui/material";
import { useSelector } from "react-redux";
import axiosInstance from "../../../../axiosInstance";
import { selectIsAuthenticated, selectUserId } from "../../../features/user/userSlice";
import UserLiveRideMap from "../../components/UserLiveRideMap/UserLiveRideMap";
import { Helmet } from "react-helmet-async";
import BookingCard from "../../components/BookingCard/BoookingCard";
import { useNavigate } from "react-router-dom";

export default function MyBookings() {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const userId = useSelector(selectUserId);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackingBooking, setTrackingBooking] = useState(null);
  const navigate = useNavigate()

  // define fetchBookings outside useEffect for reuse
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.post(
        "/api/booking/userBookings",
        {},
        { withCredentials: true }
      );
      setBookings(response.data.data || []);
    } catch (err) {
      console.error("Failed to fetch bookings:", err);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && userId) {
      fetchBookings();
    } else {
      setBookings([]);
    }
  }, [isAuthenticated, userId, fetchBookings]);

  return (
    <>
      <Helmet>
        <title>My Bookings – TOLI‑TOLI</title>
      </Helmet>
      <Box sx={{ p: 3 }} mt={20} mb={50}>
        <Typography variant="h4" gutterBottom sx={{textAlign:"center"}}>
          My Bookings
        </Typography>

        {loading ? (
          <Grid container spacing={2}>
            {[...Array(3)].map((_, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rectangular" height={200} />
                <Skeleton variant="rectangular" height={40} sx={{borderRadius:5, mt:2, width:"50%"}}/>
              </Grid>
            ))}
          </Grid>
        ) : bookings.length === 0 ? (
          <Box sx={{p:5, alignItems:"start"}}>
            <Alert severity="info" sx={{p:3, fontSize:20,}}>
              No bookings found.
              <Button onClick={()=>navigate("/searchRides")} variant="outlined" sx={{ pl:{xs:4, sm:8}, pr:{xs:4, sm:8}, placeSelf:"center",borderRadius:5, mt:1, ml:2 }}>
              Book Now
              </Button>
            </Alert> 
          </Box>
        ) : (
          <Grid container spacing={2}>
            {bookings.map((booking) => (
              <Grid item xs={12} sm={6} md={4} key={booking._id}>
                <BookingCard
                  booking={booking}
                  onTrack={() => setTrackingBooking(booking._id)}
                  onRefresh={fetchBookings}
                />
              </Grid>
            ))}
          </Grid>
        )}
        <Dialog
          open={Boolean(trackingBooking)}
          onClose={() => setTrackingBooking(null)}
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>Track Your Ride</DialogTitle>
          <DialogContent sx={{ height: 450 }}>
            {trackingBooking && <UserLiveRideMap bookingId={trackingBooking} />}
          </DialogContent>
        </Dialog>
      </Box>
    </>
  );
}
