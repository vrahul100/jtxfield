import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Login } from './pages/Login';
import { Tickets } from './pages/Tickets';
import { Members } from './pages/Members';
import { Projects } from './pages/Projects';
import { Transactions } from './pages/Transactions';
import { Reports } from './pages/Reports';
import { Nodes } from './pages/Nodes';
import { Users } from './pages/Users';
import { Integrations } from './pages/Integrations';
import { COPackets } from './pages/COPackets';
import { TicketDetail } from './pages/TicketDetail';
import './index.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-gray-600">Loading...</div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/tickets"
                        element={
                            <ProtectedRoute>
                                <Tickets />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/members"
                        element={
                            <ProtectedRoute>
                                <Members />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/tickets/:id"
                        element={
                            <ProtectedRoute>
                                <TicketDetail />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/projects"
                        element={
                            <ProtectedRoute>
                                <Projects />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/transactions"
                        element={
                            <ProtectedRoute>
                                <Transactions />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/reports"
                        element={
                            <ProtectedRoute>
                                <Reports />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/nodes"
                        element={
                            <ProtectedRoute>
                                <Nodes />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/users"
                        element={
                            <ProtectedRoute>
                                <Users />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/integrations"
                        element={
                            <ProtectedRoute>
                                <Integrations />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/copackets"
                        element={
                            <ProtectedRoute>
                                <COPackets />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/" element={<Navigate to="/tickets" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
