// components/TestPush/TestPush.jsx
import { useState } from "react";
import { toast } from "react-toastify";
import axiosInstanceAdmin from "../../../../axiosInstanceAdmin";

const TestPush = () => {
  const [form, setForm] = useState({
    userId: "",
    fcmToken: "",
    title: "Hello from Admin",
    body: "This is a test push notification 🚀",
    data: { url: "/", type: "test" },
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const sendPush = async () => {
    try {
      const { data } = await axiosInstanceAdmin.post("/api/test-push", form, {
        withCredentials: true,
      });
      toast.success("✅ Push sent successfully!");
      console.log("FCM Response:", data);
    } catch (err) {
      toast.error("❌ Push failed: " + (err.response?.data?.message || err.message));
      console.error("Test Push Error:", err);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h3>🔔 Test Push Notification</h3>

      <label>User ID:</label>
      <input
        name="userId"
        value={form.userId}
        onChange={handleChange}
        placeholder="Optional (or use FCM token)"
        style={{ width: "100%", marginBottom: 8 }}
      />

      <label>FCM Token:</label>
      <input
        name="fcmToken"
        value={form.fcmToken}
        onChange={handleChange}
        placeholder="Optional (or use User ID)"
        style={{ width: "100%", marginBottom: 8 }}
      />

      <label>Title:</label>
      <input
        name="title"
        value={form.title}
        onChange={handleChange}
        style={{ width: "100%", marginBottom: 8 }}
      />

      <label>Body:</label>
      <input
        name="body"
        value={form.body}
        onChange={handleChange}
        style={{ width: "100%", marginBottom: 8 }}
      />

      <button onClick={sendPush} style={{ marginTop: 10 }}>
        Send Push
      </button>
    </div>
  );
};

export default TestPush;
