import React, { useState, useEffect, useCallback } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Paper,
  TextField,
  Grid,
  MenuItem,
  Button,
} from "@mui/material";
import { MdExitToApp, MdOutlineSwapVert } from "react-icons/md";
import { APIProvider, Map, Marker, useApiIsLoaded } from "@vis.gl/react-google-maps";
import { useNavigate } from "react-router-dom";
import GooglePlacesAutocomplete from "react-google-places-autocomplete";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useSmoothDriverAnimation } from "../../../hooks/useSmoothDriverAnimation/useSmoothDriverAnimation";
import PassengerSelector from "../PassengerSelector/passengerSelector";

const SearchAvailable = () => {
  const navigate = useNavigate();
  const GOOGLE_MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID;
  const Maps_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const [center, setCenter] = useState({ lat: 5.6037, lng: -0.1870 });
  const [pickupCoords, setPickupCoords] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [destCoords, setDestCoords] = useState(null);
  const [tripDate, setTripDate] = useState(null);
  const [passengers, setPassengers] = useState(1);

  // Animated driver markers
  const [drivers] = useSmoothDriverAnimation([
    { id: 1, lat: 5.606, lng: -0.190 },
    { id: 2, lat: 5.609, lng: -0.185 },
  ]);

  const isLoaded = useApiIsLoaded();

  /** Auto-center when both pickup and destination are selected */
  useEffect(() => {
    if (pickupCoords && destCoords) {
      const lat = (pickupCoords.lat + destCoords.lat) / 2;
      const lng = (pickupCoords.lng + destCoords.lng) / 2;
      setCenter({ lat, lng });
    }
  }, [pickupCoords, destCoords]);

  /** Convert place_id to coordinates */
  const getCoordsFromPlaceId = useCallback((placeId, setCoords) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId }, (results, status) => {
      if (status === "OK" && results[0]?.geometry?.location) {
        const loc = results[0].geometry.location;
        setCoords({ lat: loc.lat(), lng: loc.lng() });
      }
    });
  }, []);

const handlePickupChange = (value) => {
  setPickup(value); // save the whole value object
  const placeId = value?.value?.place_id;
  if (placeId) getCoordsFromPlaceId(placeId, setPickupCoords);
};

const handleDestChange = (value) => {
  setDestination(value); // save the whole value object
  const placeId = value?.value?.place_id;
  if (placeId) getCoordsFromPlaceId(placeId, setDestCoords);
};

const handleSwap = () => {
  // Swap objects
  const prevPickup = pickup;
  const prevDestination = destination;
  setPickup(prevDestination);
  setDestination(prevPickup);

  // Swap coordinates
  const prevPickupCoords = pickupCoords;
  const prevDestCoords = destCoords;
  setPickupCoords(prevDestCoords);
  setDestCoords(prevPickupCoords);
};


const handleSearch = () => {
  if (!pickup || !destination || !tripDate || !pickupCoords || !destCoords) {
    alert("Please complete all fields to search rides.");
    return;
  }

  // Prepare search data
  const searchData = {
    pickup: pickup.label || pickup.description || pickup, // handle object/string
    destination: destination.label || destination.description || destination,
    selectedDate: tripDate,
    passengers,
    pickupCoords,
    destCoords,
  };

  // Save for reload persistence
  localStorage.setItem("searchData", JSON.stringify(searchData));

  // Navigate to /searchRides with state
  navigate("/searchRides", { state: searchData });
};

  return (
    <Box sx={{ position: "relative", width: "100%", height: "100vh" }}>
      {/* 1️⃣ Map */}
      <Box sx={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <APIProvider apiKey={Maps_API_KEY} libraries={["places"]}>
          <Map
            mapId={GOOGLE_MAP_ID}
            center={center}
            zoom={14}
            gestureHandling="greedy"
            style={{ width: "100%", height: "100%" }}
          >
            {pickupCoords && (
              <Marker
                position={pickupCoords}
                draggable
                onDragEnd={(e) =>
                  setPickupCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() })
                }
              />
            )}
            {destCoords && (
              <Marker
                position={destCoords}
                draggable
                onDragEnd={(e) =>
                  setDestCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() })
                }
              />
            )}
            {isLoaded &&
              drivers.map((driver) => (
                <Marker
                  key={driver.id}
                  position={{ lat: driver.lat, lng: driver.lng }}
                  icon={{
                    url: "/icons/car.png",
                    scaledSize: { width: 40, height: 40 },
                    rotation: driver.rotation,
                    anchor: { x: 20, y: 20 },
                  }}
                />
              ))}
          </Map>
        </APIProvider>
      </Box>

      {/* 2️⃣ Top AppBar */}
      <AppBar
        position="absolute"
        sx={{
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2,
          backgroundColor: "white",
          color: "black",
          boxShadow: "0 0 10px rgba(0,0,0,0.1)",
        }}
      >
        <Toolbar>
          <Typography
            onClick={() => navigate("/")}
            sx={{
              fontWeight: { xs: 900, sm: 800 },
              fontSize: { xs: "20px", sm: "32px" },
              color: "#1e2730ff",
              flexGrow: 1,
              cursor: "pointer",
              fontFamily: "'Poppins', sans-serif",
              userSelect: "none",
              letterSpacing: -4.5,
              fontStyle: "italic",
            }}
          >
            GoOn
          </Typography>
          <IconButton edge="end" onClick={() => navigate(-1)}>
            <MdExitToApp size={30} style={{ color: "#333" }} />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* 3️⃣ Floating Search Form */}
      <Box
        sx={{
          position: "absolute",
          top: { xs: 260, sm: 100 },
          left: { xs: "50%", sm: 50 },
          transform: { xs: "translateX(-50%)", sm: "none" },
          zIndex: 3,
        }}
      >
        <Paper elevation={6} sx={{ p: 2, borderRadius: 3, width: { xs: "90vw", sm: 400 } }}>
          <Grid container spacing={2}>
            {/* Pickup */}
            <Grid item xs={12}>
              <Typography variant="subtitle2">Pickup Location</Typography>
              <GooglePlacesAutocomplete
                apiKey={Maps_API_KEY}
                selectProps={{
                  value: pickup,
                  onChange: handlePickupChange,
                  placeholder: "Enter pickup...",
                }}
              />
            </Grid>

            {/* Swap Button */}
            <Grid item xs={12} sx={{ display: "flex", justifyContent: "center" }}>
              <IconButton
                onClick={handleSwap}
                aria-label="swap locations"
                sx={{
                  bgcolor: "white",
                  border: "2px solid",
                  borderColor: "primary.light",
                  color: "primary.main",
                  width: 48,
                  height: 48,
                  transition: "transform 0.3s ease",
                  "&:hover": {
                    bgcolor: "primary.light",
                    color: "white",
                    transform: "rotate(180deg)",
                  },
                }}
              >
                <MdOutlineSwapVert size={24} />
              </IconButton>

            </Grid>

            {/* Destination */}
            <Grid item xs={12}>
              <Typography variant="subtitle2">Destination</Typography>
              <GooglePlacesAutocomplete
                apiKey={Maps_API_KEY}
                selectProps={{
                  value: destination,
                  onChange: handleDestChange,
                  placeholder: "Enter destination...",
                }}
              />
            </Grid>

            {/* Date */}
            <Grid item xs={12}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Date"
                  value={tripDate}
                  onChange={(date) => setTripDate(date)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              </LocalizationProvider>
            </Grid>

            {/* Passengers */}
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" mb={1}>
                Passengers
              </Typography>
              <PassengerSelector value={passengers} setValue={setPassengers} min={1} max={6} />
            </Grid>

            {/* Submit Button */}
            <Grid item xs={12}>
              <Button variant="contained" color="primary" fullWidth onClick={handleSearch}>
                Search Rides
              </Button>
            </Grid>
          </Grid>
        </Paper>
      </Box>
    </Box>
  );
};

export default SearchAvailable;
