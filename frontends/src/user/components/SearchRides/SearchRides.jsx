import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './SearchRides.css';
import {
  FaCheck,
  FaCircle,
  FaRegCircle,
  FaMotorcycle,
  FaStar,
} from 'react-icons/fa';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import AirportShuttleIcon from '@mui/icons-material/AirportShuttle';
import {
  Box,
  Skeleton,
  Typography,
  Chip,
  Button,
  Grid,
  Alert,
} from '@mui/material';
import { useDispatch } from 'react-redux';
import { addToCart } from '../../../features/cart/cartSlice';
import { socket } from '../../Provider/UserSocketProvider';
import { toast } from 'react-toastify';
import axiosInstance from '../../../../axiosInstance';

// Helper to call Google Directions API via hidden map
const fetchRouteInfo = (serviceMap, origin, destination) =>
  new Promise((resolve, reject) => {
    const service = new window.google.maps.DirectionsService();
    service.route(
      { origin, destination, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, status) => {
        if (status === 'OK' && result.routes[0]?.legs?.[0]) {
          const leg = result.routes[0].legs[0];
          resolve({
            durationText: leg.duration.text,
            distanceText: leg.distance.text,
          });
        } else {
          reject(status);
        }
      }
    );
  });

const renderRideTypeIcon = (rideType) => {
  const type = rideType.toLowerCase();
  if (type === 'bus') return <DirectionsBusIcon style={{ fontSize: 32 }} />;
  if (type === 'motorcycle') return <FaMotorcycle size={32} />;
  if (type === 'car') return <AirportShuttleIcon style={{ fontSize: 32 }} />;
  return null;
};

export default function SearchRides({ sortOption, filterOption }) {
  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  const [rides, setRides] = useState([]);
  const [routeInfo, setRouteInfo] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

 // 1) Safely load searchData
  const searchData = useMemo(() => {
    const raw = location.state || localStorage.getItem('searchData');
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); }
      catch { return null; }
    }
    return raw;
  }, [location.state]);

 const stripAccents = (s = "") => 
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
      
  // — 2) Derive primitives for room‐join effect
  const pickupNorm = useMemo(
    () => searchData?.pickup ? stripAccents(searchData.pickup) : '',
    [searchData?.pickup]
  );
  const destNorm = useMemo(
    () => searchData?.destination ? stripAccents(searchData.destination) : '',
    [searchData?.destination]
  );
  const searchDate = useMemo(
    () => searchData?.selectedDate
      ? new Date(searchData.selectedDate).toISOString().split('T')[0]
      : '',
    [searchData?.selectedDate]
  );

  // 1) Fetch rides
useEffect(() => {
if (!searchData?.pickup || !searchData?.destination) return;

  const fetchRides = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        pickup: searchData.pickup,
        destination: searchData.destination,
        selectedDate: searchData.selectedDate,
        sort: sortOption,
        filter: filterOption !== "all" ? filterOption : undefined,
        page: currentPage,
        limit: 10,
      };
      const res = await axiosInstance.get("/api/rides/search", { params });
      setRides(res.data.rides);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      setError(err.response?.data?.message || "Error fetching rides");
    } finally {
      setLoading(false);
    }
  };

  fetchRides();
}, [ searchData?.pickup, searchData?.destination, searchData?.selectedDate, sortOption, filterOption, currentPage ]
);

   // 2) Join search room and listen for rideFull
 useEffect(() => {
if (!pickupNorm || !destNorm || !searchDate) return;

   const roomPayload = { pickupNorm, destinationNorm: destNorm, date: searchDate };
   socket.emit("joinSearchRoom", roomPayload);

   const handleFull = ({ rideId }) => {
     setRides((prev) =>
       prev.map((r) =>
         r._id === rideId ? { ...r, isFull: true } : r
       )
     );
     // optional toast:
     toast.info("A ride just filled up — it’s now marked Full.");
   };

   socket.on("rideFull", handleFull);

   return () => {
     socket.emit("leaveSearchRoom", roomPayload);
     socket.off("rideFull", handleFull);
   };
 }, [pickupNorm, destNorm, searchDate]);

  // 2) Compute ETA & distance
  useEffect(() => {
    if (!rides.length || !window.google) return;
    const mapDiv = document.createElement('div');
    const serviceMap = new window.google.maps.Map(mapDiv);
    rides.forEach((ride) => {
      const origin = {
        lat: ride.pickupLocation.coordinates[1],
        lng: ride.pickupLocation.coordinates[0],
      };
      const destination = {
        lat: ride.destinationLocation.coordinates[1],
        lng: ride.destinationLocation.coordinates[0],
      };
      fetchRouteInfo(serviceMap, origin, destination)
        .then((info) =>
          setRouteInfo((prev) => ({ ...prev, [ride._id]: info }))
        )
        .catch(() => {});
    });
  }, [rides]);

  const handleSelectRide = (ride) => {
    // 1) Dispatch into Redux
    dispatch(addToCart(ride));
    navigate('/cart');
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString();
  };

  const calculateEndTime = (start, duration) => {
    if (!start || !duration) return start;
    const [sh, sm] = start.split(':').map(Number);
    const [dh, dm] = duration.split(':').map(Number);
    let eh = sh + dh;
    let em = sm + dm;
    if (em >= 60) {
      eh += Math.floor(em / 60);
      em %= 60;
    }
    eh %= 24;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  };

  const formatDuration = (duration) => {
    if (!duration) return 'Duration N/A';
    const [h, m] = duration.split(':');
    return `${h}h ${m}m`;
  };

  const prevPage = () => currentPage > 1 && setCurrentPage((p) => p - 1);
  const nextPage = () => currentPage < totalPages && setCurrentPage((p) => p + 1);

  if (loading) {
    return (
      <Box className="skeleton-container">
        <Skeleton variant="text" width="60%" height={30} />
        {[...Array(2)].map((_, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            height={200}
            sx={{ mb: 2 }}
          />
        ))}
      </Box>
    );
  }

  if (error) return <Typography color="error"><Alert severity='error'>{error}</Alert></Typography>;
  if (!rides.length) return <Typography sx={{fontWeight:"bold", p:3, fontSize:16}}><Alert sx={{ p:3, fontSize:16}} severity='info'>No rides found.</Alert></Typography>;

  return (
    <Box sx={{ p: 2 }} className="search-rides">
      <Typography variant="h5" gutterBottom>
        {formatDate(rides[0].selectedDate)}, {rides[0].pickup} → {rides[0].destination}
      </Typography>
      <Grid container spacing={2}>
        {rides.map((ride) => {
          const info = routeInfo[ride._id] || {};
          const endTime = ride.duration
            ? calculateEndTime(ride.selectedTime, ride.duration)
            : ride.selectedTime;
          return (
            <Grid item xs={12} md={6} lg={20} key={ride._id}>
              <Box className="ride-card">
                <Box display="flex" justifyContent="space-between" mb={1}>
                      {ride.isFull ? (
                      <Chip label="Full" color="error" />
                    ) : (
                      <Chip label="Available" color="success" />
                    )}
                  <Chip label={info.durationText || '--'} color="primary" />
                  <Chip label={info.distanceText || '--'} variant="outlined" />
                </Box>
                <Box className="ride-date">
                  <Typography>{formatDate(ride.selectedDate)}</Typography>
                  <Typography>
                    {ride.currency} {ride.price.toFixed(2)}
                  </Typography>
                </Box>
                <hr />
                <Box className="ride-info">
                  <Box display="flex" alignItems="center">
                    {renderRideTypeIcon(ride.type)}
                    <Typography sx={{ ml: 1 }}>{ride.type}</Typography>
                  </Box>
                  <img
                    src={ride.imageUrl}
                    alt="ride"
                    onError={(e) => (e.target.src = '/default-ride.jpeg')}
                    className="ride-image"
                  />
                  {ride.driver?.imageUrl && (
                    <Box className="driver-info">
                      <img
                        src={ride.driver.imageUrl}
                        alt={ride.driver.name}
                        className="driver-image"
                      />
                      <Typography>{ride.driver.name}</Typography>
                    </Box>
                  )}
                  <FaCheck />
                  <Typography>
                    {ride.description} <FaStar /> 5.0
                  </Typography>
                </Box>
                <Box className="ride-timeline">
                  <Typography className="time-label">
                    {ride.selectedTime}
                  </Typography>
                  <FaCircle className="timeline-icon" />
                  <Box className="timeline-bar">
                    <Typography className="duration-label">
                      {formatDuration(ride.duration)}
                    </Typography>
                  </Box>
                  <FaRegCircle className="timeline-icon" />
                  <Typography className="time-label">
                    {endTime}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  fullWidth
                  disabled={ride.isFull}
                  onClick={() => handleSelectRide(ride)}
                  sx={{ mt: 1 }}
                >
                  {ride.isFull ? "Full" : "Select"}
                </Button>
              </Box>
            </Grid>
          );
        })}
      </Grid>
      <Box display="flex" justifyContent="center" alignItems="center" mt={2}>
        <Button onClick={prevPage} disabled={currentPage === 1}>
          Previous
        </Button>
        <Typography sx={{ mx: 2 }}>
          Page {currentPage} of {totalPages}
        </Typography>
        <Button onClick={nextPage} disabled={currentPage === totalPages}>
          Next
        </Button>
      </Box>
    </Box>
  );
}
