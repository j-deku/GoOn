import { useEffect, useState } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  InputAdornment,
  IconButton,
  Divider,
  Stack,
  Card,
  CardHeader,
  CardContent,
  CardActions,
  Alert,
} from "@mui/material";
import { FaEnvelope, FaLock, FaInfoCircle } from "react-icons/fa";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import { Formik } from "formik";
import * as Yup from "yup";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Howl } from "howler";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";
import "./AdminLogin.css";
import { useDispatch, useSelector } from "react-redux";
import {
  selectIsAdminAuthenticated,
  selectAdminAuthChecked,
  setAdminAuth,
} from "../../../features/admin/adminSlice";
import CaptchaModal from "../../components/CaptchaModal/CaptchaModal";
import { Helmet } from "react-helmet-async";

const successTone = new Howl({
  src: ["/sounds/apple-sms.mp3"],
  volume: 1,
  autoplay: false,
});

const AdminLoginInner = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector(selectIsAdminAuthenticated);
  const authChecked = useSelector(selectAdminAuthChecked);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaModalOpen, setCaptchaModalOpen] = useState(false);
  const [pendingLoginValues, setPendingLoginValues] = useState(null);

  const AUTH_LK = import.meta.env.VITE_AUTH_LINK1;
  const AUTH_LK2 = import.meta.env.VITE_AUTH_LINK2;

  useEffect(() => {
    if (authChecked && isAuthenticated) {
      navigate(`${AUTH_LK2}/dashboard`, { replace: true });
    }
  }, [navigate, isAuthenticated, authChecked]);

  const togglePassword = () => setShowPassword((prev) => !prev);

  const validationSchema = Yup.object().shape({
    email: Yup.string().email("Invalid email").required("Email is required"),
    password: Yup.string()
      .min(8, "Must be at least 8 characters")
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$!%*?&]).{8,}$/,
        "Must include uppercase, lowercase, number, special char"
      )
      .required("Password is required"),
  });

      const handleCaptchaVerified = async () => {
        setCaptchaModalOpen(false);

        if (!pendingLoginValues) {
          toast.error("Unexpected error. Try again.");
          return;
        }
        await attemptLogin(pendingLoginValues, () => {});
      };

  const attemptLogin = async (payload, setSubmitting) => {
    try {
      const response = await axiosInstanceAdmin.post(
        "/api/admin/login",
        payload,
        { withCredentials: true }
      );

      if (response.data.pre2FAToken) {
        localStorage.setItem("temp2FAToken", response.data.pre2FAToken);
        sessionStorage.setItem("pending2FA", payload.email);
        toast.info("Two-Factor Authentication required. Redirecting…");
        navigate( `${AUTH_LK}/setup-2fa`, { replace: true });
      } else if (response.data.success) {
        if (response.data.success) {
  // ✅ Update Redux immediately (no need to wait for /me)
  const admin = response.data.admin || response.data.user || {}; // adjust based on backend
  dispatch(setAdminAuth({
    userId: admin.id || admin._id,
    roles: admin.roles || response.data.roles || [],
    adminInfo: admin,
  }));

  successTone.play();
  toast.success(response.data.message || "Login successful.", {
    theme: "dark",
    color: "white",
    progressStyle: { backgroundColor: "#2e54a7ff" },
  });

  localStorage.removeItem("temp2FAToken");
  setTimeout(() => navigate(`${AUTH_LK2}/dashboard`, { replace: true }), 300);
}
      } else {
        toast.error(response.data.message || "Login failed.");
      }
    } catch (error) {
      const data = error.response?.data;
      if (error.response?.status === 403 && data?.pre2FAToken) {
        localStorage.setItem("temp2FAToken", data.pre2FAToken);
        sessionStorage.setItem("pending2FA", payload.email);
        toast.info("Two-Factor Authentication required. Redirecting…");
        navigate(`${AUTH_LK}/setup-2fa`, { replace: true });
      } else if (error.response && error.response.status === 423) {
        toast.warn(error.response.data.message || "Your account is temporarily suspended. Please try again later.", { autoClose: 5000 });
      } else if (error.response && error.response.status === 401) {
        toast.warn(error.response.data.message || "Not authorized to login here.");
      } else if (error.response && error.response.status === 404) {
        toast.error(error.response.data.message || "Invalid credentials. Password mismatch.");
      } else if (error.response && error.response.status === 503) {
        toast.error(error.response.data.message || "Server down. Please try again later.");
      } else if (error.code === "ERR_NETWORK") {
        toast.error("Network error. Please check your connection.");
      } else {
        toast.error("An unexpected error occurred.");
      }
    } finally {
      setIsSubmitting(false);
      setSubmitting(false);
    }
  };

  if (!authChecked) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
        }}
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box className="adminLogin"
    sx={{
      display:"flex",
      position:"fixed",
      flexDirection:{xs:'column', sm:'row'},
      height:"100vh",
      columnGap:{xs:0, sm:15},
      transition: "all 0.3s ease",
      alignItems:"center",
      background:{xs:"url('/GN-logo.png')", sm:"white"},
      backgroundSize:"contain",
      backgroundRepeat:"no-repeat",
      backgroundPosition:{xs:"bottom", sm:"right"},
    }}>
      <Box className="banner"
      sx={{
        height:{xs:'20vh', sm:'100vh'},
      }}
      >
        <img src="/admin_ban1.png" alt="Admin Banner" className="adminBannerImage"
        style={{
        height:{xs:'20vh', sm:'100vh'},
        width:"100%",
        objectFit:"cover",
      }}/>
      </Box>
      <Box className="adminForm"
      sx={{
        position:{xs:"absolute", sm:"relative"},
        mt:{xs:-10, sm:0},
        bottom:{xs:0, sm:"auto"},
        borderRadius:{xs:"40px 40px 0 0", sm:"20px"},
        mr:{xs:0, sm:10},
        p:3.5,
        placeSelf:{xs:'center', sm:'none'},
        transition: "all 0.3s ease",
        backgroundColor:"rgba(255, 255, 255, 0.91)",
        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
      }}>
      <Card sx={{display:{xs:'none', sm:'block'}}}>
        <CardHeader
          title="GoOn"
          subheader="ADMINISTRATOR LOGIN"
          sx={{ textAlign: "center", color: "rgb(9,51, 65)"}}
          subheaderTypographyProps={{ variant: "subtitle1", letterSpacing:2 }}
          titleTypographyProps={{ variant: "h5", fontWeight: "800" }}
        />
        <Divider sx={{ mb: 2, display:{xs:'none', sm:'block'} }} />
      </Card>
        <Typography variant="h5" sx={{ mb:2,textAlign: "start", fontWeight:"800", color:"rgb(9,51, 65)", display: { xs: 'block', sm: 'none' } }}>
          GoOn
        </Typography>
           <Divider sx={{mb:5}}/>
        <Typography variant="h5" sx={{ mb: 3, textAlign: "center", color: "gray", display: { xs: 'block', sm: 'none' } }}>
          ADMINISTRATOR LOGIN
        </Typography>
        <Formik
          initialValues={{ email: "", password: "" }}
          validationSchema={validationSchema}
          onSubmit={(values, { setSubmitting }) => {
            setIsSubmitting(true);
            setSubmitting(false);
            setPendingLoginValues(values);
            setCaptchaModalOpen(true);
          }}
        >
          {({ values, errors, touched, handleChange, handleBlur, handleSubmit }) => (
            <>
              <CaptchaModal open={captchaModalOpen} onVerify={handleCaptchaVerified} />
              <form onSubmit={handleSubmit} noValidate>
                <Stack spacing={3.5} sx={{ mb: 2 }}>
                <Box sx={{ mb: 3 }}>
                  <TextField
                    name="email"
                    label="Email"
                    type="email"
                    placeholder="Enter admin email"
                    fullWidth
                    value={values.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={touched.email && Boolean(errors.email)}
                    helperText={touched.email && errors.email}
                    InputProps={{
                      sx:{borderRadius: 50},
                      startAdornment: (
                        <InputAdornment position="start">
                          <FaEnvelope style={{ marginRight: 8 }} />
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
                    placeholder="Enter your password"
                    fullWidth
                    value={values.password}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={touched.password && Boolean(errors.password)}
                    helperText={touched.password && errors.password}
                    InputProps={{
                      sx:{borderRadius: 50},
                      startAdornment: (
                        <InputAdornment position="start">
                          <FaLock style={{ marginRight: 8 }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={togglePassword} edge="end">
                            {showPassword ? <MdVisibility /> : <MdVisibilityOff />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ mb: 2, textAlign: "right" }}>
                  <a
                    href={`${AUTH_LK}/forgot-password`}
                    style={{
                      color: "#1A73E8",
                      fontWeight: "bold",
                      textDecoration: "underline",
                    }}
                  >
                    Forgot password?
                  </a>
                </Typography>
                <Box sx={{ textAlign: "center", mb: 2 }}>
                  <Button type="submit" variant="contained" fullWidth disabled={isSubmitting}>
                    {isSubmitting ? <CircularProgress size={24} /> : "Login"}
                  </Button>
                </Box>
                </Stack>
              </form>
            </>
          )}
        </Formik>
        <Typography variant="text" sx={{color:"tomato", fontFamily:"calibri", fontSize:18, textAlign:"center"}}>
        <FaInfoCircle/> Restricted access: For authorized administrators only. 
      </Typography>
      </Box>
    </Box>
  );
};

const AdminLogin = () => (
  <>
  <Helmet>
    <title>Admin Portal - GoOn</title>
    <meta name="description" content="Admin login page for GoOn. Access restricted to authorized administrators only." />
    <meta name="keywords" content="admin login, GoOn, administrator access, secure login" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="canonical" href={`${import.meta.env.VITE_AUTH_LINK1}/login`} />
    <meta property="og:title" content="Admin Login - GoOn " />
    <meta property="og:description" content="Admin login page for GoOn. Access restricted to authorized administrators only." />
    <meta property="og:image" content="/icons/TT-logo-1024x1024.png" />
    <meta property="og:url" content={`${import.meta.env.VITE_AUTH_LINK1}/login`} />
    <meta name="twitter:card" content="summary_large_image" />
  </Helmet>
  <div className="admin-login-container">
    <AdminLoginInner />
  </div>
  </>
);

export default AdminLogin;
