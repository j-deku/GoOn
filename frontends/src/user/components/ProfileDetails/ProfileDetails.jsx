import React from "react";
import "./ProfileDetails.css";
import { useSelector } from "react-redux";
import { selectUser } from "../../../features/user/userSlice";

const ProfileDetails = () => {
  const user = useSelector(selectUser);

  return (
    <div className="profile-details">
      <table cellPadding={5} cellSpacing={10} border={1}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Avatar</th>
            <th>Role(s)</th>
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
          </tr>
          <tr>{user.roles}</tr>
        </tbody>
      </table>
    </div>
  );
};

export default ProfileDetails;