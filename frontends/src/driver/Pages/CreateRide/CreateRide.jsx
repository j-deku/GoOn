import React, { useState } from "react";
import "./CreateRide.css";
import { toast } from "react-toastify";
import CircularProgress from "@mui/material/CircularProgress";
import { Button, TextField, Box, Typography, Grid, Paper, MenuItem } from "@mui/material";
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import GooglePlacesAutocomplete from "react-google-places-autocomplete";
import { Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import axiosInstanceDriver from "../../../../axiosInstanceDriver";
import { UseCommissionRate } from "../../hooks/UseCommissionRate/UseCommissionRate";
import { Helmet } from "react-helmet-async";

const initialState = {
  pickup: null,
  destination: null,
  price: "",
  currency: "USD",
  description: "",
  selectedDate: null,
  selectedTime: null,
  capacity: 1,
  maxPassengers: 1,
  image: null,
  type: "",
};

export default function CreateRide() {
  const [data, setData] = useState({ ...initialState });
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [createdRide, setCreatedRide] = useState(null);

  const commissionRate = UseCommissionRate();

  const handleChange = (field) => (e) => {
    const value = e.target ? (e.target.type === 'file' ? e.target.files[0] : e.target.value) : e;
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePlace = (field) => (value) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    const { pickup, destination, price, selectedDate, selectedTime, capacity, maxPassengers, type, image } = data;
    if (!pickup || !destination || !price || !selectedDate || !selectedTime || !type || !image) {
      toast.error("Please complete all required fields.");
      return false;
    }
    if (price <= 0 || capacity < 1 || maxPassengers < 1) {
      toast.error("Values must be positive numbers.");
      return false;
    }
    if (maxPassengers > capacity) {
      toast.error("Max Passengers cannot exceed Capacity.");
      return false;
    }
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const formData = new FormData();
    formData.append('pickup', data.pickup.label);
    formData.append('pickupPlaceId', data.pickup.value.place_id);
    formData.append('destination', data.destination.label);
    formData.append('destinationPlaceId', data.destination.value.place_id);

    formData.append('price', data.price);
    formData.append('capacity', data.capacity);
    formData.append('maxPassengers', data.maxPassengers);
    formData.append('type', data.type);
    formData.append('description', data.description);
    formData.append('currency', data.currency);
    formData.append('image', data.image, data.image.name);
    formData.append('selectedDate', data.selectedDate.toISOString().split('T')[0]);
    formData.append('selectedTime', data.selectedTime.toTimeString().slice(0,5));

    setLoading(true);
    try {
      const { data: resp } = await axiosInstanceDriver.post(
        "/api/driver/add",
        formData,
        {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" }
        }
      );
      if (resp.success) {
        setCreatedRide(resp.ride);
        setShowModal(true);
      } else {
        toast.error(resp.message);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error adding ride.");
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setCreatedRide(null);
    setData({ ...initialState });
  };

  return (
    <>
    <Helmet>
      <title>Create Ride - TOLI-Driver</title>
    </Helmet>
    <Box p={4} maxWidth={700} mx="auto" mt={10}>
      <Typography variant="h4" mb={3} align="center">Create a New Ride</Typography>
      <Paper elevation={3} sx={{ p:3 }} component="form" onSubmit={submit}>
        <Grid container spacing={2}>
          {/* Pickup & Destination */}
          <Grid item xs={12}>
            <Typography variant="subtitle2">Pickup Location</Typography>
            <GooglePlacesAutocomplete
              apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
              selectProps={{
                value: data.pickup,
                onChange: handlePlace('pickup'),
                placeholder: "Enter pickup..."
              }}
            />
          </Grid>
          <Grid item xs={12} >
            <Typography variant="subtitle2">Destination</Typography>
            <GooglePlacesAutocomplete
              apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
              selectProps={{
                value: data.destination,
                onChange: handlePlace('destination'),
                placeholder: "Enter destination..."
              }}
            />
          </Grid>

          {/* Price, Capacity, MaxPassengers */}
          <Grid item xs={4}>
            <TextField
              label="Price"
              type="number"
              fullWidth
              value={data.price}
              onChange={handleChange('price')}
              required
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              label="Total Capacity"
              type="number"
              fullWidth
              value={data.capacity}
              onChange={handleChange('capacity')}
              required
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              label="Max Passengers"
              type="number"
              fullWidth
              value={data.maxPassengers}
              onChange={handleChange('maxPassengers')}
              inputProps={{ max: data.capacity }}
              required
            />
          </Grid>

          {/* Commission & Description */}
          <Grid item xs={12} md={6}>
            {commissionRate === null
              ? <CircularProgress size={24} />
              : <TextField
                  label="Your Payout"
                  fullWidth
                  value={data.price ? (data.price * (1 - commissionRate)).toFixed(2) : '0.00'}
                  InputProps={{ readOnly: true }}
                />
            }
            <Typography variant="caption" color="textSecondary" mt={1}>
              The commission rate is {commissionRate ? (commissionRate * 100).toFixed(2) + '%' : 'loading...'}.
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Description"
              multiline rows={3}
              fullWidth
              value={data.description}
              onChange={handleChange('description')}
              required
            />
          </Grid>

          {/* Type, Date, Time */}
          <Grid item xs={12} md={4}>
            <TextField
              select
              label="Type"
              fullWidth
              value={data.type}
              onChange={handleChange('type')}
              required
            >
              <MenuItem value="bus">Bus</MenuItem>
              <MenuItem value="car">Car</MenuItem>
              <MenuItem value="motorcycle">Motorcycle</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} md={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Date"
                value={data.selectedDate}
                onChange={d => setData(prev => ({ ...prev, selectedDate: d }))}
                renderInput={params => <TextField {...params} fullWidth required />}                
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={6} md={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <TimePicker
                label="Time"
                value={data.selectedTime}
                onChange={t => setData(prev => ({ ...prev, selectedTime: t }))}
                renderInput={params => <TextField {...params} fullWidth required />}                
              />
            </LocalizationProvider>
          </Grid>

          {/* Image Upload */}
          <Grid item xs={12}>
            <Button variant="outlined" component="label">
              Upload Image
              <input
                type="file"
                name="image"
                accept="image/*"
                hidden
                onChange={handleChange('image')}
                required
              />
            </Button>
            {data.image && <Typography component="span" ml={2}>{data.image.name}</Typography>}
          </Grid>

          {/* Submit */}
          <Grid item xs={12} textAlign="center">
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={loading}
              startIcon={loading && <CircularProgress size={20} color="inherit" />}
            >
              {loading ? 'Adding...' : 'Add Ride'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Success Modal */}
      <Dialog open={showModal} onClose={closeModal} maxWidth="sm" fullWidth>
        <DialogTitle>✅ Ride Created!</DialogTitle>
        <DialogContent>
          {createdRide && (
            <Box>
              <img
                src={createdRide.imageUrl}
                alt="ride"
                style={{ width:'100%', borderRadius:8, marginBottom:16 }}
              />
              <Typography><strong>From:</strong> {createdRide.pickup}</Typography>
              <Typography><strong>To:</strong> {createdRide.destination}</Typography>
              <Typography><strong>Date:</strong> {new Date(createdRide.selectedDate).toLocaleDateString()}</Typography>
              <Typography><strong>Time:</strong> {createdRide.selectedTime}</Typography>
              <Typography><strong>Capacity:</strong> {createdRide.capacity}</Typography>
              <Typography><strong>Max Passengers:</strong> {createdRide.maxPassengers}</Typography>
              <Typography><strong>Price:</strong> {createdRide.currency} {createdRide.price.toFixed(2)}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModal} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
    </>
  );
}
