// BookingCard.jsx
import React from "react";
import PropTypes from "prop-types";
import {
  Card,
  CardContent,
  CardMedia,
  Typography,
  Box,
  Button,
  Chip,
} from "@mui/material";
import { toast } from "react-toastify";
import axiosInstance from "../../../../axiosInstance";

const statusColors = {
  "pending approval": "warning",
  approved: "success",
  "partially approved": "info",
  "in progress": "info",
  completed: "default",
  declined: "error",
};

export default function BookingCard({ booking, onTrack, onRefresh }) {
  const rides = booking.rides || [];
  const inProgress = rides.some((r) => r.status === "in progress");

  const handleCancel = async () => {
    try {
      await axiosInstance.post(
        `/api/booking/${booking._id}/cancel`,
        {},
        { withCredentials: true }
      );
      toast.info("Booking cancelled.");
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Cancel failed.");
    }
  };

  return (
    <Card sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <CardMedia
        component="img"
        height="140"
        image="/call-away.jpeg"
        alt="Ride visual"
        width={30}
      />
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography variant="h6" gutterBottom noWrap>
          {rides.map((r, i) => (
            <React.Fragment key={r._id || i}>
              {r.pickup} → {r.destination}
              {i < rides.length - 1 && ", "}
            </React.Fragment>
          ))}
        </Typography>
        <Box sx={{ mb: 1 }}>
          <Typography variant="body2">
            <strong>Amount:</strong> {booking.currency} {booking.amount.toFixed(2)}
          </Typography>
          <Typography variant="body2">
            <strong>Rides:</strong> {rides.length}
          </Typography>
        </Box>
        <Chip
          label={booking.status}
          color={statusColors[booking.status] || "default"}
        />
      </CardContent>
      <Box sx={{ p: 2, pt: 0 }}>
        <Button
          variant="contained"
          fullWidth
          disabled={!inProgress}
          onClick={onTrack}
          sx={{
            mt: 1,
            backgroundColor: inProgress ? "#0A4D68" : "grey.400",
          }}
        >
          {inProgress ? "Track Ride" : "Not Available"}
        </Button>
        <Button
          variant="outlined"
          color="error"
          fullWidth
          disabled={!["pending approval","approved"].includes(booking.status)}
          onClick={handleCancel}
          sx={{ mt: 1 }}
        >
          Cancel
        </Button>
      </Box>
    </Card>
  );
}

BookingCard.propTypes = {
  booking: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    rides: PropTypes.arrayOf(
      PropTypes.shape({
        _id: PropTypes.string,
        pickup: PropTypes.string,
        destination: PropTypes.string,
        status: PropTypes.string,
      })
    ),
    amount: PropTypes.number,
    currency: PropTypes.string,
    status: PropTypes.string,
  }).isRequired,
  onTrack: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired, 
};