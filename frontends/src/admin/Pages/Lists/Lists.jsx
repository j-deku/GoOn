/* eslint-disable no-unused-vars */
import { useEffect, useState } from "react";
import "./Lists.css";
import { toast } from "react-toastify";
import { assets } from "../../assets/assets";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";
import { Alert } from "@mui/material";

const Lists = () => {
  const [list, setList] = useState([]);

  const fetchList = async () => {
    try {
      const response = await axiosInstanceAdmin.get(`/api/admin/list`, {
        withCredentials: true,
      });      
      if (response.data.success) {
        setList(response.data.data);
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      return null;
    }
  };

  const removeRide = async (rideId) => {
    try {
      const response = await axiosInstanceAdmin.post(`/api/admin/remove`, { id: rideId}, {
        withCredentials: true,
      });
      if (response.data.success) {
        toast.success(response.data.message);
        fetchList();
      } else {
        toast.error("Failed to remove ride");
      }
    } catch (error) {
      toast.error("Error removing ride",error);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  return (
    <div className="list add flex-col">
      <h1>All Ride Lists</h1>
      {list.length === 0 ? (
        <div style={{ width: "100%", marginTop: "50px" }}>
          <Alert severity="info" className="no-rides-alert">
            No rides found. Please add some rides.
          </Alert>
        </div>
      ):(
      <div className="list-table">
        <div className="list-table-format title">
          <b>Driver</b>
          <b>Ride</b>
          <b>Pickup</b>
          <b>Destination</b>
          <b>Time</b>
          <b>Price ($)</b>
          <b>Date</b>
          <b>Passengers</b>
          <b>Action</b>
        </div>
        {list.map((ride, index) => (
          <div key={index} className="list-table-format">
            <img 
              src={ride.imageUrl || assets.placeholder} 
              alt="Ride" 
              className="ride-image"
            /> 
            <p>{ride.type}</p>
            <p>{ride.pickup}</p>
            <p>{ride.destination}</p>
            <p>{ride.selectedTime}</p>
            <p>{ride.price}</p>
            <p>{new Date(ride.selectedDate).toLocaleDateString()}</p>
            <p>{ride.passengers}</p>
            <p onClick={() => removeRide(ride._id)} className="cursor">
              <img src={assets.trash} alt="delete" />
            </p>
          </div>
        ))}
      </div>
      )}
    </div>
  );
};

export default Lists;
