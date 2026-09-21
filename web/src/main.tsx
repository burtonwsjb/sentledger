import { StrictMode, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./styles.css";
import { loadConfig } from "./lib/api";
import { AuthProvider, useAuth } from "./lib/auth";
import { Spinner, ToastProvider } from "./components/ui";
import { Shell } from "./components/Shell";
import { AcceptInvite, AuthCallback, DeviceApprove, Forgot, Login, ResetPassword, Signup } from "./pages/Auth";
import { Onboarding } from "./pages/Onboarding";

// Route-level code splitting keeps the first load small (editor and charts load on demand).
const L = <T extends Record<string, any>>(f: () => Promise<T>, k: keyof T) => lazy(() => f().then((m) => ({ default: m[k] })));
const Dashboard = L(() => import("./pages/Dashboard"), "Dashboard");
const Analytics = L(() => import("./pages/Dashboard"), "Analytics");
const Send = L(() => import("./pages/Send"), "Send");
const Messages = L(() => import("./pages/Messages"), "Messages");
const MessageDetail = L(() => import("./pages/Messages"), "MessageDetail");
const Templates = L(() => import("./pages/Templates"), "Templates");
const TemplateEditor = L(() => import("./pages/Templates"), "TemplateEditor");
const Contacts = L(() => import("./pages/Contacts"), "Contacts");
const ContactDetail = L(() => import("./pages/Contacts"), "ContactDetail");
const Files = L(() => import("./pages/Files"), "Files");
const Developers = L(() => import("./pages/Developers"), "Developers");
const Integrations = L(() => import("./pages/Integrations"), "Integrations");
const Team = L(() => import("./pages/Team"), "Team");
const Billing = L(() => import("./pages/Billing"), "Billing");
const Settings = L(() => import("./pages/Settings"), "Settings");
const Help = L(() => import("./pages/Help"), "Help");
const Admin = L(() => import("./pages/Help"), "Admin");

function RequireAuth({ children, needOrg = true }: { children: ReactNode; needOrg?: boolean }) {
  const { session, ready, me, org } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner label="Loading SentLedger" />;
  if (!session) return <Navigate to={`/app/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!me) return <Spinner label="Loading your account" />;
  if (needOrg && !me.organizations.length) return <Navigate to="/app/onboarding" replace />;
  if (needOrg && !org) return <Spinner label="Loading workspace" />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/app/login" element={<Login />} />
      <Route path="/app/signup" element={<Signup />} />
      <Route path="/app/forgot" element={<Forgot />} />
      <Route path="/app/reset-password" element={<ResetPassword />} />
      <Route path="/app/auth/callback" element={<AuthCallback />} />
      <Route path="/app/invite/:token" element={<AcceptInvite />} />
      <Route path="/app/onboarding" element={<RequireAuth needOrg={false}><Onboarding /></RequireAuth>} />
      <Route path="/app/device" element={<RequireAuth><DeviceApprove /></RequireAuth>} />
      <Route path="/app" element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="send" element={<Send />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:id" element={<MessageDetail />} />
        <Route path="templates" element={<Templates />} />
        <Route path="templates/:id" element={<TemplateEditor />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="contacts/:id" element={<ContactDetail />} />
        <Route path="files" element={<Files />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="developers" element={<Developers />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="team" element={<Team />} />
        <Route path="billing" element={<Billing />} />
        <Route path="settings" element={<Settings />} />
        <Route path="help" element={<Help />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

function Boot() {
  const [state, setState] = useState<"loading" | "ready" | Error>("loading");
  useEffect(() => { loadConfig().then(() => setState("ready")).catch((e) => setState(e)); }, []);
  if (state === "loading") return <Spinner label="Loading SentLedger" />;
  if (state instanceof Error) return <div className="p-8 text-center text-sm text-danger" role="alert">{state.message}</div>;
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter><Suspense fallback={<Spinner />}><App /></Suspense></BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Boot /></StrictMode>);
