/* eslint-disable no-empty */
// src/admin/utils/checkIPAllowlist.js
export const checkIPAllowlist = async () => {
  const cached = sessionStorage.getItem("adminAccess");
  if (cached) {
    try {
      const { checked, allowed } = JSON.parse(cached);
      if (checked && !allowed) return false;
    } catch {}
  }

  try {
    const res = await fetch("/api/admin/check-ip", {
      credentials: "include",
    });

    // If server served a static 404.html (or any non-JSON), treat as denied:
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("application/json")) {
      // Cache denial
      sessionStorage.setItem(
        "adminAccess",
        JSON.stringify({ checked: true, allowed: false })
      );
      return false;
    }

    const data = await res.json();
    // Cache the true result
    sessionStorage.setItem(
      "adminAccess",
      JSON.stringify({ checked: true, allowed: data.allowed })
    );
    return data.allowed;
  } catch (err) {
    console.error("IP check failed:", err);
    // Cache denial on network error
    sessionStorage.setItem(
      "adminAccess",
      JSON.stringify({ checked: true, allowed: false })
    );
    return false;
  }
};