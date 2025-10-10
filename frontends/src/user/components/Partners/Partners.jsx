/* eslint-disable no-unused-vars */
import React from "react";
import "./Partners.css";
import { useNavigate } from "react-router-dom";
import { Button } from "@mui/material";
import { motion } from "framer-motion";

const Partners = () => {
  const navigate = useNavigate();

  const fadeInUp = {
    hidden: { opacity: 0, y: 60 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 1.2, ease: [0.25, 0.8, 0.25, 1] },
    },
  };
  const staggerContainer = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.3, delayChildren: 0.4 },
    },
  };

  return (
    <div className="partners">
      <h2>Drive with GoOn</h2>
      <motion.div
        className="container"
        initial="hidden"
        whileInView="visible"
        variants={{
          visible: {
            opacity: 1,
            scale: 1,
            transition: { duration: 1, ease: [0.25, 0.8, 0.25, 1] },
          },
          hidden: { opacity: 0, scale: 0 },
        }}
        transition={{ duration: 8 }}
        viewport={{ once: true, amount: 0.7 }}
      >
        <img src="/Inside-car2.jpg" alt="" />
        <div className="container2">
          <b>Arrive Safely</b>
          <p>
            Comfort & Convenience:Experience comfort, affordability, and ease in
            every ride. On-Demand Transport: Your fast, on-demand ride, ready
            when you are. Smart Commutes: Ride smart with seamless booking and
            real-time tracking.
            <br />
            <br />
            <button
              type="button"
              onClick={() => navigate("/searchRides")}
              title="searchrides"
            >
              Book Now
            </button>
          </p>
        </div>
      </motion.div>

      <motion.div className="container">
        <motion.div
          className="containerBg"
          initial="hidden"
          whileInView="visible"
          variants={{
            visible: {
              opacity: 1,
              scale: 1,
              transition: { duration: 1, ease: [0.25, 0.8, 0.25, 1] },
            },
            hidden: { opacity: 0, scale: 0 },
          }}
          transition={{ duration: 8 }}
          viewport={{ once: true, amount: 0.7 }}
        >
          <div className="container5">
            <b>Smart Platform</b>
            <p>
              GoOn is a smart ride-hailing platform that connects passengers
              with trusted drivers for safe and convenient trips. It offers
              real-time booking, transparent pricing, and reliable transport
              services. <br />
              <br />
              <button
                type="button"
                onClick={() => navigate("/searchRides")}
                title="searchrides"
              >
                Book Now
              </button>
            </p>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        className="container"
        initial={{ opacity: 0, x: -60 }}
        whileInView={{ opacity: 1, x: 0 }}
        transition={{ duration: 8, ease: [0.25, 0.8, 0.25, 1] }}
        viewport={{ once: true, amount: 0.7 }}
      >
        <div className="stroke-container">
          <div> → Pickup location → </div>
          <div className="circle0"></div>
          <div className="stroke"></div>
          <div> ← Drop Off location ← </div>
          <div className="circle"></div>
          <div className="stroke"></div>
        </div>
        <div className="container3">
          <b>Transfers</b>
          <p>
            <strong>Smart Commutes:</strong> Ride smart with seamless booking
            and real-time tracking. Efficient Service: Efficient, safe, and
            reliable transport to suit your busy schedule. Professional
            Transfers:Professional drivers, modern vehicles, and a hassle-free
            journey.
          </p>
        </div>
        <img src="/traveler9.jpeg" alt="" />
      </motion.div>

      <br />
      <div
        className="container"
        initial={{ opacity: 0, x: -60 }}
        whileInView={{ opacity: 1, x: 0 }}
        transition={{ duration: 8, ease: [0.25, 0.8, 0.25, 1] }}
        viewport={{ once: true, amount: 0.7 }}
      >
        <div className="stroke-container">
          <div> → Pickup location → </div>
          <div className="circle0"></div>
          <div className="stroke"></div>
          <div> ← Drop Off location ← </div>
          <div className="circle"></div>
          <div className="stroke"></div>
        </div>
        <img src="/support4.jpg" alt="" />
        <div className="container4">
          <br />
          <b style={{ fontSize: "30px" }}>Support Teams</b>
          <br />
          <p>
            <b>Your safety is our priority</b>
            <br />
            <br />
            <div style={{ textAlign: "left" }}>
              Share a link, and the others will see your location SOS-button One
              button for emergency services 24/7 support Our team of specialists
              will assist you any time day and night Verified drivers The
              drivers undergo rigorous screening before the first drive
              <br />
            </div>
            <em>⭐⭐⭐⭐⭐</em>
            <a href="https://apps.google.com">
              <Button
                variant="outlined"
                fullWidth
                sx={{
                  mt: 4,
                  alignItems: "center",
                  p: 1.5,
                  fontWeight: "bold",
                  fontSize: 18,
                  borderRadius: 20,
                }}
              >
                DOWNLOAD APP
              </Button>
            </a>
          </p>
        </div>
      </div>
      <br />
    </div>
  );
};

export default Partners;
