import { useState } from "react";
import PropTypes from "prop-types";
import { toast } from "react-toastify";
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  InputAdornment,
  IconButton,
} from "@mui/material";
import { FaEnvelope, FaLock, FaUser } from "react-icons/fa";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import { Formik } from "formik";
import * as Yup from "yup";
import axiosInstance from "../../../../axiosInstance";

const RegisForm = ({ setLogin }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const togglePassword = () => {
    setShowPassword((prev) => !prev);
  };

  // Validation schema
  const validationSchema = Yup.object().shape({
    name: Yup.string()
      .min(5, "Enter your full name")
      .required("Name is required"),
    email: Yup.string()
      .email("Invalid email address")
      .required("Email is required"),
    password: Yup.string()
      .min(8, "Password must be at least 8 characters")
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
        "Password must contain uppercase, lowercase, number, and special character."
      )
      .required("Password is required"),
  });

  const handleSubmit = async (values) => {
    setIsSubmitting(true);
    try {
      const response = await axiosInstance.post(`/api/user/register`, values, {
        withCredentials: true,
      });
      if (response.data.success) {
        // Optionally, handle response.data.userId if needed, but don't store it in localStorage
        window.open("/verify-otp", "_blank");
        setLogin(false);
      } else {
        toast.warn(response.data.message);
      }
    } catch (error) {
      if (error.response && error.response.status === 400) {
        toast.error(error.response.data?.message || "User already exists");
      } else if (error.response && error.response.status === 401) {
        toast.error(error.response.data?.message || "Invalid email format");
      } else if (error.response && error.response.status === 403) {
        toast.warn(
          error.response.data?.message ||
            "Password must be at least 8 characters long and include uppercase, lowercase, and a special character."
        );
      } else if (error.response && error.response.status === 500) {
        toast.error(
          error.response.data?.message || "Server down. Please try again later."
        );
      } else if (error.code === "ERR_NETWORK") {
        toast.warn("Network unstable. Check your internet connection");
      } else {
        toast.error(error.message || "An unexpected error occurred.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <Typography
        variant="h5"
        sx={{ mb: 3, textAlign: "center", color: "gray" }}
      >
        Register
      </Typography>
      <Formik
        initialValues={{ name: "", email: "", password: "" }}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({
          values,
          errors,
          touched,
          handleChange,
          handleBlur,
          handleSubmit,
        }) => (
          <form onSubmit={handleSubmit}>
            <Box sx={{ mb: 3 }}>
              <TextField
                name="name"
                label="Full Name"
                required
                autoFocus
                fullWidth
                autoComplete="name"
                value={values.name}
                onChange={(e) => {
                  const capitalizedValue = e.target.value.replace(
                    /\b\w/g,
                    (char) => char.toUpperCase()
                  );
                  handleChange({
                    target: {
                      name: e.target.name,
                      value: capitalizedValue,
                    },
                  });
                }}
                onBlur={handleBlur}
                placeholder="Enter your full name"
                error={touched.name && Boolean(errors.name)}
                helperText={touched.name && errors.name}
                inputMode="text"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <FaUser style={{ marginRight: "8px" }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
            <Box sx={{ mb: 3 }}>
              <TextField
                name="email"
                label="Email"
                type="email"
                required
                fullWidth
                value={values.email}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Enter your email"
                autoComplete="email"
                error={touched.email && Boolean(errors.email)}
                helperText={touched.email && errors.email}
                inputMode="email"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <FaEnvelope style={{ marginRight: "8px" }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
            <Box sx={{ mb: 3 }}>
              <TextField
                name="password"
                label="Password"
                type={showPassword ? "text" : "password"}
                required
                fullWidth
                value={values.password}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Create a password"
                autoComplete="new-password"
                error={touched.password && Boolean(errors.password)}
                inputMode="password"
                helperText={touched.password && errors.password}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <FaLock style={{ marginRight: "8px" }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={togglePassword} tabIndex={-1}>
                        {showPassword ? <MdVisibility /> : <MdVisibilityOff />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={isSubmitting}
              >
                {isSubmitting ? <CircularProgress size={24} /> : "Register"}
              </Button>
            </Box>
          </form>
        )}
      </Formik>
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="h6" sx={{ my: 2 }}>
          OR
        </Typography>
      </Box>
    </div>
  );
};

RegisForm.propTypes = {
  setLogin: PropTypes.func.isRequired,
};

export default RegisForm;