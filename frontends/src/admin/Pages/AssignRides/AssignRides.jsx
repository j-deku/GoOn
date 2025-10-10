/* eslint-disable no-unused-vars */
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import "./AssignRides.css"; // Create or adjust your CSS for a professional look
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";
import { Alert } from "@mui/material";

const AssignRides = () => {
  const [rides, setRides] = useState([]);
  const [drivers, setDrivers] = useState([]);
  // This state maps each ride's ID to the selected driver ID
  const [selectedDrivers, setSelectedDrivers] = useState({});

  // Fetch rides from admin endpoint
  const fetchRides = async () => {
    try {
      const response = await axiosInstanceAdmin.get(`/api/admin/rides`, {
       withCredentials:true,
      });
      if (response.data.rides) {
        setRides(response.data.rides);
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  };

  // Fetch drivers from admin endpoint
  const fetchDrivers = async () => {
    try {
      const response = await axiosInstanceAdmin.get(`/api/admin/drivers`, {
        withCredentials: true,
      });
      if (response.data.drivers) {
        setDrivers(response.data.drivers);
      } else {
        return null;
      }
    } catch (error) {
      return null
    }
  };

  useEffect(() => {
    fetchRides();
    fetchDrivers();
  }, []);

  // Handler for when an admin selects a driver from the dropdown for a specific ride
  const handleDriverChange = (rideId, event) => {
    const driverId = event.target.value;
    setSelectedDrivers((prev) => ({ ...prev, [rideId]: driverId }));
  };

  // Function to assign a ride to a driver
  const assignRide = async (rideId) => {
    const driverId = selectedDrivers[rideId];
    if (!driverId) {
      toast.error("Please select a driver for this ride");
      return;
    }
    try {
      const response = await axiosInstanceAdmin.post(
        `/api/admin/assign-ride`,
        { rideId, driverId },
        { withCredentials: true },
      );
      if (response.data.success) {
        toast.success("Ride assigned successfully");
        // Refresh the rides list so the UI updates with the new assignment
        fetchRides();
      } else {
        toast.error(response.data.message || "Failed to assign ride");
      }
    } catch (error) {
    return null
    }
  };

  return (
    <div className="assign-ride-container">
      {rides.length === 0 ? (
        <div style={{ width: "100%", marginTop: "50px" }}>
          <Alert severity="info" className="no-rides-alert">
            No rides or drivers found. Please add some rides and drivers.
          </Alert>
        </div>
      ) : (
        <div>
      <h2>Assign Rides to Drivers</h2>
      <table className="assign-ride-table">
        <thead>
          <tr>
            <th>Ride ID</th>
            <th>Pickup</th>
            <th>Destination</th>
            <th>Status</th>
            <th>Driver</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rides.map((ride) => (
            <tr key={ride._id}>
              <td>{ride._id}</td>
              <td>{ride.pickup}</td>
              <td>{ride.destination}</td>
              <td>{ride.status}</td>
              <td>
                {ride.driver ? (
                  // If the ride is already assigned, show the driver name (if available)
                  <span>{ride.driver.name || "Assigned"}</span>
                ) : (
                  // Otherwise, provide a dropdown to select a driver
                  <select
                    value={selectedDrivers[ride._id] || ""}
                    onChange={(e) => handleDriverChange(ride._id, e)}
                  >
                    <option value="">Select driver</option>
                    {drivers.map((driver) => (
                      <option key={driver._id} value={driver._id}>
                        {driver.name} ({driver.email})
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td>
                {!ride.driver && (
                  <button onClick={() => assignRide(ride._id)}>
                    Assign
                  </button>
                )}
                {ride.driver && <span>Assigned</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      ) }
    </div>
  );
};

export default AssignRides;
