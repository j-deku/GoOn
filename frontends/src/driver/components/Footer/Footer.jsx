import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Footer.css";

const Footer = () => {
  const navigate = useNavigate();
 
  return (
    <footer className="driver-footer">
    <div className="logo" onClick={()=>navigate("/")}>
        <img src="/GN-logo.png" alt="Logo" />
    </div>
      <nav className="footer-nav">
        <Link to="/driver/history">Ride History</Link>
        <Link to="/driver/earnings">Earnings Report</Link>
        <Link to="/driver/profile-settings">Profile Settings</Link>
        <Link to="/driver/support">Support</Link>
        <a href="tel:+233246062758">📞 Assistance</a>
      </nav>
      <div className="footer-info">
        <p>&copy; {new Date().getFullYear()} GoOn. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
