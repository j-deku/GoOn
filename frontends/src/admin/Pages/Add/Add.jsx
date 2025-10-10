import {
  Box,
  Grid,
  TextField,
  Typography,
  Button,
  MenuItem,
  InputLabel,
  Select,
  FormControl,
} from "@mui/material";
import { useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";

const Add = () => {
  const [data, setData] = useState({
    pickup: "",
    destination: "",
    price: "",
    description: "",
    selectedDate: "",
    selectedTime: "",
    passengers: 1,
    image: null,
    type: "",
  });

  const onChangeHandler = (event) => {
    const { name, value } = event.target;
    setData((prevData) => ({ ...prevData, [name]: value }));
  };

  const onFileChange = (event) => {
    setData((prevData) => ({ ...prevData, image: event.target.files[0] }));
  };

  const validateForm = () => {
    const { pickup, destination, price, description, selectedDate, selectedTime, type, image, passengers } = data;
    if (!pickup || !destination || !price || !description || !selectedDate || !selectedTime || !type || !image) {
      toast.error("All fields are required");
      return false;
    }
    if (price <= 0 || passengers <= 0) {
      toast.error("Price and passengers must be greater than zero");
      return false;
    }
    return true;
  };

  const onSubmitHandler = async (event) => {
    event.preventDefault();
    if (!validateForm()) return;

    const formData = new FormData();
    Object.keys(data).forEach((key) => formData.append(key, data[key]));

    try {
      const response = await axios.post("/api/admin/add", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        withCredentials: true,
      });

      if (response.data.success) {
        toast.success("Ride added successfully");
        setData({
          pickup: "",
          destination: "",
          price: "",
          description: "",
          selectedDate: "",
          selectedTime: "",
          passengers: 1,
          image: null,
          type: "",
        });
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error("Failed to add ride");
      console.error("Error adding ride:", error.response?.data || error.message);
    }
  };

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", mt: 4, p: 3, bgcolor: "#fff", borderRadius: 2, boxShadow: 2 }}>
      <Typography variant="h5" gutterBottom fontWeight={600}>
        Add New Ride
      </Typography>

      <form onSubmit={onSubmitHandler} encType="multipart/form-data">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Pickup Location"
              name="pickup"
              value={data.pickup}
              onChange={onChangeHandler}
              fullWidth
              required
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              label="Destination"
              name="destination"
              value={data.destination}
              onChange={onChangeHandler}
              fullWidth
              required
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              label="Price"
              type="number"
              name="price"
              value={data.price}
              onChange={onChangeHandler}
              inputProps={{ min: 1 }}
              fullWidth
              required
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              label="Passengers"
              type="number"
              name="passengers"
              value={data.passengers}
              onChange={onChangeHandler}
              inputProps={{ min: 1, max: 60 }}
              fullWidth
              required
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Ride Description"
              name="description"
              value={data.description}
              onChange={onChangeHandler}
              multiline
              rows={4}
              fullWidth
              required
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel id="ride-type-label">Ride Type</InputLabel>
              <Select
                labelId="ride-type-label"
                name="type"
                value={data.type}
                label="Ride Type"
                onChange={onChangeHandler}
              >
                <MenuItem value="">Select Ride Type</MenuItem>
                <MenuItem value="bus">Bus</MenuItem>
                <MenuItem value="car">Van</MenuItem>
                <MenuItem value="motorcycle">Motor</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={6} sm={3}>
            <TextField
              label="Date"
              name="selectedDate"
              type="date"
              value={data.selectedDate}
              onChange={onChangeHandler}
              fullWidth
              InputLabelProps={{ shrink: true }}
              required
            />
          </Grid>

          <Grid item xs={6} sm={3}>
            <TextField
              label="Time"
              name="selectedTime"
              type="time"
              value={data.selectedTime}
              onChange={onChangeHandler}
              fullWidth
              InputLabelProps={{ shrink: true }}
              required
            />
          </Grid>

          <Grid item xs={12}>
            <Button variant="outlined" component="label" fullWidth>
              Upload Ride Image
              <input type="file" name="image" accept="image/*" hidden onChange={onFileChange} />
            </Button>
            {data.image && <Typography mt={1}>Selected: {data.image.name}</Typography>}
          </Grid>

          <Grid item xs={12}>
            <Button variant="contained" color="primary" type="submit" fullWidth sx={{ mt: 2 }}>
              Add Ride
            </Button>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default Add;
