import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Admin from './pages/Admin'
import Cabinet from './pages/Cabinet'
import Room from './pages/Room'
import Share from './pages/Share'
import { TaskDock, TasksProvider } from './components/TaskDock'
import { Metrika } from './components/Metrika'

export default function App() {
  return (
    <TasksProvider>
      <Metrika />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/cabinet" element={<Cabinet />} />
        <Route path="/room/:id" element={<Room />} />
        <Route path="/s/:token" element={<Share />} />
      </Routes>
      <TaskDock />
    </TasksProvider>
  )
}
