import {
  Modal,
  Box,
  Typography,
  Divider,
  useTheme,
} from "@mui/material";
import { MdSecurity } from "react-icons/md";
import ClickHoldCaptcha from "../ClickHoldCaptcha/ClickHoldCaptcha";

const CaptchaModal = ({ open, onVerify }) => {
  const theme = useTheme();

  return (
    <Modal
      open={open}
      onClose={() => {}}
      aria-labelledby="captcha-modal"
      disableEscapeKeyDown
    >
      <Box
        sx={{
          width: 400,
          bgcolor: "background.paper",
          borderRadius: 2,
          boxShadow: 24,
          p: 4,
          mx: "auto",
          mt: "15vh",
          textAlign: "center",
        }}
      >
        <MdSecurity size={48} color={theme.palette.primary.main} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Let’s verify you’re a human
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
          Please click and hold the button below to securely complete login.
        </Typography>
        <Divider sx={{ my: 2 }} />
        <ClickHoldCaptcha onSuccess={onVerify} />
      </Box>
    </Modal>
  );
};

export default CaptchaModal;
