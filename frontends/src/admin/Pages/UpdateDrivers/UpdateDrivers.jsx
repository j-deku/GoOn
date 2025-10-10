/* Corrected UpdateDrivers.jsx */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Box,
  Button,
  TextField,
  MenuItem,
  CircularProgress,
  Typography,
} from "@mui/material";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";
import "./UpdateDrivers.css";

const VEHICLE_TYPES = ["Car", "Van", "Bus", "Motorbike", "Truck"];

const UpdateDrivers = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [driverData, setDriverData] = useState({
    name: "",
    email: "",
    phone: "",
    licenseNumber: "",
    vehicleType: "",
    model: "",
    registrationNumber: "",
    capacity: "",
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fetch driver details
  const fetchDriverDetails = async () => {
    try {
      const response = await axiosInstanceAdmin.get(`/api/admin/drivers/${id}`, {
        withCredentials: true,
      });
      const { driver } = response.data;
      const prof = driver.profile || {};
      setDriverData({
        name: driver.name || "",
        email: driver.email || "",
        phone: prof.phone || "",
        licenseNumber: prof.licenseNumber || "",
        vehicleType: prof.vehicle?.vehicleType || "",
        model: prof.vehicle?.model || "",
        registrationNumber: prof.vehicle?.registrationNumber || "",
        capacity: prof.vehicle?.capacity?.toString() || "",
      });
    } catch (error) {
      toast.error("Failed to fetch driver details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDriverDetails();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setDriverData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setAvatarFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData();
    Object.entries(driverData).forEach(([key, val]) => {
      formData.append(key, val);
    });
    if (avatarFile) formData.append("avatar", avatarFile);

    try {
      const response = await axiosInstanceAdmin.put(
        `/api/admin/drivers/${id}`,
        formData,
        {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      if (response.data.success) {
        toast.success(response.data.message);
        navigate("/admin/list-drivers");
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error("Failed to update driver");
      console.error(error.response?.data || error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <CircularProgress size={48} />;
  }

  return (
    <Box className="update-driver" component="form" onSubmit={handleSubmit} sx={{ maxWidth:"max-content", mx: "auto", p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Update Driver Details
      </Typography>
      <TextField
        fullWidth
        margin="normal"
        label="Name"
        name="name"
        value={driverData.name}
        onChange={handleChange}
        required
      />
      <TextField
        fullWidth
        margin="normal"
        label="Email"
        name="email"
        type="email"
        value={driverData.email}
        onChange={handleChange}
        required
      />
      <TextField
        fullWidth
        margin="normal"
        label="Phone"
        name="phone"
        value={driverData.phone}
        onChange={handleChange}
        required
      />
      <TextField
        fullWidth
        margin="normal"
        label="License Number"
        name="licenseNumber"
        value={driverData.licenseNumber}
        onChange={handleChange}
        required
      />
      <TextField
        fullWidth
        select
        margin="normal"
        label="Vehicle Type"
        name="vehicleType"
        value={driverData.vehicleType}
        onChange={handleChange}
        required
      >
        {VEHICLE_TYPES.map((type) => (
          <MenuItem key={type} value={type}>
            {type}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        fullWidth
        margin="normal"
        label="Model"
        name="model"
        value={driverData.model}
        onChange={handleChange}
        required
      />
      <TextField
        fullWidth
        margin="normal"
        label="Registration Number"
        name="registrationNumber"
        value={driverData.registrationNumber}
        onChange={handleChange}
        required
      />
      <TextField
        fullWidth
        margin="normal"
        label="Capacity"
        name="capacity"
        type="number"
        value={driverData.capacity}
        onChange={handleChange}
        required
      />
      <Button variant="outlined" component="label" sx={{ mt: 2 }}>
        Upload Avatar
        <input type="file" hidden onChange={handleFileChange} accept="image/*" />
      </Button>
      <Box sx={{ mt: 4 }}>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting}
          startIcon={submitting && <CircularProgress size={20} />}
        >
          {submitting ? "Updating..." : "Update Driver"}
        </Button>
      </Box>
    </Box>
  );
};

export default UpdateDrivers;
