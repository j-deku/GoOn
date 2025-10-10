/* AddDriver.jsx */
import { useState } from "react";
import { Formik, Form, Field } from "formik";
import * as Yup from "yup";
import {
  Box,
  Button,
  Grid,
  TextField,
  MenuItem,
  Typography,
  CircularProgress,
  InputAdornment,
  IconButton,
  Avatar,
} from "@mui/material";
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { toast } from "react-toastify";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";

const VEHICLE_TYPES = ["Car", "Van", "Bus", "Motorbike", "Truck"];

const validationSchema = Yup.object({
  name: Yup.string().required("Required"),
  email: Yup.string().email("Invalid email").required("Required"),
  password: Yup.string()
    .min(8, "Min 8 characters")
    .required("Required"),
  phone: Yup.string().required("Required"),
  licenseNumber: Yup.string().required("Required"),
  vehicleType: Yup.string().required("Required"),
  model: Yup.string().required("Required"),
  registrationNumber: Yup.string().required("Required"),
  capacity: Yup.number().min(1, "Min 1").required("Required"),
});

const AddDriver = () => {
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (values, { resetForm }) => {
    const formData = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (k === 'avatar') return;
      formData.append(k, v);
    });
    if (values.avatar) formData.append("avatar", values.avatar);

    try {
      const res = await axiosInstanceAdmin.post(
        "/api/admin/add-driver",
        formData,
        {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      toast.success(res.data.message || "Driver added");
      resetForm();
      setAvatarPreview(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Add failed");
      console.error(err);
    }
  };

  return (
    <Box p={3} maxWidth={700} mx="auto">
      <Typography variant="h4" mb={2}>
        Add New Driver
      </Typography>

      <Formik
        initialValues={{
          name: "",
          email: "",
          password: "",
          phone: "",
          licenseNumber: "",
          vehicleType: "",
          model: "",
          registrationNumber: "",
          capacity: "",
          avatar: null,
        }}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({ values, errors, touched, setFieldValue, isSubmitting }) => (
          <Form>
            <Grid container spacing={2}>
              {[
                { name: 'name', label: 'Name' },
                { name: 'email', label: 'Email', type: 'email' },
                { name: 'phone', label: 'Phone' },
                { name: 'licenseNumber', label: 'License Number' },
              ].map(({ name, label, type }) => (
                <Grid item xs={12} sm={6} key={name}>
                  <Field
                    name={name}
                    as={TextField}
                    type={type || 'text'}
                    label={label}
                    fullWidth
                    error={touched[name] && Boolean(errors[name])}
                    helperText={touched[name] && errors[name]}
                  />
                </Grid>
              ))}

              <Grid item xs={12} sm={6}>
                <Field
                  name="password"
                  as={TextField}
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  fullWidth
                  error={touched.password && Boolean(errors.password)}
                  helperText={touched.password && errors.password}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Field
                  name="vehicleType"
                  as={TextField}
                  select
                  label="Vehicle Type"
                  fullWidth
                  error={touched.vehicleType && Boolean(errors.vehicleType)}
                  helperText={touched.vehicleType && errors.vehicleType}
                >
                  {VEHICLE_TYPES.map((opt) => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Field>
              </Grid>

              {[
                { name: 'model', label: 'Model' },
                { name: 'registrationNumber', label: 'Reg. Number' },
                { name: 'capacity', label: 'Capacity', type: 'number' },
              ].map(({ name, label, type }) => (
                <Grid item xs={12} sm={6} key={name}>
                  <Field
                    name={name}
                    as={TextField}
                    type={type || 'text'}
                    label={label}
                    fullWidth
                    error={touched[name] && Boolean(errors[name])}
                    helperText={touched[name] && errors[name]}
                  />
                </Grid>
              ))}

              <Grid item xs={12}>
                <Button variant="outlined" component="label" startIcon={
                  values.avatar ? <Avatar src={avatarPreview} /> : null
                }>
                  {values.avatar ? 'Change Avatar' : 'Upload Avatar'}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.currentTarget.files[0];
                      setFieldValue('avatar', file);
                      setAvatarPreview(URL.createObjectURL(file));
                    }}
                  />
                </Button>
              </Grid>

              <Grid item xs={12}>
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={isSubmitting}
                  startIcon={isSubmitting && <CircularProgress size={20} />}
                >
                  {isSubmitting ? 'Adding...' : 'Add Driver'}
                </Button>
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
    </Box>
  );
};

export default AddDriver;
