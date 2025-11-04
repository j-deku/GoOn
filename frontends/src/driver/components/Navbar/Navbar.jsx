import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MdClose, MdLogout, MdMenu, MdSettings } from "react-icons/md";
import DriverNotifications from '../DriverNotifications/DriverNotifications';
import { useDispatch, useSelector } from "react-redux";
import { driverLogout, selectDriverInfo } from "../../../features/driver/driverSlice";
import "./Navbar.css";
import axiosInstanceDriver from "../../../../axiosInstanceDriver";
 
const Navbar = () => {
  const [showProfileDetails, setShowProfileDetails] = useState(false);
  const profileRef = useRef(null);
  const [avatar, setAvatar] = useState("");
  const [showMenuLinks, setShowMenuLinks] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Driver info from redux (may be null on first load)
  const driverInfo = useSelector(selectDriverInfo);
  const driverName = driverInfo?.name || "Driver";
  const driverImageUrl = driverInfo?.avatar || "/driver.jpeg";

  // Logout function
  const logout = () => {
    dispatch(driverLogout());
    window.location.href = "/driver";
  };

  const fetchDriverAvatar = async() =>{
    try {
      const avatarUrl = await axiosInstanceDriver("/api/driver/me");
      if (avatarUrl && avatarUrl.data && avatarUrl.data.avatar) {
        setAvatar(avatarUrl.data.avatar);
        return avatarUrl.data.avatar;
      }
    }catch (error) {
      console.error("Error fetching driver avatar:", error);
      // Fallback to default avatar if there's an error
      return "/driver.jpeg";
    }
  }

  useEffect(() => {
    fetchDriverAvatar();
  }, []);
  // Toggle the dropdown visibility
  const toggleProfile = () => {
    setShowProfileDetails((prev) => !prev);
  };
  const toggleMenu = () => {
    setShowMenuLinks((prev) => !prev);
  };

  // Close the dropdown if a click happens outside the profile section
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        profileRef.current &&
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !profileRef.current.contains(event.target)
      ) {
        setShowProfileDetails(false);
        setShowMenuLinks(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <nav className="navbar">
      <div className="navbar__left">
        <Link to="/driver/dashboard">
          <img className="navbar__logo" src="/GN-logo.png" alt="Logo" />
        </Link>
      </div>

      <div className="navbar__center">
        <ul>
          <li>
            <a href="/driver/dashboard">Dashboard</a>
          </li>
          <li>
            <a href="/driver/history">History</a>
          </li>
          <li>
            <a href="/driver/earnings">Earnings</a>
          </li>
          <li>
            <a href="/driver/support">Support</a>
          </li>
        </ul>
      </div>
      <button onClick={() => navigate("/driver/create-ride")}>Post a Ride</button>

      <div className="navbar__right" ref={profileRef}>
        <DriverNotifications />
        <div className="profile">
          <img
            onClick={toggleProfile}
            className="navbar__profile"
            src={avatar || driverImageUrl}
            alt="Driver Profile"
          />
          <p style={{ color: "#fff" }}>{driverName}</p>
        </div>
        {showProfileDetails && (
          <div className="navbar__dropdown">
            <h2>Contact Me</h2>
            <ul>
              <li>
                <span>Call on: </span>
                <a href="tel:+233246062758">+233 246 062 758</a>
              </li>
              <hr />
              <li>
                <span>Whatsapp Line: </span>
                <a href="https://wa.me/+233544684595">0544684595</a>
              </li>
              <hr />
              <li>
                <span>Email: </span>
                <a href="mailto:fdeku573@gmail.com">fdeku573@gmail.com</a>
              </li>
              <hr />
              <li>
                <span>Send Message: </span>
                <a href="sms:+233246062758">✉ SMS</a>
              </li>
              <hr />
              <li className="navbar__logout">
                <span>Logout: </span>
                <MdLogout
                  onClick={logout}
                  style={{ display: "flex", width: 30, height: 30, position: "relative" }}
                />
              </li>
              <li style={{ float: "right", width: 30, marginRight: 40, alignItems: "center", height: 30, top: -100, position: "relative" }}>
                <span>Settings:</span>
                <MdSettings style={{ width: 30, height: 30 }} onClick={() => navigate('/driver/profile-settings')} />
              </li>
            </ul>
          </div>
        )}
      </div>
      <div className="toggle-menu" onClick={() => toggleMenu()} ref={menuRef}>
        <MdMenu style={{ color: "#fff", width: 30, height: 30, float: "right" }} />
        {showMenuLinks && (
          <div className="navbar_menuLinks">
            <MdClose style={{ width: 25, height: 25, cursor: "pointer" }} />
            <button className="btn-create" onClick={() => navigate("/driver/create-ride")}>Creat New Ride</button>
            <h2>Menu</h2>
            <ul>
              <li>
                <a href="/driver/dashboard">Dashboard</a>
              </li>
              <hr />
              <li>
                <a href="/driver/history">History</a>
              </li>
              <hr />
              <li>
                <a href="/driver/earnings">Earnings</a>
              </li>
              <hr />
              <li>
                <a href="/driver/support">Support</a>
              </li>
            </ul>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;