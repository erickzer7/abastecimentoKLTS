import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { OperatorApp } from './pages/OperatorApp';
import { Panel } from './pages/Panel';
import { NotFound } from './pages/NotFound';

function Protected({ children, lider }: { children: ReactNode; lider?: boolean }) {
  const { operador } = useAuth();
  if (!operador) return <Navigate to="/login" replace />;
  if (lider && !operador.lider) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Layout><OperatorApp /></Layout>
              </Protected>
            }
          />
          <Route
            path="/panel"
            element={
              <Protected lider>
                <Layout><Panel /></Layout>
              </Protected>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
