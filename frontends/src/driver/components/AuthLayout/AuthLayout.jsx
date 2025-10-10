// src/components/AuthLayout/AuthLayout.jsx
import React from "react";
import Footer from "../Footer/Footer";
import Navbar from "../Navbar/Navbar";
import { Helmet } from "react-helmet-async";
export default function AuthLayout({ children }) {
  return (
    <>
          <Helmet>
            <title>Driver - TOLI‑TOLI</title>
          </Helmet>
      <Navbar />
      <hr />
      <div className="app">
        {children}
        <Footer/>
      </div>
    </>
  );
}
