import React, { useState, useEffect, useRef } from "react";
import './LoginForm.css';
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  InputAdornment,
  IconButton,
  Alert,
} from "@mui/material";
import { FaEnvelope, FaLock } from "react-icons/fa";
import { Formik, Form } from "formik";
import * as Yup from "yup";
import { NavLink, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Howl } from "howler";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import axiosInstanceDriver from "../../../../axiosInstanceDriver";
import { useSelector, useDispatch } from "react-redux";
import {
  selectIsDriverAuthenticated,
  selectDriverAuthChecked,
  selectDriverLoading,
  fetchDriverInfo,
} from "../../../features/driver/driverSlice";
import { Helmet } from "react-helmet-async";

const LoginForm = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(selectIsDriverAuthenticated);
  const authChecked = useSelector(selectDriverAuthChecked);
  const isLoading = useSelector(selectDriverLoading);
  const [message, setMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  // Toast tone
  const successTone = useRef(
    new Howl({ src: ["/sounds/apple-sms.mp3"], volume: 1 })
  ).current;

  // Consolidated navigation effect
  useEffect(() => {
    if (!authChecked) return;
    if (isAuthenticated) {
      const dest = pendingNavigation || '/driver/dashboard';
      navigate(dest, { replace: true });
      setPendingNavigation(null);
    }
  }, [authChecked, isAuthenticated, navigate, pendingNavigation]);

  const validationSchema = Yup.object().shape({
    email: Yup.string()
      .email("Invalid email address")
      .required("Email is required"),
    password: Yup.string()
      .min(8, "Password must be at least 8 characters")
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 
        "Include uppercase, lowercase, number & special character"
      )
      .required("Password is required"),
  });
// Updated handleSubmit function in LoginForm.js

const handleSubmit = async (values) => {
  let mounted = true;
  setIsSubmitting(true);
  try {
    const { data } = await axiosInstanceDriver.post(
      "/api/driver/login",
      values,
      { withCredentials: true }
    );
    if (!data.success) throw new Error(data.message);

    successTone.play();
    toast.success(data.message);

    // ✅ FIX: Use the driverId (profile id) from the login response FIRST 
    if (data.driverId) {
      localStorage.setItem("driverId", data.driverId);
      console.log("✅ Stored driverId from login response:", data.driverId);
    }

    // Then fetch driver info for Redux state
     await dispatch(fetchDriverInfo());

    const params = new URLSearchParams(window.location.search);
    setPendingNavigation(params.get('redirect') || '/driver/dashboard');
  } catch (err) {
    const status = err.response?.status;
    const fallback = err.message || 'Login failed';
    const codeToMsg = {
      401: 'Incorrect credentials',
      403: 'Account not approved or inactive',
      404: 'Driver profile not found',
      422: 'Please fill all required fields',
      423: 'Account locked. Try again later',
      500: 'Server error. Please try later',
    };
    const msg = codeToMsg[status] || fallback;
    setMessage(msg, {color:"green", fontWeight:"bold", textAlign:"center"});
    console.error('Login error:', err);
  } finally {
    if (mounted) setIsSubmitting(false);
  }
  return () => { mounted = false; };
};

  if (!authChecked || isLoading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
        <>
        <Helmet>
          <title>Login - TOLI-Driver</title>
        </Helmet>
    <div className="overlay">
      <div className="logo">
        <img src="/TT-logo.png" alt="TOLI‑TOLI logo" />
      </div>
      <div className="form">
        <Typography variant="h5" sx={{ mb: 3, textAlign: 'center', color: 'gray' }}>
          Driver Login
        </Typography>
        <Formik
          initialValues={{ email: '', password: '' }}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, handleChange, handleBlur, handleSubmit }) => (
            <Form onSubmit={handleSubmit}>
              <Box sx={{ mb: 3 }}>
                <TextField
                  name="email"
                  label="Email"
                  placeholder="Enter your email address"
                  type="email"
                  fullWidth
                  required
                  value={values.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={touched.email && Boolean(errors.email)}
                  helperText={touched.email && errors.email}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <FaEnvelope />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <TextField
                  name="password"
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  fullWidth
                  required
                  value={values.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={touched.password && Boolean(errors.password)}
                  helperText={touched.password && errors.password}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <FaLock />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(p => !p)} edge="end">
                          {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
                  {message && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {message}
                </Alert>
              )}
              <Typography variant="body2" sx={{ textAlign: 'center', mb: 2 }}>
                Forgot password?{' '}
                <NavLink to="/driver/forgot-password">Reset password</NavLink>
              </Typography>

              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={isSubmitting}
                startIcon={isSubmitting && <CircularProgress size={20} />}
              >
                {isSubmitting ? 'Logging in…' : 'Login'}
              </Button>

              <Typography variant="body2" sx={{ textAlign: 'center', mt: 2 }}>
                Not registered?{' '}
                <NavLink to="/driver/register">Create Account</NavLink>
              </Typography>
            </Form>
          )}
        </Formik>
      </div>
    </div>
    </>
  );
};

export default LoginForm;
