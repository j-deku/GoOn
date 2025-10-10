import { useState, useEffect } from 'react';
import './Bookings.css';
import { toast } from 'react-toastify';
import { assets } from '../../assets/assets';
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";
import { Alert, Skeleton, Stack } from '@mui/material';

const Bookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchAllBookings = async () => {
    setLoading(true);
    try {
      const response = await axiosInstanceAdmin.get(`/api/booking/list`, {
        withCredentials: true,
      });
      if (response.data.success) {
        setBookings(response.data.data);
      } else {
        setError(response.data.message);
      }
    } catch (error) {
      setError("Error fetching bookings", error);
      return error;
    }finally{
      setLoading(false);
    }
  };

  const statusHandler = async (event, bookingId) => {
    const newStatus = event.target.value;
    setLoadingStatus(true); 
    try {
      const response = await axiosInstanceAdmin.post(`/api/booking/status`, {
        bookingId,
        status: newStatus,
        withCredentials: true,
      });
      if (response.data.success) {
        setBookings((prevBookings) =>
          prevBookings.map((booking) =>
            booking._id === bookingId ? { ...booking, status: newStatus } : booking
          )
        );
        toast.success("Status updated successfully");
      } else {
        setError(response.data.message);
      }
    } catch (error) {
      toast.error("Failed to update order status");
      return error;
    } finally {
      setLoadingStatus(false); 
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "approved":
        return "status-approved";
      case "partially approved":
        return "status-partially";
      case "completed":
        return "status-completed";
      case "pending approval":
        return "status-pending";
      case "declined":
        return "status-cancelled";
      case "refunds":
        return "status-refunds";
      case "re-schedule":
        return "status-reschedule";
      default:
        return "";
    }
  };

  useEffect(() => {
    fetchAllBookings();
  }, []);

  return (
    <div className="order add">
      <h3>Booking Page</h3>
      {loading ? (
       <Stack>
        <Skeleton variant='rectangular' width={"100%"} height={150} sx={{mt:5}}/>
        <Skeleton variant='rectangular' width={"100%"} height={150} sx={{mt:5}}/>
        <Skeleton variant='rectangular' width={"100%"} height={150} sx={{mt:5}}/>
        <Skeleton variant='rectangular' width={"100%"} height={150} sx={{mt:5}}/>
       </Stack>
      ):(
      <div className="order-list">
        {error || bookings.length === 0 ? (        
          <Alert severity='info' sx={{m:5, width:500,p:2, fontSize:16}}>
          {error}
        </Alert>
      ):(
      <>
        {bookings.map((booking, index) => (
          <div key={index} className="order-item">
            <img src={assets.Parcel2} alt="Order Icon" />
            <div>
              <p className="order-item-design">
                {booking.rides.map((ride, index) => {
                  if (index === booking.rides.length - 1) {
                    return ride.pickup + " > " + ride.destination;
                  } else {
                    return ride.pickup + " > " + ride.destination + ", ";
                  }
                })}
              </p>
              <p className="order-item-name">
                {booking.address.firstName + " " + booking.address.lastName}
              </p>
              <div className="order-item-address">
                <p>{booking.address.street + ","}</p>
                <p>
                  {booking.address.city + ", " + booking.address.state + ", " +
                    booking.address.country + ", " + booking.address.zipCode}
                </p>
              </div>
              <p className="order-item-phone">{booking.address.phone}</p>
            </div>
            <p>Rides: {booking.rides.length}</p>
            <p>{booking.currency} {booking.amount}.00</p>
            <div>
              <p className={`status-badge ${getStatusClass(booking.status)}`}>
                {booking.status}
              </p>
              <select
                onChange={(event) => statusHandler(event, booking._id)}
                value={booking.status}
                disabled={loadingStatus} // Disable dropdown during status update
              >
                <option value="approved">Approved</option>
                <option value="pending approval">pending approval</option>
                <option value="partially approved">partially approved</option>
                <option value="completed">Completed</option>
                <option value="declined">Declined</option>
                <option value="refunds">Refunds</option>
                <option value="re-schedule">Re-schedule</option>
              </select>
            </div>
          </div>
        ))}
        </>
        )}
      </div>
      )}
    </div>
  );
};

export default Bookings;
