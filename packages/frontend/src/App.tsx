import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductsPage } from "./pages/products/ProductsPage";
import { InventoryPage } from "./pages/inventory/InventoryPage";
import { KardexPage } from "./pages/inventory/KardexPage";
import { PurchasingPage } from "./pages/purchasing/PurchasingPage";
import { PurchaseOrderDetailPage } from "./pages/purchasing/PurchaseOrderDetailPage";
import { SuppliersPage } from "./pages/suppliers/SuppliersPage";
import { OrganizationPage } from "./pages/organization/OrganizationPage";
import { ReportsPage } from "./pages/reports/ReportsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/inventory/kardex/:productId" element={<KardexPage />} />
        <Route path="/purchasing" element={<PurchasingPage />} />
        <Route path="/purchasing/:id" element={<PurchaseOrderDetailPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/organization" element={<OrganizationPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
