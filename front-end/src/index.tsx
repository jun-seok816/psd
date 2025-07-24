import React, { useState, useEffect, useRef } from "react";
import { Outlet, Route, Routes } from "react-router";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "bootstrap-icons/font/bootstrap-icons.css";
import "react-toastify/dist/ReactToastify.css";
import "./index.scss";
import C_psdWork from "./component/C_psdWork";

export default function Root() {
  return (
    <Routes>
      <Route index element={<C_psdWork />}></Route>
    </Routes>
  );
}

const container = document.getElementById("app");
const root = createRoot(container!); // createRoot(container!) if you use TypeScript

root.render(
  <>
    <ToastContainer
      position="bottom-right"
      style={{ fontSize: "16px", width: "auto", minWidth: "10rem" }}
    />
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </>
);
