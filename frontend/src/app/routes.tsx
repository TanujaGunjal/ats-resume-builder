import { createBrowserRouter } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import UserDashboard from "./pages/UserDashboard";
import CreateResume from "./pages/CreateResume";
import PasteJD from "./pages/PasteJD";
import ATSScore from "./pages/ATSScore";
import ATSAddJD from "./pages/ATSAddJD";
import TemplateSelection from "./pages/TemplateSelection";
import DownloadResume from "./pages/DownloadResume";
import AdminDashboard from "./pages/admin/AdminDashboard";
import UserManagement from "./pages/admin/UserManagement";
import ResumeStats from "./pages/admin/ResumeStats";
import TemplateManagement from "./pages/admin/TemplateManagement";
import KeywordsLibrary from "./pages/admin/KeywordsLibrary";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/auth",
    Component: AuthPage,
  },
  {
    path: "/dashboard",
    Component: () => <ProtectedRoute><UserDashboard /></ProtectedRoute>,
  },
  {
    path: "/create-resume",
    Component: () => <ProtectedRoute><CreateResume /></ProtectedRoute>,
  },
  {
    path: "/paste-jd",
    Component: () => <ProtectedRoute><PasteJD /></ProtectedRoute>,
  },
  {
    path: "/ats-score",
    Component: () => <ProtectedRoute><ATSScore /></ProtectedRoute>,
  },
  {
    path: "/ats/add-jd",
    Component: () => <ProtectedRoute><ATSAddJD /></ProtectedRoute>,
  },
  {
    path: "/templates",
    Component: () => <ProtectedRoute><TemplateSelection /></ProtectedRoute>,
  },
  {
    path: "/download",
    Component: () => <ProtectedRoute><DownloadResume /></ProtectedRoute>,
  },
  {
    path: "/admin",
    Component: () => <ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>,
  },
  {
    path: "/admin/users",
    Component: () => <ProtectedRoute requireAdmin><UserManagement /></ProtectedRoute>,
  },
  {
    path: "/admin/stats",
    Component: () => <ProtectedRoute requireAdmin><ResumeStats /></ProtectedRoute>,
  },
  {
    path: "/admin/templates",
    Component: () => <ProtectedRoute requireAdmin><TemplateManagement /></ProtectedRoute>,
  },
  {
    path: "/admin/keywords",
    Component: () => <ProtectedRoute requireAdmin><KeywordsLibrary /></ProtectedRoute>,
  },
]);
