/* eslint-disable no-unused-vars */
import React, { useEffect, useState } from "react";
import "./ProfileDetails.css";
import { useSelector } from "react-redux";
import { selectUser } from "../../../features/user/userSlice";
import { FaUserCheck } from "react-icons/fa";
import { Typography } from "@mui/material";
import axiosInstance from "../../../../axiosInstance";

const ProfileDetails = () => {
  const user = useSelector(selectUser);
  const [verified, setVerified] = useState(null);

  // Fetch user profile status
  const profileStatus = async () => {
    try {
      const res = await axiosInstance.get("/api/user/me", { withCredentials: true });

      if (res.data.success && res.data.user) {
        setVerified(res.data.user.verified);
      } else {
        setVerified(false);
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      setVerified(false);
    }
  };

  useEffect(() => {
    profileStatus();
  }, []);

  return (
    <div className="profile-details">
      <h1>Your Account Details</h1>
      <table cellPadding={10} cellSpacing={10} border={1}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Avatar</th>
            <th>Role(s)</th>
            <th>Account Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{user?.name}</td>
            <td>{user?.email}</td>
            {user?.avatar ? (
              <td>
                <img
                  src={user.avatar}
                  alt="avatar"
                  style={{ width: 50, borderRadius: "50%" }}
                />
              </td>
            ) : (
              <td>No Avatar</td>
            )}
            <td>
              {user?.roles?.length ? (
                user.roles.join(", ")
              ) : (
                <Typography color="gray">No Roles Assigned</Typography>
              )}
            </td>
            <td>
              {verified === null ? (
                <Typography color="gray">Loading...</Typography>
              ) : verified ? (
                <Typography color="green">
                  <FaUserCheck style={{ marginRight: 4 }} />
                  Verified
                </Typography>
              ) : (
                <Typography color="red">Not Verified</Typography>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default ProfileDetails;
