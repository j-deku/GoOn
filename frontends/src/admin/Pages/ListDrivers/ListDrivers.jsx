/* Updated ListDrivers.jsx */
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import { Alert, Box, Button } from "@mui/material";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";
import { Skeleton } from "antd";
import "./ListDrivers.css";

const ListDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all drivers from the backend
  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const response = await axiosInstanceAdmin.get(`/api/admin/drivers`, {
        withCredentials: true,
      });

      if (Array.isArray(response.data.drivers)) {
        setDrivers(response.data.drivers);
      } else {
        setDrivers([]);
        toast.error(response.data.message || "Unexpected response format");
      }
    } catch (error) {
      setDrivers([]);
      console.error("Error fetching drivers:", error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  // Handler to approve a driver and re-fetch the drivers list afterwards.
  const handleApprove = async (driverId) => {
    try {
      const response = await axiosInstanceAdmin.put(
        `/api/admin/drivers/approve/${driverId}`,
        {},
        { withCredentials: true }
      );
      toast.success(response.data.message || "Driver approved successfully");
      fetchDrivers();
    } catch (error) {
      console.error("Error approving driver:", error.response?.data || error.message);
      toast.error(error.response?.data?.message || "Failed to approve driver");
    }
  };

  return (
    <div className="list-drivers">
      <h2>Drivers List</h2>
      {loading ? (
        <Box>
          <Skeleton style={{ width: 600 }} active />
        </Box>
      ) : drivers.length === 0 ? (
        <Alert severity="info">No drivers found.</Alert>
      ) : (
        <table className="drivers-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Avatar</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>License</th>
              <th>Vehicle Type</th>
              <th>Model</th>
              <th>Reg. No.</th>
              <th>Capacity</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((driver, index) => {
              const prof = driver.profile || {};
              return (
                <tr key={driver._id || index}>
                  <td>{index + 1}</td>
                  <td>
                    {driver.avatar ? (
                      <img
                        src={driver.avatar}
                        alt={`${driver.name}'s Avatar`}
                        className="driver-avatar"
                      />
                    ) : (
                      "N/A"
                    )}
                  </td>
                  <td>{driver.name || "N/A"}</td>
                  <td>{driver.email || "N/A"}</td>
                  <td>{prof.phone || "N/A"}</td>
                  <td>{prof.licenseNumber || "N/A"}</td>
                  <td>{prof.vehicle?.vehicleType || "N/A"}</td>
                  <td>{prof.vehicle?.model || "N/A"}</td>
                  <td>{prof.vehicle?.registrationNumber || "N/A"}</td>
                  <td>{prof.vehicle?.capacity ?? "N/A"}</td>
                  <td>
                    <Link to={`/admin/update-driver/${driver._id}`} className="edit-btn">
                      Edit
                    </Link>
                    {(prof.approved || prof.status === "active") ? (
                      <span className="approved-label">Approved</span>
                    ) : (
                      <Button
                        variant="contained"
                        color="success"
                        onClick={() => handleApprove(driver._id)}
                        size="small"
                        sx={{ mt: 1 }}
                      >
                        Approve
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ListDrivers;
