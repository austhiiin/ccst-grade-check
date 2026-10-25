import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import StudentLookup from './pages/StudentLookup'
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import UploadPreview from './pages/admin/UploadPreview'
import ClassStudents from './pages/admin/ClassStudents'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StudentLookup />} />
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/upload"
          element={
            <ProtectedRoute>
              <UploadPreview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/classes/:classId/students"
          element={
            <ProtectedRoute>
              <ClassStudents />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}