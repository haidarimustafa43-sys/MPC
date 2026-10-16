import { createHashRouter, Navigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { CapacityPage } from "../pages/CapacityPage";
import { DashboardPage } from "../pages/DashboardPage";
import { InventoryPage } from "../pages/InventoryPage";
import { MasterDataPage } from "../pages/MasterDataPage";
import { MpsPage } from "../pages/MpsPage";
import { MrpPage } from "../pages/MrpPage";
import { OrdersPage } from "../pages/OrdersPage";
import { PlanningVersionsPage } from "../pages/PlanningVersionsPage";
import { SettingsPage } from "../pages/SettingsPage";

/*
 * Hash routing (#/mrp) keeps every route on index.html, so reloading or
 * opening a deep link on GitHub Pages never produces a 404.
 */
export const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "mps", element: <MpsPage /> },
      { path: "mrp", element: <MrpPage /> },
      { path: "capacity", element: <CapacityPage /> },
      { path: "inventory", element: <InventoryPage /> },
      { path: "orders", element: <OrdersPage /> },
      { path: "versions", element: <PlanningVersionsPage /> },
      { path: "master-data", element: <MasterDataPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
], {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
