import { useState } from "react";
import "./VerifyOTP.css";
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import { Formik } from "formik";
import * as Yup from "yup";
import { Howl } from "howler";
import { toast } from "react-toastify";
import { FaInfo, FaKey } from "react-icons/fa";
import axiosInstance from "../../../../axiosInstance";

const VerifyOTP = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const successTone = new Howl({
    src: ["/apple-toast.mp3"],
    autoPlay: false,
    volume: 1,
    loop: false,
  });

  // Validation schema
  const validationSchema = Yup.object().shape({
    otp: Yup.string()
      .required("OTP is required")
      .length(6, "OTP must be 6 digits"),
  });

  const handleSubmit = async (values) => {
    setIsSubmitting(true);
    try {
      const response = await axiosInstance.post(`/api/user/verify-otp`, {
        otp: values.otp,
      }, {
        withCredentials: true,
      });
      if (response.data.success) {
        successTone.play();
        window.location.href = response.data.redirect;
        toast.success("OTP verified successfully!");
        if (window.opener) {
          window.opener.postMessage({ verified: true }, "*");
        }
        window.close();
      } else {
        toast.warning(response.data.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to verify OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      const response = await axiosInstance.post(`/api/user/resend-otp`, {}, {
        withCredentials: true,
      });
      if (response.data.success) {
        toast.success("OTP resent successfully");
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to resend OTP.");
    }
  };

  return (
    <Box>
      <div className="whitePaper"></div>

      <div className="verify-otp">
        <em>
          <p
            className="text"
            style={{
              padding: "40px",
              color: "gray",
              fontSize: "16px",
              marginLeft: "50px",
              fontFamily: " serif",
              display: "inline",
            }}
          >
            <p>
              <i>One-Time Password</i> <br /> has been sent to your email.
              <FaInfo style={{ color: "deepskyblue", display: "inline" }} />
            </p>
          </p>
        </em>
        <hr />
        <br />
        <br />
        <Typography
          variant="h5"
          sx={{ mb: 3, textAlign: "center", color: "gray", fontWeight: "bold" }}
        >
          Email Verification
        </Typography>
        <Formik
          initialValues={{ otp: "" }}
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
                  name="otp"
                  label="OTP"
                  required
                  autoFocus
                  placeholder="000111"
                  type="tel"
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  autoComplete="off"
                  fullWidth
                  value={values.otp}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={touched.otp && Boolean(errors.otp)}
                  helperText={touched.otp && errors.otp}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <FaKey style={{ color: "gray" }} />
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
                  sx={{ padding: "10px", marginBottom: "20px" }}
                >
                  {isSubmitting ? <CircularProgress size={24} /> : "Verify OTP"}
                </Button>
                <Button
                  onClick={handleResendOTP}
                  variant="contained"
                  fullWidth
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <CircularProgress size={24} /> : "Resend OTP"}
                </Button>
              </Box>
            </form>
          )}
        </Formik>
      </div>
    </Box>
  );
};
export default VerifyOTP;